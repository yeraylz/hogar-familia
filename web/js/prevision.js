'use strict';

// Pestaña «Previsión»: calendario de pagos por semanas, saldo previsto de la cuenta conjunta y suscripciones.

let datosPrevision = null;
let datosSuscripciones = null;
let previsionMes = '';

async function cargarPrevision() {
  if (!previsionMes) previsionMes = hoyLocalISO().slice(0, 7);
  const cont = document.getElementById('pagos-prevision');
  if (!cont) return;
  try {
    const [p, s] = await Promise.all([API.get('/gastos/prevision?mes=' + previsionMes), API.get('/gastos/suscripciones')]);
    datosPrevision = p;
    datosSuscripciones = s;
  } catch (e) {
    if (!datosPrevision) { cont.innerHTML = '<p class="text-sm text-rose-600 px-1">No se pudo cargar la previsión.</p>'; return; }
  }
  pintarPrevision();
}

function cambiarMesPrevision(n) {
  previsionMes = mesMasN(previsionMes, n);
  cargarPrevision();
}

function fechaCortaPrev(f) {
  return parseFechaISO(f).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', timeZone: 'UTC' }).replace('.', '');
}

function colorSaldoPrev(v, colchon) {
  return v < 0 ? 'text-rose-600' : (v < colchon ? 'text-amber-600' : 'text-emerald-600');
}

function htmlCuentaPrevision() {
  const p = datosPrevision;
  if (!p.configurada) {
    return `<section class="bg-white border border-slate-200 rounded-2xl shadow-sm p-4">
      <p class="text-[11px] font-bold text-slate-400 uppercase tracking-wider">🏦 Cuenta conjunta</p>
      <p class="text-sm text-slate-600 mt-1">Apunta cuánto hay ahora en la cuenta y la app calculará si llegáis a fin de mes y os avisará antes de un cargo grande.</p>
      <button type="button" onclick="abrirSaldoPrevision()" class="mt-3 bg-indigo-600 text-white text-sm font-semibold px-4 py-2 rounded-xl active:scale-95">Apuntar el saldo</button>
    </section>`;
  }
  const hoy = hoyLocalISO();
  const dias = Math.round((parseFechaISO(hoy) - parseFechaISO(p.fecha_saldo)) / 86400000);
  const min = p.minimo || {};
  const hayMin = min.fecha && min.saldo < p.saldo_hoy - 0.5;
  return `<section class="bg-white border border-slate-200 rounded-2xl shadow-sm p-4 space-y-2">
    <div class="flex items-start justify-between gap-2">
      <div>
        <p class="text-[11px] font-bold text-slate-400 uppercase tracking-wider">🏦 Cuenta conjunta · hoy (estimado)</p>
        <p class="text-3xl font-extrabold leading-tight ${colorSaldoPrev(p.saldo_hoy, p.colchon)}">${eurosCortos(p.saldo_hoy)}</p>
      </div>
      <button type="button" onclick="abrirSaldoPrevision()" class="text-xs font-semibold text-sky-600 shrink-0 mt-1">✏️ Actualizar</button>
    </div>
    ${p.fin_mes !== undefined ? `<p class="text-sm text-slate-700">A final de mes: <b class="${colorSaldoPrev(p.fin_mes, p.colchon)}">${eurosCortos(p.fin_mes)}</b>${p.fin_mes < 0 ? ' · <span class="font-semibold text-rose-600">no llegáis</span>' : (p.fin_mes < p.colchon ? ' · <span class="font-semibold text-amber-600">justo</span>' : ' · <span class="font-semibold text-emerald-600">llegáis</span>')}</p>` : ''}
    ${hayMin ? `<p class="text-[12px] text-slate-500">Punto más bajo de las próximas semanas: <b class="${colorSaldoPrev(min.saldo, p.colchon)}">${eurosCortos(min.saldo)}</b> el ${escapeHTML(fechaCortaPrev(min.fecha))}</p>` : ''}
    <p class="text-[11px] text-slate-400">Saldo apuntado el ${escapeHTML(fechaCortaPrev(p.fecha_saldo))} (${eurosCortos(p.saldo)}). Cuenta facturas, gastos fijos, hipoteca, aportaciones (${eurosCortos(p.aporte)}/mes) y unas compras sueltas de ~${eurosCortos(p.variable_dia)} al día.</p>
    ${dias > 14 ? `<p class="text-[11px] font-semibold text-amber-600">Hace ${dias} días que no actualizas el saldo: la previsión pierde precisión.</p>` : ''}
    <button type="button" onclick="abrirAvisosPrevision()" class="text-xs font-semibold text-sky-600">🔔 Avisarme si queda menos de ${eurosCortos(p.colchon)} tras un cargo de ${eurosCortos(p.grande)} o más</button>
  </section>`;
}

function htmlSemanasPrevision() {
  const p = datosPrevision;
  const semanas = p.semanas || [];
  const max = Math.max(0, ...semanas.map(s => s.total));
  const hoy = hoyLocalISO();
  const filas = semanas.map(s => {
    const items = s.items.map(m => {
      const ingreso = m.tipo === 'ingreso';
      const icono = ingreso ? '💰' : (m.tipo === 'fijo' ? '🔁' : (m.tipo === 'hipoteca' ? '🏠' : '🧾'));
      const grande = !ingreso && p.configurada && m.con_saldo && m.importe >= p.grande && m.saldo < p.colchon;
      return `<div class="flex items-center gap-2 py-1.5 text-sm ${m.pagado ? 'opacity-60' : ''}">
        <span class="w-11 shrink-0 text-xs ${m.fecha < hoy && !m.pagado ? 'text-rose-600 font-bold' : 'text-slate-400'}">${escapeHTML(fechaCortaPrev(m.fecha))}</span>
        <span class="flex-grow min-w-0 truncate text-slate-700 ${m.pagado ? 'line-through' : ''}">${icono} ${escapeHTML(m.nombre)}${m.pagado ? ' <span class="text-emerald-600 no-underline">✓</span>' : ''}</span>
        <span class="text-right shrink-0"><span class="font-semibold ${ingreso ? 'text-emerald-600' : 'text-slate-800'}">${ingreso ? '+' : ''}${eurosCortos(m.importe)}</span>${m.con_saldo ? `<span class="block text-[10px] ${grande ? 'font-bold text-rose-600' : 'text-slate-400'}">quedan ${eurosCortos(m.saldo)}</span>` : ''}</span>
      </div>`;
    }).join('');
    const rango = s.desde === s.hasta ? fechaCortaPrev(s.desde) : `${fechaCortaPrev(s.desde)} – ${fechaCortaPrev(s.hasta)}`;
    const actual = hoy >= s.desde && hoy <= s.hasta;
    return `<details class="bg-white border ${actual ? 'border-indigo-300' : 'border-slate-200'} rounded-2xl shadow-sm overflow-hidden" ${actual || (s.items.length && s.total === max && max > 0) ? 'open' : ''}>
      <summary class="flex items-center justify-between px-4 py-3 cursor-pointer list-none">
        <span class="text-sm font-bold text-slate-800">${actual ? '📍 ' : ''}${escapeHTML(rango)}</span>
        <span class="text-sm font-extrabold ${s.total === max && max > 0 ? 'text-rose-600' : 'text-slate-900'}">${s.total > 0 ? 'sale ' + eurosCortos(s.total) : 'nada'} <span class="text-slate-300">›</span></span>
      </summary>
      ${items ? `<div class="px-4 pb-2 border-t border-slate-100 divide-y divide-slate-50">${items}</div>` : `<p class="px-4 pb-3 text-xs text-slate-400">Sin pagos esta semana</p>`}
    </details>`;
  }).join('');
  return `<section class="space-y-2">
    <div class="flex items-end justify-between px-1">
      <h2 class="text-xs font-bold text-slate-400 uppercase tracking-wider">Calendario de pagos</h2>
      <span class="text-xs font-semibold text-slate-600">Total del mes: ${eurosCortos(p.total_mes)}</span>
    </div>
    ${filas}
  </section>`;
}

function htmlSuscripcionesPrevision() {
  const s = datosSuscripciones || { suscripciones: [], otras: [] };
  const hoy = hoyLocalISO();
  const filas = s.suscripciones.map(x => {
    const antigua = !x.revisada || (parseFechaISO(hoy) - parseFechaISO(x.revisada)) / 86400000 > 90;
    return `<div class="py-2.5">
      <div class="flex items-center gap-2">
        <span class="flex-grow min-w-0 truncate text-sm font-semibold ${x.en_uso ? 'text-slate-800' : 'text-slate-400 line-through'}">${escapeHTML(x.nombre)}</span>
        <span class="text-sm font-bold text-slate-800 shrink-0">${eurosCortos(x.importe)}<span class="text-[10px] font-normal text-slate-400"> /${x.frecuencia === 'mensual' ? 'mes' : x.frecuencia}</span></span>
      </div>
      <div class="flex items-center justify-between gap-2 mt-0.5">
        <span class="text-[11px] text-slate-400">${x.anual > 0 ? eurosCortos(x.anual) + ' al año' : 'pago único'} · ${escapeHTML(x.persona)}</span>
        <span class="flex gap-1.5 shrink-0">
          ${x.en_uso
            ? `${antigua ? `<button type="button" onclick="revisarSuscripcion(${x.id})" class="text-[11px] font-semibold text-amber-600">¿La usáis? ✓ sí</button>` : ''}<button type="button" onclick="usoSuscripcion(${x.id}, false)" class="text-[11px] font-semibold text-slate-500 border border-slate-200 rounded-lg px-2 py-0.5">No la usamos</button>`
            : `<button type="button" onclick="usoSuscripcion(${x.id}, true)" class="text-[11px] font-semibold text-emerald-600 border border-emerald-200 rounded-lg px-2 py-0.5">Sí la usamos</button>`}
          <button type="button" onclick="quitarSuscripcion(${x.id})" class="text-[11px] text-slate-300 px-1" aria-label="Quitar de suscripciones">✕</button>
        </span>
      </div>
    </div>`;
  }).join('');
  return `<section class="bg-white border border-slate-200 rounded-2xl shadow-sm p-4">
    <div class="flex items-start justify-between gap-2">
      <div>
        <h2 class="text-sm font-bold text-slate-800">📺 Suscripciones</h2>
        ${s.suscripciones.length ? `<p class="text-xs text-slate-500">${eurosCortos(s.anual)} al año · ${eurosCortos(s.mensual)} al mes</p>` : ''}
      </div>
      <button type="button" onclick="abrirAnadirSuscripcion()" class="text-xs font-semibold text-sky-600 shrink-0">➕ Añadir</button>
    </div>
    ${s.sin_uso ? `<p class="mt-2 text-xs font-semibold text-rose-600 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">Si cancelas ${s.sin_uso === 1 ? 'la que no usáis' : 'las ' + s.sin_uso + ' que no usáis'}, ahorras ${eurosCortos(s.ahorro_anual)} al año.</p>` : ''}
    ${filas ? `<div class="divide-y divide-slate-100 mt-1">${filas}</div>` : '<p class="text-sm text-slate-400 mt-2">Aún no has marcado ninguna. Elige entre tus facturas con «Añadir».</p>'}
  </section>`;
}

function pintarPrevision() {
  const cont = document.getElementById('pagos-prevision');
  if (!cont || !datosPrevision) return;
  const esActual = previsionMes === hoyLocalISO().slice(0, 7);
  cont.innerHTML = `
    <div class="flex items-center justify-between">
      <button type="button" onclick="cambiarMesPrevision(-1)" class="w-10 h-10 rounded-xl bg-white border border-slate-200 text-slate-600 text-lg" aria-label="Mes anterior">‹</button>
      <div class="text-center">
        <p class="text-base font-bold text-slate-900">${escapeHTML(nombreMesGasto(previsionMes))}</p>
        ${esActual ? '' : `<button type="button" onclick="previsionMes='${hoyLocalISO().slice(0, 7)}'; cargarPrevision()" class="text-[11px] font-semibold text-sky-600">Volver a este mes</button>`}
      </div>
      <button type="button" onclick="cambiarMesPrevision(1)" class="w-10 h-10 rounded-xl bg-white border border-slate-200 text-slate-600 text-lg" aria-label="Mes siguiente">›</button>
    </div>
    ${htmlCuentaPrevision()}
    ${htmlSemanasPrevision()}
    ${htmlSuscripcionesPrevision()}
    <div class="h-16"></div>`;
}

// ---------- Ventanas ----------
function hojaPrevision(html) {
  let m = document.getElementById('modal-prevision');
  if (!m) {
    m = document.createElement('div');
    m.id = 'modal-prevision';
    m.className = 'fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/40 backdrop-blur-sm p-0 sm:p-4';
    m.addEventListener('click', (e) => { if (e.target === m) cerrarHojaPrevision(); });
    document.body.appendChild(m);
  }
  m.innerHTML = `<div class="bg-white w-full max-w-md rounded-t-3xl sm:rounded-3xl shadow-xl p-5 space-y-4 max-h-[88vh] overflow-y-auto">${html}</div>`;
}

function cerrarHojaPrevision() {
  const m = document.getElementById('modal-prevision');
  if (m) m.remove();
}

function abrirSaldoPrevision() {
  const p = datosPrevision || {};
  hojaPrevision(`<form onsubmit="guardarSaldoPrevision(event)" class="space-y-4">
    <div class="flex items-center justify-between"><h3 class="text-base font-bold text-slate-900">Saldo de la cuenta conjunta</h3><button type="button" onclick="cerrarHojaPrevision()" class="text-slate-400 text-2xl leading-none" aria-label="Cerrar">×</button></div>
    <p class="text-xs text-slate-500">Mira el saldo en el banco y apúntalo. Desde ese momento la app descuenta lo que vayáis apuntando.</p>
    <div class="flex items-center gap-2 border-b-2 border-slate-200 focus-within:border-indigo-500">
      <input id="prev-saldo" type="number" inputmode="decimal" step="0.01" required placeholder="0,00" value="${p.configurada ? p.saldo_hoy : ''}" class="flex-grow min-w-0 bg-transparent text-3xl font-extrabold text-slate-900 placeholder-slate-300 py-1 focus:outline-none">
      <span class="text-2xl font-bold text-slate-400">€</span>
    </div>
    <button type="submit" class="w-full bg-indigo-600 text-white font-semibold py-3 rounded-2xl text-sm active:scale-95">💾 Guardar saldo</button>
  </form>`);
  setTimeout(() => { const i = document.getElementById('prev-saldo'); if (i) i.focus(); }, 60);
}

async function guardarSaldoPrevision(ev) {
  ev.preventDefault();
  const v = parseFloat(String(document.getElementById('prev-saldo').value).replace(',', '.'));
  if (isNaN(v)) return;
  try {
    await API.put('/gastos/prevision', { saldo: v });
    cerrarHojaPrevision();
    await cargarPrevision();
  } catch (e) { mostrarError('No se pudo guardar el saldo', e); }
}

function abrirAvisosPrevision() {
  const p = datosPrevision;
  hojaPrevision(`<form onsubmit="guardarAvisosPrevision(event)" class="space-y-4">
    <div class="flex items-center justify-between"><h3 class="text-base font-bold text-slate-900">Aviso de saldo</h3><button type="button" onclick="cerrarHojaPrevision()" class="text-slate-400 text-2xl leading-none" aria-label="Cerrar">×</button></div>
    <p class="text-xs text-slate-500">Recibiréis una notificación (una sola vez por cargo) cuando, en los próximos 14 días, un cargo grande deje la cuenta por debajo del mínimo.</p>
    <label class="block"><span class="text-[10px] font-bold text-slate-400 uppercase">Se considera cargo grande desde (€)</span>
      <input id="prev-grande" type="number" inputmode="decimal" step="1" min="0" value="${p.grande}" class="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm mt-1"></label>
    <label class="block"><span class="text-[10px] font-bold text-slate-400 uppercase">Avisar si la cuenta queda por debajo de (€)</span>
      <input id="prev-colchon" type="number" inputmode="decimal" step="1" min="0" value="${p.colchon}" class="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm mt-1"></label>
    <label class="block"><span class="text-[10px] font-bold text-slate-400 uppercase">Día del mes en que entran las aportaciones</span>
      <input id="prev-dia" type="number" inputmode="numeric" step="1" min="1" max="28" value="${p.aporte_dia}" class="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm mt-1"></label>
    <button type="submit" class="w-full bg-indigo-600 text-white font-semibold py-3 rounded-2xl text-sm active:scale-95">💾 Guardar</button>
  </form>`);
}

async function guardarAvisosPrevision(ev) {
  ev.preventDefault();
  const n = (id) => parseFloat(String(document.getElementById(id).value).replace(',', '.'));
  try {
    await API.put('/gastos/prevision', { grande: n('prev-grande'), colchon: n('prev-colchon'), aporte_dia: Math.round(n('prev-dia')) });
    cerrarHojaPrevision();
    await cargarPrevision();
  } catch (e) { mostrarError('No se pudo guardar', e); }
}

// ---------- Suscripciones ----------
function abrirAnadirSuscripcion() {
  const otras = (datosSuscripciones && datosSuscripciones.otras) || [];
  const fila = (x) => `<button type="button" onclick="anadirSuscripcion(${x.id})" class="w-full flex items-center justify-between gap-2 py-2.5 text-left">
    <span class="min-w-0 truncate text-sm text-slate-800">${x.posible ? '✨ ' : ''}${escapeHTML(x.nombre)}</span>
    <span class="text-xs text-slate-500 shrink-0">${eurosCortos(x.importe)} · ${escapeHTML(x.frecuencia)}</span></button>`;
  hojaPrevision(`<div class="flex items-center justify-between"><h3 class="text-base font-bold text-slate-900">¿Cuáles son suscripciones?</h3><button type="button" onclick="cerrarHojaPrevision()" class="text-slate-400 text-2xl leading-none" aria-label="Cerrar">×</button></div>
    <p class="text-xs text-slate-500">Toca las facturas que sean suscripciones (✨ = lo parecen por el nombre). Las demás las añades primero en la pestaña Facturas.</p>
    <div class="divide-y divide-slate-100">${otras.length ? otras.map(fila).join('') : '<p class="text-sm text-slate-400 py-3">No hay más facturas para marcar.</p>'}</div>`);
}

async function anadirSuscripcion(id) {
  try {
    await API.put('/gastos/suscripciones/' + id, { suscripcion: true });
    datosSuscripciones = await API.get('/gastos/suscripciones');
    abrirAnadirSuscripcion();
    pintarPrevision();
  } catch (e) { mostrarError('No se pudo marcar', e); }
}

async function usoSuscripcion(id, uso) {
  try { await API.put('/gastos/suscripciones/' + id, { en_uso: uso }); await cargarPrevision(); }
  catch (e) { mostrarError('No se pudo guardar', e); }
}

async function revisarSuscripcion(id) {
  try { await API.put('/gastos/suscripciones/' + id, { revisada: true }); await cargarPrevision(); }
  catch (e) { mostrarError('No se pudo guardar', e); }
}

async function quitarSuscripcion(id) {
  if (!confirm('¿Quitar de la lista de suscripciones? La factura se mantiene.')) return;
  try { await API.put('/gastos/suscripciones/' + id, { suscripcion: false }); await cargarPrevision(); }
  catch (e) { mostrarError('No se pudo guardar', e); }
}
