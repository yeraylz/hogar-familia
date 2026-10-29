'use strict';

// ---------------- RETO: modo guiado ----------------
// Pantalla completa que te lleva paso a paso: calentamiento, cada ejercicio
// (serie a serie, con descanso cronometrado), finisher y cierre. También guía
// el cardio por intervalos. Todo lo que marcas se guarda al momento.

let retoG = null;       // estado de la sesión guiada
let retoReloj = null;   // setInterval del temporizador
let retoRelojFin = 0;   // instante (ms) en que termina el temporizador
let retoRelojAlTerminar = null;

function retoSegundos(txt) {
  const n = parseInt(String(txt), 10);
  return isNaN(n) ? 60 : n;
}

// ---------- Temporizador ----------
function retoPitido() {
  try { if (navigator.vibrate) navigator.vibrate([250, 120, 250]); } catch (e) { /* sin vibración */ }
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ac = new Ctx();
    const o = ac.createOscillator(), g = ac.createGain();
    o.frequency.value = 880; g.gain.value = 0.15;
    o.connect(g); g.connect(ac.destination);
    o.start(); o.stop(ac.currentTime + 0.25);
    setTimeout(() => ac.close && ac.close(), 600);
  } catch (e) { /* sin audio */ }
}

function retoRelojIniciar(segundos, etiqueta, alTerminar) {
  retoRelojParar();
  retoRelojFin = Date.now() + segundos * 1000;
  retoRelojAlTerminar = alTerminar || null;
  retoG.reloj = { etiqueta, total: segundos };
  pintarGuiado();
  retoReloj = setInterval(retoRelojTick, 250);
}

function retoRelojParar() {
  if (retoReloj) clearInterval(retoReloj);
  retoReloj = null;
  if (retoG) retoG.reloj = null;
}

function retoRelojTick() {
  const resta = Math.max(0, Math.ceil((retoRelojFin - Date.now()) / 1000));
  const el = document.getElementById('reloj-tiempo');
  const barra = document.getElementById('reloj-barra');
  if (el) el.textContent = Math.floor(resta / 60) + ':' + String(resta % 60).padStart(2, '0');
  if (barra && retoG && retoG.reloj) barra.style.width = Math.round(100 * (1 - resta / retoG.reloj.total)) + '%';
  if (resta <= 0) {
    const cb = retoRelojAlTerminar;
    retoRelojParar();
    retoPitido();
    if (cb) cb(); else pintarGuiado();
  }
}

function retoRelojMas(s) { retoRelojFin += s * 1000; if (retoG && retoG.reloj) retoG.reloj.total += s; }
function retoRelojSaltar() {
  const cb = retoRelojAlTerminar;
  retoRelojParar();
  if (cb) cb(); else pintarGuiado();
}

function retoRelojHTML() {
  if (!retoG || !retoG.reloj) return '';
  return `<div class="fixed bottom-0 inset-x-0 z-[60] p-3">
    <div class="max-w-md mx-auto bg-slate-900 text-white rounded-2xl shadow-xl p-4">
      <div class="flex items-center justify-between">
        <p class="text-xs font-semibold text-slate-300">${escapeHTML(retoG.reloj.etiqueta)}</p>
        <p id="reloj-tiempo" class="text-3xl font-bold tabular-nums">0:00</p>
      </div>
      <div class="h-1.5 rounded-full bg-slate-700 overflow-hidden mt-2"><div id="reloj-barra" class="h-full bg-emerald-400 rounded-full" style="width:0%"></div></div>
      <div class="flex gap-2 mt-3">
        <button onclick="retoRelojMas(15)" class="flex-1 py-2 rounded-xl bg-slate-700 text-sm font-semibold">+15 s</button>
        <button onclick="retoRelojSaltar()" class="flex-1 py-2 rounded-xl bg-emerald-500 text-sm font-bold">Saltar</button>
      </div>
    </div>
  </div>`;
}

// ---------- Estructura ----------
function retoGuiadoContenedor() {
  let c = document.getElementById('reto-guiado');
  if (!c) {
    c = document.createElement('div');
    c.id = 'reto-guiado';
    c.className = 'fixed inset-0 z-50 bg-slate-50 overflow-y-auto';
    document.body.appendChild(c);
  }
  return c;
}

function retoGuiadoCerrar(pedirConfirmacion) {
  if (pedirConfirmacion && retoG && retoG.paso > 0 && retoG.fase !== 'fin' &&
      !confirm('¿Salir del entreno? Lo que ya has marcado queda guardado.')) return;
  retoRelojParar();
  retoG = null;
  const c = document.getElementById('reto-guiado');
  if (c) c.remove();
  document.body.style.overflow = '';
  cargarReto();
}

function retoGuiadoAbrir(rutina) {
  const plan = retoSemanaPlan(retoFecha);
  const hist = {};
  retoEstado.ultimas.forEach(s => { (hist[s.ejercicio] = hist[s.ejercicio] || []).push(s); });
  const guardadas = {};
  retoEstado.series.forEach(s => { guardadas[s.ejercicio] = s; });
  const dow = retoDiaSemana(retoFecha);

  const ejercicios = RETO_RUTINAS[rutina].map(e => {
    const h = hist[e.n] || [];
    const base = (retoEstado.base_ciclo || []).find(b => b.ejercicio === e.n);
    const c = retoConsejo(e, h, { descarga: plan && plan.descarga, enCiclo: plan && plan.enCiclo, ciclo: plan && plan.ciclo, base });
    const g = guardadas[e.n];
    const n = plan && plan.descarga ? Math.ceil(e.series / 2) : e.series;
    const ult = h[0];
    const guardadasReps = g ? retoParseReps(g.reps, n) : [];
    const modo = e.tipo === 'peso' ? retoModo(e, c.sugerido || (ult && ult.peso) || 0) : null;
    const objetivoReps = e.tipo === 'tiempo' ? e.reps : e.tipo === 'max' ? ((ult && retoParseReps(ult.reps, e.series)[0]) || 10) : (modo ? modo.rango[0] : e.rango[0]);
    const sets = [];
    for (let i = 0; i < n; i++) {
      sets.push({ reps: guardadasReps[i] != null ? guardadasReps[i] : objetivoReps, hecha: guardadasReps[i] != null });
    }
    return { e, c, h, n, sets, peso: g && g.peso ? g.peso : (c.sugerido || (ult && ult.peso) || 0), descanso: retoSegundos(e.d) };
  });
  const finisher = (plan && plan.descarga) ? undefined : RETO_FINISHER_DIA[dow];
  retoG = { modo: 'fuerza', rutina, ejercicios, finisher, paso: 0, fase: 'calentar', rondas: 0, reloj: null, plan };
  document.body.style.overflow = 'hidden';
  pintarGuiado();
}

// pasos: 0 calentamiento, 1..N ejercicios, N+1 finisher (si toca), último resumen
function retoGuiadoTotalPasos() {
  return 1 + retoG.ejercicios.length + (retoG.finisher !== undefined ? 1 : 0) + 1;
}
function retoGuiadoIr(p) {
  retoRelojParar();
  retoG.paso = p;
  retoG.tec = false;
  const nEj = retoG.ejercicios.length;
  retoG.fase = p === 0 ? 'calentar' : p <= nEj ? 'ejercicio' : (retoG.finisher !== undefined && p === nEj + 1) ? 'finisher' : 'fin';
  retoG.rondas = 0;
  pintarGuiado();
  const c = document.getElementById('reto-guiado');
  if (c) c.scrollTop = 0;
}
function retoGuiadoSiguiente() { retoGuiadoIr(retoG.paso + 1); }

// Barra para moverte entre pasos (calentar, ejercicios, finisher, final) y volver a corregir un dato.
function retoGuiadoNavHTML() {
  const n = retoG.ejercicios.length;
  const pasos = [{ t: '🔥', p: 0 }];
  retoG.ejercicios.forEach((x, i) => pasos.push({ t: String(i + 1), p: i + 1, hecho: x.sets.length > 0 && x.sets.every(s => s.hecha) }));
  if (retoG.finisher !== undefined) pasos.push({ t: '⚡', p: n + 1 });
  pasos.push({ t: '🏁', p: retoGuiadoTotalPasos() - 1 });
  return `<div class="flex items-center gap-1.5">
    <button onclick="retoGuiadoIr(${Math.max(0, retoG.paso - 1)})" ${retoG.paso === 0 ? 'disabled' : ''} aria-label="Paso anterior" class="shrink-0 px-2.5 h-8 rounded-lg bg-slate-100 text-slate-600 text-sm font-bold disabled:opacity-30">‹ Anterior</button>
    <div class="flex flex-grow justify-center gap-1 overflow-x-auto">${pasos.map(q => `<button onclick="retoGuiadoIr(${q.p})" class="shrink-0 min-w-8 h-8 px-1.5 rounded-lg text-xs font-bold ${q.p === retoG.paso ? 'bg-emerald-600 text-white' : q.hecho ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}">${q.t}</button>`).join('')}</div>
  </div>`;
}

function pintarGuiado() {
  if (!retoG) return;
  const c = retoGuiadoContenedor();
  let cuerpo = '';
  if (retoG.modo === 'cardio') cuerpo = retoCardioPantalla();
  else if (retoG.fase === 'calentar') cuerpo = retoPantallaCalentar();
  else if (retoG.fase === 'ejercicio') cuerpo = retoPantallaEjercicio();
  else if (retoG.fase === 'finisher') cuerpo = retoPantallaFinisher();
  else cuerpo = retoPantallaFin();
  const total = retoG.modo === 'cardio' ? 1 : retoGuiadoTotalPasos();
  const pct = retoG.modo === 'cardio' ? (retoG.fase === 'fin' ? 100 : 0) : Math.round(100 * retoG.paso / (total - 1));
  c.innerHTML = `
    <div class="max-w-md mx-auto px-4 pt-4 pb-40 space-y-4">
      <div class="flex items-center justify-between">
        <button onclick="retoGuiadoCerrar(true)" class="text-sm font-semibold text-slate-500">✕ Salir</button>
        <p class="text-xs font-semibold text-slate-400">${retoG.modo === 'cardio' ? 'Cardio' : 'Rutina ' + retoG.rutina}</p>
      </div>
      ${retoG.modo === 'cardio' ? '' : `<div class="h-1.5 rounded-full bg-slate-200 overflow-hidden"><div class="h-full bg-emerald-500 rounded-full transition-all" style="width:${pct}%"></div></div>`}
      ${retoG.modo === 'cardio' ? '' : retoGuiadoNavHTML()}
      ${cuerpo}
    </div>
    ${retoRelojHTML()}`;
  if (retoG.reloj) retoRelojTick();
}

// ---------- Pantallas de fuerza ----------
function retoPantallaCalentar() {
  const desc = retoG.plan && retoG.plan.descarga
    ? '<div class="text-xs font-semibold text-sky-700 bg-sky-50 border border-sky-200 rounded-xl px-3 py-2">🌿 Semana de descarga: mitad de series, peso más bajo, sin llegar al fallo.</div>' : '';
  return `
    ${desc}
    <div class="text-center space-y-1 pt-4">
      <p class="text-5xl">🔥</p>
      <h1 class="text-xl font-bold text-slate-900">Calienta primero</h1>
      <p class="text-sm text-slate-500">5–8 minutos de movilidad (hombros, caderas) y comba suave.</p>
    </div>
    <div class="bg-white rounded-2xl border border-slate-200 p-4 text-sm text-slate-600 space-y-1">
      <p>Hoy hay <b>${retoG.ejercicios.length} ejercicios</b>${retoG.finisher !== undefined ? ' y finisher' : ''}. Yo te digo qué peso y cuántas repeticiones en cada uno.</p>
    </div>
    <button onclick="retoRelojIniciar(300, 'Calentamiento', retoGuiadoSiguiente)" class="w-full py-3.5 rounded-2xl bg-white border-2 border-emerald-500 text-emerald-700 font-bold">⏱ Cronometrar 5 min</button>
    <button onclick="retoGuiadoSiguiente()" class="w-full py-3.5 rounded-2xl bg-emerald-600 text-white font-bold">Ya he calentado → empezar</button>`;
}

function retoPantallaEjercicio() {
  const x = retoG.ejercicios[retoG.paso - 1];
  const e = x.e;
  const descansando = !!retoG.reloj;
  const hechas = x.sets.filter(s => s.hecha).length;
  const terminado = hechas === x.sets.length;
  const objetivo = e.tipo === 'max' ? 'Máximo de repeticiones' : e.tipo === 'tiempo' ? `${e.reps} segundos` : retoObjetivoTexto(e, x.peso).replace(/^\d+ × /, '') + '';
  const ultima = x.h[0];
  const pista = ultima ? `Última vez: ${ultima.peso ? retoNum(ultima.peso) + ' kg · ' : ''}${escapeHTML(ultima.reps || '—')}` : 'Primera vez con este ejercicio';
  const pesoBloque = e.tipo === 'peso' ? `
    <div class="flex items-center justify-between bg-white rounded-2xl border border-slate-200 px-3 py-2.5">
      <span class="text-sm font-semibold text-slate-700">Peso (por mancuerna)</span>
      <div class="flex items-center gap-1.5">
        <button onclick="retoGuiadoPeso(-${e.inc})" class="w-9 h-9 rounded-xl bg-slate-100 text-lg font-bold text-slate-600">−</button>
        <input type="number" inputmode="decimal" step="0.5" min="0" max="500" value="${x.peso || ''}" placeholder="kg" onchange="retoGuiadoPesoValor(this.value)" class="w-16 text-center text-lg font-bold bg-transparent focus:outline-none">
        <button onclick="retoGuiadoPeso(${e.inc})" class="w-9 h-9 rounded-xl bg-slate-100 text-lg font-bold text-slate-600">+</button>
        <span class="text-xs text-slate-400 ml-0.5">kg</span>
      </div>
    </div>` : '';
  const nomLado = e.lado === 'pierna' ? ['derecha', 'izquierda'] : ['derecho', 'izquierdo'];
  const filas = x.sets.map((s, i) => `
    <div class="flex items-center gap-2 px-3 py-2.5 ${s.hecha ? 'bg-emerald-50' : ''}">
      <span class="w-14 text-xs font-bold ${s.hecha ? 'text-emerald-700' : 'text-slate-400'}">Serie ${i + 1}${e.lado && !s.hecha ? `<br><span class="text-[10px] font-semibold text-sky-600">${e.lado === 'pierna' ? 'Pierna' : 'Brazo'} ${nomLado[s.lado ? 1 : 0]}</span>` : ''}</span>
      <button onclick="retoGuiadoReps(${i}, -1)" class="w-9 h-9 rounded-xl bg-slate-100 text-lg font-bold text-slate-600">−</button>
      <input type="number" inputmode="numeric" min="0" max="999" value="${s.reps}" onchange="retoGuiadoRepsValor(${i}, this.value)" class="w-14 text-center text-lg font-bold bg-transparent focus:outline-none">
      <button onclick="retoGuiadoReps(${i}, 1)" class="w-9 h-9 rounded-xl bg-slate-100 text-lg font-bold text-slate-600">+</button>
      <span class="text-xs text-slate-400 flex-grow">${e.tipo === 'tiempo' ? 's' : 'reps'}</span>
      <button onclick="retoGuiadoSerieHecha(${i})" class="shrink-0 px-3.5 h-10 rounded-xl text-sm font-bold ${s.hecha ? 'bg-emerald-500 text-white' : 'bg-white border-2 border-emerald-500 text-emerald-700'} active:scale-95">${s.hecha ? '✓' : (e.lado ? (s.lado ? 'Izq. ✓' : 'Der. ✓') : 'Hecha')}</button>
    </div>`).join('');
  const esUltimoEjercicio = retoG.paso === retoG.ejercicios.length && retoG.finisher === undefined;
  return `
    <div class="space-y-1">
      <p class="text-xs font-bold text-emerald-600 uppercase tracking-wider">Ejercicio ${retoG.paso} de ${retoG.ejercicios.length}</p>
      <h1 class="text-xl font-bold text-slate-900 leading-tight">${escapeHTML(e.n)}</h1>
      <p class="text-sm text-slate-500">${x.n} series · <b class="text-slate-800">${escapeHTML(objetivo)}</b> · descanso ${e.d}</p>
      <p class="text-xs text-slate-400">${pista}</p>
      ${e.lado ? `<p class="text-xs font-semibold text-sky-700">Se hace un lado y luego el otro: las repeticiones de la serie son por ${e.lado}. Toca «Der.» al acabar el lado derecho y «Izq.» al acabar el izquierdo; el descanso empieza al terminar los dos.</p>` : ''}
    </div>
    <div>
      <button onclick="retoTecnicaToggle()" class="text-xs font-bold px-3 py-1.5 rounded-full ${retoG.tec ? 'bg-sky-600 text-white' : 'bg-sky-100 text-sky-700'}">ℹ️ ${retoG.tec ? 'Ocultar cómo se hace' : 'Cómo se hace'}</button>
      ${retoG.tec ? `<div class="mt-2">${retoTecnicaHTML(e.n)}</div>` : ''}
    </div>
    <div class="rounded-xl border px-3 py-2.5 ${RETO_ESTILO_CONSEJO[x.c.tipo]}">
      <p class="text-sm font-bold">${RETO_ICONO_CONSEJO[x.c.tipo]} ${escapeHTML(x.c.titulo)}</p>
      <p class="text-xs mt-0.5 opacity-90">${escapeHTML(x.c.texto)}</p>
    </div>
    ${pesoBloque}
    <div class="bg-white rounded-2xl border border-slate-200 shadow-sm divide-y divide-slate-100 overflow-hidden">${filas}</div>
    ${descansando ? '' : (terminado
      ? `<button onclick="retoGuiadoSiguiente()" class="w-full py-4 rounded-2xl bg-emerald-600 text-white font-bold text-base">${esUltimoEjercicio ? 'Terminar entreno →' : 'Siguiente ejercicio →'}</button>`
      : `<button onclick="retoGuiadoSiguiente()" class="w-full py-2 text-sm font-semibold text-slate-400">Saltar este ejercicio</button>`)}`;
}

function retoTecnicaToggle() {
  retoG.tec = !retoG.tec;
  pintarGuiado();
}

function retoGuiadoPeso(delta) {
  const x = retoG.ejercicios[retoG.paso - 1];
  x.peso = Math.max(0, Math.round(((x.peso || 0) + delta) * 10) / 10);
  if (x.sets.some(t => t.hecha)) retoGuiadoGuardarEjercicio(x);
  pintarGuiado();
}
function retoGuiadoPesoValor(v) {
  const x = retoG.ejercicios[retoG.paso - 1];
  x.peso = Math.max(0, parseFloat(String(v).replace(',', '.')) || 0);
  if (x.sets.some(t => t.hecha)) retoGuiadoGuardarEjercicio(x);
  pintarGuiado();
}
function retoGuiadoReps(i, delta) {
  const s = retoG.ejercicios[retoG.paso - 1].sets[i];
  s.reps = Math.max(0, (parseInt(s.reps, 10) || 0) + delta);
  if (s.hecha) retoGuiadoGuardarEjercicio(retoG.ejercicios[retoG.paso - 1]);
  pintarGuiado();
}
function retoGuiadoRepsValor(i, v) {
  const x = retoG.ejercicios[retoG.paso - 1];
  x.sets[i].reps = Math.max(0, parseInt(v, 10) || 0);
  if (x.sets[i].hecha) retoGuiadoGuardarEjercicio(x);
}

async function retoGuiadoGuardarEjercicio(x) {
  const reps = x.sets.filter(s => s.hecha).map(s => s.reps).join('-');
  try {
    await retoPut('/reto/series', { fecha: retoFecha, ejercicio: x.e.n, peso: x.e.tipo === 'peso' ? (x.peso || 0) : 0, reps });
  } catch (err) { retoError(err); }
}

function retoGuiadoSerieHecha(i) {
  const x = retoG.ejercicios[retoG.paso - 1];
  const s = x.sets[i];
  // Al tocar una ya hecha la deshaces (por si te equivocaste)
  if (s.hecha) { s.hecha = false; s.lado = 0; retoRelojParar(); retoGuiadoGuardarEjercicio(x); pintarGuiado(); return; }
  // Ejercicio unilateral: primero un lado (sin descanso) y después el otro
  if (x.e.lado && !s.lado) { s.lado = 1; pintarGuiado(); return; }
  s.hecha = true;
  // Las series siguientes sin hacer heredan estas repeticiones como punto de partida
  for (let k = i + 1; k < x.sets.length; k++) if (!x.sets[k].hecha) x.sets[k].reps = s.reps;
  retoGuiadoGuardarEjercicio(x);
  const quedan = x.sets.some(t => !t.hecha);
  const ultimoDeTodo = !quedan && retoG.paso === retoG.ejercicios.length && retoG.finisher === undefined;
  if (ultimoDeTodo) { pintarGuiado(); return; }
  retoRelojIniciar(x.descanso, quedan ? 'Descansa antes de la siguiente serie' : 'Descansa antes del siguiente ejercicio', () => { retoG.reloj = null; pintarGuiado(); });
}

// ---------- Finisher ----------
function retoPantallaFinisher() {
  const f = retoG.finisher;
  const texto = RETO_FINISHER[f];
  let accion;
  if (f === 0) {
    const r = retoG.rondas;
    accion = r >= 4
      ? '<p class="text-center text-emerald-700 font-bold">✓ Las 4 rondas hechas</p>'
      : `<button onclick="retoFinisherRonda()" ${retoG.reloj ? 'disabled' : ''} class="w-full py-4 rounded-2xl bg-orange-500 text-white font-bold text-base disabled:opacity-40">▶ Empezar ronda ${r + 1} de 4 (40 s)</button>
         <p class="text-xs text-slate-500 text-center">En esos 40 s: 3 repeticiones pesadas de peso muerto rumano y descansas el resto.</p>`;
  } else {
    accion = retoG.finTerminado
      ? '<p class="text-center text-emerald-700 font-bold">✓ Finisher hecho</p>'
      : `<button onclick="retoFinisherRestPause()" ${retoG.reloj ? 'disabled' : ''} class="w-full py-4 rounded-2xl bg-orange-500 text-white font-bold text-base disabled:opacity-40">▶ Empezar 4:40</button>
         <p class="text-xs text-slate-500 text-center">Elige un ejercicio (zancada, remo o flexiones). Al fallo, 5 s de descanso, al fallo, 5 s, al fallo, 20 s. Repite hasta que suene.</p>`;
  }
  return `
    <div class="text-center space-y-1 pt-2">
      <p class="text-5xl">🔥</p>
      <h1 class="text-xl font-bold text-slate-900">Finisher rest-pause</h1>
      <p class="text-sm text-slate-500">${escapeHTML(texto)}</p>
    </div>
    ${accion}
    <button onclick="retoGuiadoSiguiente()" class="w-full py-3.5 rounded-2xl ${(f === 0 ? retoG.rondas >= 4 : retoG.finTerminado) ? 'bg-emerald-600 text-white' : 'bg-white border border-slate-200 text-slate-500'} font-bold">${(f === 0 ? retoG.rondas >= 4 : retoG.finTerminado) ? 'Terminar →' : 'Saltar finisher'}</button>`;
}
function retoFinisherRonda() {
  retoRelojIniciar(40, `Ronda ${retoG.rondas + 1} de 4`, () => {
    retoG.rondas += 1; retoG.reloj = null;
    if (retoG.rondas < 4) { retoRelojIniciar(20, 'Respira un poco antes de la siguiente ronda', () => { retoG.reloj = null; pintarGuiado(); }); } else pintarGuiado();
  });
}
function retoFinisherRestPause() {
  retoRelojIniciar(280, 'Rest-pause: al fallo, 5 s, al fallo, 5 s, al fallo, 20 s…', () => { retoG.finTerminado = true; retoG.reloj = null; pintarGuiado(); });
}

// ---------- Final ----------
function retoPantallaFin() {
  const lineas = retoG.ejercicios.map(x => {
    const reps = x.sets.filter(s => s.hecha).map(s => s.reps).join('-');
    return `<div class="flex justify-between gap-3 px-3.5 py-2.5 text-sm"><span class="text-slate-700">${escapeHTML(x.e.n.split(' con ')[0].split(' (')[0])}</span><span class="text-slate-500 text-right">${x.e.tipo === 'peso' && x.peso ? retoNum(x.peso) + ' kg · ' : ''}${reps || '—'}</span></div>`;
  }).join('');
  return `
    <div class="text-center space-y-1 pt-4">
      <p class="text-5xl">💪</p>
      <h1 class="text-xl font-bold text-slate-900">¡Entreno completado!</h1>
      <p class="text-sm text-slate-500">Ya está todo guardado. La próxima vez te diré si toca subir peso.</p>
    </div>
    <div class="bg-white rounded-2xl border border-slate-200 shadow-sm divide-y divide-slate-100 overflow-hidden">${lineas}</div>
    ${retoCelebracionHTML()}
    ${retoEstiramientosHTML()}
    <button onclick="retoGuiadoTerminar()" class="w-full py-4 rounded-2xl bg-emerald-600 text-white font-bold text-base">Terminar y marcar como hecho</button>`;
}

function retoEstiramientosHTML() {
  const lista = RETO_ESTIRAMIENTOS[retoG.rutina];
  if (!lista) return '';
  const filas = lista.map(x => `
    <div class="px-3.5 py-2.5">
      <div class="flex items-baseline justify-between gap-2"><p class="text-sm font-bold text-slate-800">${escapeHTML(x.n)}</p><p class="text-xs font-semibold text-sky-600 shrink-0">${escapeHTML(x.t)}</p></div>
      <p class="text-xs text-slate-500 mt-0.5">${escapeHTML(x.d)}</p>
    </div>`).join('');
  return `
    <div class="space-y-1.5">
      <h2 class="text-xs font-bold text-slate-400 uppercase tracking-wider px-1">🧘 Estiramientos · unos 4 min</h2>
      <div class="bg-white rounded-2xl border border-slate-200 shadow-sm divide-y divide-slate-100 overflow-hidden">${filas}</div>
      <p class="text-[11px] text-slate-400 px-1">Aguanta quieto, sin rebotes, notando tensión pero sin dolor. Respira despacio.</p>
    </div>`;
}

async function retoGuiadoTerminar() {
  const d = Object.assign({}, retoEstado.diario);
  if (retoG.modo === 'cardio') d.cardio = true; else d.sesion_hecha = true;
  try { await retoPut('/reto/diario', d); } catch (e) { retoError(e); }
  retoG.fase = 'fin';
  retoGuiadoCerrar(false);
  retoCargarProgreso().then(() => { if (retoVista === 'medidas' || retoVista === 'hoy') pintarReto(); });
  mostrarToast('¡Bien hecho! Marcado en tu día ✓');
}

// ---------- Cardio guiado ----------
function retoCardioIntervalos(plan) {
  const n = plan ? plan.n : 1;
  const seq = [{ t: 'Camina para entrar en calor', s: 300, k: 'w' }];
  if (n === 1) {
    for (let i = 0; i < 4; i++) { seq.push({ t: 'Trota suave', s: 60, k: 't' }, { t: 'Camina', s: 60, k: 'w' }); }
  } else if (n <= 6) {
    seq.push({ t: 'Trota suave', s: 120, k: 't' }, { t: 'Camina', s: 60, k: 'w' }, { t: 'Trota suave', s: 120, k: 't' }, { t: 'Camina', s: 60, k: 'w' }, { t: 'Trota suave', s: 120, k: 't' });
  } else {
    const objetivo = (8 + 2 * (n - 6)) * 60;
    let tot = 0;
    while (tot < objetivo) {
      seq.push({ t: 'Trota suave', s: 120, k: 't' }); tot += 120;
      if (tot < objetivo) { seq.push({ t: 'Camina', s: 60, k: 'w' }); tot += 60; }
    }
  }
  seq.push({ t: 'Camina para enfriar', s: 300, k: 'w' });
  return seq;
}

function retoGuiadoAbrirCardio() {
  const plan = retoSemanaPlan(retoFecha);
  retoG = { modo: 'cardio', fase: 'previo', paso: 0, seq: retoCardioIntervalos(plan), idx: -1, reloj: null, plan };
  document.body.style.overflow = 'hidden';
  pintarGuiado();
}

function retoCardioPantalla() {
  const g = retoG;
  const ct = retoCardioTexto(g.plan);
  const lista = g.seq.map((p, i) => `<div class="flex justify-between px-3.5 py-2 text-sm ${i === g.idx ? 'bg-emerald-50 font-bold text-emerald-700' : (i < g.idx ? 'text-slate-300 line-through' : 'text-slate-600')}">
    <span>${p.k === 't' ? '🏃' : '🚶'} ${escapeHTML(p.t)}</span><span>${Math.round(p.s / 60 * 10) / 10 } min</span></div>`).join('');
  if (g.fase === 'fin') {
    return `<div class="text-center space-y-1 pt-4"><p class="text-5xl">🏃</p><h1 class="text-xl font-bold text-slate-900">¡Cardio completado!</h1><p class="text-sm text-slate-500">Buen trabajo.</p></div>
      <button onclick="retoGuiadoTerminar()" class="w-full py-4 rounded-2xl bg-emerald-600 text-white font-bold text-base">Terminar y marcar como hecho</button>`;
  }
  const actual = g.idx >= 0 ? g.seq[g.idx] : null;
  return `
    <div class="space-y-1">
      <h1 class="text-xl font-bold text-slate-900">Cardio suave</h1>
      <p class="text-sm text-slate-500">${escapeHTML(ct.t)}. ${escapeHTML(ct.d)}</p>
    </div>
    ${actual ? `<div class="text-center py-3"><p class="text-4xl">${actual.k === 't' ? '🏃' : '🚶'}</p><p class="text-lg font-bold text-slate-900">${escapeHTML(actual.t)}</p></div>` : ''}
    <div class="bg-white rounded-2xl border border-slate-200 shadow-sm divide-y divide-slate-100 overflow-hidden">${lista}</div>
    ${g.idx < 0 ? '<button onclick="retoCardioSiguiente()" class="w-full py-4 rounded-2xl bg-emerald-600 text-white font-bold text-base">▶ Empezar</button>'
      : '<button onclick="retoCardioSiguiente()" class="w-full py-2 text-sm font-semibold text-slate-400">Saltar al siguiente tramo</button>'}`;
}

function retoCardioSiguiente() {
  retoRelojParar();
  retoG.idx += 1;
  if (retoG.idx >= retoG.seq.length) { retoG.fase = 'fin'; pintarGuiado(); return; }
  const p = retoG.seq[retoG.idx];
  retoRelojIniciar(p.s, p.t, retoCardioSiguiente);
}
