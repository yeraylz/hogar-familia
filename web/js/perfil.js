'use strict';

// Perfiles con personalidad: rol (papá, mamá…), avatar, cumpleaños y apodo.
// Los datos se guardan en el servidor y los ve toda la familia.
const PERFIL_ROLES = {
  papa: '👨 Papá', mama: '👩 Mamá', hijo: '👦 Hijo', hija: '👧 Hija', otro: '🙂 Otro'
};
const PERFIL_AVATARES = [
  // Personas
  '👨', '👩', '🧔', '👱‍♀️', '👱‍♂️', '👨‍🦰', '👩‍🦰', '👨‍🦱', '👩‍🦱', '👨‍🦳', '👩‍🦳', '👨‍🦲', '🧑', '👦', '👧', '👶', '🧒', '🧓', '👴', '👵',
  // Personajes
  '🦸‍♂️', '🦸‍♀️', '🦹‍♂️', '🧙‍♂️', '🧙‍♀️', '🧚‍♀️', '🧜‍♀️', '🧛‍♂️', '🥷', '🤠', '👸', '🤴', '🎅', '🤶', '👨‍🚀', '👩‍🚀', '👨‍🍳', '👩‍🍳', '👨‍🎤', '👩‍🎤',
  // Caras
  '😀', '😎', '🤓', '🥳', '😇', '🤩', '😴', '🤪', '😏', '🥰', '🤗', '😈', '🤖', '👻', '👽', '💩', '🤡', '🦄',
  // Animales
  '🦊', '🐻', '🐼', '🐨', '🦁', '🐯', '🐶', '🐱', '🐭', '🐹', '🐰', '🐸', '🐵', '🐔', '🐧', '🦉', '🦅', '🐺', '🐗', '🐴', '🦓', '🦒', '🐘', '🦏', '🐢', '🐙', '🦈', '🐬', '🐳', '🦋', '🐝', '🐞',
  // Comida y plantas
  '🍕', '🍔', '🌮', '🍩', '🍪', '🍓', '🍒', '🍉', '🍑', '🥑', '🍄', '🌻', '🌵', '🌴', '🍀',
  // Cosas y deportes
  '🚀', '⚽', '🏀', '🏐', '🎾', '🏋️', '🚴', '🏄', '⛷️', '🎸', '🎹', '🎧', '🎮', '🎨', '📚', '☕', '🎲', '🏆', '👑', '🌈', '⭐', '🔥', '❤️', '💎', '🌙', '☀️'
];

let perfilesFamilia = [];
let estadosFamilia = [];
const ESTADOS_RAPIDOS = ['💪 A tope', '😴 Cansado/a', '🏋️ Entrenando', '💼 Currando', '🍳 Hoy cocino yo', '🛒 De compras', '🛋️ Relax', '🎉 De fiesta'];
const REACCIONES = ['❤️', '👏', '🔥', '😂', '💪'];
let perfilEditId = null;
let perfilForm = null;

// Solo el emoji (para textos y avisos).
function perfilEmojiDe(p) {
  return (p && p.avatar) || (typeof AVATAR_INICIAL !== 'undefined' && p && AVATAR_INICIAL[p.nombre]) || (p && p.nombre ? p.nombre.charAt(0) : '?');
}

// Foto de perfil si la hay; si no, el emoji. Devuelve HTML.
function perfilAvatarDe(p) {
  if (p && p.foto) return `<img class="av-foto" src="/perfiles/${p.usuario_id}/foto?v=${p.foto}" alt="" draggable="false" onerror="this.replaceWith(document.createTextNode(this.dataset.e||'👤'))" data-e="${escapeHTML(perfilEmojiDe(p))}">`;
  return escapeHTML(perfilEmojiDe(p));
}

function perfilFechaParts(iso) {
  const [y, m, d] = String(iso).split('-').map(Number);
  return { y, m, d };
}

// Edad y próximo cumpleaños a partir de la fecha de nacimiento (AAAA-MM-DD).
function perfilCumple(nac, hoyISO) {
  if (!nac) return null;
  const n = perfilFechaParts(nac), h = perfilFechaParts(hoyISO);
  const hoy = new Date(h.y, h.m - 1, h.d);
  let cand = new Date(h.y, n.m - 1, n.d);
  if (cand < hoy) cand = new Date(h.y + 1, n.m - 1, n.d);
  const dias = Math.round((cand - hoy) / 86400000);
  const cumpleEsteAnio = new Date(h.y, n.m - 1, n.d);
  let edad = h.y - n.y;
  if (hoy < cumpleEsteAnio) edad--;
  let meses = (h.y - n.y) * 12 + (h.m - n.m) - (h.d < n.d ? 1 : 0);
  return { dias, edad, meses, cumplira: cand.getFullYear() - n.y, fecha: cand };
}

function perfilEdadTexto(c) {
  if (!c) return '';
  if (c.edad < 3) {
    const m = c.meses % 12;
    return c.edad === 0 ? `${c.meses} meses` : `${c.edad} año${c.edad > 1 ? 's' : ''}${m ? ' y ' + m + ' meses' : ''}`;
  }
  return c.edad + ' años';
}

async function perfilCargar() {
  try { const r = await API.get('/perfiles?t=' + Date.now()); if (Array.isArray(r)) perfilesFamilia = r; } catch (e) { /* se queda lo que había */ }
  if (typeof perfilPintarMio === 'function') perfilPintarMio();
  return perfilesFamilia;
}

// Saludo con tu rol y los próximos cumpleaños de la familia, arriba de Hoy.
async function pintarFamiliaHoy() {
  const cont = document.getElementById('hoy-familia');
  if (!cont) return;
  await perfilCargar();
  try { const r = await API.get('/estados?t=' + Date.now()); if (Array.isArray(r)) estadosFamilia = r; } catch (e) { /* se queda lo anterior */ }
  if (typeof cargarSocialHoy === 'function') await cargarSocialHoy();
  cargarTiempoHoy();
  const hoy = hoyLocalISO();
  const yo = perfilesFamilia.find(p => p.usuario_id === usuarioActualId);
  const hora = new Date().getHours();
  const saludo = hora < 14 ? 'Buenos días' : (hora < 21 ? 'Buenas tardes' : 'Buenas noches');
  const nombre = yo ? (yo.apodo || yo.nombre) : '';
  const sub = yo ? [PERFIL_ROLES[yo.rol] ? PERFIL_ROLES[yo.rol].slice(3) : '', yo.nacimiento ? perfilEdadTexto(perfilCumple(yo.nacimiento, hoy)) : ''].filter(Boolean).join(' · ') : '';
  const cab = nombre ? `<div class="flex items-center gap-3 px-1">
      <button type="button" onclick="mostrarPerfil()" class="w-11 h-11 shrink-0 rounded-2xl bg-white border border-slate-200 shadow-sm flex items-center justify-center text-2xl">${perfilAvatarDe(yo)}</button>
      <div class="min-w-0"><p class="text-lg font-extrabold text-slate-900 leading-tight truncate">${saludo}, ${escapeHTML(nombre)}</p>
      ${sub ? `<p class="text-xs text-slate-400">${escapeHTML(sub)}</p>` : ''}</div>
      <div id="hoy-tiempo" class="ml-auto shrink-0 text-right">${htmlTiempoHoy()}</div></div>` : '';
  const cumples = perfilesFamilia.filter(p => p.nacimiento).map(p => ({ p, c: perfilCumple(p.nacimiento, hoy) }))
    .filter(x => x.c && x.c.dias <= 30).sort((a, b) => a.c.dias - b.c.dias).slice(0, 3);
  const fmt = c => c.fecha.toLocaleDateString('es-ES', { day: 'numeric', month: 'long' });
  const tarjetaHoy = ({ p, c }) => `<div class="flex items-center gap-3 p-3.5 rounded-2xl bg-gradient-to-r from-pink-100 to-amber-100 border border-pink-200">
        <span class="text-3xl">🎉</span><div><p class="text-sm font-extrabold text-slate-900">¡Hoy es el cumple de ${escapeHTML(p.apodo || p.nombre)}!</p><p class="text-xs text-slate-600">Cumple ${c.cumplira} años · ${perfilAvatarDe(p)}</p></div></div>`;
  const tarjetaProx = ({ p, c }) => `<div class="flex items-center gap-3 p-3 rounded-2xl bg-slate-50 border border-slate-100">
        <span class="text-2xl">🎂</span><p class="text-sm text-slate-700 min-w-0"><span class="font-semibold">${escapeHTML(p.apodo || p.nombre)}</span> cumple ${c.cumplira} años ${c.dias === 1 ? '<b>mañana</b>' : 'en <b>' + c.dias + ' días</b>'} <span class="text-slate-400">(${fmt(c)})</span></p></div>`;
  // Arriba solo el saludo y el cumpleaños de hoy; el resto de la familia, plegado al final.
  const arriba = document.getElementById('hoy-familia-arriba');
  if (arriba) arriba.innerHTML = cab + cumples.filter(x => x.c.dias === 0).map(tarjetaHoy).join('');
  const prox = cumples.filter(x => x.c.dias > 0);
  const chips = [];
  if (typeof socialCuentas !== 'undefined' && socialCuentas.length) {
    const sig = socialCuentas.map(c => ({ c, d: diasHastaCuenta(c.fecha) })).filter(x => x.d >= 0)[0];
    if (sig) chips.push('⏳ ' + escapeHTML(sig.c.titulo.length > 14 ? sig.c.titulo.slice(0, 13) + '…' : sig.c.titulo) + ' ' + (sig.d === 0 ? 'hoy' : sig.d + ' d'));
  }
  const nuevos = (typeof socialMensajes !== 'undefined' ? socialMensajes : []).filter(m => m.no_leido).length;
  if (nuevos) chips.push('💌 ' + nuevos);
  if (prox.length) chips.push('🎂 ' + escapeHTML(prox[0].p.apodo || prox[0].p.nombre) + ' en ' + prox[0].c.dias + ' d');
  const abierto = familiaAbierta();
  cont.innerHTML = `<details ${abierto ? 'open' : ''} ontoggle="familiaGuardarAbierta(this.open)" class="bg-white border border-slate-200 rounded-2xl shadow-sm">
    <summary class="flex items-center justify-between gap-2 px-4 py-3 cursor-pointer list-none">
      <span class="text-sm font-bold text-slate-800">👨‍👩‍👧 Familia</span>
      <span class="text-xs text-slate-400 truncate">${chips.join(' · ')} <span class="text-slate-300">›</span></span></summary>
    <div class="px-3 pb-3 space-y-3">${prox.map(tarjetaProx).join('')}${htmlFamiliaHoy()}${typeof htmlSocialHoy === 'function' ? htmlSocialHoy() : ''}</div></details>`;
}

function familiaAbierta() {
  try { return localStorage.getItem('hogar_familia_abierta') === '1'; } catch (e) { return false; }
}
function familiaGuardarAbierta(v) {
  try { localStorage.setItem('hogar_familia_abierta', v ? '1' : '0'); } catch (e) { /* ignorar */ }
}

// ---------- Tiempo en el saludo ----------
let tiempoHoy = null;

function htmlTiempoHoy() {
  const t = tiempoHoy;
  if (!t) return '';
  const g = v => Math.round(v) + '°';
  return `<div title="${escapeHTML(t.texto)} · máx ${g(t.max)} · mín ${g(t.min)}" class="flex items-center gap-1.5">
    <span class="text-3xl leading-none">${t.icono}</span>
    <div class="leading-tight"><p class="text-lg font-extrabold text-slate-900">${g(t.temp)}</p><p class="text-[10px] text-slate-400">${g(t.min)} / ${g(t.max)}</p></div></div>`;
}

// Se pide aparte para que el saludo no espere a que responda el servicio del tiempo.
async function cargarTiempoHoy() {
  try {
    const t = await API.get('/tiempo?t=' + Date.now());
    if (t && typeof t.temp === 'number') {
      tiempoHoy = t;
      const el = document.getElementById('hoy-tiempo');
      if (el) el.innerHTML = htmlTiempoHoy();
    }
  } catch (e) { /* sin tiempo: el saludo queda igual */ }
}

// ---------- Estado del día de la familia ----------
function htmlFamiliaHoy() {
  if (perfilesFamilia.length < 2) return '';
  const tarjetas = perfilesFamilia.map(p => {
    const e = estadosFamilia.find(x => x.usuario_id === p.usuario_id);
    const yo = p.usuario_id === usuarioActualId;
    const estado = e ? `${e.emoji ? e.emoji + ' ' : ''}${escapeHTML(e.texto)}` : '';
    let pie = '';
    if (yo) {
      pie = `<button type="button" onclick="abrirEstado()" class="mt-1.5 text-[11px] font-semibold text-indigo-600">${e ? '✏️ Cambiar' : '＋ ¿Cómo vas hoy?'}</button>`;
    } else if (e) {
      pie = `<div class="mt-1.5 flex flex-wrap justify-center gap-1">${REACCIONES.map(em => {
        const n = e.reacciones.filter(r => r.emoji === em).length;
        const mia = e.reacciones.some(r => r.emoji === em && r.de_id === usuarioActualId);
        return `<button type="button" onclick="reaccionarEstado(${p.usuario_id}, '${em}')" class="px-1.5 py-0.5 rounded-full border text-xs ${mia ? 'border-indigo-400 bg-indigo-50' : 'border-slate-200 bg-white'}">${em}${n ? ' <b class="text-[10px]">' + n + '</b>' : ''}</button>`;
      }).join('')}</div>`;
    }
    const reacYo = yo && e && e.reacciones.length ? `<p class="mt-1 text-sm">${e.reacciones.map(r => r.emoji).join(' ')}</p>` : '';
    return `<div class="shrink-0 w-36 snap-start bg-white border ${yo ? 'border-indigo-200' : 'border-slate-200'} rounded-2xl shadow-sm p-3 text-center">
      <span class="text-3xl">${perfilAvatarDe(p)}</span>
      <p class="text-xs font-bold text-slate-800 truncate">${escapeHTML(p.apodo || p.nombre)}</p>
      <p class="text-xs ${estado ? 'text-slate-600' : 'text-slate-300'} min-h-[2rem] break-words">${estado || 'sin novedades'}</p>
      ${reacYo}${pie}</div>`;
  }).join('');
  return `<div><p class="text-xs font-bold text-slate-400 uppercase tracking-wider px-1 mb-1.5">👨‍👩‍👧 La familia hoy</p>
    <div class="flex gap-2 overflow-x-auto snap-x pb-1">${tarjetas}</div></div>`;
}

async function reaccionarEstado(paraId, emoji) {
  try {
    estadosFamilia = await API.post('/estados/' + paraId + '/reaccion', { emoji });
    pintarFamiliaHoy();
  } catch (e) { mostrarError('No se pudo enviar la reacción', e); }
}

function abrirEstado() {
  const e = estadosFamilia.find(x => x.usuario_id === usuarioActualId);
  let m = document.getElementById('modal-estado');
  if (m) m.remove();
  m = document.createElement('div');
  m.id = 'modal-estado';
  m.className = 'fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/40 backdrop-blur-sm p-0 sm:p-4';
  m.addEventListener('click', (ev) => { if (ev.target === m) m.remove(); });
  m.innerHTML = `
    <div class="bg-white w-full max-w-md rounded-t-3xl sm:rounded-3xl shadow-xl p-5 space-y-3">
      <div class="flex items-center justify-between">
        <h3 class="text-base font-bold text-slate-900">¿Cómo vas hoy?</h3>
        <button type="button" onclick="document.getElementById('modal-estado').remove()" class="text-slate-400 text-2xl leading-none" aria-label="Cerrar">×</button>
      </div>
      <p class="text-xs text-slate-400">Lo verá toda la familia en Hoy y puede reaccionar. Se borra solo a medianoche.</p>
      <div class="flex flex-wrap gap-1.5">${ESTADOS_RAPIDOS.map(t => `<button type="button" onclick="guardarEstado('${t.split(' ')[0]}', '${t.slice(t.indexOf(' ') + 1)}')" class="px-3 py-1.5 rounded-xl text-xs font-semibold border border-slate-200 text-slate-700 active:scale-95">${t}</button>`).join('')}</div>
      <div class="flex gap-2">
        <input id="estado-emoji" type="text" maxlength="4" value="${escapeHTML(e ? e.emoji : '😀')}" class="w-14 text-center bg-slate-50 border border-slate-200 rounded-xl py-2 text-lg focus:outline-none">
        <input id="estado-texto" type="text" maxlength="40" value="${escapeHTML(e ? e.texto : '')}" placeholder="O escribe lo tuyo…" class="flex-grow min-w-0 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none">
      </div>
      <div class="flex gap-2">
        <button type="button" onclick="guardarEstado('', '')" class="px-4 py-2.5 rounded-xl bg-slate-100 text-slate-600 text-sm font-semibold">Quitar</button>
        <button type="button" onclick="guardarEstado(document.getElementById('estado-emoji').value, document.getElementById('estado-texto').value)" class="flex-1 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white font-semibold py-2.5 rounded-xl text-sm transition-all">Publicar</button>
      </div>
    </div>`;
  document.body.appendChild(m);
}

async function guardarEstado(emoji, texto) {
  try {
    estadosFamilia = await API.put('/estados', { emoji, texto });
    const m = document.getElementById('modal-estado');
    if (m) m.remove();
    pintarFamiliaHoy();
  } catch (e) { mostrarError('No se pudo guardar tu estado', e); }
}

// ---------- Editor dentro de «Mi perfil» ----------
async function pintarPerfilDatos() {
  const cont = document.getElementById('perfil-datos');
  if (!cont) return;
  await perfilCargar();
  // Cada persona edita solo lo suyo: ya no se puede elegir el perfil de otro (ni de un peque de la
  // familia, ni mucho menos el de un invitado), así que esto siempre es el perfil de quien ha entrado.
  perfilEditId = usuarioActualId;
  const p = perfilesFamilia.find(x => x.usuario_id === perfilEditId);
  if (!p) { cont.innerHTML = ''; return; }
  perfilForm = { rol: p.rol, avatar: p.avatar, nacimiento: p.nacimiento, apodo: p.apodo };
  repintarPerfilDatos();
}

function repintarPerfilDatos() {
  const cont = document.getElementById('perfil-datos');
  const p = perfilesFamilia.find(x => x.usuario_id === perfilEditId);
  if (!cont || !p) return;
  const f = perfilForm;
  const c = f.nacimiento ? perfilCumple(f.nacimiento, hoyLocalISO()) : null;
  cont.innerHTML = `
    <p class="text-sm font-bold text-slate-800">Sobre ti</p>
    <div class="flex items-center gap-3">
      <span class="w-14 h-14 rounded-full bg-indigo-100 flex items-center justify-center text-2xl overflow-hidden shrink-0">${perfilAvatarDe(p)}</span>
      <div class="flex flex-wrap gap-2">
        <label class="px-3 py-1.5 rounded-xl text-xs font-semibold border border-slate-200 bg-white text-slate-600 cursor-pointer">📷 ${p.foto ? 'Cambiar foto' : 'Poner foto'}<input type="file" accept="image/*" class="hidden" onchange="perfilFotoElegir(this, ${p.usuario_id})"></label>
        ${p.foto ? `<button type="button" onclick="perfilFotoQuitar(${p.usuario_id})" class="px-3 py-1.5 rounded-xl text-xs font-semibold border border-slate-200 bg-white text-rose-600">Quitar</button>` : ''}</div></div>
    <div><p class="text-[10px] font-bold text-slate-400 uppercase mb-1">Frase (la ven en tu perfil)</p>
      <div class="flex gap-2"><input id="perfil-frase" type="text" maxlength="80" value="${escapeHTML(p.frase || '')}" placeholder="Disponible, En el trabajo…" class="w-full bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-2 text-sm focus:outline-none">
        <button type="button" onclick="perfilFraseGuardar(${p.usuario_id}, document.getElementById('perfil-frase').value)" class="shrink-0 px-3 rounded-xl text-xs font-semibold bg-slate-800 text-white">Guardar</button></div></div>
    <div class="flex flex-wrap gap-1.5 max-h-44 overflow-y-auto pr-1">${PERFIL_AVATARES.map(a => `<button type="button" onclick="perfilCampo('avatar','${a}')" class="w-9 h-9 rounded-xl border text-xl flex items-center justify-center ${f.avatar === a ? 'border-indigo-500 bg-indigo-50' : 'border-slate-200'}">${a}</button>`).join('')}</div>
    <div class="flex items-center gap-2"><input id="perfil-avatar-libre" type="text" maxlength="16" placeholder="O escribe el tuyo 😊" onchange="perfilAvatarLibre(this.value)" class="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none"></div>
    <div class="flex flex-wrap gap-1.5">${Object.entries(PERFIL_ROLES).map(([k, t]) => `<button type="button" onclick="perfilCampo('rol','${k}')" class="px-3 py-1.5 rounded-xl text-xs font-semibold border ${f.rol === k ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white border-slate-200 text-slate-600'}">${t}</button>`).join('')}</div>
    <div class="grid grid-cols-2 gap-2">
      <div><p class="text-[10px] font-bold text-slate-400 uppercase mb-1">Cumpleaños</p>
        <input id="perfil-nac" type="date" value="${escapeHTML(f.nacimiento)}" max="${hoyLocalISO()}" onchange="perfilForm.nacimiento=this.value; repintarPerfilDatos()" class="w-full bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-2 text-sm focus:outline-none"></div>
      <div><p class="text-[10px] font-bold text-slate-400 uppercase mb-1">Apodo (opcional)</p>
        <input id="perfil-apodo" type="text" maxlength="20" value="${escapeHTML(f.apodo)}" oninput="perfilForm.apodo=this.value" placeholder="${escapeHTML(p.nombre)}" class="w-full bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-2 text-sm focus:outline-none"></div>
    </div>
    ${c ? `<p class="text-xs text-slate-500">${perfilEdadTexto(c)} · ${c.dias === 0 ? '¡hoy es su cumple! 🎉' : 'próximo cumple en ' + c.dias + ' días'}</p>` : ''}
    <p id="perfil-datos-msg" class="hidden text-xs font-semibold"></p>
    <button type="button" onclick="perfilGuardar()" class="w-full bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white font-semibold py-2.5 rounded-xl text-sm transition-all">💾 Guardar</button>`;
}

function perfilAvatarLibre(v) {
  v = (v || '').trim();
  if (v) perfilCampo('avatar', v);
}
function perfilCampo(k, v) { perfilForm[k] = v; repintarPerfilDatos(); }

async function perfilGuardar() {
  const msg = () => document.getElementById('perfil-datos-msg');
  try {
    perfilesFamilia = await API.put('/perfiles/' + perfilEditId, perfilForm);
    if (perfilEditId === usuarioActualId) {
      const yo = perfilesFamilia.find(p => p.usuario_id === usuarioActualId);
      usuarioActualAvatar = perfilEmojiDe(yo);
      if (typeof perfilPintarMio === 'function') perfilPintarMio();
    }
    repintarPerfilDatos();
    const m = msg();
    if (m) { m.textContent = 'Guardado ✓'; m.className = 'text-xs font-semibold text-emerald-600'; }
    if (typeof moduloActual !== 'undefined' && moduloActual === 'hoy') pintarFamiliaHoy();
  } catch (e) {
    const m = msg();
    if (m) { m.textContent = (e && e.message) || 'No se pudo guardar'; m.className = 'text-xs font-semibold text-rose-600'; }
  }
}
