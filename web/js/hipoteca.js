// Pagos > pestaña "Hipoteca": estado del préstamo, cuotas restantes, intereses y simulador de amortización.

let datosHipoteca = null;

// ---------- Matemáticas del préstamo (cuota francesa) ----------
function cuotaFrancesa(saldo, r, n) {
  if (n <= 0) return 0;
  return r === 0 ? saldo / n : saldo * r / (1 - Math.pow(1 + r, -n));
}

// Tipo mensual que hace que `saldo` se pague exactamente con `cuota` en `n` cuotas.
function tipoImplicito(saldo, cuota, n) {
  if (n <= 0 || cuota * n <= saldo) return 0;
  let lo = 0, hi = 0.05;
  for (let i = 0; i < 80; i++) {
    const m = (lo + hi) / 2;
    if (cuotaFrancesa(saldo, m, n) < cuota) lo = m; else hi = m;
  }
  return (lo + hi) / 2;
}


// Fechas de cobro estrictamente posteriores a `desde` y hasta `hasta` (incluida), como objetos Date.
function fechasCobro(desde, hasta, dia) {
  const out = [];
  let a = desde.getFullYear(), m = desde.getMonth();
  for (let i = 0; i < 1200; i++) {
    const f = new Date(a, m, dia);
    if (f > hasta) break;
    if (f > desde) out.push(f);
    m++; if (m > 11) { m = 0; a++; }
  }
  return out;
}

function isoADate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function calcularHipoteca(h, hoy) {
  const fSaldo = isoADate(h.fecha_saldo);
  const fFin = isoADate(h.fecha_vencimiento);
  const todas = fechasCobro(fSaldo, fFin, h.dia_cobro);
  const nDesdeSaldo = todas.length;
  const rAuto = tipoImplicito(h.saldo, h.cuota, nDesdeSaldo);
  const r = h.interes > 0 ? h.interes / 100 / 12 : rAuto;
  // Si ya han pasado cobros desde que se anotó el saldo, se estima el saldo de hoy
  let saldo = h.saldo, pagadas = 0;
  for (const f of todas) {
    if (f > hoy) break;
    saldo = Math.max(0, saldo * (1 + r) - h.cuota);
    pagadas++;
  }
  const restantes = nDesdeSaldo - pagadas;
  const proxima = todas[pagadas] || null;
  const interesCuota = saldo * r;
  const capitalCuota = Math.max(0, Math.min(h.cuota - interesCuota, saldo));
  // Total real a pagar: simulación exacta (la última cuota puede ser menor)
  let s = saldo, pagarTotal = 0, interesTotal = 0;
  const anual = [];
  let n = 0;
  const base = proxima || hoy;
  while (s > 0.005 && n < 1200) {
    const i = s * r;
    const c = Math.min(h.cuota, s + i);
    s = s + i - c;
    pagarTotal += c; interesTotal += i; n++;
    const f = new Date(base.getFullYear(), base.getMonth() + n - 1, h.dia_cobro);
    if (f.getMonth() === 11 || s <= 0.005) anual.push({ anio: f.getFullYear(), saldo: Math.max(0, s) });
  }
  // ¿Cuadran el tipo, la cuota y la fecha de vencimiento? (si no, suele ser que el % es TAE y no TIN)
  const desfase = n - nDesdeSaldo;
  return {
    desfase, r, interesAnual: r * 12 * 100, auto: !(h.interes > 0), saldo, restantes: n || restantes, proxima,
    interesCuota, capitalCuota, pagarTotal, interesTotal, anual,
    amortizado: Math.max(0, h.capital_inicial - saldo),
    pctAmortizado: h.capital_inicial > 0 ? Math.max(0, Math.min(100, (h.capital_inicial - saldo) / h.capital_inicial * 100)) : 0,
    fechaFin: new Date(base.getFullYear(), base.getMonth() + Math.max(0, n - 1), h.dia_cobro)
  };
}

// Simula amortización anticipada (puntual) y/o extra mensual.
function simularHipoteca(h, calc, unica, extraMes) {
  const r = calc.r, S = calc.saldo - unica;
  if (S <= 0) return { liquida: true };
  // A) reducir plazo manteniendo cuota (+ extra mensual)
  const c = h.cuota + extraMes;
  let n = 0, s = S, inter = 0;
  while (s > 0.005 && n < 1200) {
    const i = s * r;
    const pago = Math.min(c, s + i);
    if (pago <= i) { n = 1200; break; }
    s = s + i - pago; inter += i; n++;
  }
  // B) reducir cuota manteniendo plazo (solo la amortización puntual)
  const cuotaNueva = cuotaFrancesa(S, r, calc.restantes);
  const interB = Math.max(0, cuotaNueva * calc.restantes - S);
  return {
    liquida: false,
    plazo: { meses: n, ahorroMeses: calc.restantes - n, ahorroIntereses: Math.max(0, calc.interesTotal - inter) },
    cuota: { nueva: cuotaNueva, ahorroMes: h.cuota - cuotaNueva, ahorroIntereses: Math.max(0, calc.interesTotal - interB) }
  };
}

// ---------- Interfaz ----------
function textoPlazo(meses) {
  const a = Math.floor(meses / 12), m = meses % 12;
  return (a ? a + ' año' + (a > 1 ? 's' : '') : '') + (a && m ? ' y ' : '') + (m ? m + ' mes' + (m > 1 ? 'es' : '') : '') || '0 meses';
}

function fechaLarga(d) {
  return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
}

async function cargarHipoteca() {
  const cont = document.getElementById('pagos-hipoteca');
  if (!cont) return;
  try {
    datosHipoteca = await API.get('/hipoteca');
  } catch (e) {
    if (!datosHipoteca) { cont.innerHTML = '<p class="text-sm text-rose-600 px-1">No se pudo cargar la hipoteca.</p>'; return; }
  }
  if (!datosHipoteca) return;
  pintarHipoteca();
}

let simHip = { unica: '', extra: '' };

function pintarHipoteca() {
  const h = datosHipoteca;
  const cont = document.getElementById('pagos-hipoteca');
  const c = calcularHipoteca(h, new Date());
  const unica = parseFloat(String(simHip.unica).replace(',', '.')) || 0;
  const extra = parseFloat(String(simHip.extra).replace(',', '.')) || 0;
  const sim = (unica > 0 || extra > 0) ? simularHipoteca(h, c, unica, extra) : null;

  const maxAnual = Math.max(1, h.capital_inicial);
  const barras = c.anual.map((a, i) => {
    const alto = Math.max(2, Math.round(a.saldo / maxAnual * 100));
    const etiqueta = (i === 0 || a.anio % 5 === 0 || i === c.anual.length - 1) ? String(a.anio).slice(2) : '';
    return `<div class="flex-1 flex flex-col items-center justify-end h-full gap-1"><span class="w-full rounded-t bg-sky-400/80" style="height:${alto}%"></span><span class="text-[9px] text-slate-400 h-3">${etiqueta}</span></div>`;
  }).join('');

  let htmlSim = '';
  if (sim) {
    if (sim.liquida) {
      htmlSim = '<p class="text-sm font-bold text-emerald-700">🎉 Con ese importe liquidáis la hipoteca.</p>';
    } else {
      htmlSim = `
        <div class="grid grid-cols-1 gap-2">
          <div class="bg-emerald-50 border border-emerald-200 rounded-xl p-3">
            <p class="text-[10px] font-bold text-emerald-700 uppercase">Acortando el plazo (misma cuota${extra > 0 ? ' + ' + eurosCortos(extra) + '/mes' : ''})</p>
            <p class="text-sm text-emerald-900">Terminaríais <b>${textoPlazo(Math.max(0, sim.plazo.ahorroMeses))}</b> antes y ahorraríais <b>${eurosCortos(sim.plazo.ahorroIntereses)}</b> de intereses.</p>
          </div>
          ${unica > 0 ? `<div class="bg-sky-50 border border-sky-200 rounded-xl p-3">
            <p class="text-[10px] font-bold text-sky-700 uppercase">Bajando la cuota (mismo plazo)</p>
            <p class="text-sm text-sky-900">La cuota pasaría a <b>${eurosCortos(sim.cuota.nueva)}</b> (${eurosCortos(sim.cuota.ahorroMes)} menos al mes) y ahorraríais <b>${eurosCortos(sim.cuota.ahorroIntereses)}</b> de intereses.</p>
          </div>` : ''}
        </div>`;
    }
  }

  cont.innerHTML = `
    ${(!c.auto && Math.abs(c.desfase) > 3) ? `<section class="bg-amber-50 border border-amber-200 rounded-2xl p-3">
      <p class="text-xs font-bold text-amber-800">⚠️ Los datos no cuadran</p>
      <p class="text-xs text-amber-800 mt-0.5">Con un ${h.interes.toString().replace('.', ',')} % y una cuota de ${eurosCortos(h.cuota)} tardaríais ${textoPlazo(Math.abs(c.desfase))} ${c.desfase > 0 ? 'más' : 'menos'} que lo que marca el vencimiento. Suele ser que ese % es la TAE (incluye seguros y comisiones) y no el TIN, que es el tipo que se aplica a la cuota. Prueba con el TIN o déjalo en 0 para que lo estime.</p>
    </section>` : ''}

    <section class="bg-white border border-slate-200 rounded-2xl shadow-sm p-4">
      <div class="flex items-start justify-between">
        <p class="text-[11px] font-bold text-slate-400 uppercase tracking-wider">🏠 ${escapeHTML(h.nombre)} · Os quedan por pagar</p>
        <button type="button" onclick="abrirEditarHipoteca()" class="text-xs font-semibold text-sky-600">Editar</button>
      </div>
      <p class="text-3xl font-extrabold text-slate-900 leading-tight">${eurosCortos(c.saldo)}</p>
      <div class="h-3 rounded-full bg-slate-100 overflow-hidden mt-3"><div class="h-full bg-emerald-500" style="width:${c.pctAmortizado.toFixed(1)}%"></div></div>
      <p class="text-[11px] text-slate-500 mt-1">Ya habéis devuelto ${eurosCortos(c.amortizado)} (${c.pctAmortizado.toFixed(1).replace('.', ',')} % de ${eurosCortos(h.capital_inicial)})</p>
      <button type="button" onclick="abrirActualizarSaldo()" class="mt-3 w-full bg-slate-100 text-slate-700 text-xs font-semibold py-2 rounded-xl">🔄 Actualizar saldo con el del banco</button>
      <p class="text-[10px] text-slate-400 mt-1.5">Saldo anotado el ${fechaLarga(isoADate(h.fecha_saldo))}${c.saldo !== h.saldo ? '; el de hoy es una estimación' : ''}.</p>
    </section>

    <section class="grid grid-cols-2 gap-3">
      <div class="bg-white border border-slate-200 rounded-2xl shadow-sm p-3"><p class="text-[10px] font-bold text-slate-400 uppercase">Cuota mensual</p><p class="text-lg font-extrabold text-slate-900">${eurosCortos(h.cuota)}</p><p class="text-[11px] text-slate-400">${c.proxima ? 'Próxima: ' + c.proxima.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Sin cuotas pendientes'}</p></div>
      <div class="bg-white border border-slate-200 rounded-2xl shadow-sm p-3"><p class="text-[10px] font-bold text-slate-400 uppercase">Cuotas que faltan</p><p class="text-lg font-extrabold text-slate-900">${c.restantes}</p><p class="text-[11px] text-slate-400">${textoPlazo(c.restantes)}</p></div>
      <div class="bg-white border border-slate-200 rounded-2xl shadow-sm p-3"><p class="text-[10px] font-bold text-slate-400 uppercase">Se acaba</p><p class="text-lg font-extrabold text-slate-900">${c.fechaFin.getFullYear()}</p><p class="text-[11px] text-slate-400">${c.fechaFin.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })}</p></div>
      <div class="bg-white border border-slate-200 rounded-2xl shadow-sm p-3"><p class="text-[10px] font-bold text-slate-400 uppercase">Intereses por pagar</p><p class="text-lg font-extrabold text-slate-900">${eurosCortos(c.interesTotal)}</p><p class="text-[11px] text-slate-400">≈ ${c.interesAnual.toFixed(2).replace('.', ',')} % anual${c.auto ? ' (estimado)' : ''}</p></div>
    </section>

    <section class="bg-white border border-slate-200 rounded-2xl shadow-sm p-4">
      <h2 class="text-sm font-bold text-slate-800 mb-2">De cada cuota ahora mismo</h2>
      <div class="h-3 rounded-full overflow-hidden flex bg-slate-100">
        <div class="bg-emerald-500" style="width:${(c.capitalCuota / h.cuota * 100).toFixed(1)}%"></div>
        <div class="bg-amber-400" style="width:${(c.interesCuota / h.cuota * 100).toFixed(1)}%"></div>
      </div>
      <p class="text-[11px] text-slate-500 mt-1.5"><span class="text-emerald-600 font-semibold">${eurosCortos(c.capitalCuota)} capital</span> · <span class="text-amber-600 font-semibold">${eurosCortos(c.interesCuota)} intereses</span></p>
      <p class="text-[11px] text-slate-400 mt-2">Total que aún os falta pagar entre capital e intereses: <b>${eurosCortos(c.pagarTotal)}</b></p>
    </section>

    <section class="bg-white border border-slate-200 rounded-2xl shadow-sm p-4">
      <h2 class="text-sm font-bold text-slate-800 mb-3">Lo que queda por año</h2>
      <div class="flex items-end gap-px h-28">${barras}</div>
    </section>

    <section class="bg-white border border-slate-200 rounded-2xl shadow-sm p-4 space-y-3">
      <h2 class="text-sm font-bold text-slate-800">🧮 ¿Y si adelantáis dinero?</h2>
      <div class="grid grid-cols-2 gap-3">
        <label class="text-[11px] text-slate-500">Amortización única (€)<input id="hip-unica" type="number" inputmode="decimal" min="0" step="100" value="${escapeHTML(String(simHip.unica))}" oninput="simHip.unica=this.value" onchange="pintarHipoteca()" placeholder="Ej. 5000" class="mt-1 w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-800"></label>
        <label class="text-[11px] text-slate-500">Extra cada mes (€)<input id="hip-extra" type="number" inputmode="decimal" min="0" step="10" value="${escapeHTML(String(simHip.extra))}" oninput="simHip.extra=this.value" onchange="pintarHipoteca()" placeholder="Ej. 100" class="mt-1 w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-800"></label>
      </div>
      ${htmlSim || '<p class="text-xs text-slate-400">Escribe un importe y verás cuánto tiempo e intereses os ahorráis.</p>'}
      <p class="text-[10px] text-slate-400">Estimación orientativa: no incluye comisiones de amortización ni cambios de tipo. Confirma las cifras con el banco.</p>
    </section>`;
}

function modalHipoteca(id, titulo, cuerpo, onsubmit) {
  const m = document.createElement('div');
  m.id = id;
  m.className = 'fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/40 backdrop-blur-sm p-0 sm:p-4';
  m.addEventListener('click', (e) => { if (e.target === m) m.remove(); });
  m.innerHTML = `
    <form onsubmit="${onsubmit}(event)" class="bg-white w-full max-w-md rounded-t-3xl sm:rounded-3xl shadow-xl p-5 space-y-3 max-h-[92vh] overflow-y-auto">
      <div class="flex items-center justify-between">
        <h3 class="text-base font-bold text-slate-900">${titulo}</h3>
        <button type="button" onclick="document.getElementById('${id}').remove()" class="text-slate-400 text-2xl leading-none" aria-label="Cerrar">×</button>
      </div>
      ${cuerpo}
    </form>`;
  document.body.appendChild(m);
}

const INPUT_HIP = 'mt-1 w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-800';

function abrirActualizarSaldo() {
  modalHipoteca('modal-hip-saldo', '🔄 Actualizar saldo', `
    <p class="text-xs text-slate-500">Copia la <b>deuda pendiente</b> que sale en la app del banco. Así los cálculos se ajustan a la realidad.</p>
    <label class="text-xs text-slate-500 block">Deuda pendiente (€)<input id="hip-nuevo-saldo" type="number" inputmode="decimal" step="0.01" min="0" required class="${INPUT_HIP}" placeholder="129822,42"></label>
    <button type="submit" class="w-full bg-indigo-600 text-white font-semibold py-3 rounded-2xl text-sm">💾 Guardar</button>`, 'guardarSaldoHipoteca');
  setTimeout(() => { const i = document.getElementById('hip-nuevo-saldo'); if (i) i.focus(); }, 60);
}

async function guardarSaldoHipoteca(ev) {
  ev.preventDefault();
  const v = parseFloat(String(document.getElementById('hip-nuevo-saldo').value).replace(',', '.'));
  if (!(v >= 0)) return;
  await enviarHipoteca({ ...datosHipoteca, saldo: v, fecha_saldo: hoyLocalISO() }, 'modal-hip-saldo');
}

function abrirEditarHipoteca() {
  const h = datosHipoteca;
  modalHipoteca('modal-hip-editar', '✏️ Datos de la hipoteca', `
    <label class="text-xs text-slate-500 block">Nombre<input id="hip-nombre" type="text" maxlength="40" value="${escapeHTML(h.nombre)}" class="${INPUT_HIP}"></label>
    <div class="grid grid-cols-2 gap-3">
      <label class="text-xs text-slate-500">Importe inicial (€)<input id="hip-capital" type="number" step="0.01" min="0" required value="${h.capital_inicial}" class="${INPUT_HIP}"></label>
      <label class="text-xs text-slate-500">Deuda pendiente (€)<input id="hip-saldo" type="number" step="0.01" min="0" required value="${h.saldo}" class="${INPUT_HIP}"></label>
      <label class="text-xs text-slate-500">Cuota mensual (€)<input id="hip-cuota" type="number" step="0.01" min="0" required value="${h.cuota}" class="${INPUT_HIP}"></label>
      <label class="text-xs text-slate-500">Día de cobro<input id="hip-dia" type="number" min="1" max="28" required value="${h.dia_cobro}" class="${INPUT_HIP}"></label>
      <label class="text-xs text-slate-500">Fecha de inicio<input id="hip-inicio" type="date" required value="${h.fecha_inicio}" class="${INPUT_HIP}"></label>
      <label class="text-xs text-slate-500">Fecha de vencimiento<input id="hip-fin" type="date" required value="${h.fecha_vencimiento}" class="${INPUT_HIP}"></label>
    </div>
    <label class="text-xs text-slate-500 block">Interés anual TIN (%) — no la TAE. Déjalo en 0 y lo estimo<input id="hip-interes" type="number" step="0.01" min="0" value="${h.interes || 0}" class="${INPUT_HIP}"></label>
    <button type="submit" class="w-full bg-indigo-600 text-white font-semibold py-3 rounded-2xl text-sm">💾 Guardar</button>`, 'guardarEditarHipoteca');
}

async function guardarEditarHipoteca(ev) {
  ev.preventDefault();
  const num = (id) => parseFloat(String(document.getElementById(id).value).replace(',', '.')) || 0;
  const h = datosHipoteca;
  await enviarHipoteca({
    nombre: document.getElementById('hip-nombre').value,
    capital_inicial: num('hip-capital'), saldo: num('hip-saldo'),
    // si cambia el saldo a mano, se considera anotado hoy
    fecha_saldo: num('hip-saldo') !== h.saldo ? hoyLocalISO() : h.fecha_saldo,
    fecha_inicio: document.getElementById('hip-inicio').value,
    fecha_vencimiento: document.getElementById('hip-fin').value,
    cuota: num('hip-cuota'), dia_cobro: Math.round(num('hip-dia')) || 1, interes: num('hip-interes')
  }, 'modal-hip-editar');
}

async function enviarHipoteca(cuerpo, modalId) {
  delete cuerpo.configurada;
  try {
    const res = await API.put('/hipoteca', cuerpo);
    const m = document.getElementById(modalId);
    if (m) m.remove();
    if (res && res.offline) { mostrarToast('Sin conexión: se guardará al volver'); datosHipoteca = { ...datosHipoteca, ...cuerpo }; pintarHipoteca(); return; }
    mostrarToast('Hipoteca actualizada ✓');
    await cargarHipoteca();
  } catch (e) {
    mostrarError('No se pudo guardar la hipoteca', e);
  }
}
