'use strict';

// «Mis cosas»: lista de tareas + calendario personales de cada persona. Privado por completo
// (tablas propias en el servidor, nunca se mezclan con el Hogar familiar ni se ven entre
// personas), disponible desde el menú "Más".

const MISCOSAS = { tareas: [], eventos: [], vista: 'tareas', cargado: false, editando: null };

async function misCosasAbrir() {
  misCosasAplicarVista();
  await misCosasCargar();
  misCosasRepintar();
}

async function misCosasCargar() {
  try {
    const [t, e] = await Promise.all([
      fetch('/mis-cosas/tareas', { credentials: 'same-origin' }).then(r => r.ok ? r.json() : []),
      fetch('/mis-cosas/eventos', { credentials: 'same-origin' }).then(r => r.ok ? r.json() : [])
    ]);
    MISCOSAS.tareas = t || [];
    MISCOSAS.eventos = e || [];
    MISCOSAS.cargado = true;
  } catch (e) { /* se queda con lo que ya había, si lo había */ }
}

function misCosasCambiarVista(v) {
  MISCOSAS.vista = v === 'calendario' ? 'calendario' : 'tareas';
  misCosasAplicarVista();
  misCosasRepintar();
}

function misCosasAplicarVista() {
  const esTareas = MISCOSAS.vista !== 'calendario';
  const activa = 'flex-1 py-1.5 rounded-lg bg-white shadow-sm text-slate-900';
  const inactiva = 'flex-1 py-1.5 rounded-lg text-slate-500';
  const tabT = document.getElementById('mc-tab-tareas');
  const tabC = document.getElementById('mc-tab-calendario');
  if (tabT) tabT.className = esTareas ? activa : inactiva;
  if (tabC) tabC.className = esTareas ? inactiva : activa;
  const formT = document.getElementById('mc-form-tarea');
  const formE = document.getElementById('mc-form-evento');
  if (formT) formT.classList.toggle('hidden', !esTareas);
  if (formE) formE.classList.toggle('hidden', esTareas);
}

function misCosasRepintar() {
  const c = document.getElementById('mis-cosas-contenido');
  if (!c) return;
  if (!MISCOSAS.cargado) { c.innerHTML = '<p class="text-center text-sm text-slate-400 py-10">Cargando…</p>'; return; }
  c.innerHTML = MISCOSAS.vista === 'calendario' ? misCosasCalendarioHTML() : misCosasTareasHTML();
}

// ---------- Fechas ----------

function misCosasHoy() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function misCosasFechaTexto(iso, corto) {
  const d = new Date(iso + 'T12:00:00');
  const hoy = new Date(); hoy.setHours(12, 0, 0, 0);
  const dif = Math.round((d - hoy) / 86400000);
  if (dif === 0) return 'Hoy';
  if (dif === 1) return 'Mañana';
  if (dif === -1) return 'Ayer';
  return d.toLocaleDateString('es-ES', corto ? { day: 'numeric', month: 'short' } : { weekday: 'long', day: 'numeric', month: 'short' });
}

function misCosasVencida(iso) { return !!iso && iso < misCosasHoy(); }

// ---------- Tareas ----------

function misCosasFilaTarea(t) {
  const venc = !t.hecha && misCosasVencida(t.fecha);
  const chip = t.fecha ? `<span class="shrink-0 text-[11px] font-bold px-2 py-1 rounded-lg ml-2 ${t.hecha ? 'bg-slate-100 text-slate-400' : venc ? 'bg-rose-50 text-rose-600' : 'bg-indigo-50 text-indigo-600'}">${venc ? '⚠ ' : ''}${escapeHTML(misCosasFechaTexto(t.fecha, true))}</span>` : '';
  return `<div class="flex items-center gap-3 bg-white p-3 rounded-2xl border border-slate-200 shadow-sm">
      <button type="button" onclick="event.stopPropagation(); misCosasTareaToggle(${t.id})" aria-label="${t.hecha ? 'Marcar sin hacer' : 'Marcar hecha'}"
        class="shrink-0 w-6 h-6 rounded-full grid place-items-center text-xs text-white transition-all" style="background:${t.hecha ? '#4f46e5' : 'transparent'};border:2px solid ${t.hecha ? '#4f46e5' : '#cbd5e1'}">${t.hecha ? '✓' : ''}</button>
      <button type="button" onclick="misCosasTareaEditar(${t.id})" class="flex-grow min-w-0 text-left flex items-center bg-transparent border-0 p-0">
        <span class="flex-grow min-w-0 text-sm truncate ${t.hecha ? 'text-slate-400 line-through' : 'text-slate-800'}">${escapeHTML(t.texto)}</span>${chip}</button>
    </div>`;
}

function misCosasTareasHTML() {
  const activas = MISCOSAS.tareas.filter(t => !t.hecha);
  const hechas = MISCOSAS.tareas.filter(t => t.hecha);
  if (!MISCOSAS.tareas.length) return '<p class="text-center text-sm text-slate-400 py-10">📝<br>Aún no tienes ninguna tarea.</p>';
  return activas.map(misCosasFilaTarea).join('') + (hechas.length ? `<p class="text-xs font-semibold text-slate-400 mt-3 mb-1 px-1">Hechas</p><div class="space-y-2">${hechas.map(misCosasFilaTarea).join('')}</div>` : '');
}

async function misCosasTareaToggle(id) {
  const t = MISCOSAS.tareas.find(x => x.id === id);
  if (!t) return;
  t.hecha = !t.hecha;
  misCosasRepintar();
  try { await fetch('/mis-cosas/tareas/' + id, { method: 'PUT', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ hecha: t.hecha }) }); }
  catch (e) { /* se reintentará al recargar */ }
}

async function misCosasTareaBorrar(id) {
  MISCOSAS.tareas = MISCOSAS.tareas.filter(x => x.id !== id);
  misCosasRepintar();
  try { await fetch('/mis-cosas/tareas/' + id, { method: 'DELETE', credentials: 'same-origin' }); } catch (e) { /* ignorar */ }
}

// ---------- Calendario ----------

function misCosasFilaEvento(e) {
  const venc = misCosasVencida(e.fecha);
  return `<button type="button" onclick="misCosasEventoEditar(${e.id})" class="flex items-center gap-3 bg-white p-3 rounded-2xl border border-slate-200 shadow-sm w-full text-left">
      <span class="shrink-0 w-10 h-10 rounded-xl grid place-items-center text-base ${venc ? 'bg-rose-50' : 'bg-indigo-50'}">${venc ? '⚠️' : '📅'}</span>
      <span class="flex-grow min-w-0">
        <b class="block text-sm font-semibold text-slate-800 truncate">${escapeHTML(e.texto)}</b>
        <span class="block text-xs ${venc ? 'text-rose-600 font-semibold' : 'text-slate-400'}">${e.hora ? escapeHTML(e.hora) : 'Todo el día'}</span>
      </span>
      <span class="shrink-0 text-slate-300 text-lg">›</span></button>`;
}

function misCosasCalendarioHTML() {
  if (!MISCOSAS.eventos.length) return '<p class="text-center text-sm text-slate-400 py-10">📅<br>Aún no tienes recordatorios.</p>';
  const lista = MISCOSAS.eventos.slice().sort((a, b) => (a.fecha + (a.hora || '')).localeCompare(b.fecha + (b.hora || '')));
  let html = '';
  let fechaAnt = null;
  lista.forEach(e => {
    if (e.fecha !== fechaAnt) {
      fechaAnt = e.fecha;
      const venc = misCosasVencida(e.fecha);
      html += `<p class="text-xs font-bold uppercase tracking-wide mt-3 mb-1 px-1 ${venc ? 'text-rose-600' : 'text-indigo-600'}">${escapeHTML(misCosasFechaTexto(e.fecha))}</p>`;
    }
    html += `<div class="mb-2">${misCosasFilaEvento(e)}</div>`;
  });
  html += `<p class="text-center text-[11px] text-slate-400 mt-3 pb-1">No se mezcla con el calendario familiar de Hogar: es solo tuyo.</p>`;
  return html;
}

async function misCosasEventoBorrar(id) {
  MISCOSAS.eventos = MISCOSAS.eventos.filter(x => x.id !== id);
  misCosasRepintar();
  try { await fetch('/mis-cosas/eventos/' + id, { method: 'DELETE', credentials: 'same-origin' }); } catch (e) { /* ignorar */ }
}

// ---------- Editar (modal) ----------

function misCosasHojaCerrar() {
  const m = document.getElementById('modal-mc-editar');
  if (m) m.classList.add('hidden');
  MISCOSAS.editando = null;
}

function misCosasTareaEditar(id) {
  const t = MISCOSAS.tareas.find(x => x.id === id);
  if (!t) return;
  MISCOSAS.editando = { tipo: 'tarea', id };
  document.getElementById('modal-mc-titulo').textContent = 'Editar tarea';
  document.getElementById('mc-edit-texto').value = t.texto;
  document.getElementById('mc-edit-fecha').value = t.fecha || '';
  document.getElementById('modal-mc-hora-wrap').classList.add('hidden');
  document.getElementById('modal-mc-editar').classList.remove('hidden');
}

function misCosasEventoEditar(id) {
  const e = MISCOSAS.eventos.find(x => x.id === id);
  if (!e) return;
  MISCOSAS.editando = { tipo: 'evento', id };
  document.getElementById('modal-mc-titulo').textContent = 'Editar recordatorio';
  document.getElementById('mc-edit-texto').value = e.texto;
  document.getElementById('mc-edit-fecha').value = e.fecha || '';
  document.getElementById('mc-edit-hora').value = e.hora || '';
  document.getElementById('modal-mc-hora-wrap').classList.remove('hidden');
  document.getElementById('modal-mc-editar').classList.remove('hidden');
}

document.addEventListener('DOMContentLoaded', () => {
document.getElementById('mc-form-tarea').addEventListener('submit', async (e) => {
  e.preventDefault();
  const texto = document.getElementById('mc-input-tarea').value.trim();
  const fecha = document.getElementById('mc-input-tarea-fecha').value;
  if (!texto) return;
  try {
    const r = await fetch('/mis-cosas/tareas', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ texto, fecha }) });
    const j = await r.json();
    if (r.ok) {
      MISCOSAS.tareas.push(j);
      document.getElementById('mc-form-tarea').reset();
      misCosasRepintar();
    } else if (typeof mostrarToast === 'function') mostrarToast(j.error || 'No se pudo guardar');
  } catch (err) { if (typeof mostrarToast === 'function') mostrarToast('Sin conexión'); }
});

document.getElementById('mc-form-evento').addEventListener('submit', async (e) => {
  e.preventDefault();
  const texto = document.getElementById('mc-input-evento').value.trim();
  const fecha = document.getElementById('mc-input-fecha').value;
  const hora = document.getElementById('mc-input-hora').value;
  if (!texto || !fecha) return;
  try {
    const r = await fetch('/mis-cosas/eventos', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ texto, fecha, hora }) });
    const j = await r.json();
    if (r.ok) {
      MISCOSAS.eventos.push(j);
      document.getElementById('mc-form-evento').reset();
      misCosasRepintar();
    } else if (typeof mostrarToast === 'function') mostrarToast(j.error || 'No se pudo guardar');
  } catch (err) { if (typeof mostrarToast === 'function') mostrarToast('Sin conexión'); }
});

document.getElementById('mc-edit-borrar').addEventListener('click', () => {
  if (!MISCOSAS.editando) return;
  const { tipo, id } = MISCOSAS.editando;
  misCosasHojaCerrar();
  if (tipo === 'tarea') misCosasTareaBorrar(id); else misCosasEventoBorrar(id);
});

document.getElementById('form-mc-editar').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!MISCOSAS.editando) return;
  const { tipo, id } = MISCOSAS.editando;
  const texto = document.getElementById('mc-edit-texto').value.trim();
  const fecha = document.getElementById('mc-edit-fecha').value;
  if (!texto || !fecha) { if (typeof mostrarToast === 'function') mostrarToast('Falta el texto o la fecha'); return; }
  misCosasHojaCerrar();
  if (tipo === 'tarea') {
    const t = MISCOSAS.tareas.find(x => x.id === id);
    if (t) { t.texto = texto; t.fecha = fecha; }
    misCosasRepintar();
    try { await fetch('/mis-cosas/tareas/' + id, { method: 'PUT', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ texto, fecha }) }); }
    catch (err) { if (typeof mostrarToast === 'function') mostrarToast('Sin conexión: no se ha guardado'); }
  } else {
    const hora = document.getElementById('mc-edit-hora').value;
    const e2 = MISCOSAS.eventos.find(x => x.id === id);
    if (e2) { e2.texto = texto; e2.fecha = fecha; e2.hora = hora; }
    misCosasRepintar();
    try { await fetch('/mis-cosas/eventos/' + id, { method: 'PUT', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ texto, fecha, hora }) }); }
    catch (err) { if (typeof mostrarToast === 'function') mostrarToast('Sin conexión: no se ha guardado'); }
  }
});

document.getElementById('modal-mc-editar').addEventListener('click', (e) => { if (e.target.id === 'modal-mc-editar') misCosasHojaCerrar(); });
});
