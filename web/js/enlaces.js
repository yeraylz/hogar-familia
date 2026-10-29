'use strict';

let cacheEnlaces = [];
let enlaceEditandoId = null;
let fotosURL = '';

function hostDe(url) {
  try { return new URL(url).host; } catch (e) { return url; }
}

// ---------------- FOTOS (Immich) ----------------

// Se llama al abrir "Más": trae la dirección guardada y pinta la tarjeta.
async function cargarAjustesMas() {
  try {
    const res = await fetch('/ajustes/fotos');
    if (res.ok) fotosURL = (await res.json()).url || '';
  } catch (e) {
    // sin red: nos quedamos con la última dirección conocida
  }
  pintarTarjetaFotos();
}

function pintarTarjetaFotos() {
  const tarjeta = document.getElementById('card-fotos');
  const subtitulo = document.getElementById('fotos-subtitulo');
  if (!tarjeta || !subtitulo) return;
  tarjeta.href = fotosURL || '#';
  subtitulo.textContent = fotosURL ? hostDe(fotosURL) : 'Toca para configurar la dirección de Immich';
}

// Con dirección guardada, el enlace navega solo (así el navegador no lo bloquea).
// Sin ella, en vez de navegar abrimos el formulario para ponerla.
function clickFotos(e) {
  if (!fotosURL) {
    e.preventDefault();
    abrirAjusteFotos();
    return false;
  }
  return true;
}

function abrirAjusteFotos() {
  document.getElementById('url-fotos').value = fotosURL;
  document.getElementById('fotos-error').classList.add('hidden');
  document.getElementById('modal-fotos').classList.remove('hidden');
  document.getElementById('url-fotos').focus();
}

function cerrarAjusteFotos() {
  document.getElementById('modal-fotos').classList.add('hidden');
}

async function guardarAjusteFotos(valor) {
  const error = document.getElementById('fotos-error');
  if (!navigator.onLine) {
    error.textContent = 'Necesitas conexión para guardar.';
    error.classList.remove('hidden');
    return;
  }
  try {
    const res = await fetch('/ajustes/fotos', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: valor })
    });
    if (!res.ok) {
      let msg = 'No se pudo guardar.';
      try { msg = (await res.json()).error || msg; } catch (e) { /* respuesta sin JSON */ }
      error.textContent = msg;
      error.classList.remove('hidden');
      return;
    }
    fotosURL = (await res.json()).url || '';
    pintarTarjetaFotos();
    cerrarAjusteFotos();
  } catch (e) {
    error.textContent = 'Sin conexión. Inténtalo de nuevo.';
    error.classList.remove('hidden');
  }
}

function quitarAjusteFotos() {
  return guardarAjusteFotos('');
}

// ---------------- ENLACES ----------------

async function cargarEnlaces() {
  try {
    cacheEnlaces = await API.get('/enlaces');
    renderizarEnlaces();
  } catch (err) {
    console.error('Error al cargar los enlaces:', err);
  }
}

function renderizarEnlaces() {
  const cont = document.getElementById('lista-enlaces');
  const n = cacheEnlaces.length;
  document.getElementById('contador-general').textContent = `${n} enlace${n === 1 ? '' : 's'}`;

  if (cacheEnlaces.length === 0) {
    cont.innerHTML = `<div class="text-center py-10 border border-dashed border-slate-200 rounded-2xl bg-white/60">
      <p class="text-3xl mb-1">🔗</p>
      <p class="text-slate-500 text-sm font-medium">Aún no hay enlaces</p>
      <p class="text-slate-400 text-xs mt-0.5">Añade arriba los que quieras tener a mano</p>
    </div>`;
    return;
  }

  cont.innerHTML = cacheEnlaces.map(e => `
    <div class="flex items-center gap-1 bg-white border border-slate-200 rounded-2xl shadow-sm pr-1">
      <a href="${escapeHTML(e.url)}" target="_blank" rel="noopener noreferrer" class="flex items-center gap-3 flex-grow min-w-0 p-3.5">
        <span class="w-10 h-10 shrink-0 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center text-lg">🔗</span>
        <span class="min-w-0">
          <p class="text-sm font-semibold text-slate-800 truncate">${escapeHTML(e.titulo)}</p>
          <p class="text-[11px] text-slate-400 truncate">${escapeHTML(hostDe(e.url))}</p>
        </span>
      </a>
      <button onclick="iniciarEdicionEnlace(${e.id})" class="shrink-0 p-2 text-slate-400 hover:text-sky-600" title="Editar">✏️</button>
      <button onclick="borrarEnlace(${e.id})" class="shrink-0 p-2 text-slate-400 hover:text-rose-600" title="Borrar">❌</button>
    </div>`).join('');
}

function iniciarEdicionEnlace(id) {
  const e = cacheEnlaces.find(x => x.id === id);
  if (!e) return;
  enlaceEditandoId = id;
  document.getElementById('titulo-enlace').value = e.titulo;
  document.getElementById('url-enlace').value = e.url;
  document.getElementById('aviso-editando-enlace').classList.remove('hidden');
  document.getElementById('btn-submit-enlace').textContent = '💾 Guardar cambios';
  document.getElementById('form-enlace').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function cancelarEdicionEnlace() {
  enlaceEditandoId = null;
  document.getElementById('aviso-editando-enlace').classList.add('hidden');
  document.getElementById('btn-submit-enlace').textContent = '➕ Añadir enlace';
  document.getElementById('form-enlace').reset();
}

async function borrarEnlace(id) {
  if (!navigator.onLine) {
    alert('📡 Necesitas conexión para borrar un enlace.');
    return;
  }
  try {
    const res = await fetch(`/enlaces/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error(await res.text().catch(() => `HTTP ${res.status}`));
    if (enlaceEditandoId === id) cancelarEdicionEnlace();
    await cargarEnlaces();
  } catch (err) {
    mostrarError('Error al borrar el enlace', err);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const formFotos = document.getElementById('form-fotos');
  if (formFotos) {
    formFotos.addEventListener('submit', (e) => {
      e.preventDefault();
      guardarAjusteFotos(document.getElementById('url-fotos').value.trim());
    });
  }
  const modalFotos = document.getElementById('modal-fotos');
  if (modalFotos) modalFotos.addEventListener('click', (e) => { if (e.target.id === 'modal-fotos') cerrarAjusteFotos(); });

  const formEnlace = document.getElementById('form-enlace');
  if (formEnlace) {
    formEnlace.addEventListener('submit', async (e) => {
      e.preventDefault();
      const datos = {
        titulo: document.getElementById('titulo-enlace').value.trim(),
        url: document.getElementById('url-enlace').value.trim()
      };
      if (!datos.titulo || !datos.url) return;
      if (!navigator.onLine) {
        alert('📡 Necesitas conexión para guardar un enlace.');
        return;
      }
      try {
        const editando = enlaceEditandoId !== null;
        const res = await fetch(editando ? `/enlaces/${enlaceEditandoId}` : '/enlaces', {
          method: editando ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(datos)
        });
        if (!res.ok) {
          let msg = `HTTP ${res.status}`;
          try { msg = (await res.json()).error || msg; } catch (err) { /* sin JSON */ }
          throw new Error(msg);
        }
        cancelarEdicionEnlace();
        await cargarEnlaces();
      } catch (err) {
        mostrarError(enlaceEditandoId !== null ? 'Error al guardar los cambios' : 'Error al guardar el enlace', err);
      }
    });
  }
});
