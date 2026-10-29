'use strict';

// ---------------- RETO: progreso, récords, rachas y logros ----------------
// Todo se calcula con el historial que devuelve /reto/progreso.

const RETO_META_SEMANA = 3; // sesiones de fuerza para dar la semana por cumplida
let retoProg = null;

async function retoCargarProgreso() {
  try { retoProg = await retoFetch('/reto/progreso'); } catch (e) { /* se queda lo que hubiera */ }
}

function retoListaReps(txt) {
  return String(txt || '').split(/[^0-9]+/).filter(Boolean).map(Number);
}

function retoLunesDe(iso) {
  const d = parseFechaISO(iso);
  const desvio = (d.getUTCDay() + 6) % 7;
  return sumarDiasISO(iso, -desvio);
}

function retoSumaReps(lista) { return lista.reduce((a, b) => a + b, 0); }

// Devuelve estadísticas del historial. `hoy` es la fecha de referencia (para la racha).
function retoAnalizar(prog, hoy) {
  const series = (prog && prog.series) || [];
  const sesiones = Array.from(new Set((prog && prog.sesiones) || [])).sort();
  const cardio = (prog && prog.cardio) || [];

  // Racha semanal
  const porSemana = {};
  sesiones.forEach(f => { const l = retoLunesDe(f); porSemana[l] = (porSemana[l] || 0) + 1; });
  const cumplidas = new Set(Object.keys(porSemana).filter(l => porSemana[l] >= RETO_META_SEMANA));
  const lunesHoy = retoLunesDe(hoy);
  let racha = 0;
  let cursor = cumplidas.has(lunesHoy) ? lunesHoy : sumarDiasISO(lunesHoy, -7);
  while (cumplidas.has(cursor)) { racha++; cursor = sumarDiasISO(cursor, -7); }
  let mejorRacha = 0, actual = 0, previa = null;
  Array.from(cumplidas).sort().forEach(l => {
    actual = (previa && sumarDiasISO(previa, 7) === l) ? actual + 1 : 1;
    if (actual > mejorRacha) mejorRacha = actual;
    previa = l;
  });

  // Volumen, récords y resumen por ejercicio
  let volumen = 0;
  const volSemana = {};
  const porEj = {};
  const eventosRecord = []; // { fecha, ejercicio, texto }
  const mejorPeso = {}, mejorReps = {};
  series.forEach(s => {
    const reps = retoListaReps(s.reps);
    const total = retoSumaReps(reps);
    const vol = s.peso > 0 ? s.peso * total : 0;
    volumen += vol;
    const l = retoLunesDe(s.fecha);
    volSemana[l] = (volSemana[l] || 0) + vol;
    const maxSet = reps.length ? Math.max(...reps) : 0;
    const ej = porEj[s.ejercicio] = porEj[s.ejercicio] || { nombre: s.ejercicio, puntos: [], conPeso: false };
    if (s.peso > 0) ej.conPeso = true;
    ej.puntos.push({ f: s.fecha, peso: s.peso, reps: maxSet });
    if (s.peso > 0) {
      const mp = mejorPeso[s.ejercicio] || 0;
      if (mp > 0 && s.peso > mp) eventosRecord.push({ fecha: s.fecha, ejercicio: s.ejercicio, texto: `${retoNum(s.peso)} kg (antes ${retoNum(mp)} kg)` });
      if (s.peso > mp) mejorPeso[s.ejercicio] = s.peso;
    } else if (maxSet > 0) {
      const mr = mejorReps[s.ejercicio] || 0;
      if (mr > 0 && maxSet > mr) eventosRecord.push({ fecha: s.fecha, ejercicio: s.ejercicio, texto: `${maxSet} repeticiones (antes ${mr})` });
      if (maxSet > mr) mejorReps[s.ejercicio] = maxSet;
    }
  });
  const resumenEj = Object.values(porEj).map(e => {
    const primero = e.puntos[0];
    let mejor = primero;
    e.puntos.forEach(p => { if (e.conPeso ? (p.peso > mejor.peso || (p.peso === mejor.peso && p.reps > mejor.reps)) : p.reps > mejor.reps) mejor = p; });
    const ganancia = e.conPeso
      ? (primero.peso > 0 ? mejor.peso / primero.peso - 1 : 0)
      : (primero.reps > 0 ? mejor.reps / primero.reps - 1 : 0);
    return { ...e, primero, mejor, ganancia, veces: e.puntos.length };
  });

  // Cintura
  return { sesiones, cardio, racha, mejorRacha, cumplidas, porSemana, lunesHoy, volumen, volSemana, resumenEj, eventosRecord, totalRecords: eventosRecord.length };
}

// Logros: [id, icono, título, descripción, valor actual, objetivo]
function retoLogros(a, medidas) {
  const nSes = a.sesiones.length;
  const cints = (medidas || []).filter(m => m.cintura).map(m => m.cintura);
  const bajaCintura = cints.length >= 2 ? Math.max(0, cints[0] - Math.min(...cints)) : 0;
  const L = [];
  [[1, '👣', 'Primer paso', 'Tu primera sesión de fuerza'], [5, '🔥', 'Calentando motores', '5 sesiones'], [10, '💪', 'Constante', '10 sesiones'],
    [25, '🏅', 'Cuarto de cien', '25 sesiones'], [50, '🥇', 'Medio centenar', '50 sesiones'], [100, '👑', 'Centenario', '100 sesiones']]
    .forEach(([n, i, t, d]) => L.push({ icono: i, titulo: t, desc: d, val: nSes, meta: n }));
  [[2, '📅', 'Dos semanas seguidas'], [4, '🗓️', 'Un mes entero'], [8, '🚀', 'Dos meses sin fallar'], [12, '🏆', 'Trimestre redondo']]
    .forEach(([n, i, t]) => L.push({ icono: i, titulo: t, desc: `${n} semanas seguidas con ${RETO_META_SEMANA}+ sesiones`, val: a.mejorRacha, meta: n }));
  [[1000, '🧱', 'Mil kilos', '1.000 kg movidos'], [5000, '🏗️', 'Cinco mil', '5.000 kg movidos'], [10000, '🚛', 'Diez mil', '10.000 kg movidos'],
    [25000, '🐘', 'Elefante', '25.000 kg movidos'], [50000, '🚀', 'Cohete', '50.000 kg movidos']]
    .forEach(([n, i, t, d]) => L.push({ icono: i, titulo: t, desc: d + ' (peso × repeticiones)', val: Math.round(a.volumen), meta: n }));
  [[1, '⬆️', 'Primer récord', 'Subir peso o repeticiones por primera vez'], [10, '📈', 'Rompiendo marcas', '10 récords personales'], [25, '⚡', 'Imparable', '25 récords personales']]
    .forEach(([n, i, t, d]) => L.push({ icono: i, titulo: t, desc: d, val: a.totalRecords, meta: n }));
  [[10, '🏃', 'Corredor', '10 sesiones de cardio'], [25, '🐆', 'Pulmón de acero', '25 sesiones de cardio']]
    .forEach(([n, i, t, d]) => L.push({ icono: i, titulo: t, desc: d, val: a.cardio.length, meta: n }));
  [[1, '📏', 'La cintura baja', 'Un centímetro menos de cintura'], [3, '✂️', 'Tres centímetros', '3 cm menos de cintura'], [5, '🎯', 'Cinco centímetros', '5 cm menos de cintura']]
    .forEach(([n, i, t, d]) => L.push({ icono: i, titulo: t, desc: d, val: Math.round(bajaCintura * 10) / 10, meta: n }));
  return L.map(x => ({ ...x, hecho: x.val >= x.meta }));
}

// ---------- Pantalla Progreso ----------
function retoSpark(puntos, color) {
  if (puntos.length < 2) return '';
  const W = 90, H = 26;
  const vs = puntos.map(p => p.v);
  let min = Math.min(...vs), max = Math.max(...vs);
  if (max === min) { min -= 1; max += 1; }
  const xs = i => 2 + i / (puntos.length - 1) * (W - 4);
  const ys = v => H - 3 - (v - min) / (max - min) * (H - 6);
  const linea = puntos.map((p, i) => `${xs(i).toFixed(1)},${ys(p.v).toFixed(1)}`).join(' ');
  return `<svg viewBox="0 0 ${W} ${H}" class="w-[90px] h-[26px] shrink-0" aria-hidden="true"><polyline points="${linea}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
}

function retoFmtKg(v) {
  return String(Math.round(v)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

function retoHTMLProgreso() {
  if (!retoProg) return '<p class="text-center text-sm text-slate-400 py-6">Cargando tu progreso…</p>';
  const hoy = retoHoyISO();
  const a = retoAnalizar(retoProg, hoy);
  if (!a.sesiones.length && !retoProg.series.length) {
    return `<section class="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 text-center space-y-1">
      <p class="text-3xl">🌱</p><p class="text-sm font-bold text-slate-800">Tu progreso empieza con la primera sesión</p>
      <p class="text-xs text-slate-500">Aquí verás tus rachas, récords y logros según vayas entrenando.</p></section>`;
  }
  const logros = retoLogros(a, retoMedidas);
  const hechos = logros.filter(l => l.hecho);
  const proximos = logros.filter(l => !l.hecho).sort((x, y) => (y.val / y.meta) - (x.val / x.meta)).slice(0, 3);
  const esteLunes = a.porSemana[a.lunesHoy] || 0;
  const rachaTxt = a.racha > 0
    ? `${a.racha} semana${a.racha > 1 ? 's' : ''}`
    : '0 semanas';

  // Desde que empezaste: los 3 ejercicios con más mejora relativa
  const mejoras = a.resumenEj.filter(e => e.veces >= 2 && e.ganancia > 0).sort((x, y) => y.ganancia - x.ganancia).slice(0, 3);
  const bloqueMejoras = mejoras.length ? `
    <section class="bg-emerald-50 border border-emerald-200 rounded-2xl p-3.5 space-y-1.5">
      <p class="text-xs font-bold text-emerald-800 uppercase tracking-wider">🌟 Lo que has mejorado</p>
      ${mejoras.map(e => {
        const txt = e.conPeso
          ? `${retoNum(e.primero.peso)} kg → <b>${retoNum(e.mejor.peso)} kg</b>`
          : `${e.primero.reps} → <b>${e.mejor.reps}</b> repeticiones`;
        return `<p class="text-sm text-emerald-900"><b>${escapeHTML(e.nombre.split(' con ')[0].split(' (')[0])}</b>: ${txt} <span class="text-emerald-700 font-semibold">(+${Math.round(e.ganancia * 100)} %)</span></p>`;
      }).join('')}
    </section>` : '';

  // Carga por semana (últimas 8)
  const semanas = [];
  for (let i = 7; i >= 0; i--) semanas.push(sumarDiasISO(a.lunesHoy, -7 * i));
  const maxVol = Math.max(1, ...semanas.map(l => a.volSemana[l] || 0));
  const barras = semanas.map(l => {
    const v = a.volSemana[l] || 0;
    const alto = Math.max(v > 0 ? 6 : 2, Math.round(v / maxVol * 100));
    const esta = l === a.lunesHoy;
    return `<div class="flex-1 min-w-0 flex flex-col items-center justify-end h-full gap-1">
      <span class="text-[9px] text-slate-400">${v > 0 ? (v >= 1000 ? (v / 1000).toFixed(1).replace('.', ',') + 'k' : Math.round(v)) : ''}</span>
      <span class="w-full rounded-t-md ${esta ? 'bg-emerald-500' : (a.cumplidas.has(l) ? 'bg-emerald-300' : 'bg-slate-300')}" style="height:${alto}%"></span>
      <span class="text-[9px] ${esta ? 'font-bold text-emerald-600' : 'text-slate-400'}">${escapeHTML(l.slice(8, 10) + '/' + l.slice(5, 7))}</span>
    </div>`;
  }).join('');

  // Por ejercicio
  const filas = a.resumenEj.slice().sort((x, y) => y.veces - x.veces).map(e => {
    const pts = e.puntos.map(p => ({ v: e.conPeso ? p.peso : p.reps }));
    const mejor = e.conPeso ? `${retoNum(e.mejor.peso)} kg${e.mejor.reps ? ' × ' + e.mejor.reps : ''}` : `${e.mejor.reps} reps`;
    return `<div class="flex items-center gap-3 px-3.5 py-2.5">
      <div class="min-w-0 flex-grow"><p class="text-sm font-semibold text-slate-800 truncate">${escapeHTML(e.nombre.split(' con ')[0].split(' (')[0])}</p><p class="text-xs text-slate-400">Mejor: ${escapeHTML(mejor)} · ${e.veces} sesion${e.veces > 1 ? 'es' : ''}</p></div>
      ${retoSpark(pts, '#059669')}
    </div>`;
  }).join('');

  const insignias = hechos.length ? `<div class="grid grid-cols-4 gap-2">${hechos.map(l => `
      <div class="flex flex-col items-center text-center gap-0.5" title="${escapeHTML(l.desc)}">
        <span class="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center text-2xl">${l.icono}</span>
        <span class="text-[10px] font-semibold text-slate-600 leading-tight">${escapeHTML(l.titulo)}</span>
      </div>`).join('')}</div>` : '<p class="text-xs text-slate-400">Aún no has desbloqueado ninguno. ¡El primero está al lado!</p>';

  const siguientes = proximos.map(l => `
      <div class="flex items-center gap-3">
        <span class="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center text-lg grayscale opacity-60">${l.icono}</span>
        <div class="min-w-0 flex-grow">
          <div class="flex justify-between gap-2"><p class="text-xs font-semibold text-slate-700 truncate">${escapeHTML(l.titulo)}</p><p class="text-[11px] text-slate-400 shrink-0">${typeof l.val === 'number' && l.val % 1 ? String(l.val).replace('.', ',') : retoFmtKg(l.val)} / ${retoFmtKg(l.meta)}</p></div>
          <div class="h-1.5 rounded-full bg-slate-100 overflow-hidden mt-1"><div class="h-full bg-emerald-400" style="width:${Math.min(100, Math.round(l.val / l.meta * 100))}%"></div></div>
          <p class="text-[10px] text-slate-400 mt-0.5">${escapeHTML(l.desc)}</p>
        </div>
      </div>`).join('');

  return `
    <section class="grid grid-cols-2 gap-3">
      <div class="bg-white rounded-2xl border border-slate-200 shadow-sm p-3.5"><p class="text-[10px] font-bold text-slate-400 uppercase">🔥 Racha</p><p class="text-xl font-extrabold text-slate-900">${rachaTxt}</p><p class="text-[11px] text-slate-400">Esta semana ${esteLunes}/${RETO_META_SEMANA} sesiones${a.mejorRacha > a.racha ? ' · mejor: ' + a.mejorRacha : ''}</p></div>
      <div class="bg-white rounded-2xl border border-slate-200 shadow-sm p-3.5"><p class="text-[10px] font-bold text-slate-400 uppercase">💪 Sesiones</p><p class="text-xl font-extrabold text-slate-900">${a.sesiones.length}</p><p class="text-[11px] text-slate-400">+ ${a.cardio.length} de cardio</p></div>
      <div class="bg-white rounded-2xl border border-slate-200 shadow-sm p-3.5"><p class="text-[10px] font-bold text-slate-400 uppercase">🏋️ Kilos movidos</p><p class="text-xl font-extrabold text-slate-900">${retoFmtKg(a.volumen)}</p><p class="text-[11px] text-slate-400">peso × repeticiones</p></div>
      <div class="bg-white rounded-2xl border border-slate-200 shadow-sm p-3.5"><p class="text-[10px] font-bold text-slate-400 uppercase">⬆️ Récords</p><p class="text-xl font-extrabold text-slate-900">${a.totalRecords}</p><p class="text-[11px] text-slate-400">veces que has subido tu marca</p></div>
    </section>
    ${bloqueMejoras}
    <section class="bg-white rounded-2xl border border-slate-200 shadow-sm p-3.5 space-y-3">
      <div class="flex items-center justify-between"><h2 class="text-sm font-bold text-slate-800">🎖️ Logros</h2><span class="text-xs text-slate-400">${hechos.length} de ${logros.length}</span></div>
      ${insignias}
      ${proximos.length ? `<div class="pt-2 border-t border-slate-100 space-y-3"><p class="text-[10px] font-bold text-slate-400 uppercase">Los siguientes</p>${siguientes}</div>` : ''}
    </section>
    <section class="bg-white rounded-2xl border border-slate-200 shadow-sm p-3.5">
      <h2 class="text-sm font-bold text-slate-800 mb-3">Kilos movidos por semana</h2>
      <div class="flex items-end gap-1 h-28 overflow-hidden">${barras}</div>
      <p class="text-[10px] text-slate-400 mt-2">Verde claro: semana cumplida (${RETO_META_SEMANA}+ sesiones).</p>
    </section>
    ${filas ? `<section class="space-y-1.5"><h2 class="text-xs font-bold text-slate-400 uppercase tracking-wider px-1">Cada ejercicio</h2><div class="bg-white rounded-2xl border border-slate-200 shadow-sm divide-y divide-slate-100 overflow-hidden">${filas}</div></section>` : ''}
    <h2 class="text-xs font-bold text-slate-400 uppercase tracking-wider px-1 pt-2">📏 Medidas</h2>`;
}

// Chip de racha para la pantalla Hoy
function retoChipRacha() {
  if (!retoProg) return '';
  const a = retoAnalizar(retoProg, retoHoyISO());
  if (!a.sesiones.length) return '';
  const esta = a.porSemana[a.lunesHoy] || 0;
  const falta = Math.max(0, RETO_META_SEMANA - esta);
  const txt = falta === 0
    ? `Semana cumplida ✓ (${esta} sesiones)`
    : `${esta}/${RETO_META_SEMANA} esta semana: te ${falta === 1 ? 'falta 1 sesión' : 'faltan ' + falta + ' sesiones'} para cumplirla`;
  return `<button type="button" onclick="retoCambiarVista('medidas')" class="w-full flex items-center gap-2 text-left bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
    <span class="text-lg">🔥</span>
    <span class="text-xs text-amber-800"><b>${a.racha > 0 ? 'Racha de ' + a.racha + ' semana' + (a.racha > 1 ? 's' : '') : 'Empieza tu racha'}</b> · ${escapeHTML(txt)}</span>
  </button>`;
}

// ---------- Final del entreno guiado: récords y logros de hoy ----------
function retoCelebracionHTML() {
  if (!retoProg || !retoG || !retoG.ejercicios) return '';
  const hoy = retoFecha;
  const hoyFilas = [];
  retoG.ejercicios.forEach(x => {
    const hechas = x.sets.filter(s => s.hecha);
    if (!hechas.length) return;
    hoyFilas.push({ fecha: hoy, ejercicio: x.e.n, peso: x.e.tipo === 'peso' ? (x.peso || 0) : 0, reps: hechas.map(s => s.reps).join('-') });
  });
  const antes = { series: retoProg.series.filter(s => s.fecha !== hoy), sesiones: retoProg.sesiones.filter(f => f !== hoy), cardio: retoProg.cardio };
  const despues = { series: antes.series.concat(hoyFilas), sesiones: antes.sesiones.concat([hoy]), cardio: retoProg.cardio };
  const a0 = retoAnalizar(antes, hoy), a1 = retoAnalizar(despues, hoy);
  const records = a1.eventosRecord.filter(r => r.fecha === hoy);
  const nuevos = retoLogros(a1, retoMedidas).filter(l => l.hecho).filter(l => !retoLogros(a0, retoMedidas).find(o => o.titulo === l.titulo && o.hecho));
  const esta = a1.porSemana[a1.lunesHoy] || 0;
  const lineas = [];
  records.forEach(r => lineas.push(`<p class="text-sm text-amber-900">🏆 <b>Récord en ${escapeHTML(r.ejercicio.split(' con ')[0].split(' (')[0])}</b>: ${escapeHTML(r.texto)}</p>`));
  nuevos.forEach(l => lineas.push(`<p class="text-sm text-amber-900">${l.icono} <b>Logro desbloqueado: ${escapeHTML(l.titulo)}</b></p>`));
  lineas.push(`<p class="text-xs text-amber-800">Sesión nº ${a1.sesiones.length} · ${esta >= RETO_META_SEMANA ? 'semana cumplida ✓' : esta + '/' + RETO_META_SEMANA + ' esta semana'}${a1.racha > 0 ? ' · racha de ' + a1.racha + ' semana' + (a1.racha > 1 ? 's' : '') : ''}</p>`);
  return `<div class="bg-amber-50 border border-amber-200 rounded-2xl p-3.5 space-y-1">${lineas.join('')}</div>`;
}
