// Pagos > pestaña "Gastos": control de gastos del hogar (resumen mensual, categorías,
// presupuestos, devoluciones entre vosotros y exportación).

const CAT_GASTO = [
  { id: 'super', icono: '🛒', nombre: 'Súper', color: '#10b981' },
  { id: 'casa', icono: '🏠', nombre: 'Casa', color: '#6366f1' },
  { id: 'cole', icono: '🎒', nombre: 'Cole y niños', color: '#f59e0b' },
  { id: 'coche', icono: '🚗', nombre: 'Coche', color: '#0ea5e9' },
  { id: 'salud', icono: '💊', nombre: 'Salud', color: '#ef4444' },
  { id: 'ocio', icono: '🎬', nombre: 'Ocio', color: '#a855f7' },
  { id: 'restaurantes', icono: '🍽️', nombre: 'Restaurantes', color: '#f97316' },
  { id: 'ropa', icono: '👕', nombre: 'Ropa', color: '#ec4899' },
  { id: 'viajes', icono: '✈️', nombre: 'Viajes', color: '#06b6d4' },
  { id: 'otros', icono: '📦', nombre: 'Otros', color: '#64748b' }
];
const CAT_FACTURAS = { id: 'facturas', icono: '🧾', nombre: 'Facturas', color: '#14b8a6' };
// Cambia estos dos nombres por los de los dos adultos de tu casa.
const ADULTOS_GASTO = ['Persona 1', 'Persona 2'];

let gastosMes = new Date().getFullYear() + '-' + String(new Date().getMonth() + 1).padStart(2, '0');
let datosGastos = null;
let datosAporte = null;

const COLORES_CAT = ['#8b5cf6', '#14b8a6', '#eab308', '#f43f5e', '#84cc16', '#3b82f6', '#d946ef', '#fb923c'];

// Categorías de serie + las que ha creado el usuario ('Otros' siempre al final)
function todasCategorias() {
  const propias = ((datosGastos && datosGastos.categorias) || []).map(c => ({ ...c, propia: true }));
  const base = CAT_GASTO.filter(c => c.id !== 'otros');
  return [...base, ...propias, CAT_GASTO.find(c => c.id === 'otros')];
}

function catGasto(id) {
  if (id === 'facturas') return CAT_FACTURAS;
  return todasCategorias().find(c => c.id === id) || CAT_GASTO[CAT_GASTO.length - 1];
}

function eurosCortos(v) {
  return formatearImporte(v) + ' €';
}

function nombreMesGasto(mes) {
  const [y, m] = mes.split('-').map(Number);
  const t = new Date(y, m - 1, 1).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function mesMasN(mes, n) {
  const [y, m] = mes.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}

// ---------- Pestañas Facturas / Gastos ----------
function pestanaPagosGuardada() {
  try {
    const t = localStorage.getItem('hogar_pagos_pestana');
    return t === 'facturas' || t === 'hipoteca' || t === 'prevision' ? t : 'gastos';
  } catch (e) { return 'gastos'; }
}

function mostrarPestanaPagos(t) {
  try { localStorage.setItem('hogar_pagos_pestana', t); } catch (e) { /* sin almacenamiento */ }
  aplicarPestanaPagos();
}

function aplicarPestanaPagos() {
  const t = pestanaPagosGuardada();
  const on = 'flex-1 py-2 rounded-xl text-sm font-semibold bg-white shadow-sm text-slate-900';
  const off = 'flex-1 py-2 rounded-xl text-sm font-semibold text-slate-500';
  ['facturas', 'gastos', 'hipoteca', 'prevision'].forEach(n => {
    const panel = document.getElementById('pagos-' + n);
    const tab = document.getElementById('tab-pagos-' + n);
    if (panel) panel.classList.toggle('hidden', t !== n);
    if (tab) tab.className = t === n ? on : off;
  });
  if (t === 'gastos') cargarGastos();
  if (t === 'hipoteca') cargarHipoteca();
  if (t === 'prevision') cargarPrevision();
}

// ---------- Carga y pintado ----------
async function cargarGastos() {
  const cont = document.getElementById('pagos-gastos');
  if (!cont) return;
  try {
    datosGastos = await API.get('/gastos/mes?mes=' + gastosMes);
  } catch (e) {
    if (!datosGastos) { cont.innerHTML = '<p class="text-sm text-rose-600 px-1">No se pudieron cargar los gastos.</p>'; return; }
  }
  if (!datosGastos) return;
  try { datosAporte = await API.get('/gastos/aportacion'); } catch (e) { /* la tarjeta simplemente no sale */ }
  pintarGastos();
  if (document.getElementById('modal-cat-detalle')) pintarCategoriaGastos();
}

function cambiarMesGastos(n) {
  gastosMes = mesMasN(gastosMes, n);
  cargarGastos();
}

function pintarGastos() {
  const d = datosGastos;
  const r = d.resumen;
  const cont = document.getElementById('pagos-gastos');
  const pres = d.presupuestos || {};
  const esActual = gastosMes === hoyLocalISO().slice(0, 7);

  // Variación frente al mes anterior
  let variacion = '';
  if (r.mes_anterior > 0) {
    const pct = Math.round((r.total - r.mes_anterior) / r.mes_anterior * 100);
    const sube = pct > 0;
    variacion = `<p class="text-xs font-semibold ${sube ? 'text-rose-600' : 'text-emerald-600'}">${sube ? '▲' : '▼'} ${Math.abs(pct)} % ${sube ? 'más' : 'menos'} que en ${nombreMesGasto(mesMasN(gastosMes, -1)).split(' ')[0].toLowerCase()} (${eurosCortos(r.mes_anterior)})</p>`;
  }

  // Barra del presupuesto general
  let barraTotal = '';
  if (pres._total > 0) {
    const p = r.total / pres._total;
    barraTotal = `
      <div class="mt-3">
        <div class="h-2 rounded-full bg-slate-100 overflow-hidden"><div class="h-full ${p >= 1 ? 'bg-rose-500' : (p >= 0.8 ? 'bg-amber-500' : 'bg-emerald-500')}" style="width:${Math.min(100, Math.round(p * 100))}%"></div></div>
        <p class="text-[11px] text-slate-500 mt-1">Presupuesto del mes: ${eurosCortos(r.total)} de ${eurosCortos(pres._total)} (${Math.round(p * 100)} %)</p>
      </div>`;
  }

  // Categorías (de más a menos gasto)
  const filas = Object.entries(r.por_categoria).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  const maxCat = filas.length ? filas[0][1] : 1;
  const htmlCategorias = filas.length ? filas.map(([id, v]) => {
    const c = catGasto(id);
    const pr = pres[id] || 0;
    const ratio = pr > 0 ? v / pr : 0;
    const colorBarra = pr > 0 ? (ratio >= 1 ? '#f43f5e' : (ratio >= 0.8 ? '#f59e0b' : c.color)) : c.color;
    const ancho = pr > 0 ? Math.min(100, ratio * 100) : (v / maxCat * 100);
    const chipCmp = chipComparaGastos(id, v);
    return `
      <div onclick="abrirCategoriaGastos('${id}')" class="cursor-pointer active:opacity-60">
        <div class="flex items-center justify-between text-sm">
          <span class="font-medium text-slate-700">${c.icono} ${escapeHTML(c.nombre)} <span class="text-slate-300">›</span></span>
          <span class="font-semibold text-slate-800">${eurosCortos(v)}${pr > 0 ? `<span class="text-[11px] font-normal text-slate-400"> / ${eurosCortos(pr)}</span>` : ''}</span>
        </div>
        <div class="h-2 rounded-full bg-slate-100 overflow-hidden mt-1"><div class="h-full rounded-full" style="width:${ancho}%;background:${colorBarra}"></div></div>
        ${pr > 0 && ratio >= 1 ? `<p class="text-[11px] font-semibold text-rose-600 mt-0.5">Te has pasado ${eurosCortos(v - pr)}</p>` : ''}
        ${chipCmp}
      </div>`;
  }).join('') : '<p class="text-sm text-slate-400 text-center py-3">Aún no hay gastos este mes</p>';

  // Por cuenta
  const cuentas = Object.entries(r.por_persona).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  const htmlCuentas = cuentas.length ? `<div class="flex flex-wrap gap-1.5">${cuentas.map(([p, v]) =>
    `<span class="text-xs font-semibold px-2.5 py-1 bg-slate-100 text-slate-600 rounded-lg">${p === 'Conjunta' ? '🏦' : '👤'} ${escapeHTML(p)} · ${eurosCortos(v)}</span>`).join('')}</div>` : '';

  // Evolución 6 meses
  const maxMes = Math.max(1, ...r.meses.map(m => m.total));
  const htmlMeses = `<div class="flex items-end gap-2 h-28">${r.meses.map(m => {
    const alto = Math.max(3, Math.round(m.total / maxMes * 100));
    const actual = m.mes === gastosMes;
    const etiqueta = new Date(m.mes + '-01T12:00:00').toLocaleDateString('es-ES', { month: 'short' }).replace('.', '');
    return `<button type="button" onclick="gastosMes='${m.mes}'; cargarGastos()" class="flex-1 flex flex-col items-center justify-end h-full gap-1">
      <span class="text-[9px] text-slate-400">${m.total > 0 ? Math.round(m.total) : ''}</span>
      <span class="w-full rounded-t-md ${actual ? 'bg-indigo-500' : 'bg-slate-300'}" style="height:${alto}%"></span>
      <span class="text-[10px] ${actual ? 'font-bold text-indigo-600' : 'text-slate-400'} capitalize">${escapeHTML(etiqueta)}</span>
    </button>`;
  }).join('')}</div>`;

  cont.innerHTML = `
    <button type="button" onclick="abrirFormGasto()" aria-label="Añadir gasto" class="fixed right-4 bottom-24 z-30 w-14 h-14 rounded-full bg-indigo-600 hover:bg-indigo-700 active:scale-90 text-white text-3xl leading-none shadow-lg transition-all flex items-center justify-center">+</button>

    <div class="flex items-center justify-between">
      <button type="button" onclick="cambiarMesGastos(-1)" class="w-10 h-10 rounded-xl bg-white border border-slate-200 text-slate-600 text-lg" aria-label="Mes anterior">‹</button>
      <div class="text-center">
        <p class="text-base font-bold text-slate-900">${escapeHTML(nombreMesGasto(gastosMes))}</p>
        ${esActual ? '' : `<button type="button" onclick="gastosMes='${hoyLocalISO().slice(0, 7)}'; cargarGastos()" class="text-[11px] font-semibold text-sky-600">Volver a este mes</button>`}
      </div>
      <button type="button" onclick="cambiarMesGastos(1)" class="w-10 h-10 rounded-xl bg-white border border-slate-200 text-slate-600 text-lg" aria-label="Mes siguiente">›</button>
    </div>

    <section class="bg-white border border-slate-200 rounded-2xl shadow-sm p-4">
      <p class="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Total del mes</p>
      <p class="text-3xl font-extrabold text-slate-900 leading-tight">${eurosCortos(r.total)}</p>
      ${variacion}
      ${htmlRitmoGastos(r)}
      <p class="text-[11px] text-slate-400 mt-1">Gastos ${eurosCortos(r.total_gastos)} · Facturas ${eurosCortos(r.total_facturas)}</p>
      ${barraTotal}
    </section>

    ${htmlDestacadosGastos()}

    ${htmlProximosGastos()}

    ${htmlBalanceGastos(d.pendientes || {})}

    ${htmlTarjetaAporte()}

    <section class="bg-white border border-slate-200 rounded-2xl shadow-sm p-4 space-y-3">
      <div class="flex items-center justify-between">
        <h2 class="text-sm font-bold text-slate-800">Por categoría</h2>
        <button type="button" onclick="abrirPresupuestos()" class="text-xs font-semibold text-sky-600">🎯 Presupuestos</button>
      </div>
      ${htmlRoscoGastos(filas, filas.reduce((t, f) => t + f[1], 0))}
      ${htmlCategorias}
      ${htmlCuentas ? `<div class="pt-2 border-t border-slate-100"><p class="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Pagado con</p>${htmlCuentas}</div>` : ''}
    </section>

    <section class="grid grid-cols-2 gap-2">
      <button type="button" onclick="abrirReglasGasto()" class="bg-white border border-slate-200 rounded-2xl shadow-sm p-3 text-left active:scale-95 transition-all"><p class="text-sm font-bold text-slate-800">🏷️ Reglas</p><p class="text-[11px] text-slate-400">${(d.reglas || []).length ? (d.reglas || []).length + ' activas' : 'Categoría automática'}</p></button>
      <button type="button" onclick="abrirFijosGasto()" class="bg-white border border-slate-200 rounded-2xl shadow-sm p-3 text-left active:scale-95 transition-all"><p class="text-sm font-bold text-slate-800">🔁 Gastos fijos</p><p class="text-[11px] text-slate-400">${(d.recurrentes || []).length ? (d.recurrentes || []).length + ' configurados' : 'Se apuntan solos'}</p></button>
    </section>

    <section class="bg-white border border-slate-200 rounded-2xl shadow-sm p-4">
      <h2 class="text-sm font-bold text-slate-800 mb-3">Últimos 6 meses</h2>
      ${htmlMeses}
    </section>

    <section>
      <div class="flex items-center justify-between px-1 mb-1">
        <h2 class="text-xs font-bold text-slate-400 uppercase tracking-wider">Movimientos</h2>
        <span class="text-[11px] font-semibold text-sky-600">
          <a href="/gastos/exportar?mes=${gastosMes}" download>⬇ Este mes</a> · <a href="/gastos/exportar" download>Todo</a> (Excel)
        </span>
      </div>
      <input type="search" value="${escapeHTML(filtroGastos.q)}" oninput="buscarGastos(this.value)" placeholder="🔍 Buscar gasto…" class="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-800 placeholder-slate-400 mb-2">
      <div id="gastos-chips" class="flex gap-1.5 overflow-x-auto pb-1 mb-1">${htmlChipsGastos()}</div>
      <div id="gastos-movs">${htmlMovimientosGastos()}</div>
      <div class="h-16"></div>
    </section>`;
}


// ---------- Movimientos: búsqueda y filtro ----------
let filtroGastos = { q: '', cat: '' };

function htmlMovimientosGastos(opts) {
  const d = datosGastos;
  let htmlMovs = '';
  let diaActual = '';
  const fcat = opts && opts.cat !== undefined ? opts.cat : filtroGastos.cat;
  const q = (opts ? '' : filtroGastos.q).trim().toLowerCase();
  const movs = [
    ...d.gastos.map(g => ({ tipo: 'gasto', fecha: g.fecha, g })),
    ...d.facturas.map(f => ({ tipo: 'factura', fecha: f.fecha_pago, f }))
  ].filter(m => {
    const cat = m.tipo === 'factura' ? (m.f.categoria || 'facturas') : m.g.categoria;
    if (fcat && cat !== fcat) return false;
    if (!q) return true;
    const txt = m.tipo === 'factura' ? (m.f.nombre + ' ' + catGasto(m.f.categoria || 'facturas').nombre) : ((m.g.nota || '') + ' ' + catGasto(m.g.categoria).nombre + ' ' + m.g.persona);
    return txt.toLowerCase().includes(q);
  }).sort((a, b) => b.fecha.localeCompare(a.fecha));
  const totalDia = {};
  movs.forEach(m => { const v = m.tipo === 'factura' ? m.f.importe : m.g.importe; totalDia[m.fecha] = (totalDia[m.fecha] || 0) + v; });
  movs.forEach(m => {
    if (m.fecha !== diaActual) {
      diaActual = m.fecha;
      const dia = parseFechaISO(m.fecha).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
      htmlMovs += `<h3 class="flex justify-between text-xs font-bold text-slate-400 uppercase tracking-wider mt-3 mb-1 px-1"><span>${escapeHTML(dia)}</span><span>${eurosCortos(totalDia[m.fecha])}</span></h3>`;
    }
    if (m.tipo === 'factura') {
      const cf = catGasto(m.f.categoria || 'facturas');
      htmlMovs += `
        <div class="flex items-center gap-3 p-3 bg-white border border-slate-200 rounded-2xl shadow-sm mb-1.5">
          <span class="w-9 h-9 rounded-xl flex items-center justify-center text-lg shrink-0" style="background:${cf.color}22">${cf.icono}</span>
          <button type="button" onclick="abrirCatFactura(${m.f.id})" class="min-w-0 flex-grow text-left"><p class="text-sm font-semibold text-slate-800 truncate">${escapeHTML(m.f.nombre)}</p><p class="text-[11px] text-slate-400">Factura pagada · ${escapeHTML(cf.nombre)} · <span class="text-sky-600 font-semibold">cambiar</span></p>${m.f.sube_pct ? `<p class="text-[11px] font-semibold text-rose-600">⚠ +${m.f.sube_pct} % sobre lo habitual (media ${eurosCortos(m.f.media)})</p>` : ''}</button>
          <span class="text-sm font-bold text-slate-800 shrink-0">${eurosCortos(m.f.importe)}</span>
        </div>`;
    } else {
      const g = m.g, c = catGasto(g.categoria);
      let sub = g.persona !== 'Conjunta' ? `${escapeHTML(g.persona)} lo pagó de su cuenta` : '';
      if (g.a_cobrar > 0) sub += ` · ${g.liquidado ? 'devuelto ✓' : 'pendiente de devolver ' + eurosCortos(g.a_cobrar)}`;
      htmlMovs += `
        <div class="flex items-center gap-3 p-3 bg-white border border-slate-200 rounded-2xl shadow-sm mb-1.5">
          <span class="w-9 h-9 rounded-xl flex items-center justify-center text-lg shrink-0" style="background:${c.color}22">${c.icono}</span>
          <button type="button" onclick="abrirFormGasto(${g.id})" class="min-w-0 flex-grow text-left">
            <p class="text-sm font-semibold text-slate-800 truncate">${escapeHTML(g.nota || c.nombre)}</p>
            <p class="text-[11px] text-slate-400 truncate">${g.importe < 0 ? '↩️ Devolución · ' : ''}${g.recurrente_id ? '🔁 Fijo · ' : ''}${g.ticket ? '📎 ' : ''}${escapeHTML(c.nombre)}${sub ? ' · ' + sub : ''}</p>
          </button>
          <span class="text-sm font-bold shrink-0 ${g.importe < 0 ? 'text-emerald-600' : 'text-slate-800'}">${g.importe < 0 ? '+' + eurosCortos(-g.importe) : eurosCortos(g.importe)}</span>
          ${g.ticket ? `<button type="button" onclick="verTicketGasto(${g.id})" class="text-lg px-1 shrink-0" aria-label="Ver ticket">🧾</button>` : ''}
          <button type="button" onclick="borrarGasto(${g.id})" class="text-slate-300 hover:text-rose-600 px-1 shrink-0" aria-label="Borrar gasto">✕</button>
        </div>`;
    }
  });

  return htmlMovs || `<div class="text-center py-6 border border-dashed border-slate-200 rounded-2xl"><p class="text-slate-400 text-sm">${q || fcat ? 'Nada coincide con el filtro' : 'Sin movimientos este mes'}</p></div>`;
}

function actualizarMovimientosGastos() {
  const el = document.getElementById('gastos-movs');
  if (el) el.innerHTML = htmlMovimientosGastos();
}
function buscarGastos(v) { filtroGastos.q = v; actualizarMovimientosGastos(); }
function filtrarCatGastos(id) {
  filtroGastos.cat = filtroGastos.cat === id ? '' : id;
  const cont = document.getElementById('gastos-chips');
  if (cont) cont.innerHTML = htmlChipsGastos();
  actualizarMovimientosGastos();
}
function htmlChipsGastos() {
  const ids = new Set(datosGastos.gastos.map(g => g.categoria));
  datosGastos.facturas.forEach(f => ids.add(f.categoria || 'facturas'));
  return [...ids].map(id => {
    const c = id === 'facturas' ? CAT_FACTURAS : catGasto(id);
    const on = filtroGastos.cat === id;
    return `<button type="button" onclick="filtrarCatGastos('${id}')" class="shrink-0 text-xs font-semibold px-2.5 py-1.5 rounded-full border ${on ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white border-slate-200 text-slate-600'}">${c.icono} ${escapeHTML(c.nombre)}</button>`;
  }).join('');
}

// Rosco de categorías + ritmo del mes
function htmlRoscoGastos(filas, total) {
  if (!filas.length || total <= 0) return '';
  let acc = 0;
  const tramos = filas.map(([id, v]) => {
    const ini = acc / total * 100; acc += v;
    return `${catGasto(id).color} ${ini.toFixed(2)}% ${(acc / total * 100).toFixed(2)}%`;
  }).join(', ');
  const leyenda = filas.slice(0, 4).map(([id, v]) => `<p class="text-xs text-slate-600 truncate"><span class="inline-block w-2 h-2 rounded-full mr-1.5" style="background:${catGasto(id).color}"></span>${escapeHTML(catGasto(id).nombre)} <span class="font-semibold">${Math.round(v / total * 100)} %</span></p>`).join('');
  return `<div class="flex items-center gap-4">
    <div class="relative w-24 h-24 shrink-0 rounded-full" style="background:conic-gradient(${tramos})">
      <div class="absolute inset-3 rounded-full bg-white flex items-center justify-center text-xs font-bold text-slate-700">${filas.length} cat.</div></div>
    <div class="min-w-0 space-y-1">${leyenda}</div></div>`;
}
function htmlRitmoGastos(r) {
  if (gastosMes !== hoyLocalISO().slice(0, 7)) return '';
  const hoy = new Date();
  const dia = hoy.getDate();
  const diasMes = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0).getDate();
  if (dia < 5 || r.total_gastos <= 0) return '';
  const media = r.total_gastos / dia;
  return `<p class="text-[11px] text-slate-500 mt-1">Media ${eurosCortos(media)}/día en gastos · a este ritmo cerrarías el mes en ~${eurosCortos(media * diasMes)}</p>`;
}


// ---------- Detalle de una categoría ----------
let catDetalle = '';

function abrirCategoriaGastos(id) {
  catDetalle = id;
  pintarCategoriaGastos();
}

function pintarCategoriaGastos() {
  const c = catGasto(catDetalle);
  const d = datosGastos;
  const total = (d.resumen.por_categoria || {})[catDetalle] || 0;
  const pr = (d.presupuestos || {})[catDetalle] || 0;
  const pct = d.resumen.total > 0 ? Math.round(total / d.resumen.total * 100) : 0;
  let m = document.getElementById('modal-cat-detalle');
  if (!m) {
    m = document.createElement('div');
    m.id = 'modal-cat-detalle';
    m.className = 'fixed inset-0 z-40 flex items-end sm:items-center justify-center bg-slate-900/40 backdrop-blur-sm p-0 sm:p-4';
    m.addEventListener('click', (e) => { if (e.target === m) m.remove(); });
    document.body.appendChild(m);
  }
  const barra = pr > 0 ? `<div class="h-2 rounded-full bg-slate-100 overflow-hidden mt-2"><div class="h-full ${total >= pr ? 'bg-rose-500' : (total >= pr * 0.8 ? 'bg-amber-500' : 'bg-emerald-500')}" style="width:${Math.min(100, Math.round(total / pr * 100))}%"></div></div>
    <p class="text-[11px] text-slate-500 mt-1">Presupuesto: ${eurosCortos(total)} de ${eurosCortos(pr)}</p>` : '';
  m.innerHTML = `
    <div class="bg-slate-50 w-full max-w-md rounded-t-3xl sm:rounded-3xl shadow-xl p-5 space-y-3 max-h-[92vh] overflow-y-auto">
      <div class="flex items-start justify-between gap-3">
        <div class="flex items-center gap-3 min-w-0">
          <span class="w-12 h-12 shrink-0 rounded-2xl flex items-center justify-center text-2xl" style="background:${c.color}22">${c.icono}</span>
          <div class="min-w-0"><h3 class="text-base font-bold text-slate-900 truncate">${escapeHTML(c.nombre)}</h3>
            <p class="text-xs text-slate-400 capitalize">${escapeHTML(nombreMesGasto(gastosMes))}</p></div>
        </div>
        <button type="button" onclick="document.getElementById('modal-cat-detalle').remove()" class="text-slate-400 text-2xl leading-none" aria-label="Cerrar">×</button>
      </div>
      <div class="bg-white rounded-2xl border border-slate-200 p-3.5">
        <p class="text-2xl font-extrabold text-slate-900">${eurosCortos(total)}</p>
        <p class="text-[11px] text-slate-400">${pct} % del gasto total del mes</p>
        ${barra}
      </div>
      <div>${htmlMovimientosGastos({ cat: catDetalle })}</div>
    </div>`;
}

// ---------- Lo que queda por pagar este mes ----------
function htmlProximosGastos() {
  const lista = (datosGastos.proximos || []);
  if (!lista.length) return '';
  const total = lista.reduce((t, p) => t + p.importe, 0);
  const hoy = hoyLocalISO();
  const filas = lista.map(p => {
    const venc = p.fecha < hoy;
    const dm = p.fecha.slice(8, 10) + '/' + p.fecha.slice(5, 7);
    return `<div class="flex items-center gap-3 px-3.5 py-2 text-sm"><span class="w-12 shrink-0 text-xs ${venc ? 'font-bold text-rose-600' : 'text-slate-400'}">${dm}</span>
      <span class="flex-grow min-w-0 truncate text-slate-700">${p.tipo === 'fijo' ? '🔁' : '🧾'} ${escapeHTML(p.nombre)}${venc ? ' <span class="text-[10px] font-bold text-rose-600">vencida</span>' : ''}</span>
      <span class="font-semibold text-slate-800 shrink-0">${eurosCortos(p.importe)}</span></div>`;
  }).join('');
  return `<details class="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
    <summary class="flex items-center justify-between px-4 py-3 cursor-pointer list-none">
      <span class="text-sm font-bold text-slate-800">📅 Te queda por pagar este mes</span>
      <span class="text-sm font-extrabold text-slate-900">${eurosCortos(total)} <span class="text-slate-300">›</span></span></summary>
    <div class="border-t border-slate-100 divide-y divide-slate-50">${filas}</div></details>`;
}

// ---------- Reglas de categoría ----------
function opcionesCategoriaSelect(sel, conAuto) {
  return (conAuto ? '<option value="">Automática (según las reglas)</option>' : '') +
    todasCategorias().map(c => `<option value="${c.id}" ${c.id === sel ? 'selected' : ''}>${c.icono} ${escapeHTML(c.nombre)}</option>`).join('');
}

function abrirReglasGasto() {
  let m = document.getElementById('modal-reglas');
  if (!m) {
    m = document.createElement('div');
    m.id = 'modal-reglas';
    m.className = 'fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/40 backdrop-blur-sm p-0 sm:p-4';
    m.addEventListener('click', (e) => { if (e.target === m) m.remove(); });
    document.body.appendChild(m);
  }
  const reglas = datosGastos.reglas || [];
  m.innerHTML = `
    <div class="bg-white w-full max-w-md rounded-t-3xl sm:rounded-3xl shadow-xl p-5 space-y-3 max-h-[92vh] overflow-y-auto">
      <div class="flex items-center justify-between">
        <h3 class="text-base font-bold text-slate-900">🏷️ Reglas de categoría</h3>
        <button type="button" onclick="document.getElementById('modal-reglas').remove()" class="text-slate-400 text-2xl leading-none" aria-label="Cerrar">×</button>
      </div>
      <p class="text-xs text-slate-400">Si el nombre de un gasto o una factura contiene la palabra, se pone en esa categoría. Ejemplo: «colegio» → Cole y niños.</p>
      <div class="divide-y divide-slate-100 border border-slate-200 rounded-2xl overflow-hidden">${reglas.length ? reglas.map(r => {
        const c = catGasto(r.categoria);
        return `<div class="flex items-center gap-3 px-3.5 py-2.5 text-sm"><span class="flex-grow min-w-0 truncate text-slate-700">«${escapeHTML(r.patron)}» → ${c.icono} ${escapeHTML(c.nombre)}</span>
          <button type="button" onclick="borrarReglaGasto(${r.id})" class="text-slate-300 hover:text-rose-600" aria-label="Borrar regla">🗑</button></div>`;
      }).join('') : '<p class="text-sm text-slate-400 text-center py-4">Aún no hay reglas</p>'}</div>
      <form onsubmit="guardarReglaGasto(event)" class="space-y-2 pt-1">
        <input id="regla-patron" type="text" maxlength="40" required placeholder="Palabra (ej. colegio, repsol, mercadona)" class="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none">
        <select id="regla-cat" class="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none">${opcionesCategoriaSelect('cole', false)}</select>
        <label class="flex items-center gap-2 text-xs text-slate-500"><input id="regla-aplicar" type="checkbox" checked class="w-4 h-4 accent-indigo-600"> Aplicar también a los gastos ya apuntados en «Otros»</label>
        <button type="submit" class="w-full bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white font-semibold py-2.5 rounded-2xl text-sm transition-all">➕ Añadir regla</button>
      </form>
    </div>`;
}

async function guardarReglaGasto(ev) {
  ev.preventDefault();
  try {
    const r = await API.post('/gastos/reglas', {
      patron: document.getElementById('regla-patron').value,
      categoria: document.getElementById('regla-cat').value,
      aplicar: document.getElementById('regla-aplicar').checked
    });
    datosGastos.reglas = r.reglas;
    if (r.cambiados > 0) mostrarToast(r.cambiados + ' gasto(s) recategorizados');
    await cargarGastos();
    abrirReglasGasto();
  } catch (e) { mostrarError('No se pudo guardar la regla', e); }
}

async function borrarReglaGasto(id) {
  try {
    datosGastos.reglas = await API.delete('/gastos/reglas/' + id);
    await cargarGastos();
    abrirReglasGasto();
  } catch (e) { mostrarError('No se pudo borrar la regla', e); }
}

// ---------- Gastos fijos ----------
function abrirFijosGasto() {
  let m = document.getElementById('modal-fijos');
  if (!m) {
    m = document.createElement('div');
    m.id = 'modal-fijos';
    m.className = 'fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/40 backdrop-blur-sm p-0 sm:p-4';
    m.addEventListener('click', (e) => { if (e.target === m) m.remove(); });
    document.body.appendChild(m);
  }
  const lista = datosGastos.recurrentes || [];
  m.innerHTML = `
    <div class="bg-white w-full max-w-md rounded-t-3xl sm:rounded-3xl shadow-xl p-5 space-y-3 max-h-[92vh] overflow-y-auto">
      <div class="flex items-center justify-between">
        <h3 class="text-base font-bold text-slate-900">🔁 Gastos fijos</h3>
        <button type="button" onclick="document.getElementById('modal-fijos').remove()" class="text-slate-400 text-2xl leading-none" aria-label="Cerrar">×</button>
      </div>
      <p class="text-xs text-slate-400">Se apuntan solos el día elegido de cada mes. Si un mes no toca, bórralo de Movimientos y no se vuelve a crear.</p>
      <div class="divide-y divide-slate-100 border border-slate-200 rounded-2xl overflow-hidden">${lista.length ? lista.map(x => {
        const c = catGasto(x.categoria);
        return `<div class="flex items-center gap-3 px-3.5 py-2.5 ${x.activo ? '' : 'opacity-50'}">
          <span class="text-lg">${c.icono}</span>
          <div class="flex-grow min-w-0"><p class="text-sm font-semibold text-slate-800 truncate">${escapeHTML(x.nota)}</p><p class="text-[11px] text-slate-400">Día ${x.dia} · ${x.persona === 'Conjunta' ? 'cuenta conjunta' : escapeHTML(x.persona)}${x.activo ? '' : ' · en pausa'}</p></div>
          <span class="text-sm font-bold text-slate-800 shrink-0">${eurosCortos(x.importe)}</span>
          <button type="button" onclick="pausarFijoGasto(${x.id})" class="text-xs text-sky-600 font-semibold shrink-0">${x.activo ? 'Pausar' : 'Activar'}</button>
          <button type="button" onclick="borrarFijoGasto(${x.id})" class="text-slate-300 hover:text-rose-600" aria-label="Borrar">🗑</button></div>`;
      }).join('') : '<p class="text-sm text-slate-400 text-center py-4">Aún no hay gastos fijos</p>'}</div>
      <form onsubmit="guardarFijoGasto(event)" class="space-y-2 pt-1">
        <input id="fijo-nota" type="text" maxlength="60" required placeholder="Nombre (ej. Cuota gimnasio)" class="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none">
        <div class="grid grid-cols-2 gap-2">
          <input id="fijo-importe" type="number" inputmode="decimal" step="0.01" min="0.01" required placeholder="Importe €" class="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none">
          <input id="fijo-dia" type="number" inputmode="numeric" min="1" max="31" required placeholder="Día del mes" class="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none">
        </div>
        <select id="fijo-cat" class="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none">${opcionesCategoriaSelect('', true)}</select>
        <select id="fijo-persona" class="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none"><option value="Conjunta">🏦 Cuenta conjunta</option>${ADULTOS_GASTO.map(p => `<option value="${p}">👤 ${p}</option>`).join('')}</select>
        <label class="flex items-center gap-2 text-xs text-slate-500"><input id="fijo-ya" type="checkbox" class="w-4 h-4 accent-indigo-600"> Ya lo he apuntado este mes (empezar el mes que viene)</label>
        <button type="submit" class="w-full bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white font-semibold py-2.5 rounded-2xl text-sm transition-all">➕ Añadir gasto fijo</button>
      </form>
    </div>`;
}

async function guardarFijoGasto(ev) {
  ev.preventDefault();
  try {
    await API.post('/gastos/recurrentes', {
      nota: document.getElementById('fijo-nota').value,
      importe: parseFloat(document.getElementById('fijo-importe').value),
      dia: parseInt(document.getElementById('fijo-dia').value, 10),
      categoria: document.getElementById('fijo-cat').value,
      persona: document.getElementById('fijo-persona').value,
      activo: true,
      ya_este_mes: document.getElementById('fijo-ya').checked
    });
    await cargarGastos();
    abrirFijosGasto();
    mostrarToast('Gasto fijo añadido');
  } catch (e) { mostrarError('No se pudo guardar el gasto fijo', e); }
}

async function pausarFijoGasto(id) {
  const x = (datosGastos.recurrentes || []).find(r => r.id === id);
  if (!x) return;
  try {
    await API.put('/gastos/recurrentes/' + id, { nota: x.nota, importe: x.importe, categoria: x.categoria, persona: x.persona, dia: x.dia, activo: !x.activo });
    await cargarGastos();
    abrirFijosGasto();
  } catch (e) { mostrarError('No se pudo cambiar el gasto fijo', e); }
}

async function borrarFijoGasto(id) {
  if (!confirm('¿Borrar este gasto fijo? Los ya apuntados se quedan.')) return;
  try {
    await API.delete('/gastos/recurrentes/' + id);
    await cargarGastos();
    abrirFijosGasto();
  } catch (e) { mostrarError('No se pudo borrar el gasto fijo', e); }
}

// ---------- Devoluciones entre vosotros ----------
function htmlBalanceGastos(pend) {
  const claves = Object.keys(pend).filter(k => pend[k] > 0);
  if (!claves.length) return '';
  const yo = typeof usuarioActualNombre !== 'undefined' ? usuarioActualNombre : null;
  let texto, importe;
  if (claves.length === 2) {
    const [a, b] = claves;
    const neto = Math.round((pend[a] - pend[b]) * 100) / 100;
    if (Math.abs(neto) < 0.005) { texto = 'Estáis en paz (lo adelantado se compensa)'; importe = 0; }
    else {
      const dueno = neto > 0 ? a : b;
      importe = Math.abs(neto);
      texto = dueno === yo ? `Te deben ${eurosCortos(importe)}` : `${escapeHTML(dueno)} tiene ${eurosCortos(importe)} por cobrar`;
    }
  } else {
    const dueno = claves[0];
    importe = pend[dueno];
    texto = dueno === yo ? `Te deben ${eurosCortos(importe)}` : `${escapeHTML(dueno)} tiene ${eurosCortos(importe)} por cobrar`;
  }
  return `
    <section class="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-center justify-between gap-3">
      <div>
        <p class="text-[11px] font-bold text-amber-700 uppercase tracking-wider">💸 Por devolver</p>
        <p class="text-sm font-bold text-amber-800">${texto}</p>
        <p class="text-[11px] text-amber-700/80">Suma de lo adelantado de cuentas personales (todos los meses)</p>
        ${htmlDetallePendientes()}
      </div>
      <button type="button" onclick="liquidarGastos()" class="shrink-0 bg-amber-500 hover:bg-amber-600 active:scale-95 text-white text-xs font-bold px-3 py-2 rounded-xl">Ya está devuelto</button>
    </section>`;
}

async function liquidarGastos() {
  if (!confirm('¿Marcar como devuelto todo lo pendiente?')) return;
  try {
    for (const p of Object.keys(datosGastos.pendientes || {})) {
      await API.post('/gastos/liquidar', { persona: p });
    }
    mostrarToast('Marcado como devuelto ✓');
  } catch (e) {
    mostrarError('No se pudo marcar como devuelto', e);
  }
  cargarGastos();
}

// ---------- Formulario de gasto ----------
let formGasto = null;

function abrirFormGasto(id) {
  const g = id ? (datosGastos.gastos.find(x => x.id === id) || null) : null;
  let modo = 'mitad', otro = '';
  if (g && g.importe > 0 && g.persona !== 'Conjunta') {
    if (g.a_cobrar === 0) modo = 'nada';
    else if (Math.abs(g.a_cobrar - g.importe / 2) < 0.01) modo = 'mitad';
    else if (Math.abs(g.a_cobrar - g.importe) < 0.01) modo = 'todo';
    else { modo = 'otro'; otro = String(g.a_cobrar); }
  }
  formGasto = {
    id: g ? g.id : null,
    importe: g ? String(Math.abs(g.importe)) : '',
    devolucion: !!(g && g.importe < 0),
    categoria: g ? g.categoria : 'super',
    persona: g ? g.persona : 'Conjunta',
    modo, otro,
    fecha: g ? g.fecha : (gastosMes === hoyLocalISO().slice(0, 7) ? hoyLocalISO() : gastosMes + '-01'),
    nota: g ? g.nota : '',
    liquidado: g ? g.liquidado : false,
    catManual: !!g,
    tieneTicket: !!(g && g.ticket), ticketNuevo: null, quitarTicket: false
  };
  pintarFormGasto();
}

function cerrarFormGasto() {
  const m = document.getElementById('modal-gasto');
  if (m) m.remove();
  formGasto = null;
}

function leerCamposFormGasto() {
  const val = (id) => { const e = document.getElementById(id); return e ? e.value : ''; };
  formGasto.importe = val('gasto-importe');
  formGasto.fecha = val('gasto-fecha');
  formGasto.nota = val('gasto-nota');
  formGasto.otro = val('gasto-otro') || formGasto.otro;
}

function categoriaPorReglaCliente(texto) {
  const t = String(texto || '').toLowerCase();
  const r = ((datosGastos && datosGastos.reglas) || []).find(x => x.patron && t.includes(x.patron));
  return r ? r.categoria : '';
}
// Mientras escribes la nota, si coincide con una regla se elige la categoría sola (hasta que toques una a mano).
function notaGastoCambio(v) {
  if (!formGasto || formGasto.catManual) return;
  const c = categoriaPorReglaCliente(v);
  if (!c || c === formGasto.categoria || !todasCategorias().some(x => x.id === c)) return;
  formGasto.categoria = c;
  document.querySelectorAll('#modal-gasto [data-cat]').forEach(b => {
    const on = b.dataset.cat === c;
    ['border-indigo-500', 'bg-indigo-50', 'text-indigo-700'].forEach(k => b.classList.toggle(k, on));
    ['border-slate-200', 'bg-white', 'text-slate-600'].forEach(k => b.classList.toggle(k, !on));
  });
}

function elegirFormGasto(campo, valor) {
  if (campo === 'categoria') formGasto.catManual = true;
  leerCamposFormGasto();
  formGasto[campo] = valor;
  pintarFormGasto();
}

function pintarFormGasto() {
  const f = formGasto;
  let m = document.getElementById('modal-gasto');
  const primera = !m;
  if (!m) {
    m = document.createElement('div');
    m.id = 'modal-gasto';
    m.className = 'fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/40 backdrop-blur-sm p-0 sm:p-4';
    m.addEventListener('click', (e) => { if (e.target === m) cerrarFormGasto(); });
    document.body.appendChild(m);
  }
  const chip = (activo, onclick, texto, extra = '') => `<button type="button" onclick="${onclick}" class="px-3 py-1.5 rounded-xl text-xs font-semibold border ${activo ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white border-slate-200 text-slate-600'} ${extra}">${texto}</button>`;
  const personal = f.persona !== 'Conjunta' && !f.devolucion;
  const esPersonalCuenta = f.persona !== 'Conjunta';
  m.innerHTML = `
    <form onsubmit="guardarGasto(event)" class="bg-white w-full max-w-md rounded-t-3xl sm:rounded-3xl shadow-xl p-5 space-y-4 max-h-[92vh] overflow-y-auto">
      <div class="flex items-center justify-between">
        <h3 class="text-base font-bold text-slate-900">${f.id ? 'Editar gasto' : 'Nuevo gasto'}</h3>
        <button type="button" onclick="cerrarFormGasto()" class="text-slate-400 text-2xl leading-none" aria-label="Cerrar">×</button>
      </div>
      <div class="flex items-center gap-2 border-b-2 border-slate-200 focus-within:border-indigo-500">
        <input id="gasto-importe" type="number" inputmode="decimal" step="0.01" min="0" required placeholder="0,00" value="${escapeHTML(f.importe)}" class="flex-grow min-w-0 bg-transparent text-3xl font-extrabold text-slate-900 placeholder-slate-300 py-1 focus:outline-none">
        <span class="text-2xl font-bold text-slate-400">€</span>
      </div>
      <div class="flex gap-1.5">
        ${chip(!f.devolucion, `elegirFormGasto('devolucion',false)`, '💸 Gasto', 'flex-1')}
        ${chip(f.devolucion, `elegirFormGasto('devolucion',true)`, '↩️ Devolución (me ingresan)', 'flex-1')}
      </div>
      <div>
        <p class="text-[10px] font-bold text-slate-400 uppercase mb-1.5">Categoría</p>
        <div class="grid grid-cols-3 gap-1.5">
          ${todasCategorias().map(c => `<button type="button" onclick="elegirFormGasto('categoria','${c.id}')" data-cat="${c.id}" class="flex flex-col items-center gap-0.5 py-2 rounded-xl border text-[11px] font-semibold ${f.categoria === c.id ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-slate-200 bg-white text-slate-600'}"><span class="text-lg">${c.icono}</span>${escapeHTML(c.nombre)}</button>`).join('')}
          <button type="button" onclick="elegirFormGasto('nueva', !formGasto.nueva)" class="flex flex-col items-center gap-0.5 py-2 rounded-xl border border-dashed border-slate-300 text-[11px] font-semibold text-slate-500"><span class="text-lg">➕</span>Nueva</button>
        </div>
        ${f.nueva ? `
        <div class="mt-2 flex gap-2">
          <input id="cat-nueva-icono" type="text" maxlength="4" placeholder="🏷️" value="🏷️" class="w-14 text-center bg-slate-50 border border-slate-200 rounded-xl py-2 text-lg focus:outline-none">
          <input id="cat-nueva-nombre" type="text" maxlength="30" placeholder="Nombre (ej. Mascotas)" class="flex-grow min-w-0 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none">
          <button type="button" onclick="crearCategoriaGasto()" class="px-3 rounded-xl bg-indigo-600 text-white text-xs font-bold">Crear</button>
        </div>` : ''}
      </div>
      <div>
        <p class="text-[10px] font-bold text-slate-400 uppercase mb-1.5">${f.devolucion ? 'Ingresado en' : 'Pagado con'}</p>
        <div class="flex flex-wrap gap-1.5">
          ${chip(!esPersonalCuenta, `elegirFormGasto('persona','Conjunta')`, '🏦 Cuenta conjunta')}
          ${ADULTOS_GASTO.map(p => chip(f.persona === p, `elegirFormGasto('persona','${p}')`, '👤 ' + p)).join('')}
        </div>
      </div>
      ${personal ? `
      <div class="bg-amber-50 border border-amber-200 rounded-2xl p-3 space-y-2">
        <p class="text-[10px] font-bold text-amber-700 uppercase">¿Cuánto le tienen que devolver a ${escapeHTML(f.persona)}?</p>
        <div class="flex flex-wrap gap-1.5">
          ${chip(f.modo === 'mitad', `elegirFormGasto('modo','mitad')`, 'La mitad')}
          ${chip(f.modo === 'todo', `elegirFormGasto('modo','todo')`, 'Todo')}
          ${chip(f.modo === 'nada', `elegirFormGasto('modo','nada')`, 'Nada')}
          ${chip(f.modo === 'otro', `elegirFormGasto('modo','otro')`, 'Otro importe')}
        </div>
        ${f.modo === 'otro' ? `<input id="gasto-otro" type="number" inputmode="decimal" step="0.01" min="0" placeholder="Importe a devolver (€)" value="${escapeHTML(f.otro)}" class="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-amber-500">` : ''}
      </div>` : ''}
      <div class="grid grid-cols-2 gap-3">
        <div>
          <p class="text-[10px] font-bold text-slate-400 uppercase mb-1">Fecha</p>
          <input id="gasto-fecha" type="date" required value="${escapeHTML(f.fecha)}" class="w-full bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-2 text-sm text-slate-700 focus:outline-none">
        </div>
        <div>
          <p class="text-[10px] font-bold text-slate-400 uppercase mb-1">Nota (opcional)</p>
          <input id="gasto-nota" type="text" maxlength="200" oninput="notaGastoCambio(this.value)" placeholder="Ej. Mercadona" value="${escapeHTML(f.nota)}" class="w-full bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-2 text-sm text-slate-700 focus:outline-none">
        </div>
      </div>
      <div>
        <p class="text-[10px] font-bold text-slate-400 uppercase mb-1">Foto del ticket (opcional)</p>
        <div class="flex items-center gap-2 flex-wrap">
          <label class="px-3 py-1.5 rounded-xl text-xs font-semibold border border-slate-200 bg-white text-slate-600 cursor-pointer">📎 ${f.ticketNuevo || (f.tieneTicket && !f.quitarTicket) ? 'Cambiar foto' : 'Añadir foto'}<input type="file" accept="image/*" class="hidden" onchange="elegirTicketGasto(this)"></label>
          ${f.ticketNuevo ? '<span class="text-[11px] text-emerald-600 font-semibold">✓ Foto lista</span>' : ''}
          ${f.id && f.tieneTicket && !f.quitarTicket && !f.ticketNuevo ? `<button type="button" onclick="verTicketGasto(${f.id})" class="text-xs font-semibold text-sky-600">Ver</button>` : ''}
          ${(f.tieneTicket && !f.quitarTicket) || f.ticketNuevo ? `<button type="button" onclick="quitarTicketForm()" class="text-xs font-semibold text-rose-600">Quitar</button>` : ''}
        </div>
      </div>
      <button type="submit" class="w-full bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white font-semibold py-3 rounded-2xl text-sm transition-all">${f.id ? '💾 Guardar cambios' : (f.devolucion ? '↩️ Apuntar devolución' : '➕ Añadir gasto')}</button>
    </form>`;
  if (primera) setTimeout(() => { const i = document.getElementById('gasto-importe'); if (i && !f.id) i.focus(); }, 60);
}

async function crearCategoriaGasto() {
  leerCamposFormGasto();
  const nombre = (document.getElementById('cat-nueva-nombre') || {}).value || '';
  const icono = (document.getElementById('cat-nueva-icono') || {}).value || '';
  if (!nombre.trim()) { mostrarError('Categoría', new Error('Escribe un nombre')); return; }
  const n = ((datosGastos.categorias || []).length) % COLORES_CAT.length;
  try {
    const c = await API.post('/gastos/categorias', { nombre: nombre.trim(), icono: icono.trim(), color: COLORES_CAT[n] });
    if (c && c.offline) { mostrarToast('Necesitas conexión para crear categorías'); return; }
    datosGastos.categorias = [...(datosGastos.categorias || []), c];
    formGasto.categoria = c.id;
    formGasto.nueva = false;
    pintarFormGasto();
  } catch (e) {
    mostrarError('No se pudo crear la categoría', e);
  }
}

async function borrarCategoriaGasto(id) {
  const c = catGasto(id);
  if (!confirm(`¿Borrar la categoría "${c.nombre}"? Sus gastos pasarán a "Otros".`)) return;
  try {
    await API.delete('/gastos/categorias/' + id);
    const m = document.getElementById('modal-presupuestos');
    if (m) m.remove();
    await cargarGastos();
  } catch (e) {
    mostrarError('No se pudo borrar la categoría', e);
  }
}

async function guardarGasto(ev) {
  ev.preventDefault();
  leerCamposFormGasto();
  const f = formGasto;
  const importeAbs = parseFloat(String(f.importe).replace(',', '.'));
  const importe = f.devolucion ? -importeAbs : importeAbs;
  if (!(importeAbs > 0)) { mostrarError('Gasto', new Error('Pon un importe mayor que 0')); return; }
  let aCobrar = 0;
  if (f.persona !== 'Conjunta' && !f.devolucion) {
    if (f.modo === 'mitad') aCobrar = importe / 2;
    else if (f.modo === 'todo') aCobrar = importe;
    else if (f.modo === 'otro') aCobrar = parseFloat(String(f.otro).replace(',', '.')) || 0;
  }
  const cuerpo = {
    fecha: f.fecha, importe, categoria: f.categoria, persona: f.persona, nota: f.nota.trim(),
    a_cobrar: Math.round(aCobrar * 100) / 100, liquidado: f.id ? f.liquidado : false
  };
  try {
    const res = await (f.id ? API.put(`/gastos/${f.id}`, cuerpo) : API.post('/gastos', cuerpo));
    const idFinal = f.id || (res && res.id);
    let avisoTicket = '';
    if (!(res && res.offline) && idFinal > 0) {
      try {
        if (f.ticketNuevo) {
          const fd = new FormData();
          fd.append('archivo', f.ticketNuevo, 'ticket.jpg');
          const rt = await fetch(`/gastos/${idFinal}/ticket`, { method: 'POST', body: fd, credentials: 'same-origin' });
          if (!rt.ok) avisoTicket = 'El gasto se guardó, pero la foto no se pudo subir';
        } else if (f.quitarTicket && f.id) {
          await fetch(`/gastos/${f.id}/ticket`, { method: 'DELETE', credentials: 'same-origin' });
        }
      } catch (e) { avisoTicket = 'El gasto se guardó, pero la foto no se pudo subir'; }
    } else if (f.ticketNuevo) {
      avisoTicket = 'Sin conexión: la foto del ticket no se ha guardado';
    }
    cerrarFormGasto();
    if (avisoTicket) mostrarToast(avisoTicket);
    if (res && res.offline) {
      mostrarToast('Sin conexión: el gasto se guardará al volver');
      if (datosGastos && cuerpo.fecha.slice(0, 7) === gastosMes) {
        datosGastos.gastos.unshift({ id: -Date.now(), ...cuerpo });
        pintarGastos();
      }
    } else {
      await cargarGastos();
    }
  } catch (e) {
    mostrarError('No se pudo guardar el gasto', e);
  }
}

async function borrarGasto(id) {
  const g = datosGastos.gastos.find(x => x.id === id);
  if (!confirm(`¿Borrar este gasto${g ? ' (' + eurosCortos(g.importe) + ')' : ''}?`)) return;
  try {
    await API.delete(`/gastos/${id}`);
    await cargarGastos();
  } catch (e) {
    mostrarError('No se pudo borrar el gasto', e);
  }
}

// ---------- Presupuestos ----------
function abrirCatFactura(id) {
  const f = (datosGastos.facturas || []).find(x => x.id === id);
  if (!f) return;
  const actual = f.categoria || 'facturas';
  const m = document.createElement('div');
  m.id = 'modal-cat-factura';
  m.className = 'fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/40 backdrop-blur-sm p-0 sm:p-4';
  m.addEventListener('click', (e) => { if (e.target === m) m.remove(); });
  const cats = [CAT_FACTURAS, ...todasCategorias()];
  m.innerHTML = `
    <div class="bg-white w-full max-w-md rounded-t-3xl sm:rounded-3xl shadow-xl p-5 space-y-3 max-h-[92vh] overflow-y-auto">
      <div class="flex items-center justify-between">
        <h3 class="text-base font-bold text-slate-900">Categoría de «${escapeHTML(f.nombre)}»</h3>
        <button type="button" onclick="document.getElementById('modal-cat-factura').remove()" class="text-slate-400 text-2xl leading-none" aria-label="Cerrar">×</button>
      </div>
      <p class="text-xs text-slate-400">Se aplica a todas las facturas con este nombre, las anteriores y las que vengan.</p>
      <div class="grid grid-cols-2 gap-2">${cats.map(c => `<button type="button" onclick="guardarCatFactura(${id}, '${c.id}')" class="flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm font-semibold text-left ${c.id === actual ? 'border-indigo-600 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-700'}"><span class="text-lg">${c.icono}</span><span class="truncate">${escapeHTML(c.nombre)}</span></button>`).join('')}</div>
    </div>`;
  document.body.appendChild(m);
}

async function guardarCatFactura(id, cat) {
  const f = (datosGastos.facturas || []).find(x => x.id === id);
  if (!f) return;
  try {
    await API.put('/gastos/factura-categoria', { nombre: f.nombre, categoria: cat });
    const m = document.getElementById('modal-cat-factura');
    if (m) m.remove();
    await cargarGastos();
    mostrarToast('Categoría actualizada');
  } catch (e) { mostrarError('No se pudo guardar la categoría', e); }
}

function abrirPresupuestos() {
  const pres = (datosGastos && datosGastos.presupuestos) || {};
  const m = document.createElement('div');
  m.id = 'modal-presupuestos';
  m.className = 'fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/40 backdrop-blur-sm p-0 sm:p-4';
  m.addEventListener('click', (e) => { if (e.target === m) m.remove(); });
  const fila = (id, icono, nombre, borrable) => `
    <div class="flex items-center gap-3">
      <span class="w-8 text-center text-lg">${icono}</span>
      <span class="flex-grow text-sm font-medium text-slate-700">${escapeHTML(nombre)}</span>
      <input data-cat="${id}" type="number" inputmode="decimal" step="1" min="0" placeholder="—" value="${pres[id] || ''}" class="w-24 bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 text-sm text-right focus:outline-none focus:border-indigo-500">
      <span class="text-sm text-slate-400">€</span>
      ${borrable ? `<button type="button" onclick="borrarCategoriaGasto('${id}')" class="text-slate-300 hover:text-rose-600" aria-label="Borrar categoría">🗑</button>` : ''}
    </div>`;
  m.innerHTML = `
    <form onsubmit="guardarPresupuestos(event)" class="bg-white w-full max-w-md rounded-t-3xl sm:rounded-3xl shadow-xl p-5 space-y-3 max-h-[92vh] overflow-y-auto">
      <div class="flex items-center justify-between">
        <h3 class="text-base font-bold text-slate-900">🎯 Presupuestos mensuales</h3>
        <button type="button" onclick="document.getElementById('modal-presupuestos').remove()" class="text-slate-400 text-2xl leading-none" aria-label="Cerrar">×</button>
      </div>
      <p class="text-xs text-slate-400">Deja en blanco los que no quieras. Te avisaremos al llegar al 80 % y al pasarte.</p>
      ${fila('_total', '🏠', 'Toda la casa (gastos del mes)')}
      <div class="border-t border-slate-100 pt-3 space-y-2">${todasCategorias().map(c => fila(c.id, c.icono, c.nombre, c.propia)).join('')}</div>
      <button type="submit" class="w-full bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white font-semibold py-3 rounded-2xl text-sm transition-all">💾 Guardar</button>
    </form>`;
  document.body.appendChild(m);
}

async function guardarPresupuestos(ev) {
  ev.preventDefault();
  const pres = (datosGastos && datosGastos.presupuestos) || {};
  const campos = document.querySelectorAll('#modal-presupuestos input[data-cat]');
  try {
    for (const inp of campos) {
      const nuevo = parseFloat(String(inp.value).replace(',', '.')) || 0;
      if (nuevo !== (pres[inp.dataset.cat] || 0)) {
        await API.put('/presupuestos', { categoria: inp.dataset.cat, importe: nuevo });
      }
    }
    document.getElementById('modal-presupuestos').remove();
    mostrarToast('Presupuestos guardados ✓');
    await cargarGastos();
  } catch (e) {
    mostrarError('No se pudieron guardar los presupuestos', e);
  }
}

// ---------- Aportación mensual recomendada ----------
function htmlTarjetaAporte() {
  const a = datosAporte;
  if (!a || !Array.isArray(a.meses)) return '';
  if (!a.meses.length) {
    return `<section class="bg-white border border-slate-200 rounded-2xl shadow-sm p-4">
      <p class="text-sm font-bold text-slate-800">📈 Aportación a la cuenta conjunta</p>
      <p class="text-xs text-slate-500 mt-1">Cuando haya al menos un mes completo de gastos o facturas pagadas, aquí te diré cuánto os conviene ingresar cada mes.</p>
    </section>`;
  }
  const dif = Math.round((a.actual - a.recomendada) * 100) / 100;
  const falta = dif < 0;
  const poco = a.meses.length < 3;
  return `
    <section class="bg-white border border-slate-200 rounded-2xl shadow-sm p-4">
      <div class="flex items-start justify-between gap-3">
        <div>
          <p class="text-[11px] font-bold text-slate-400 uppercase tracking-wider">📈 Aportación mensual</p>
          <p class="text-sm text-slate-600 mt-0.5">Ahora ingresáis <b>${eurosCortos(a.actual)}</b> · recomendado <b>${eurosCortos(a.recomendada)}</b></p>
        </div>
        <span class="text-xs font-bold px-2.5 py-1 rounded-lg ${falta ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-600'}">${falta ? 'Os faltan ' + eurosCortos(-dif) : 'Os sobran ' + eurosCortos(dif)}</span>
      </div>
      ${poco ? `<p class="text-[11px] text-amber-700 mt-2">Solo hay ${a.meses.length} mes${a.meses.length > 1 ? 'es' : ''} con datos: la estimación irá mejorando.</p>` : ''}
      <button type="button" onclick="abrirAportacion()" class="mt-3 text-xs font-semibold text-sky-600">Ver cálculo y repartir →</button>
    </section>`;
}

function abrirAportacion() {
  const a = datosAporte;
  const m = document.createElement('div');
  m.id = 'modal-aporte';
  m.className = 'fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/40 backdrop-blur-sm p-0 sm:p-4';
  m.addEventListener('click', (e) => { if (e.target === m) m.remove(); });
  const falta = a.recomendada > a.actual;
  const filas = a.meses.map(x => `<tr class="border-t border-slate-100"><td class="py-1.5 text-slate-600">${escapeHTML(nombreMesGasto(x.mes))}</td><td class="py-1.5 text-right text-slate-400">${eurosCortos(x.gastos)} + ${eurosCortos(x.facturas)}</td><td class="py-1.5 text-right font-semibold text-slate-800">${eurosCortos(x.total)}</td></tr>`).join('');
  const act = a.mes_actual || {};
  m.innerHTML = `
    <div class="bg-white w-full max-w-md rounded-t-3xl sm:rounded-3xl shadow-xl p-5 space-y-4 max-h-[92vh] overflow-y-auto">
      <div class="flex items-center justify-between">
        <h3 class="text-base font-bold text-slate-900">📈 Aportación recomendada</h3>
        <button type="button" onclick="document.getElementById('modal-aporte').remove()" class="text-slate-400 text-2xl leading-none" aria-label="Cerrar">×</button>
      </div>
      <div class="bg-indigo-50 border border-indigo-100 rounded-2xl p-4 text-center">
        <p class="text-[11px] font-bold text-indigo-500 uppercase">Lo que necesita la casa al mes</p>
        <p class="text-3xl font-extrabold text-indigo-700">${eurosCortos(a.recomendada)}</p>
        <p class="text-[11px] text-indigo-500">media de los últimos ${Math.min(3, a.meses.length)} meses (${eurosCortos(a.media_3)}) + 10 % de colchón (${eurosCortos(a.colchon)})</p>
      </div>
      <div>
        <p class="text-[10px] font-bold text-slate-400 uppercase mb-1">Gasto real por mes (gastos + facturas)</p>
        <table class="w-full text-xs"><tbody>${filas}</tbody></table>
        <p class="text-[11px] text-slate-400 mt-1">Mes más alto: ${eurosCortos(a.maximo)}${act.llevado ? ` · Este mes llevas ${eurosCortos(act.llevado)}${act.proyeccion ? ` (al ritmo actual, ${eurosCortos(act.proyeccion)})` : ''}` : ''}</p>
        <p class="text-[11px] text-slate-400">Cuenta lo pagado desde la cuenta conjunta y lo adelantado de cuentas personales que se devuelve. Lo que gastas de tu cuenta sin devolución no cuenta.</p>
      </div>
      <form onsubmit="guardarAporte(event)" class="space-y-3">
        <p class="text-[10px] font-bold text-slate-400 uppercase">Lo que ingresáis ahora cada mes</p>
        <div class="grid grid-cols-2 gap-3">
          <label class="text-xs text-slate-500">${ADULTOS_GASTO[0]}<input id="aporte-a" type="number" step="0.01" min="0" value="${a.aporte.a}" class="mt-1 w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-800"></label>
          <label class="text-xs text-slate-500">${ADULTOS_GASTO[1]}<input id="aporte-b" type="number" step="0.01" min="0" value="${a.aporte.b}" class="mt-1 w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-800"></label>
        </div>
        <button type="submit" class="w-full bg-slate-100 text-slate-700 font-semibold py-2 rounded-xl text-sm">Guardar lo que ingresáis</button>
      </form>
      <div class="bg-emerald-50 border border-emerald-200 rounded-2xl p-3 space-y-1">
        <p class="text-[10px] font-bold text-emerald-700 uppercase">Reparto sugerido (misma proporción: ${a.proporcion_a} % / ${Math.round((100 - a.proporcion_a) * 100) / 100} %)</p>
        <p class="text-sm text-emerald-900">${ADULTOS_GASTO[0]} <b>${eurosCortos(a.sugerido.a)}</b> · ${ADULTOS_GASTO[1]} <b>${eurosCortos(a.sugerido.b)}</b></p>
        <p class="text-[11px] text-emerald-700">${falta ? `Subiríais ${eurosCortos(a.recomendada - a.actual)} al mes en total.` : 'Con lo que ingresáis ahora cubrís el gasto con margen.'}</p>
        <button type="button" onclick="usarAporteSugerido()" class="mt-1 text-xs font-bold text-emerald-700">Usar este reparto →</button>
      </div>
    </div>`;
  document.body.appendChild(m);
}

async function guardarAporte(ev) {
  ev.preventDefault();
  const valorA = parseFloat(document.getElementById('aporte-a').value) || 0;
  const valorB = parseFloat(document.getElementById('aporte-b').value) || 0;
  try {
    await API.put('/gastos/aportacion', { a: valorA, b: valorB });
    document.getElementById('modal-aporte').remove();
    mostrarToast('Aportaciones guardadas ✓');
    await cargarGastos();
  } catch (e) {
    mostrarError('No se pudo guardar', e);
  }
}

async function usarAporteSugerido() {
  try {
    await API.put('/gastos/aportacion', { a: datosAporte.sugerido.a, b: datosAporte.sugerido.b });
    document.getElementById('modal-aporte').remove();
    mostrarToast('Reparto guardado ✓');
    await cargarGastos();
  } catch (e) {
    mostrarError('No se pudo guardar', e);
  }
}


// ---------- Comparativas, destacados y tickets ----------
function chipComparaGastos(id, v) {
  const r = datosGastos.resumen || {};
  const ant = (r.cat_anterior || {})[id] || 0;
  const med = (r.cat_media || {})[id] || 0;
  const base = med > 0 ? med : ant;
  if (!(base > 0)) return '';
  const dif = v - base, pct = Math.round(dif / base * 100);
  if (Math.abs(pct) < 15 || Math.abs(dif) < 5) return '';
  const sube = dif > 0;
  return `<p class="text-[11px] font-semibold ${sube ? 'text-rose-600' : 'text-emerald-600'} mt-0.5">${sube ? '▲' : '▼'} ${Math.abs(pct)} % ${sube ? 'más' : 'menos'} de lo habitual (${eurosCortos(base)}${med > 0 ? ' de media' : ' el mes pasado'})</p>`;
}

function htmlDestacadosGastos() {
  const d = datosGastos, r = d.resumen || {};
  const puntos = [];
  let subida = null, bajada = null;
  Object.entries(r.por_categoria || {}).forEach(([id, v]) => {
    const base = (r.cat_media || {})[id] || 0;
    if (!(base > 0)) return;
    const dif = v - base, pct = Math.round(dif / base * 100);
    if (Math.abs(pct) < 15 || Math.abs(dif) < 10) return;
    if (dif > 0 && (!subida || dif > subida.dif)) subida = { id, dif, pct };
    if (dif < 0 && (!bajada || dif < bajada.dif)) bajada = { id, dif, pct };
  });
  if (subida) { const c = catGasto(subida.id); puntos.push(`▲ ${c.icono} <b>${escapeHTML(c.nombre)}</b> sube ${eurosCortos(subida.dif)} (${subida.pct} %) sobre su media`); }
  if (bajada) { const c = catGasto(bajada.id); puntos.push(`▼ ${c.icono} <b>${escapeHTML(c.nombre)}</b> baja ${eurosCortos(-bajada.dif)} (${Math.abs(bajada.pct)} %) bajo su media`); }
  (d.facturas || []).filter(f => f.sube_pct).forEach(f => puntos.push(`🧾 <b>${escapeHTML(f.nombre)}</b> ha subido un ${f.sube_pct} % (${eurosCortos(f.importe)} frente a ${eurosCortos(f.media)})`));
  const mayor = (d.gastos || []).filter(g => g.importe > 0).sort((a, b) => b.importe - a.importe)[0];
  if (mayor && mayor.importe >= 50) puntos.push(`💶 Mayor gasto: <b>${escapeHTML(mayor.nota || catGasto(mayor.categoria).nombre)}</b> · ${eurosCortos(mayor.importe)}`);
  if (!puntos.length) return '';
  return `<section class="bg-indigo-50 border border-indigo-200 rounded-2xl p-4">
    <p class="text-[11px] font-bold text-indigo-700 uppercase tracking-wider mb-1.5">✨ Lo más destacado del mes</p>
    <ul class="space-y-1 text-[13px] text-indigo-900">${puntos.slice(0, 5).map(p => `<li>${p}</li>`).join('')}</ul>
  </section>`;
}

function htmlDetallePendientes() {
  const lista = (datosGastos && datosGastos.pendientes_lista) || [];
  if (!lista.length) return '';
  return `<details class="mt-2"><summary class="text-[11px] font-semibold text-amber-800 cursor-pointer">Ver el detalle (${lista.length})</summary>
    <ul class="mt-1 space-y-0.5">${lista.map(p => `<li class="text-[11px] text-amber-900 flex justify-between gap-3"><span class="truncate">${escapeHTML(p.fecha.slice(5).split('-').reverse().join('/'))} · ${escapeHTML(p.nota || 'Gasto')} <span class="text-amber-700/70">(${escapeHTML(p.persona)})</span></span><span class="font-semibold shrink-0">${eurosCortos(p.a_cobrar)}</span></li>`).join('')}</ul>
  </details>`;
}

async function elegirTicketGasto(input) {
  const file = input.files && input.files[0];
  input.value = '';
  if (!file) return;
  try {
    leerCamposFormGasto();
    formGasto.ticketNuevo = await chatReducirFoto(file);
    formGasto.quitarTicket = false;
    pintarFormGasto();
  } catch (e) { mostrarError('Foto', e); }
}

function quitarTicketForm() {
  leerCamposFormGasto();
  if (formGasto.ticketNuevo) formGasto.ticketNuevo = null;
  else formGasto.quitarTicket = true;
  pintarFormGasto();
}

async function verTicketGasto(id) {
  try {
    const r = await fetch(`/gastos/${id}/ticket`, { credentials: 'same-origin' });
    if (!r.ok) throw new Error('El ticket no está disponible');
    chatVerFoto(URL.createObjectURL(await r.blob()));
  } catch (e) { mostrarError('Ticket', e); }
}
