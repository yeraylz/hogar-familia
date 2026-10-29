'use strict';

let usuarioActualId = null;
let usuarioActualNombre = null;
let usuarioActualAvatar = '';
let usuariosDisponibles = [];
let personaSeleccionadaLogin = null;
let creandoPinNuevo = false;

const AVATAR_INICIAL = { Hogar: '🏠' };
const COLOR_AVATAR_LOGIN = { Hogar: 'bg-slate-200 text-slate-700' };
// Para el resto de personas (nombres de tu familia, no fijados aquí), se reparte un color
// de esta paleta siempre igual para el mismo nombre, en vez de tenerlos escritos a mano.
const PALETA_AVATAR_LOGIN = [
  'bg-sky-100 text-sky-700', 'bg-pink-100 text-pink-700', 'bg-purple-100 text-purple-700',
  'bg-emerald-100 text-emerald-700', 'bg-amber-100 text-amber-700', 'bg-rose-100 text-rose-700',
  'bg-cyan-100 text-cyan-700', 'bg-orange-100 text-orange-700'
];
function colorAvatarPersona(nombre) {
  if (COLOR_AVATAR_LOGIN[nombre]) return COLOR_AVATAR_LOGIN[nombre];
  let h = 0;
  for (let i = 0; i < String(nombre || '').length; i++) h = (h * 31 + nombre.charCodeAt(i)) >>> 0;
  return PALETA_AVATAR_LOGIN[h % PALETA_AVATAR_LOGIN.length];
}

// Mismo reparto, pero en hexadecimal (para el calendario, que no usa clases de Tailwind).
const PALETA_HEX_PERSONA = ['#ea580c', '#db2777', '#7c3aed', '#059669', '#d97706', '#e11d48', '#0891b2', '#c2410c'];
function colorHexPersona(nombre) {
  if (!nombre || nombre === 'Todos') return '#2563eb';
  let h = 0;
  for (let i = 0; i < String(nombre).length; i++) h = (h * 31 + nombre.charCodeAt(i)) >>> 0;
  return PALETA_HEX_PERSONA[h % PALETA_HEX_PERSONA.length];
}

async function comprobarSesion() {
  if (typeof iniciarInvitacion === 'function' && await iniciarInvitacion()) return;
  try {
    const res = await fetch('/me');
    if (res.ok) {
      aplicarUsuarioLogueado(await res.json());
      return;
    }
    // Solo un 401 significa "no hay sesión". Cualquier otro error (502/504 del proxy,
    // servidor reiniciándose, límite de intentos...) no debe tirarte a la pantalla del PIN.
    if (res.status !== 401) {
      if (typeof mostrarToast === 'function') mostrarToast('El servidor no responde bien ahora mismo. Reintenta en un momento.');
      return;
    }
  } catch (e) {
    // sin red: no bloqueamos con el login, se podrá identificar en cuanto vuelva
    return;
  }
  await mostrarPantallaLogin();
}

// Aplica el usuario ya identificado: cierra el login, pinta el chip de arriba
// y rellena por defecto los selectores de "asignado a / persona" de los
// formularios de creación (sin tocar lo que el usuario cambie después).
function aplicarUsuarioLogueado(u) {
  usuarioActualId = u.id;
  usuarioActualNombre = u.nombre;
  usuarioActualAvatar = u.avatar || '';
  if (typeof moduloActual !== 'undefined' && moduloActual === 'documentos' && typeof cargarDocumentos === 'function') cargarDocumentos();

  document.getElementById('pantalla-login').classList.add('hidden');

  const chip = document.getElementById('chip-usuario-actual');
  chip.classList.remove('hidden');
  chip.classList.add('flex');
  document.getElementById('chip-usuario-nombre').textContent = u.nombre;
  document.getElementById('chip-usuario-avatar').textContent = u.avatar || AVATAR_INICIAL[u.nombre] || u.nombre.charAt(0);

  // Al identificarte, este dispositivo queda asociado a ti para los avisos dirigidos.
  if (typeof Notification !== 'undefined' && Notification.permission === 'granted' && typeof suscribirsePush === 'function') suscribirsePush();
  if (typeof iniciarAgregarPorQR === 'function') setTimeout(iniciarAgregarPorQR, 500);

  const esPersonaReal = u.nombre !== 'Hogar';
  if (esPersonaReal) {
    const asignadoTarea = document.getElementById('asignado-tarea');
    if (asignadoTarea) asignadoTarea.value = u.nombre;

    const personaPago = document.getElementById('persona-pago');
    if (personaPago) personaPago.value = u.nombre;

    const personaDocumento = document.getElementById('persona-documento');
    if (personaDocumento) personaDocumento.value = u.nombre;

    if (typeof seleccionarPersonaEvento === 'function') seleccionarPersonaEvento(u.nombre);
  }
}

async function mostrarPantallaLogin() {
  document.getElementById('pantalla-login').classList.remove('hidden');
  document.getElementById('login-paso-personas').classList.remove('hidden');
  document.getElementById('login-paso-pin').classList.add('hidden');

  try {
    usuariosDisponibles = await (await fetch('/usuarios')).json();
  } catch (e) {
    usuariosDisponibles = [];
  }

  const cont = document.getElementById('login-lista-personas');
  cont.innerHTML = '';
  usuariosDisponibles.forEach(u => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'flex flex-col items-center gap-2 p-4 rounded-2xl bg-white border border-slate-200 hover:border-sky-400 transition-colors';
    btn.innerHTML = `
      <span class="w-14 h-14 rounded-full ${colorAvatarPersona(u.nombre)} flex items-center justify-center text-2xl">${u.avatar || AVATAR_INICIAL[u.nombre] || u.nombre.charAt(0)}</span>
      <span class="text-sm font-semibold text-slate-800">${u.nombre}</span>`;
    btn.onclick = () => elegirPersonaLogin(u);
    cont.appendChild(btn);
  });
}

function elegirPersonaLogin(u) {
  personaSeleccionadaLogin = u;
  creandoPinNuevo = !u.pin_configurado;

  document.getElementById('login-paso-personas').classList.add('hidden');
  document.getElementById('login-paso-pin').classList.remove('hidden');
  document.getElementById('login-pin-titulo').textContent = creandoPinNuevo ? `Crea un PIN para ${u.nombre}` : `Hola, ${u.nombre}`;
  document.getElementById('login-pin-subtitulo').textContent = creandoPinNuevo
    ? 'Elige un PIN de 6 dígitos para este perfil (solo se puede crear desde la wifi de casa)'
    : 'Introduce tu PIN';
  document.getElementById('login-pin-confirmar').classList.toggle('hidden', !creandoPinNuevo);
  document.getElementById('login-pin-error').classList.add('hidden');

  const input = document.getElementById('login-pin-input');
  input.value = '';
  document.getElementById('login-pin-confirmar').value = '';
  setTimeout(() => input.focus(), 50);
}

function volverAPersonas() {
  document.getElementById('login-paso-pin').classList.add('hidden');
  document.getElementById('login-paso-personas').classList.remove('hidden');
}

function mostrarErrorLogin(msg) {
  const el = document.getElementById('login-pin-error');
  el.textContent = msg;
  el.classList.remove('hidden');
}

async function enviarPin() {
  const pin = document.getElementById('login-pin-input').value.trim();
  if (!(creandoPinNuevo ? /^\d{6}$/ : /^(\d{4}|\d{6})$/).test(pin)) {
    mostrarErrorLogin(creandoPinNuevo ? 'El PIN debe tener 6 dígitos.' : 'El PIN debe tener 4 o 6 dígitos.');
    return;
  }

  if (creandoPinNuevo) {
    const pin2 = document.getElementById('login-pin-confirmar').value.trim();
    if (pin !== pin2) {
      mostrarErrorLogin('Los dos PIN no coinciden.');
      return;
    }
    try {
      const res = await fetch(`/usuarios/${personaSeleccionadaLogin.id}/pin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin })
      });
      if (!res.ok) {
        mostrarErrorLogin(res.status === 403 ? 'El primer PIN solo se puede crear conectado a la wifi de casa (usa la dirección local).' : 'No se pudo crear el PIN. Inténtalo de nuevo.');
        return;
      }
    } catch (e) {
      mostrarErrorLogin('Sin conexión. Inténtalo de nuevo.');
      return;
    }
  } else {
    try {
      const res = await fetch('/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usuario_id: personaSeleccionadaLogin.id, pin })
      });
      if (res.status === 429) {
        let msg = 'Demasiados intentos. Espera unos minutos.';
        try { msg = (await res.json()).error || msg; } catch (e) { /* sin JSON */ }
        mostrarErrorLogin(msg);
        return;
      }
      if (!res.ok) {
        mostrarErrorLogin('PIN incorrecto.');
        return;
      }
    } catch (e) {
      mostrarErrorLogin('Sin conexión. Inténtalo de nuevo.');
      return;
    }
  }

  try {
    const meRes = await fetch('/me');
    if (meRes.ok) {
      aplicarUsuarioLogueado(await meRes.json());
      // Los datos se pidieron antes de tener sesión: se recargan ya identificado.
      location.reload();
    }
  } catch (e) { /* se reintentará solo en la próxima recarga */ }
}

function mostrarPerfil() {
  document.getElementById('perfil-avatar').textContent = usuarioActualAvatar || AVATAR_INICIAL[usuarioActualNombre] || (usuarioActualNombre || '?').charAt(0);
  if (typeof pintarPerfilDatos === 'function') { perfilEditId = usuarioActualId; pintarPerfilDatos(); }
  document.getElementById('perfil-nombre').textContent = usuarioActualNombre || '';
  document.getElementById('perfil-pin-actual').value = '';
  document.getElementById('perfil-pin-nuevo').value = '';
  document.getElementById('perfil-pin-confirmar').value = '';
  const msg = document.getElementById('perfil-pin-mensaje');
  msg.classList.add('hidden');
  document.getElementById('modal-perfil').classList.remove('hidden');
}
function cerrarPerfil() {
  document.getElementById('modal-perfil').classList.add('hidden');
}

function mostrarMensajePerfil(texto, esError) {
  const msg = document.getElementById('perfil-pin-mensaje');
  msg.textContent = texto;
  msg.className = 'text-xs font-semibold ' + (esError ? 'text-rose-600' : 'text-emerald-600');
}

// Al cambiar de usuario, los documentos guardados en la caché del dispositivo
// se borran, para que no puedan verse sin conexión con otro perfil.
async function olvidarDocumentosEnCache() {
  if (!('caches' in window)) return;
  try {
    for (const nombre of await caches.keys()) {
      const cache = await caches.open(nombre);
      for (const peticion of await cache.keys()) {
        if (new URL(peticion.url).pathname.startsWith('/documentos')) await cache.delete(peticion);
      }
    }
  } catch (e) { /* si no se puede limpiar, no bloqueamos el cambio de usuario */ }
}

async function cerrarSesionUsuario() {
  try { await fetch('/logout', { method: 'POST' }); } catch (e) { /* seguimos igual */ }
  usuarioActualId = null;
  usuarioActualNombre = null;
  document.getElementById('chip-usuario-actual').classList.add('hidden');
  // Que no quede nada del perfil anterior a la vista detrás de la pantalla de login
  if (typeof cerrarModalDocumento === 'function') cerrarModalDocumento();
  if (typeof mostrarDocumentosBloqueados === 'function') mostrarDocumentosBloqueados();
  await olvidarDocumentosEnCache();
  await mostrarPantallaLogin();
}

document.addEventListener('DOMContentLoaded', () => {
  comprobarSesion();

  const modalPerfil = document.getElementById('modal-perfil');
  if (modalPerfil) modalPerfil.addEventListener('click', (e) => { if (e.target.id === 'modal-perfil') cerrarPerfil(); });

  const formPin = document.getElementById('form-cambiar-pin');
  if (formPin) {
    formPin.addEventListener('submit', async (e) => {
      e.preventDefault();
      const actual = document.getElementById('perfil-pin-actual').value.trim();
      const nuevo = document.getElementById('perfil-pin-nuevo').value.trim();
      const confirmar = document.getElementById('perfil-pin-confirmar').value.trim();

      if (!/^\d{6}$/.test(nuevo)) { mostrarMensajePerfil('El PIN nuevo debe tener 6 dígitos.', true); return; }
      if (nuevo !== confirmar) { mostrarMensajePerfil('Los dos PIN nuevos no coinciden.', true); return; }

      try {
        const res = await fetch(`/usuarios/${usuarioActualId}/cambiar-pin`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pin_actual: actual, pin_nuevo: nuevo })
        });
        if (!res.ok) {
          const texto = await res.text().catch(() => '');
          mostrarMensajePerfil(texto.includes('no es correcto') ? 'El PIN actual no es correcto.' : 'No se pudo cambiar el PIN.', true);
          return;
        }
        mostrarMensajePerfil('✅ PIN actualizado.', false);
        document.getElementById('perfil-pin-actual').value = '';
        document.getElementById('perfil-pin-nuevo').value = '';
        document.getElementById('perfil-pin-confirmar').value = '';
      } catch (err) {
        mostrarMensajePerfil('Sin conexión. Inténtalo de nuevo.', true);
      }
    });
  }
});
