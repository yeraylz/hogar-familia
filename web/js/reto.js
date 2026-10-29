'use strict';

// ---------------- RETO: plan de recomposición corporal ----------------
// Datos del plan (rutinas, menú, fases) y pantallas Hoy / Medidas / Plan.

// tipo: 'peso' (mancuernas, sube kg), 'cuerpo' (peso corporal, sube dificultad),
// 'max' (a tope de repeticiones), 'tiempo' (segundos). inc = kg que se suben.
// tipo: 'peso' (mancuernas: rango de reps y luego sube kg), 'max' (a tope de
// repeticiones), 'tiempo' (segundos), 'cuerpo' (peso corporal con rango de reps).
// nivel: 'fallo' (hasta no poder más), 'cerca' (cerca del fallo).
// pesado: si el peso por mancuerna llega a "desde", pasa a series pesadas de pocas reps.
const RETO_RUTINAS = {
  A: [
    { n: 'Sentadilla goblet con mancuerna', d: '90 s', series: 4, tipo: 'peso', rango: [15, 20], nivel: 'cerca', inc: 2, pesado: { desde: 20, rango: [5, 6] } },
    { n: 'Flexiones (pies elevados cuando sean fáciles)', d: '90 s', series: 4, tipo: 'max', nivel: 'fallo' },
    { n: 'Remo con mancuerna a una mano', d: '90 s', series: 4, tipo: 'peso', rango: [15, 20], nivel: 'fallo', inc: 2, suf: ' por brazo', lado: 'brazo' },
    { n: 'Zancadas hacia atrás', d: '60 s', series: 3, tipo: 'peso', rango: [15, 20], nivel: 'fallo', inc: 2, suf: ' por pierna', lado: 'pierna' },
    { n: 'Jalón al pecho con banda', d: '60 s', series: 3, tipo: 'cuerpo', rango: [15, 20], nivel: 'fallo', banda: true },
    { n: 'Plancha', d: '45 s', series: 3, tipo: 'tiempo', reps: 40 }
  ],
  B: [
    { n: 'Peso muerto rumano con mancuernas', d: '90 s', series: 4, tipo: 'peso', rango: [15, 20], nivel: 'cerca', inc: 2, pesado: { desde: 20, rango: [5, 6] } },
    { n: 'Remo inclinado con dos mancuernas', d: '90 s', series: 4, tipo: 'peso', rango: [15, 20], nivel: 'fallo', inc: 2 },
    { n: 'Press de hombro con mancuernas', d: '90 s', series: 3, tipo: 'peso', rango: [15, 20], nivel: 'cerca', inc: 1 },
    { n: 'Aperturas hacia atrás con banda', d: '45 s', series: 3, tipo: 'cuerpo', rango: [15, 25], nivel: 'fallo', banda: true },
    { n: 'Fondos en banco o paralelas', d: '90 s', series: 3, tipo: 'max', nivel: 'fallo' },
    { n: 'Elevaciones de piernas tumbado', d: '45 s', series: 3, tipo: 'cuerpo', rango: [15, 20], nivel: 'cerca' }
  ]
};

// Estiramientos al terminar (3 por rutina, unos 4 min). Mantener sin rebotar, sin dolor.
const RETO_ESTIRAMIENTOS = {
  A: [
    { n: 'Cuádriceps de pie', t: '30 s por pierna', d: 'De pie, lleva el talón hacia el glúteo y agárrate el pie con la mano, con las rodillas juntas y la cadera hacia delante. Apóyate en una pared si hace falta.' },
    { n: 'Pecho en el marco de una puerta', t: '30 s por lado', d: 'Antebrazo apoyado en el marco con el codo a la altura del hombro, y gira el cuerpo hacia el lado contrario hasta notar el pecho estirarse.' },
    { n: 'Postura del niño', t: '40 s', d: 'De rodillas, siéntate sobre los talones y estira los brazos al frente en el suelo. Deja caer el pecho y respira hondo: estira dorsal y espalda baja.' }
  ],
  B: [
    { n: 'Isquios sentado', t: '30 s por pierna', d: 'Sentado en el suelo con una pierna estirada y la otra doblada. Inclínate hacia delante desde la cadera con la espalda recta hasta notar la parte de atrás del muslo.' },
    { n: 'Glúteo en figura 4', t: '30 s por lado', d: 'Tumbado boca arriba, cruza el tobillo sobre la rodilla contraria y tira del muslo hacia el pecho hasta notar el glúteo del lado cruzado.' },
    { n: 'Hombro y tríceps', t: '30 s por brazo', d: 'De pie, lleva un brazo cruzado por delante del pecho y tira de él con el otro. Después súbelo, dobla el codo por detrás de la cabeza y empuja suave sobre el codo.' }
  ]
};

// 0 = domingo ... 6 = sábado
const RETO_SEMANA = {
  1: { nombre: 'Lunes', rutina: 'A', texto: 'Rutina A', dur: '45–50 min' },
  2: { nombre: 'Martes', rutina: '', cardio: true, texto: 'Carrera suave andando y trotando + caminar', dur: '45–60 min' },
  3: { nombre: 'Miércoles', rutina: 'B', texto: 'Rutina B', dur: '45–50 min' },
  4: { nombre: 'Jueves', rutina: '', texto: 'Descanso o caminar', dur: '' },
  5: { nombre: 'Viernes', rutina: 'A', texto: 'Rutina A', dur: '45–50 min' },
  6: { nombre: 'Sábado', rutina: 'B', texto: 'Rutina B (o intervalos: 10 × 30 s sprint o comba + 60 s suave)', dur: '45 min' },
  0: { nombre: 'Domingo', rutina: '', texto: 'Descanso', dur: '' }
};

// ---------- CROSSFIT: días de box que sustituyen al plan normal (ajustable en Plan) ----------
const RETO_CF_DEFECTO = { desde: '2026-11-02', dias: [2, 4] };
function retoCrossfitCfg() {
  try {
    const c = JSON.parse(localStorage.getItem('hogar_reto_crossfit') || 'null');
    if (c && /^\d{4}-\d{2}-\d{2}$/.test(c.desde) && Array.isArray(c.dias)) return { desde: c.desde, dias: c.dias.filter(n => n >= 0 && n <= 6) };
  } catch (e) { /* sin almacenamiento */ }
  return RETO_CF_DEFECTO;
}
function retoCrossfitGuardar(cfg) {
  try { localStorage.setItem('hogar_reto_crossfit', JSON.stringify(cfg)); } catch (e) { /* ignorar */ }
}
// Plan del día para una fecha: si es día de CrossFit, sustituye al plan normal.
function retoDiaPlan(fecha) {
  const n = retoDiaSemana(fecha);
  const cfg = retoCrossfitCfg();
  if (fecha >= cfg.desde && cfg.dias.includes(n)) {
    return { nombre: RETO_SEMANA[n].nombre, rutina: '', crossfit: true, texto: 'CrossFit en el box (WOD)', dur: '60 min' };
  }
  return RETO_SEMANA[n];
}
function retoCrossfitCambiar(n, marcado) {
  const cfg = retoCrossfitCfg();
  const dias = new Set(cfg.dias);
  if (marcado) dias.add(n); else dias.delete(n);
  retoCrossfitGuardar({ desde: cfg.desde, dias: [...dias] });
  pintarReto();
}
function retoCrossfitDesde(f) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f)) return;
  retoCrossfitGuardar({ desde: f, dias: retoCrossfitCfg().dias });
  pintarReto();
}
function retoHTMLCrossfitAjustes() {
  const cfg = retoCrossfitCfg();
  const chips = [1, 2, 3, 4, 5, 6, 0].map(n => `<label class="flex flex-col items-center gap-1 text-[11px] text-slate-500"><span>${RETO_SEMANA[n].nombre.slice(0, 3)}</span>
    <input type="checkbox" ${cfg.dias.includes(n) ? 'checked' : ''} onchange="retoCrossfitCambiar(${n}, this.checked)" class="w-5 h-5 accent-emerald-600"></label>`).join('');
  return `<section class="space-y-2"><h2 class="text-xs font-bold text-slate-400 uppercase tracking-wider px-1">🏋️ CrossFit</h2>
    <div class="bg-white rounded-2xl border border-slate-200 shadow-sm p-3.5 space-y-3">
      <p class="text-xs text-slate-500">Los días marcados, desde la fecha indicada, el entreno es el WOD del box: cuenta como sesión de fuerza para la racha y los logros.</p>
      <div class="flex justify-between">${chips}</div>
      <label class="flex items-center justify-between gap-3 text-sm text-slate-700">Desde
        <input type="date" value="${cfg.desde}" onchange="retoCrossfitDesde(this.value)" class="bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 text-sm"></label>
    </div></section>`;
}

const RETO_MENU = {
  1: ['Tostadas con huevos revueltos y fruta', 'Pollo a la plancha con arroz y ensalada', 'Yogur con plátano y nueces', 'Merluza al horno con patata y judías verdes'],
  2: ['Avena con leche y plátano', 'Lentejas con verduras y un huevo duro', 'Tostada con pavo y una manzana', 'Tortilla francesa con ensalada y pan'],
  3: ['Tostadas con tomate y jamón, y yogur', 'Ternera a la plancha con pasta y verdura', 'Queso fresco con fruta y almendras', 'Salmón al horno con boniato y brócoli'],
  4: ['Huevos con tostadas y una naranja', 'Garbanzos con espinacas y arroz', 'Yogur con almendras y un plátano', 'Pechuga de pavo con verduras al horno y patata'],
  5: ['Avena con leche, plátano y crema de cacahuete', 'Arroz con pollo y verduras', 'Bocadillo de atún y una fruta', 'Sardinas o caballa con ensalada y patata'],
  6: ['Tortitas de avena con huevo y fruta', 'Pescado a la plancha con arroz y ensalada', 'Batido de leche, plátano y avena', 'Hamburguesa de ternera con ensalada y patatas'],
  0: ['Tostadas con aguacate y huevos', 'Paella o arroz con verduras y pollo', 'Yogur con fruta y nueces', 'Pollo asado con verdura y patata']
};
const RETO_COMIDAS = ['Desayuno', 'Comida', 'Merienda', 'Cena'];

const RETO_KCAL_META = 2700;
const RETO_PROTEINA_META = 135;
const RETO_PROTEINA_MAX = 160;
const RETO_PROTEINA_EXTRAS = [
  { t: 'Batido de proteína', g: 25 }, { t: 'Yogur griego', g: 10 }, { t: 'Huevo', g: 6 },
  { t: 'Lata de atún', g: 20 }, { t: 'Queso fresco batido', g: 12 }, { t: 'Lonchas de pavo', g: 15 }
];

const RETO_FASES = [
  { n: 1, nombre: 'Base', meses: '1–3', entreno: 'Rutinas A y B, 4 días. Aprender bien la técnica y subir peso cada semana.', comida: 'Mantenimiento: 2.600–2.800 kcal, 135–160 g de proteína.', paso: 'Han pasado 3 meses o ya usas el peso máximo de tus mancuernas en casi todo.' },
  { n: 2, nombre: 'Progresión', meses: '4–6', entreno: 'De 4 a 5 series en los ejercicios principales. Piernas a una pierna (sentadilla búlgara, peso muerto a una pierna, hip thrust). Bajar el peso en 3 s.', comida: 'Igual; +150–200 kcal si el peso lleva un mes sin moverse.', paso: 'La cintura se mantiene estable 2 meses y quieres más volumen.' },
  { n: 3, nombre: 'Volumen limpio', meses: '7–10', entreno: '4–5 días, 10–20 series por músculo a la semana. Si el peso se queda corto: ejercicios a una pierna, bajar en 3–4 s con pausas abajo y chaleco lastrado.', comida: '+250–300 kcal sobre mantenimiento; subir 0,25–0,5 kg al mes.', paso: 'La cintura sube más de 2–3 cm o llevas 4 meses.' },
  { n: 4, nombre: 'Definición corta', meses: '11–12', entreno: 'Mismo entreno, intentando mantener los pesos.', comida: '−300–400 kcal, proteína 170–180 g, 10.000+ pasos.', paso: 'La cintura vuelve a tu medida de partida; entonces repites fases 3 y 4.' }
];

const RETO_HABITOS = [
  { k: 'pasos', icono: '👟', texto: 'Pasos', meta: '8.000–10.000' },
  { k: 'agua', icono: '💧', texto: 'Agua', meta: '2,5–3 l' },
  { k: 'sueno', icono: '😴', texto: 'Sueño', meta: '7–8 h' }
];

let retoVista = 'hoy';
let retoComidaAbierta = null;
let retoFecha = null;
let retoEstado = null;
let retoMedidas = [];

async function retoFetch(url, opciones) {
  const res = await fetch(url, opciones);
  if (!res.ok) {
    let msg = 'No se pudo completar la acción';
    try { msg = (await res.json()).error || msg; } catch (e) { /* sin JSON */ }
    throw new Error(msg);
  }
  return res.json();
}
function retoPut(url, cuerpo) {
  return retoFetch(url, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) });
}
function retoError(e) {
  mostrarToast(navigator.onLine ? (e.message || 'No se pudo guardar') : 'Sin conexión: el Reto necesita internet para guardar');
}

function retoHoyISO() { return hoyLocalISO(); }

async function cargarReto() {
  if (!retoFecha) retoFecha = retoHoyISO();
  try {
    const [estado, medidas, progreso] = await Promise.all([
      retoFetch('/reto/estado?fecha=' + retoFecha),
      retoFetch('/reto/medidas'),
      retoFetch('/reto/progreso').catch(() => null)
    ]);
    retoEstado = estado;
    retoMedidas = medidas;
    if (progreso) retoProg = progreso;
  } catch (e) {
    document.getElementById('reto-contenido').innerHTML =
      '<p class="text-center text-sm text-slate-400 py-10">No se pudo cargar el Reto. Comprueba la conexión.</p>';
    return;
  }
  pintarReto();
}

function retoCambiarVista(v) {
  retoVista = v;
  pintarReto();
}

function pintarReto() {
  document.querySelectorAll('[data-reto-vista]').forEach(b => {
    const on = b.dataset.retoVista === retoVista;
    b.classList.toggle('bg-white', on);
    b.classList.toggle('shadow-sm', on);
    b.classList.toggle('text-slate-800', on);
    b.classList.toggle('text-slate-500', !on);
  });
  const cont = document.getElementById('reto-contenido');
  if (!retoEstado) return;
  if (retoVista === 'hoy') cont.innerHTML = retoHTMLHoy();
  else if (retoVista === 'comer') cont.innerHTML = retoHTMLComer();
  else if (retoVista === 'medidas') cont.innerHTML = retoHTMLProgreso() + retoHTMLMedidas();
  else cont.innerHTML = retoHTMLPlan();
}

function retoDiaSemana(iso) { return parseFechaISO(iso).getDay(); }

function retoFechaLarga(iso) {
  const d = parseFechaISO(iso);
  const t = d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function retoCambiarDia(delta) {
  retoFecha = sumarDiasISO(retoFecha, delta);
  cargarReto();
}
function retoIrAHoy() { retoFecha = retoHoyISO(); cargarReto(); }

// ---------- CICLO 3 + 1 ----------
// Semana 1 base, 2 sube (+1–2 kg o +2 reps), 3 sube otra vez (la más dura),
// 4 descarga (mitad de series, peso 20–30 % más bajo, sin fallo ni finisher).
const RETO_CICLO = [
  { t: 'Base', d: 'Pesos y repeticiones base.' },
  { t: 'Sube', d: 'Sube 1–2 kg o 2 repeticiones respecto a la semana 1.' },
  { t: 'Más dura', d: 'Otra subida: es la semana más exigente del ciclo.' },
  { t: 'Descarga', d: 'Mitad de series, peso un 20–30 % más bajo, sin llegar al fallo y sin finisher.' }
];

// null si aún no hay fecha de inicio o la fecha es anterior al reto.
function retoSemanaPlan(fecha) {
  const ini = retoEstado && retoEstado.inicio;
  if (!ini) return null;
  const dias = Math.round((parseFechaISO(fecha) - parseFechaISO(ini)) / 86400000);
  if (dias < 0) return null;
  const n = Math.floor(dias / 7) + 1;
  const enCiclo = ((n - 1) % 4) + 1;
  return { n, enCiclo, ciclo: Math.floor((n - 1) / 4) + 1, descarga: enCiclo === 4 };
}

// ---------- ENTRENADOR ----------
// Doble progresión: mismo peso hasta completar todas las series en lo más alto
// del rango de repeticiones; entonces sube el peso y vuelves al principio del
// rango. Si no llegas dos sesiones seguidas y vas a peor, baja un escalón.
function retoParseReps(txt, series) {
  const nums = String(txt || '').split(/[^0-9]+/).filter(Boolean).map(Number);
  if (nums.length === 1 && series > 1) return Array(series).fill(nums[0]); // "10" = todas igual
  return nums;
}
function retoNum(n) { return String(Math.round(n * 10) / 10).replace('.', ','); }

function retoModo(e, peso) {
  if (e.pesado && peso >= e.pesado.desde) return { rango: e.pesado.rango, pesado: true };
  return { rango: e.rango, pesado: false };
}
function retoNivelTexto(e, modo) {
  if (modo && modo.pesado) return 'Es una serie pesada: nunca al fallo, deja 2–3 repeticiones en reserva.';
  if (e.nivel === 'fallo') return 'Lleva la última serie hasta el fallo.';
  if (e.nivel === 'cerca') return 'Termina cerca del fallo (1–2 repeticiones en reserva).';
  return '';
}

// Texto de series × reps de hoy (según el peso con el que vas).
function retoObjetivoTexto(e, peso) {
  const suf = e.suf || '';
  if (e.tipo === 'max') return `${e.series} × máximo`;
  if (e.tipo === 'tiempo') return `${e.series} × ${e.reps} s`;
  const m = e.tipo === 'peso' ? retoModo(e, peso || 0) : { rango: e.rango };
  return `${e.series} × ${m.rango[0]}–${m.rango[1]}${suf}`;
}

// hist = [última sesión, la anterior] (sin semanas de descarga).
// ctx = { descarga, enCiclo, ciclo, base } (base = sesión de la semana 2 del ciclo anterior)
function retoConsejo(e, hist, ctx) {
  ctx = ctx || {};
  const ult = hist[0], ant = hist[1];
  const total = r => r.reduce((a, b) => a + b, 0);

  // Semana de descarga
  if (ctx.descarga) {
    const mitad = Math.ceil(e.series / 2);
    if (e.tipo === 'peso' && ult && ult.peso) {
      return { tipo: 'descarga', titulo: `Descarga: ${retoNum(ult.peso * 0.7)}–${retoNum(ult.peso * 0.8)} kg`, texto: `${mitad} series con un peso 20–30 % más bajo que ${retoNum(ult.peso)} kg, sin llegar al fallo. Tu cuerpo se recupera y vuelves más fuerte.`, sugerido: Math.round(ult.peso * 0.75 * 2) / 2 };
    }
    return { tipo: 'descarga', titulo: 'Descarga', texto: `${mitad} series, más suaves de lo habitual y sin llegar al fallo.`, sugerido: 0 };
  }

  // Primera semana de un ciclo nuevo: partes de los pesos de la semana 2
  if (ctx.enCiclo === 1 && ctx.ciclo > 1 && ctx.base && e.tipo === 'peso' && ctx.base.peso) {
    const m = retoModo(e, ctx.base.peso);
    return { tipo: 'nuevo', titulo: `Empieza con ${retoNum(ctx.base.peso)} kg`, texto: `Ciclo nuevo: vuelves al peso de la semana 2 del ciclo anterior (${retoNum(ctx.base.peso)} kg) con ${m.rango[0]}–${m.rango[1]} repeticiones.`, sugerido: ctx.base.peso };
  }

  if (!ult) {
    if (e.tipo === 'peso') return { tipo: 'nuevo', titulo: 'Primera vez', texto: `Elige un peso con el que hagas ${e.rango[0]} repeticiones dejando 1–2 de reserva. ${retoNivelTexto(e)} Apunta lo que uses y yo me encargo del resto.`, sugerido: 0 };
    return { tipo: 'nuevo', titulo: 'Primera vez', texto: e.tipo === 'max' ? 'Haz el máximo de repeticiones limpias en cada serie y apúntalas.' : e.tipo === 'tiempo' ? 'Aguanta lo que puedas con el cuerpo recto y apunta los segundos de cada serie.' : `Intenta ${e.series} × ${e.rango[0]}–${e.rango[1]} y apunta lo que consigas.`, sugerido: 0 };
  }
  const reps = retoParseReps(ult.reps, e.series);
  const todas = objetivo => reps.length >= e.series && reps.slice(0, e.series).every(x => x >= objetivo);

  if (e.tipo === 'max') {
    const mejor = Math.max(0, ...reps);
    if (reps.length && Math.min(...reps) >= 20) return { tipo: 'sube', titulo: 'Sube la dificultad', texto: 'Ya haces 20 o más en todas las series: pasa a pies elevados o con la mochila cargada.', sugerido: 0 };
    return { tipo: 'sube', titulo: `Supera ${reps.join('-') || 'la última vez'}`, texto: `Última vez ${reps.join('-')}. Hoy intenta 2 repeticiones más (al menos ${mejor + 1} en la primera serie) y llega al fallo en la última.`, sugerido: 0 };
  }
  if (e.tipo === 'tiempo') {
    const minimo = reps.length ? Math.min(...reps) : 0;
    if (todas(e.reps)) {
      if (minimo >= 60) return { tipo: 'sube', titulo: 'Sube la dificultad', texto: 'Ya aguantas 60 s: añade peso en la espalda o haz la plancha con los pies elevados.', sugerido: 0 };
      return { tipo: 'sube', titulo: `Objetivo ${minimo + 5} s`, texto: `Aguantaste ${reps.join('-')} s. Hoy intenta ${minimo + 5} s en cada serie.`, sugerido: 0 };
    }
    return { tipo: 'igual', titulo: 'Mantén', texto: `Intenta llegar a ${e.reps} s en las ${e.series} series (última vez ${reps.join('-') || '—'}).`, sugerido: 0 };
  }
  if (e.tipo === 'cuerpo') {
    const [rmin, rmax] = e.rango;
    if (e.banda && todas(rmax)) return { tipo: 'sube', titulo: 'Banda más dura', texto: `Hiciste ${e.series} × ${rmax}. Usa una banda más dura, o agarra más cerca del anclaje para que tense más, y vuelve a empezar en ${rmin}.`, sugerido: 0 };
    if (todas(rmax)) return { tipo: 'sube', titulo: 'Sube la dificultad', texto: `Hiciste ${e.series} × ${rmax}. Hazlo más lento (bajando en 3 s) o con peso extra, y vuelve a empezar en ${rmin}.`, sugerido: 0 };
    if (todas(rmin)) return { tipo: 'igual', titulo: 'Suma 2 repeticiones', texto: `Última vez ${reps.join('-')}. Intenta 2 repeticiones más por serie hasta llegar a ${rmax}. ${retoNivelTexto(e)}`, sugerido: 0 };
    return { tipo: 'igual', titulo: 'Mantén', texto: `Busca ${e.series} × ${rmin} como mínimo (última vez ${reps.join('-') || '—'}).`, sugerido: 0 };
  }

  // tipo 'peso'
  const peso = ult.peso || 0;
  if (!peso) return { tipo: 'nuevo', titulo: 'Apunta el peso', texto: 'La última vez no anotaste el peso: apúntalo para poder decirte cuándo subir.', sugerido: 0 };
  const modo = retoModo(e, peso);
  const [rmin, rmax] = modo.rango;
  if (todas(rmax)) {
    const nuevo = peso + e.inc;
    const m2 = retoModo(e, nuevo);
    const aviso = m2.pesado && !modo.pesado
      ? ` Con ${retoNum(nuevo)} kg por mancuerna pasas a series pesadas: ${m2.rango[0]}–${m2.rango[1]} repeticiones, sin llegar al fallo.`
      : ` Vuelve a empezar en ${m2.rango[0]} repeticiones por serie.`;
    return { tipo: 'sube', titulo: `Sube a ${retoNum(nuevo)} kg`, texto: `Hiciste ${e.series} × ${rmax} con ${retoNum(peso)} kg.${aviso}`, sugerido: nuevo };
  }
  if (todas(rmin)) {
    return { tipo: 'igual', titulo: `Mantén ${retoNum(peso)} kg · busca ${rmax} reps`, texto: `Última vez ${reps.join('-')}. Mismo peso: suma repeticiones (hasta 2 más por serie) hasta llegar a ${rmax} en todas. ${retoNivelTexto(e, modo)}`, sugerido: peso };
  }
  if (ant && ant.peso === peso) {
    const repsAnt = retoParseReps(ant.reps, e.series);
    const antCompleta = repsAnt.length >= e.series && repsAnt.slice(0, e.series).every(x => x >= rmin);
    if (!antCompleta && total(reps) < total(repsAnt)) {
      const bajo = Math.max(0, peso - e.inc);
      return { tipo: 'baja', titulo: `Baja a ${retoNum(bajo)} kg`, texto: `Dos sesiones seguidas sin llegar a ${rmin} repeticiones y cada vez menos. Baja ${retoNum(e.inc)} kg, cuida la técnica y vuelve a subir cuando completes todas las series.`, sugerido: bajo };
    }
  }
  const faltan = reps.length < e.series ? 'Completa todas las series' : `Llega a ${rmin} repeticiones en todas las series`;
  return { tipo: 'igual', titulo: `Mantén ${retoNum(peso)} kg`, texto: `${faltan} (última vez ${reps.join('-') || '—'}). Cuando lo consigas, sumas repeticiones hasta ${rmax}; entonces subes ${retoNum(e.inc)} kg. ${retoNivelTexto(e, modo)}`, sugerido: peso };
}

const RETO_ESTILO_CONSEJO = {
  sube: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  igual: 'bg-slate-50 text-slate-600 border-slate-200',
  baja: 'bg-amber-50 text-amber-700 border-amber-200',
  nuevo: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  descarga: 'bg-sky-50 text-sky-700 border-sky-200'
};
const RETO_ICONO_CONSEJO = { sube: '⬆', igual: '＝', baja: '⬇', nuevo: '✨', descarga: '🌿' };

// ---------- CARDIO (un día a la semana, andando y trotando) ----------
function retoCardioTexto(plan) {
  const n = plan ? plan.n : 1;
  if (n === 1) return { t: '8 min: 1 min trotando + 1 min caminando', d: 'Semana 1: empieza suave, el trote tiene que ser cómodo (poder hablar).' };
  if (n <= 6) return { t: '8 min: 2 min trotando + 1 min caminando', d: `Semana ${n}: no alargues el tiempo todavía; solo hazlo más fluido.` };
  const min = 8 + 2 * (n - 6), max = 8 + 3 * (n - 6);
  return { t: `Unos ${min}–${max} min trotando y caminando`, d: `Semana ${n}: alarga poco a poco, 2–3 min más que la semana pasada.` };
}

// Miércoles (B) → el de peso muerto rumano; viernes (A) → el de zancada, remo o flexiones.
// Nunca en la semana de descarga.
const RETO_FINISHER_DIA = { 3: 0, 5: 1 };

const RETO_FINISHER = [
  '4 series de 40 s: haz 3 repeticiones pesadas de peso muerto rumano y descansa el resto de los 40 s.',
  '4 min 40 s de rest-pause en un ejercicio (zancada, remo o flexiones): al fallo, 5 s de descanso, al fallo, 5 s, al fallo, 20 s. Repite hasta acabar el tiempo.'
];

// ---------- HOY ----------
function retoHTMLHoy() {
  const dia = retoDiaPlan(retoFecha);
  const esHoy = retoFecha === retoHoyISO();
  const d = retoEstado.diario;
  const hist = {};
  retoEstado.ultimas.forEach(s => { (hist[s.ejercicio] = hist[s.ejercicio] || []).push(s); });
  const guardadas = {};
  retoEstado.series.forEach(s => { guardadas[s.ejercicio] = s; });
  const plan = retoSemanaPlan(retoFecha);
  const ctxDe = e => ({ descarga: plan && plan.descarga, enCiclo: plan && plan.enCiclo, ciclo: plan && plan.ciclo, base: (retoEstado.base_ciclo || []).find(b => b.ejercicio === e.n) });

  // Fila de la semana
  const letras = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
  const fila = letras.map((l, i) => {
    const f = sumarDiasISO(retoEstado.semana_lunes, i);
    const hecho = retoEstado.dias_hechos[f];
    const dp = retoDiaPlan(f);
    const fuerza = dp.rutina || dp.crossfit;
    const actual = f === retoFecha;
    return `<div class="flex flex-col items-center gap-1">
      <span class="text-[10px] font-semibold ${actual ? 'text-emerald-600' : 'text-slate-400'}">${l}</span>
      <span class="w-7 h-7 rounded-full flex items-center justify-center text-xs ${hecho ? 'bg-emerald-500 text-white' : (fuerza ? 'border-2 border-slate-300 text-slate-300' : 'bg-slate-100 text-slate-300')} ${actual ? 'ring-2 ring-emerald-300' : ''}">${hecho ? '✓' : (fuerza ? '' : '·')}</span>
    </div>`;
  }).join('');

  let sesion = '';
  if (dia.rutina) {
    const suben = RETO_RUTINAS[dia.rutina].filter(e => e.tipo === 'peso' && retoConsejo(e, hist[e.n] || [], ctxDe(e)).tipo === 'sube');
    const resumenSubidas = suben.length
      ? `<div class="text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2">⬆ Hoy toca subir peso en: ${suben.map(e => escapeHTML(e.n.split(' con ')[0].split(' (')[0])).join(', ')}.</div>`
      : '';
    const semanaSuave = (plan && plan.descarga)
      ? '<div class="text-xs font-semibold text-sky-700 bg-sky-50 border border-sky-200 rounded-xl px-3 py-2">🌿 Semana de descarga: mitad de series, peso un 20–30 % más bajo, sin fallo y sin finisher.</div>'
      : '';
    const ejercicios = RETO_RUTINAS[dia.rutina].map((e, i) => {
      const g = guardadas[e.n];
      const h = hist[e.n] || [];
      const u = h[0];
      const c = retoConsejo(e, h, ctxDe(e));
      const objetivo = retoObjetivoTexto(e, (c.sugerido || (u && u.peso) || 0));
      const pista = u ? `Última vez: ${u.peso ? retoNum(u.peso) + ' kg' : '—'}${u.reps ? ' · ' + escapeHTML(u.reps) : ''}` : 'Primera vez';
      return `<div class="p-3.5 space-y-2">
        <div class="flex items-start justify-between gap-2">
          <p class="text-sm font-semibold text-slate-800">${escapeHTML(e.n)}</p>
          <span class="shrink-0 text-xs font-semibold px-2 py-1 rounded-lg bg-emerald-50 text-emerald-700">${escapeHTML(plan && plan.descarga ? Math.ceil(e.series / 2) + ' series' : objetivo)}</span>
        </div>
        <p class="text-xs text-slate-400">Descanso ${e.d} · ${pista}</p>
        <details><summary class="text-xs font-semibold text-sky-700 cursor-pointer">ℹ️ Cómo se hace</summary><div class="mt-2">${retoTecnicaHTML(e.n)}</div></details>
        <div class="rounded-xl border px-2.5 py-2 ${RETO_ESTILO_CONSEJO[c.tipo]}">
          <p class="text-xs font-bold">${RETO_ICONO_CONSEJO[c.tipo]} ${escapeHTML(c.titulo)}</p>
          <p class="text-xs mt-0.5 opacity-90">${escapeHTML(c.texto)}</p>
        </div>
        <div class="flex gap-2">
          <label class="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 w-28">
            <input type="number" inputmode="decimal" step="0.5" min="0" max="500" value="${g && g.peso ? g.peso : ''}" placeholder="${c.sugerido ? retoNum(c.sugerido) : (u && u.peso ? u.peso : 'kg')}" data-reto-ej="${i}" data-campo="peso" onchange="retoGuardarSerie(${i}, '${dia.rutina}')" class="w-full bg-transparent text-sm text-slate-800 focus:outline-none">
            <span class="text-xs text-slate-400">kg</span>
          </label>
          <input type="text" maxlength="40" value="${g ? escapeHTML(g.reps) : ''}" placeholder="${e.tipo === 'tiempo' ? 'segundos (40-40-35)' : 'reps por serie (15-15-14-12)'}" data-reto-ej="${i}" data-campo="reps" onchange="retoGuardarSerie(${i}, '${dia.rutina}')" class="flex-grow min-w-0 bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 text-sm text-slate-800 focus:outline-none">
        </div>
      </div>`;
    }).join('');
    sesion = `
      <section class="space-y-2">
        <div class="flex items-center justify-between px-1">
          <h2 class="text-xs font-bold text-slate-400 uppercase tracking-wider">💪 ${escapeHTML(dia.texto)} · ${dia.dur}</h2>
        </div>
        ${resumenSubidas}
        ${semanaSuave}
        <p class="text-xs text-slate-400 px-1">Calienta 5–8 min (movilidad, comba suave). Acaba cada serie con 1–2 repeticiones de reserva. En reps, pon cada serie separada por guiones; si hiciste igual en todas, basta un número.</p>
        <div class="bg-white rounded-2xl border border-slate-200 shadow-sm divide-y divide-slate-100 overflow-hidden">${ejercicios}</div>
        <button onclick="retoToggleHabito('sesion_hecha')" class="w-full py-3 rounded-2xl font-semibold text-sm transition-all active:scale-95 ${d.sesion_hecha ? 'bg-emerald-500 text-white' : 'bg-white border-2 border-emerald-500 text-emerald-700'}">${d.sesion_hecha ? '✓ Sesión hecha' : 'Marcar sesión como hecha'}</button>
      </section>`;
  } else if (dia.crossfit) {
    sesion = `
      <section class="space-y-2">
        <h2 class="text-xs font-bold text-slate-400 uppercase tracking-wider px-1">🏋️ CrossFit · ${dia.dur}</h2>
        <div class="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-1">
          <p class="text-sm font-semibold text-slate-800">Hoy toca el box</p>
          <p class="text-xs text-slate-500">Calentamiento, técnica y WOD con el coach. Escala el peso a tu nivel y prioriza hacerlo bien. Cuenta como tu sesión de fuerza de hoy.</p>
        </div>
        <button onclick="retoToggleHabito('sesion_hecha')" class="w-full py-3 rounded-2xl font-semibold text-sm transition-all active:scale-95 ${d.sesion_hecha ? 'bg-emerald-500 text-white' : 'bg-white border-2 border-emerald-500 text-emerald-700'}">${d.sesion_hecha ? '✓ CrossFit hecho' : 'Marcar CrossFit hecho'}</button>
      </section>`;
  } else if (dia.cardio) {
    const c = retoCardioTexto(plan);
    sesion = `
      <section class="space-y-2">
        <h2 class="text-xs font-bold text-slate-400 uppercase tracking-wider px-1">🏃 Cardio suave · ${dia.dur}</h2>
        <div class="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-1">
          <p class="text-sm font-semibold text-slate-800">${escapeHTML(c.t)}</p>
          <p class="text-xs text-slate-500">${escapeHTML(c.d)}</p>
          <p class="text-xs text-slate-400">Calienta caminando 5 min, haz el bloque y termina caminando. El resto del tiempo, camina a paso rápido.</p>
        </div>
        <button onclick="retoToggleHabito('cardio')" class="w-full py-3 rounded-2xl font-semibold text-sm transition-all active:scale-95 ${d.cardio ? 'bg-emerald-500 text-white' : 'bg-white border-2 border-emerald-500 text-emerald-700'}">${d.cardio ? '✓ Cardio hecho' : 'Marcar cardio como hecho'}</button>
      </section>`;
  } else {
    sesion = `
      <section class="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
        <p class="text-sm font-semibold text-slate-800">${escapeHTML(dia.texto)}</p>
        <p class="text-xs text-slate-400 mt-0.5">${dia.dur ? dia.dur + ' · ' : ''}Hoy no toca fuerza. Los pasos de abajo cuentan.</p>
      </section>`;
  }

  // ---- "Tu día": todo lo que toca hoy, en orden, con una casilla cada cosa ----
  const menuHoy = RETO_MENU[retoDiaSemana(retoFecha)];
  const filas = [];
  const comida = (i, bit, icono) => filas.push({
    icono, titulo: RETO_COMIDAS[i], sub: retoLineaComida(retoDiaSemana(retoFecha), i, d.porciones) || 'Toca «Elegir» y escoge qué vas a comer', plato: '', hecho: !!(d.comidas & bit), onclick: `retoToggleComida(${bit})`,
    comida: i, prot: Math.round(retoProteinaComida(retoDiaSemana(retoFecha), i, d.porciones))
  });
  if (dia.rutina) {
    const descargaTxt = plan && plan.descarga ? ' (semana de descarga)' : '';
    filas.push({ icono: '🏋️', titulo: `Entreno · Rutina ${dia.rutina}${descargaTxt}`, sub: `${dia.dur} · ${RETO_RUTINAS[dia.rutina].length} ejercicios${RETO_FINISHER_DIA[retoDiaSemana(retoFecha)] !== undefined && !(plan && plan.descarga) ? ' + finisher' : ''}`,
      hecho: d.sesion_hecha, onclick: "retoToggleHabito('sesion_hecha')", boton: d.sesion_hecha ? 'Repetir' : '▶ Empezar', botonClick: `retoGuiadoAbrir('${dia.rutina}')` });
  } else if (dia.crossfit) {
    filas.push({ icono: '🏋️', titulo: 'CrossFit en el box', sub: dia.dur + ' · cuenta como sesión de fuerza', hecho: d.sesion_hecha, onclick: "retoToggleHabito('sesion_hecha')" });
  } else if (dia.cardio) {
    const ct = retoCardioTexto(plan);
    filas.push({ icono: '🏃', titulo: 'Cardio suave', sub: ct.t, hecho: d.cardio, onclick: "retoToggleHabito('cardio')", boton: d.cardio ? 'Repetir' : '▶ Empezar', botonClick: 'retoGuiadoAbrirCardio()' });
  } else {
    filas.push({ icono: '😌', titulo: dia.texto, sub: 'Hoy no toca entreno. Si te apetece, camina un rato.', info: true });
  }
  RETO_HABITOS.forEach(h => filas.push({ icono: h.icono, titulo: h.texto, sub: h.meta, hecho: d[h.k], onclick: `retoToggleHabito('${h.k}')` }));
  const pr = retoProteinaTotal(d, retoDiaSemana(retoFecha));
  const chequeables = filas.filter(f => !f.info);
  const hechas = chequeables.filter(f => f.hecho).length;
  const pct = Math.round(hechas * 100 / chequeables.length);
  const listaDia = filas.map(f => f.info
    ? `<div class="flex items-center gap-3 px-3.5 py-3"><span class="text-xl w-7 text-center">${f.icono}</span><div class="min-w-0"><p class="text-sm font-semibold text-slate-800">${escapeHTML(f.titulo)}</p><p class="text-xs text-slate-400">${escapeHTML(f.sub)}</p></div></div>`
    : `<div><div class="flex items-center gap-3 px-3.5 py-3">
        <button onclick="${f.onclick}" aria-label="Marcar" class="shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-sm transition-all ${f.hecho ? 'bg-emerald-500 text-white' : 'border-2 border-slate-300 text-transparent'}">✓</button>
        <span class="text-xl w-7 text-center shrink-0">${f.icono}</span>
        <div class="flex-grow min-w-0"><p class="text-sm font-semibold ${f.hecho ? 'text-slate-400 line-through' : 'text-slate-800'}">${escapeHTML(f.titulo)}</p>${f.plato ? `<p class="text-xs text-slate-400">${escapeHTML(f.plato)}</p>` : ''}<p class="${f.comida !== undefined && f.prot > 0 ? 'text-[13px] font-medium text-emerald-700 mt-0.5' : 'text-xs text-slate-400'}">${escapeHTML(f.sub)}</p>${f.comida !== undefined && f.prot > 0 ? `<p class="text-[11px] text-slate-400 mt-0.5">≈ ${f.prot} g de proteína</p>` : ''}</div>
        ${f.comida !== undefined ? `<button onclick="retoAbrirComida(${f.comida})" class="shrink-0 px-2.5 py-1.5 rounded-xl text-xs font-bold ${retoComidaAbierta === f.comida ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600'}">${retoComidaAbierta === f.comida ? 'Cerrar' : (f.prot > 0 ? 'Cambiar' : 'Elegir')}</button>` : ''}
        ${f.boton ? `<button onclick="${f.botonClick}" class="shrink-0 px-3 py-2 rounded-xl text-xs font-bold ${f.hecho ? 'bg-slate-100 text-slate-500' : 'bg-emerald-600 text-white'} active:scale-95">${f.boton}</button>` : ''}
      </div>${f.comida !== undefined && retoComidaAbierta === f.comida ? retoHTMLComida(retoDiaSemana(retoFecha), f.comida, d.porciones) : ''}</div>`).join('');

  const semanaN = retoEstado.sesiones_semana;
  return `
    <div class="flex items-center justify-between">
      <button onclick="retoCambiarDia(-1)" aria-label="Día anterior" class="w-10 h-10 rounded-xl bg-white border border-slate-200 text-slate-500">‹</button>
      <div class="text-center">
        <p class="text-sm font-bold text-slate-800">${escapeHTML(retoFechaLarga(retoFecha))}</p>
        ${esHoy ? '' : '<button onclick="retoIrAHoy()" class="text-xs font-semibold text-emerald-600">Volver a hoy</button>'}
      </div>
      <button onclick="retoCambiarDia(1)" aria-label="Día siguiente" class="w-10 h-10 rounded-xl bg-white border border-slate-200 text-slate-500">›</button>
    </div>
    <div class="bg-white rounded-2xl border border-slate-200 shadow-sm p-3.5">
      <div class="flex justify-between px-1">${fila}</div>
      <p class="text-xs text-slate-500 text-center mt-2.5"><span class="font-bold text-slate-800">${semanaN}</span> de 4 sesiones de fuerza esta semana</p>
    </div>
    ${retoChipRacha()}
    ${plan ? `<div class="rounded-2xl border px-3.5 py-2.5 ${plan.descarga ? 'bg-sky-50 border-sky-200' : 'bg-white border-slate-200'}">
      <p class="text-xs font-bold ${plan.descarga ? 'text-sky-700' : 'text-slate-700'}">Semana ${plan.n} · ${plan.enCiclo} de 4 del ciclo: ${RETO_CICLO[plan.enCiclo - 1].t}</p>
      <p class="text-xs text-slate-500 mt-0.5">${escapeHTML(RETO_CICLO[plan.enCiclo - 1].d)}</p></div>`
      : `<div class="rounded-2xl border border-dashed border-slate-300 px-3.5 py-2.5 text-xs text-slate-500">Fija la fecha de inicio en la pestaña Plan para que lleve tu ciclo de 3 semanas de carga + 1 de descarga. <button onclick="retoCambiarVista('plan')" class="font-semibold underline">Ir a Plan</button></div>`}
    ${retoBannerRevision()}
    <section class="space-y-2">
      <div class="flex items-center justify-between px-1">
        <h2 class="text-xs font-bold text-slate-400 uppercase tracking-wider">✅ Tu día</h2>
        <span class="text-xs font-semibold text-slate-500">${hechas} de ${chequeables.length}</span>
      </div>
      <div class="h-1.5 rounded-full bg-slate-200 overflow-hidden"><div class="h-full bg-emerald-500 rounded-full transition-all" style="width:${pct}%"></div></div>
      <div class="bg-white rounded-2xl border border-slate-200 shadow-sm divide-y divide-slate-100 overflow-hidden">${listaDia}</div>
    </section>
    ${(plan && plan.descarga) || RETO_FINISHER_DIA[retoDiaSemana(retoFecha)] === undefined || !dia.rutina ? '' : `<div class="rounded-2xl border-2 border-orange-300 bg-orange-50 px-3.5 py-3">
      <p class="text-sm font-bold text-orange-700">🔥 Hoy toca finisher rest-pause</p>
      <p class="text-sm text-slate-700 mt-1">${escapeHTML(RETO_FINISHER[RETO_FINISHER_DIA[retoDiaSemana(retoFecha)]])}</p>
      <p class="text-xs text-slate-500 mt-1.5">Va incluido al final del entreno guiado.</p></div>`}
    ${dia.rutina ? `<details class="bg-white rounded-2xl border border-slate-200 px-3.5 py-3"><summary class="text-sm font-semibold text-slate-700 cursor-pointer">📝 Ver los ejercicios y anotar a mano</summary><div class="mt-3">${sesion}</div></details>` : ''}`;
}

function retoProteinaTotal(d, dow) {
  let comidas = 0, kcal = 0;
  [1, 2, 4, 8].forEach((bit, i) => {
    if ((d.comidas || 0) & bit) { comidas += retoProteinaComida(dow, i, d.porciones); kcal += retoKcalComida(dow, i, d.porciones); }
  });
  comidas = Math.round(comidas);
  const extra = d.proteina_extra || 0;
  // Los extras se anotan en gramos de proteína; ~5 kcal por gramo es una estimación razonable.
  const kcalExtra = Math.round(extra * 5);
  return { comidas, extra, total: comidas + extra, kcalComidas: Math.round(kcal), kcalExtra, kcal: Math.round(kcal) + kcalExtra };
}

async function retoProteinaExtra(delta) {
  const d = Object.assign({}, retoEstado.diario);
  d.proteina_extra = delta === 0 ? 0 : Math.max(0, Math.min(600, (d.proteina_extra || 0) + delta));
  const antes = retoEstado.diario;
  retoEstado.diario = d;
  pintarReto();
  try { await retoPut('/reto/diario', d); } catch (e) { retoEstado.diario = antes; pintarReto(); retoError(e); }
}
function retoProteinaOtro() {
  const v = prompt('¿Cuántos gramos de proteína quieres sumar?', '20');
  if (v === null) return;
  const n = parseInt(String(v).replace(',', '.'), 10);
  if (isNaN(n) || n === 0) return;
  retoProteinaExtra(n);
}

function retoProteinaScroll() {
  const el = document.getElementById('reto-proteina');
  if (el && el.scrollIntoView) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

async function retoToggleComida(bit) {
  const d = Object.assign({}, retoEstado.diario);
  d.comidas = (d.comidas || 0) ^ bit;
  const antes = retoEstado.diario;
  retoEstado.diario = d;
  pintarReto();
  try {
    await retoPut('/reto/diario', d);
  } catch (e) {
    retoEstado.diario = antes;
    pintarReto();
    retoError(e);
  }
}

async function retoToggleHabito(clave) {
  const d = Object.assign({}, retoEstado.diario);
  d[clave] = !d[clave];
  const antes = retoEstado.diario;
  retoEstado.diario = d;
  try {
    await retoPut('/reto/diario', d);
    await cargarReto(); // refresca la fila de la semana y el contador
  } catch (e) {
    retoEstado.diario = antes;
    pintarReto();
    retoError(e);
  }
}

async function retoGuardarSerie(i, rutina) {
  const e = RETO_RUTINAS[rutina][i];
  const peso = document.querySelector(`[data-reto-ej="${i}"][data-campo="peso"]`);
  const reps = document.querySelector(`[data-reto-ej="${i}"][data-campo="reps"]`);
  try {
    await retoPut('/reto/series', {
      fecha: retoFecha,
      ejercicio: e.n,
      peso: parseFloat(String(peso.value).replace(',', '.')) || 0,
      reps: reps.value.trim()
    });
    mostrarToast('Guardado ✓');
  } catch (err) {
    retoError(err);
  }
}

// ---------- MEDIDAS ----------
function retoGrafica(puntos, color, unidad) {
  if (puntos.length < 2) return '<p class="text-xs text-slate-400 text-center py-4">Con dos medidas ya se dibuja la evolución.</p>';
  const W = 320, H = 96, P = 14;
  const vs = puntos.map(p => p.v);
  let min = Math.min(...vs), max = Math.max(...vs);
  if (max - min < 1) { min -= 1; max += 1; }
  const t0 = parseFechaISO(puntos[0].f).getTime(), t1 = parseFechaISO(puntos[puntos.length - 1].f).getTime();
  const x = p => P + (t1 === t0 ? 0 : (parseFechaISO(p.f).getTime() - t0) / (t1 - t0)) * (W - 2 * P);
  const y = p => H - P - ((p.v - min) / (max - min)) * (H - 2 * P);
  const linea = puntos.map(p => `${x(p).toFixed(1)},${y(p).toFixed(1)}`).join(' ');
  const pts = puntos.map(p => `<circle cx="${x(p).toFixed(1)}" cy="${y(p).toFixed(1)}" r="3" fill="${color}"/>`).join('');
  const a = puntos[0], b = puntos[puntos.length - 1];
  return `<svg viewBox="0 0 ${W} ${H}" class="w-full h-24" role="img" aria-label="Evolución">
    <polyline points="${linea}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round"/>${pts}
    <text x="${P}" y="11" font-size="10" fill="#94a3b8">${a.v} ${unidad}</text>
    <text x="${W - P}" y="11" font-size="10" fill="#94a3b8" text-anchor="end">${b.v} ${unidad}</text>
  </svg>`;
}

function retoHTMLMedidas() {
  const m = retoMedidas;
  const hoy = retoHoyISO();
  const ultima = m.length ? m[m.length - 1] : null;
  let aviso = '';
  if (!ultima) aviso = 'Aún no hay medidas. Empieza hoy: cintura a la altura del ombligo y peso en ayunas.';
  else {
    const dias = Math.round((parseFechaISO(hoy) - parseFechaISO(ultima.fecha)) / 86400000);
    if (dias >= 7) aviso = `Han pasado ${dias} días desde la última medida: toca pesarse.`;
  }
  const cint = m.filter(x => x.cintura).map(x => ({ f: x.fecha, v: x.cintura }));
  const peso = m.filter(x => x.peso).map(x => ({ f: x.fecha, v: x.peso }));
  const delta = (arr, u) => {
    if (arr.length < 2) return '';
    const d = Math.round((arr[arr.length - 1].v - arr[0].v) * 10) / 10;
    return `<span class="text-xs font-semibold ${d === 0 ? 'text-slate-400' : (d < 0 ? 'text-emerald-600' : 'text-amber-600')}">${d > 0 ? '+' : ''}${String(d).replace('.', ',')} ${u} desde el inicio</span>`;
  };
  const lista = m.slice().reverse().map(x => `
    <div class="flex items-center gap-3 px-3.5 py-2.5">
      <span class="text-xs text-slate-400 w-20 shrink-0">${escapeHTML(formatearFechaCorta(x.fecha))}</span>
      <span class="flex-grow text-sm text-slate-700">${x.cintura ? `Cintura <b>${String(x.cintura).replace('.', ',')}</b> cm` : ''}${x.cintura && x.peso ? ' · ' : ''}${x.peso ? `<b>${String(x.peso).replace('.', ',')}</b> kg` : ''}</span>
      <button onclick="retoBorrarMedida(${x.id})" aria-label="Borrar" class="text-slate-300 hover:text-rose-500 text-lg leading-none px-1">×</button>
    </div>`).join('');
  return `
    ${retoHTMLRevision()}
    ${aviso ? `<div class="text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">${escapeHTML(aviso)}</div>` : ''}
    <form onsubmit="retoGuardarMedida(event)" class="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-3">
      <p class="text-xs text-slate-400">Pésate 1 vez por semana, el mismo día y en ayunas; la cintura, cada 2 semanas. La cintura y las fotos dicen más que la báscula.</p>
      <div class="grid grid-cols-3 gap-2">
        <input type="date" id="reto-m-fecha" value="${hoy}" required class="col-span-3 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-800 focus:outline-none">
        <label class="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 flex items-center gap-1.5 col-span-1"><input type="number" inputmode="decimal" step="0.1" id="reto-m-cintura" placeholder="Cintura" class="w-full bg-transparent text-sm focus:outline-none"><span class="text-xs text-slate-400">cm</span></label>
        <label class="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 flex items-center gap-1.5 col-span-1"><input type="number" inputmode="decimal" step="0.1" id="reto-m-peso" placeholder="Peso" class="w-full bg-transparent text-sm focus:outline-none"><span class="text-xs text-slate-400">kg</span></label>
        <button type="submit" class="col-span-1 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-semibold rounded-xl text-sm">Guardar</button>
      </div>
    </form>
    <section class="bg-white rounded-2xl border border-slate-200 shadow-sm p-3.5">
      <div class="flex items-center justify-between"><p class="text-sm font-bold text-slate-800">Cintura</p>${delta(cint, 'cm')}</div>
      ${retoGrafica(cint, '#059669', 'cm')}
    </section>
    <section class="bg-white rounded-2xl border border-slate-200 shadow-sm p-3.5">
      <div class="flex items-center justify-between"><p class="text-sm font-bold text-slate-800">Peso</p>${delta(peso, 'kg')}</div>
      ${retoGrafica(peso, '#2563eb', 'kg')}
    </section>
    <p class="text-xs text-slate-500 px-1">Señal de que va bien: la cintura baja o se mantiene mientras suben los pesos que levantas. Hazte también fotos de frente y de perfil con la misma luz.</p>
    ${m.length ? `<div class="bg-white rounded-2xl border border-slate-200 shadow-sm divide-y divide-slate-100 overflow-hidden">${lista}</div>` : ''}`;
}

function formatearFechaCorta(iso) {
  return parseFechaISO(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: '2-digit' });
}

async function retoGuardarMedida(ev) {
  ev.preventDefault();
  const num = id => parseFloat(String(document.getElementById(id).value).replace(',', '.')) || 0;
  try {
    await retoFetch('/reto/medidas', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fecha: document.getElementById('reto-m-fecha').value, cintura: num('reto-m-cintura'), peso: num('reto-m-peso') })
    });
    await cargarReto();
    mostrarToast('Medida guardada ✓');
  } catch (e) { retoError(e); }
}

async function retoBorrarMedida(id) {
  if (!confirm('¿Borrar esta medida?')) return;
  try {
    await retoFetch('/reto/medidas/' + id, { method: 'DELETE' });
    await cargarReto();
  } catch (e) { retoError(e); }
}

// ---------- PLAN ----------
function retoFaseActual() {
  const ini = retoEstado.inicio;
  if (!ini) return null;
  const dias = Math.round((parseFechaISO(retoHoyISO()) - parseFechaISO(ini)) / 86400000);
  if (dias < 0) return { dias, mes: 0, fase: null };
  const mes = Math.floor(dias / 30.4) + 1;
  const fase = mes <= 3 ? 1 : mes <= 6 ? 2 : mes <= 10 ? 3 : 4;
  return { dias, mes, fase: RETO_FASES[fase - 1] };
}

function retoHTMLPlan() {
  const act = retoFaseActual();
  let cabecera;
  if (!retoEstado.inicio) {
    cabecera = `<div class="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-2">
      <p class="text-sm font-semibold text-slate-800">¿Cuándo empiezas el reto?</p>
      <p class="text-xs text-slate-400">Con la fecha de inicio la app te dice en qué fase estás.</p>
      <button onclick="retoFijarInicio('${retoHoyISO()}')" class="w-full bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-semibold py-2.5 rounded-xl text-sm">Empiezo hoy</button>
    </div>`;
  } else if (act && act.fase) {
    const f = act.fase;
    cabecera = `<div class="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 space-y-1.5">
      <p class="text-[11px] font-bold text-emerald-700 uppercase tracking-wide">Mes ${act.mes} de 12 · Fase ${f.n}</p>
      <p class="text-lg font-bold text-slate-900">${f.nombre}</p>
      <p class="text-sm text-slate-700"><b>Entreno:</b> ${escapeHTML(f.entreno)}</p>
      <p class="text-sm text-slate-700"><b>Comida:</b> ${escapeHTML(f.comida)}</p>
      <p class="text-sm text-slate-700"><b>Pasas de fase cuando:</b> ${escapeHTML(f.paso)}</p>
      <div class="flex items-center justify-between pt-1.5">
        <span class="text-xs text-slate-500">Empezaste el ${escapeHTML(formatearFechaCorta(retoEstado.inicio))}</span>
        <button onclick="retoCambiarInicio()" class="text-xs font-semibold text-slate-500 underline">Cambiar fecha</button>
      </div>
    </div>`;
  } else {
    cabecera = `<div class="bg-white rounded-2xl border border-slate-200 p-4 text-sm text-slate-600">El reto empieza el ${escapeHTML(formatearFechaCorta(retoEstado.inicio))}. <button onclick="retoCambiarInicio()" class="font-semibold underline">Cambiar</button></div>`;
  }

  const cifras = [
    ['Calorías', '2.600–2.800 kcal (aprox., mantenimiento)'],
    ['Proteína', '135–160 g al día'],
    ['Pasos', '8.000–10.000 al día'],
    ['Sueño', '7–8 h'],
    ['Agua', '2,5–3 l']
  ].map(([a, b]) => `<div class="flex justify-between gap-3 px-3.5 py-2.5 text-sm"><span class="text-slate-400">${a}</span><span class="text-slate-800 text-right font-medium">${b}</span></div>`).join('');

  const semana = [1, 2, 3, 4, 5, 6, 0].map(n => {
    const d = retoDiaPlan(sumarDiasISO(retoEstado.semana_lunes || retoHoyISO(), (n + 6) % 7));
    return `<div class="flex gap-3 px-3.5 py-2.5 text-sm"><span class="w-20 shrink-0 text-slate-400">${d.nombre}</span><span class="text-slate-800">${escapeHTML(d.texto)}${d.dur ? ` <span class="text-slate-400">· ${d.dur}</span>` : ''}</span></div>`;
  }).join('');

  const fases = RETO_FASES.map(f => `<div class="px-3.5 py-3 ${act && act.fase && act.fase.n === f.n ? 'bg-emerald-50' : ''}">
    <p class="text-sm font-bold text-slate-800">${f.n}. ${f.nombre} <span class="text-xs font-normal text-slate-400">· meses ${f.meses}</span></p>
    <p class="text-xs text-slate-500 mt-0.5">${escapeHTML(f.comida)}</p></div>`).join('');

  const menuDias = [1, 2, 3, 4, 5, 6, 0].map(n => `<details class="px-3.5 py-2.5"><summary class="text-sm font-semibold text-slate-800 cursor-pointer">${RETO_SEMANA[n].nombre}</summary>
    <div class="mt-1.5 space-y-1">${RETO_MENU[n].map((t, i) => `<p class="text-sm text-slate-600"><span class="text-xs font-bold text-slate-400">${RETO_COMIDAS[i]}:</span> ${escapeHTML(t)}</p>`).join('')}</div></details>`).join('');

  return `
    ${cabecera}
    ${retoHTMLConsejos()}
    ${retoHTMLCrossfitAjustes()}
    <section class="space-y-2"><h2 class="text-xs font-bold text-slate-400 uppercase tracking-wider px-1">Cifras clave</h2>
      <div class="bg-white rounded-2xl border border-slate-200 shadow-sm divide-y divide-slate-100 overflow-hidden">${cifras}</div>
      <p class="text-xs text-slate-500 px-1">Si en 3–4 semanas el peso baja más de 1 kg, suma unas 200 kcal (más arroz, pan o frutos secos). Si la cintura sube, quita 200 kcal.</p></section>
    <section class="space-y-2"><h2 class="text-xs font-bold text-slate-400 uppercase tracking-wider px-1">Semana tipo</h2>
      <div class="bg-white rounded-2xl border border-slate-200 shadow-sm divide-y divide-slate-100 overflow-hidden">${semana}</div>
      <p class="text-xs text-slate-500 px-1">Cuando completes todas las series con el máximo de repeticiones, sube peso (1–2 kg) o añade 2 repeticiones. Cada 4.ª semana es de descarga (más abajo, Ciclo 3 + 1).</p></section>
    <section class="space-y-2"><h2 class="text-xs font-bold text-slate-400 uppercase tracking-wider px-1">Tipos de fuerza</h2>
      <div class="bg-white rounded-2xl border border-slate-200 shadow-sm divide-y divide-slate-100 overflow-hidden">
        <div class="px-3.5 py-2.5"><p class="text-sm font-bold text-slate-800">Fuerza resistencia · 12–20 reps</p><p class="text-xs text-slate-500">La base mientras tengas poca carga, terminando cerca del fallo. En la app: 15–20 repeticiones.</p></div>
        <div class="px-3.5 py-2.5"><p class="text-sm font-bold text-slate-800">Fuerza máxima · 1–5 pesadas</p><p class="text-xs text-slate-500">Sentadilla y peso muerto rumano cuando cargues 20 kg o más por mancuerna (5–6 repeticiones). Nunca al fallo.</p></div>
        <div class="px-3.5 py-2.5"><p class="text-sm font-bold text-slate-800">Fuerza fatiga · hasta no poder más</p><p class="text-xs text-slate-500">Flexiones, zancadas, remo y fondos, y en el finisher.</p></div>
      </div></section>
    <section class="space-y-2"><h2 class="text-xs font-bold text-slate-400 uppercase tracking-wider px-1">Ciclo 3 + 1</h2>
      <div class="bg-white rounded-2xl border border-slate-200 shadow-sm divide-y divide-slate-100 overflow-hidden">${RETO_CICLO.map((c, i) => `<div class="flex gap-3 px-3.5 py-2.5 text-sm"><span class="w-24 shrink-0 text-slate-400">${i < 3 ? 'Semana ' + (i + 1) : 'Semana 4'}</span><span class="text-slate-800"><b>${c.t}.</b> ${escapeHTML(c.d)}</span></div>`).join('')}</div>
      <p class="text-xs text-slate-500 px-1">Al acabar la descarga empieza otro ciclo partiendo de los pesos de la semana 2. Fuera de los ejercicios al fallo, termina cada serie con 1–2 repeticiones en reserva.</p></section>
    <section class="space-y-2"><h2 class="text-xs font-bold text-slate-400 uppercase tracking-wider px-1">Finisher rest-pause</h2>
      <div class="bg-white rounded-2xl border border-slate-200 shadow-sm p-3.5"><p class="text-xs text-slate-400 mb-1.5">Dos veces por semana, nunca en descarga: el miércoles (rutina B) el primero y el viernes (rutina A) el segundo.</p>
      <ol class="space-y-1.5 list-decimal pl-5 text-sm text-slate-600">${RETO_FINISHER.map(t => `<li>${escapeHTML(t)}</li>`).join('')}</ol></div></section>
    <section class="space-y-2"><h2 class="text-xs font-bold text-slate-400 uppercase tracking-wider px-1">Cardio (un día a la semana)</h2>
      <div class="bg-white rounded-2xl border border-slate-200 shadow-sm divide-y divide-slate-100 overflow-hidden">
        <div class="flex gap-3 px-3.5 py-2.5 text-sm"><span class="w-24 shrink-0 text-slate-400">Semana 1</span><span class="text-slate-800">8 min: 1 min trotando + 1 min caminando</span></div>
        <div class="flex gap-3 px-3.5 py-2.5 text-sm"><span class="w-24 shrink-0 text-slate-400">Semanas 2–6</span><span class="text-slate-800">8 min: 2 min trotando + 1 min caminando, sin alargar el tiempo</span></div>
        <div class="flex gap-3 px-3.5 py-2.5 text-sm"><span class="w-24 shrink-0 text-slate-400">Desde la 7</span><span class="text-slate-800">Alarga poco a poco: +2–3 min por semana</span></div>
      </div>
      <p class="text-xs text-slate-500 px-1">Mejora tu capacidad cardiovascular (VO2 máx) y te ayuda a aguantar las series largas.</p></section>
    <section class="space-y-2"><h2 class="text-xs font-bold text-slate-400 uppercase tracking-wider px-1">Las 4 fases</h2>
      <div class="bg-white rounded-2xl border border-slate-200 shadow-sm divide-y divide-slate-100 overflow-hidden">${fases}</div></section>
`;
}

async function retoFijarInicio(fecha) {
  try {
    await retoPut('/reto/inicio', { inicio: fecha });
    await cargarReto();
  } catch (e) { retoError(e); }
}

function retoCambiarInicio() {
  const v = prompt('Fecha de inicio del reto (AAAA-MM-DD):', retoEstado.inicio || retoHoyISO());
  if (v === null) return;
  if (v.trim() !== '' && !/^\d{4}-\d{2}-\d{2}$/.test(v.trim())) { mostrarToast('Usa el formato AAAA-MM-DD'); return; }
  retoFijarInicio(v.trim());
}

// ---- Cantidades de cada comida ----
function retoAbrirComida(i) {
  retoComidaAbierta = retoComidaAbierta === i ? null : i;
  pintarReto();
}

function retoFmtCant(l) {
  return String(Math.round(l.cant * 10) / 10).replace('.', ',');
}

function retoMedidaCasera(l) {
  const m = retoMedidasCaseras(l);
  return m.length ? m[0] : '';
}

let retoInfoLinea = null;
function retoToggleInfo(comida, i) {
  const k = comida + '.' + i;
  retoInfoLinea = retoInfoLinea === k ? null : k;
  pintarReto();
}

function retoChipsCambio(comida, linea, grupo, etiqueta) {
  if (!linea) return '';
  const opciones = retoOpcionesDe(retoDiaSemana(retoFecha), comida, linea);
  return `<div class="py-2.5">
    <p class="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">${etiqueta}</p>
    <div class="flex flex-wrap gap-1.5">${opciones.map(k => `<button onclick="retoCambiarIng(${comida},${linea.i},'${k}')" class="text-xs font-semibold px-2.5 py-1.5 rounded-full border active:scale-95 ${k === linea.id && linea.cant > 0 ? 'bg-emerald-600 border-emerald-600 text-white' : 'bg-white border-slate-200 text-slate-700'}">${escapeHTML(RETO_ING[k].n.replace(/\s*\([^)]*\)/, ''))}</button>`).join('')}</div>
    ${linea.cant <= 0 ? '<p class="text-xs text-slate-400 mt-1.5">Toca uno para elegirlo (o déjalo sin elegir).</p>' : `<p class="text-xs text-slate-400 mt-1.5">Ración: <b class="text-slate-600">${retoFmtCant(linea)} ${retoUnidad(linea.ing)}</b>${retoMedidaCasera(linea) ? ' · ' + retoMedidaCasera(linea) : ''}${grupo === 'prot' ? ' · ≈ ' + Math.round(linea.prot) + ' g de proteína' : ''}</p>`}
  </div>`;
}

// Opciones de cambio de una línea: las del alimento original del menú (siempre incluye el actual).
function retoOpcionesDe(dow, comida, l) {
  const original = RETO_MENU_ING[dow][comida][l.i][0];
  const op = retoOpcionesCambio(original).slice();
  if (!op.includes(l.id)) op.push(l.id);
  return op;
}

function retoHTMLComida(dow, comida, porciones) {
  const lineas = retoDetalleComida(dow, comida, porciones);
  const total = Math.round(lineas.reduce((a, l) => a + l.prot, 0));
  const hayCambios = lineas.some(l => l.cambiado);
  const filas = lineas.filter(l => l.cant > 0).map(l => {
    const u = retoUnidad(l.ing);
    const paso = u === 'ud' ? 1 : (l.cant < 50 ? 5 : 10);
    const opciones = retoOpcionesDe(dow, comida, l);
    const nombre = opciones.length > 1
      ? `<select onchange="retoCambiarIng(${comida},${l.i},this.value)" class="w-full text-sm font-semibold text-slate-800 bg-transparent">${opciones.map(k => `<option value="${k}" ${k === l.id ? 'selected' : ''}>${escapeHTML(RETO_ING[k].n)}</option>`).join('')}</select>`
      : `<p class="text-sm font-semibold text-slate-800">${escapeHTML(l.ing.n)}</p>`;
    const abierta = retoInfoLinea === comida + '.' + l.i;
    const medidas = retoMedidasCaseras(l);
    const info = abierta ? `<div class="bg-sky-50 border border-sky-200 rounded-lg px-2.5 py-2 mb-1.5 text-xs text-sky-900">
      <p class="font-semibold">${retoFmtCant(l)} ${u} de ${escapeHTML(l.ing.n.replace(/\s*\([^)]*\)/, '').toLowerCase())} son:</p>
      ${medidas.length ? `<ul class="mt-0.5 space-y-0.5">${medidas.map(m => `<li>${escapeHTML(m)}</li>`).join('')}</ul>` : '<p class="mt-0.5">Para este alimento no hay medida casera útil: pésalo.</p>'}
      <p class="mt-1 text-sky-700">Taza = una de desayuno grande (240 ml). Cucharada = sopera rasa.</p></div>` : '';
    return `<div class="py-1.5">
      <div class="flex items-center gap-1.5">
        <div class="flex-grow min-w-0">${nombre}<p class="text-xs text-slate-400">${Math.round(l.prot) ? '≈ ' + Math.round(l.prot) + ' g de proteína' : 'Casi sin proteína'}</p></div>
        <button onclick="retoToggleInfo(${comida},${l.i})" aria-label="Equivalencia en tazas y cucharas" class="shrink-0 w-8 h-8 rounded-full text-sm font-bold ${abierta ? 'bg-sky-600 text-white' : 'bg-sky-100 text-sky-700'}">i</button>
        <button onclick="retoCambiarCant(${comida},${l.i},-${paso})" aria-label="Menos" class="w-8 h-8 rounded-lg bg-slate-100 text-slate-600 font-bold">−</button>
        <span class="w-14 text-center text-sm font-bold ${l.cambiado ? 'text-emerald-700' : 'text-slate-700'}">${retoFmtCant(l)} ${u}</span>
        <button onclick="retoCambiarCant(${comida},${l.i},${paso})" aria-label="Más" class="w-8 h-8 rounded-lg bg-slate-100 text-slate-600 font-bold">+</button>
      </div>
      <div class="flex gap-1.5 mt-1">${[['Nada', 0], ['¼', 0.25], ['½', 0.5], ['¾', 0.75], ['Todo', 1]].map(([t, f]) => `<button onclick="retoFraccion(${comida},${l.i},${f})" class="flex-1 py-1 rounded-lg text-xs font-semibold ${Math.abs(l.cant - retoBaseLinea(dow, comida, l.i) * f) < 0.51 ? 'bg-emerald-600 text-white' : 'bg-white border border-slate-200 text-slate-500'}">${t}</button>`).join('')}</div>${info}</div>`;
  }).join('');
  return `<div class="mx-3 mb-3 rounded-xl bg-slate-50 border border-slate-200 px-3 divide-y divide-slate-200">
    ${retoChipsCambio(comida, lineas[0], 'prot', 'Proteína (elige una de la guía)')}
    ${retoChipsCambio(comida, lineas[1], 'hid', 'Hidrato')}
    ${retoChipsCambio(comida, lineas[2], 'verd', 'Verdura')}
    ${retoChipsCambio(comida, lineas[3], 'fruta', 'Fruta')}
    ${retoChipsCambio(comida, lineas[4], 'grasa', 'Grasa (aceite o frutos secos)')}
    ${retoChipsCambio(comida, lineas[5], 'prot', 'Otra proteína (opcional, p. ej. yogur o huevos)')}
    <details open class="py-2"><summary class="text-xs font-semibold text-slate-500 cursor-pointer">He comido distinto: ajustar cada alimento</summary>
      <p class="text-xs text-slate-500 pt-1.5">¿Has comido menos de algo (por ejemplo, ya llevaba garbanzos la ensalada)? Toca <b>½</b>, <b>¼</b> o <b>Nada</b> y la proteína se recalcula sola.</p>
      <div class="mt-1 divide-y divide-slate-100">${filas || '<p class="text-xs text-slate-400 py-2">Aún no has elegido nada.</p>'}</div>
      <p class="text-xs text-slate-400 pt-2">«Crudo» = antes de cocinar (200 g de pollo crudo ≈ 150 g cocinado; 80 g de arroz crudo ≈ 200 g cocinado).</p>
    </details>
    <div class="flex items-center justify-between py-2">
      <p class="text-sm font-bold text-slate-800">Esta comida ≈ ${total} g de proteína</p>
      ${hayCambios ? `<button onclick="retoRestaurarComida(${comida})" class="text-xs font-semibold text-emerald-600">Volver al ejemplo</button>` : ''}
    </div>
  </div>`;
}

async function retoGuardarPorciones(porciones) {
  const antes = retoEstado.diario;
  const d = Object.assign({}, antes, { porciones });
  retoEstado.diario = d;
  pintarReto();
  try {
    await retoPut('/reto/diario', d);
  } catch (e) {
    retoEstado.diario = antes;
    pintarReto();
    retoError(e);
  }
}

// Cantidad "completa" de una línea (la del menú, o su equivalente si has cambiado el alimento).
function retoBaseLinea(dow, comida, i) {
  const porciones = retoEstado.diario.porciones || {};
  const orig = retoDetalleComida(dow, comida, {})[i];
  const actual = retoDetalleComida(dow, comida, porciones)[i];
  if (orig.def === 0) return RETO_ING[actual.id].rac || actual.cant;
  return actual.id === orig.id ? orig.def : retoCantidadEquivalente(orig, actual.id);
}

// Atajo: "me he comido la mitad / nada / todo" de un alimento, sin contar gramos.
function retoFraccion(comida, i, f) {
  const dow = retoDiaSemana(retoFecha);
  const porciones = Object.assign({}, retoEstado.diario.porciones || {});
  const l = retoDetalleComida(dow, comida, porciones)[i];
  const base = retoBaseLinea(dow, comida, i);
  const u = retoUnidad(l.ing);
  const nueva = u === 'ud' ? Math.round(base * f * 2) / 2 : Math.round(base * f / 5) * 5;
  const clave = comida + '.' + i;
  const cambioIng = porciones[clave] && porciones[clave].i ? porciones[clave].i : '';
  if (nueva === l.def && !cambioIng) delete porciones[clave];
  else porciones[clave] = cambioIng ? { c: nueva, i: cambioIng } : { c: nueva };
  retoGuardarPorciones(porciones);
}

function retoCambiarCant(comida, i, delta) {
  const dow = retoDiaSemana(retoFecha);
  const porciones = Object.assign({}, retoEstado.diario.porciones || {});
  const l = retoDetalleComida(dow, comida, porciones)[i];
  const nueva = Math.max(0, Math.min(3000, Math.round((l.cant + delta) * 10) / 10));
  const clave = comida + '.' + i;
  const cambioIng = porciones[clave] && porciones[clave].i ? porciones[clave].i : '';
  if (nueva === l.def && !cambioIng) delete porciones[clave];
  else porciones[clave] = cambioIng ? { c: nueva, i: cambioIng } : { c: nueva };
  retoGuardarPorciones(porciones);
}

function retoCambiarIng(comida, i, id) {
  const dow = retoDiaSemana(retoFecha);
  const porciones = Object.assign({}, retoEstado.diario.porciones || {});
  const clave = comida + '.' + i;
  const original = RETO_MENU_ING[dow][comida][i][0];
  const defOrig = RETO_MENU_ING[dow][comida][i][1];
  const actualL = retoDetalleComida(dow, comida, porciones)[i];
  if (defOrig === 0 && actualL.id === id && actualL.cant > 0) delete porciones[clave];
  else if (id === original && defOrig > 0) delete porciones[clave];
  else {
    const actual = retoDetalleComida(dow, comida, porciones)[i];
    porciones[clave] = { c: retoCantidadEquivalente(actual, id), i: id };
  }
  retoGuardarPorciones(porciones);
}

function retoRestaurarComida(comida) {
  const porciones = Object.assign({}, retoEstado.diario.porciones || {});
  Object.keys(porciones).forEach(k => { if (k.startsWith(comida + '.')) delete porciones[k]; });
  retoGuardarPorciones(porciones);
}

// Barra de objetivo: verde dentro del rango, ámbar por debajo, rojo por encima.
function retoBarraObjetivo(titulo, valor, min, max, unidad, meta) {
  const dentro = valor >= min && valor <= max;
  const encima = valor > max;
  const color = dentro ? 'bg-emerald-500' : (encima ? 'bg-rose-400' : 'bg-amber-400');
  const pct = Math.min(100, Math.round(valor * 100 / max));
  const fmt = n => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const falta = valor < min ? `Faltan ≈ ${fmt(min - valor)} ${unidad} para el mínimo` : (encima ? `Te pasas ≈ ${fmt(valor - max)} ${unidad}` : 'Dentro de tu objetivo');
  return `<div>
    <div class="flex items-baseline justify-between"><p class="text-xs font-bold text-slate-500 uppercase tracking-wide">${titulo}</p>
      <p class="text-sm"><span class="text-xl font-bold ${dentro ? 'text-emerald-600' : 'text-slate-800'}">≈ ${fmt(valor)}</span> <span class="text-slate-400">/ ${fmt(min)}–${fmt(max)} ${unidad}</span></p></div>
    <div class="h-2 rounded-full bg-slate-200 overflow-hidden mt-1"><div class="h-full ${color} rounded-full transition-all" style="width:${pct}%"></div></div>
    <p class="text-[11px] text-slate-400 mt-0.5">${falta}</p></div>`;
}

// ---- Revisión: ¿está funcionando? Sigue la regla del plan: pesarse una vez por semana y mirar la tendencia ----
function retoRevision() {
  const m = retoMedidas || [];
  const hoy = retoHoyISO();
  const pesos = m.filter(x => x.peso);
  if (!pesos.length) return { estado: 'sin', titulo: 'Antes de empezar, pésate y mide la cintura', texto: 'Anota el peso en ayunas y la cintura a la altura del ombligo. Sin eso no puedo decirte si tienes que comer más o menos.', accion: true };
  const ultima = pesos[pesos.length - 1];
  const dias = Math.round((parseFechaISO(hoy) - parseFechaISO(ultima.fecha)) / 86400000);
  const vencida = dias >= 7;
  const lim = sumarDiasISO(ultima.fecha, -28);
  const ref = pesos.filter(x => x.fecha >= lim && Math.round((parseFechaISO(ultima.fecha) - parseFechaISO(x.fecha)) / 86400000) >= 6)[0];
  if (!ref) {
    return { estado: vencida ? 'toca' : 'espera', titulo: vencida ? 'Toca pesarse' : 'Todo en marcha', texto: vencida ? `Han pasado ${dias} días desde tu última pesada. Pésate en ayunas, el mismo día de la semana.` : 'Pésate otra vez dentro de una semana, en ayunas, para ver la tendencia. Mientras tanto, sigue el plan tal cual.', accion: vencida };
  }
  const semanas = Math.max(1, (parseFechaISO(ultima.fecha) - parseFechaISO(ref.fecha)) / 604800000);
  const dPeso = (ultima.peso - ref.peso) / semanas;
  const kg = n => String(Math.round(n * 100) / 100).replace('.', ',');
  const cint = pesos.length && ultima.cintura && ref.cintura ? ultima.cintura - ref.cintura : null;
  const resumen = `Peso: ${dPeso > 0 ? '+' : ''}${kg(dPeso)} kg/semana${cint !== null ? ` · Cintura: ${cint > 0 ? '+' : ''}${String(Math.round(cint * 10) / 10).replace('.', ',')} cm` : ''}`;
  let estado = 'ok', titulo = 'Perfecto: no cambies nada', texto = 'El peso se mantiene. Sigue comiendo igual.';
  if (dPeso < -0.2) {
    estado = 'baja'; titulo = 'El peso baja: te quedas corto';
    texto = 'Sube a 2 puños de hidrato (arroz, pasta, patata o pan) en las comidas y añade frutos secos o una tostada con aceite.';
  } else if (dPeso > 0.5) {
    estado = 'sube'; titulo = 'Sube más de 0,5 kg/semana';
    texto = 'Baja un poco el hidrato en las cenas.';
  }
  return { estado, titulo, texto, resumen, accion: vencida, dias };
}

function retoColoresRevision(e) {
  return e === 'ok' ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
    : (e === 'sin' || e === 'toca' || e === 'espera') ? 'bg-sky-50 border-sky-200 text-sky-800'
    : 'bg-amber-50 border-amber-300 text-amber-900';
}

function retoHTMLRevision() {
  const r = retoRevision();
  return `<div class="rounded-2xl border px-3.5 py-3 ${retoColoresRevision(r.estado)}">
    <p class="text-sm font-bold">${escapeHTML(r.titulo)}</p>
    ${r.resumen ? `<p class="text-xs font-semibold mt-0.5 opacity-80">${escapeHTML(r.resumen)}</p>` : ''}
    <p class="text-xs mt-1">${escapeHTML(r.texto)}</p></div>`;
}

// En "Hoy" solo aparece cuando hay algo que hacer: medir, o cambiar la comida.
function retoBannerRevision() {
  const r = retoRevision();
  if (r.estado === 'ok' || r.estado === 'espera') return '';
  return `<div class="rounded-2xl border px-3.5 py-3 ${retoColoresRevision(r.estado)}">
    <p class="text-sm font-bold">${escapeHTML(r.titulo)}</p>
    <p class="text-xs mt-1">${escapeHTML(r.texto)}</p>
    <button onclick="retoCambiarVista('medidas')" class="mt-2 text-xs font-bold underline">${r.accion ? 'Ir a Medidas' : 'Ver mi revisión'}</button></div>`;
}

// ---------- COMER: guía de proteínas + regla del plato (igual que el documento del plan) ----------
function retoHTMLComer() {
  const hoyDow = retoDiaSemana(retoFecha);
  const semana = [1, 2, 3, 4, 5, 6, 0].map(n => `<div class="px-3.5 py-2.5 ${n === hoyDow ? 'bg-emerald-50' : ''}">
    <p class="text-sm font-bold text-slate-800">${RETO_SEMANA[n].nombre}${n === hoyDow ? ' <span class="text-xs font-semibold text-emerald-600">· hoy</span>' : ''}</p>
    <div class="mt-1 space-y-0.5">${RETO_MENU[n].map((t, i) => `<p class="text-sm text-slate-600"><span class="text-xs font-bold text-slate-400">${RETO_COMIDAS[i]}:</span> ${escapeHTML(t)}</p>`).join('')}</div></div>`).join('');
  const guia = RETO_GUIA.map(g => `<div class="px-3.5 py-2.5">
    <div class="flex items-baseline justify-between gap-2"><p class="text-sm font-semibold text-slate-800">${escapeHTML(g[0])}</p><p class="text-sm font-bold text-emerald-700 shrink-0">${escapeHTML(g[2])}</p></div>
    <p class="text-xs text-slate-500">${escapeHTML(g[1])} · ${escapeHTML(g[3])}</p></div>`).join('');
  return `
    <section class="space-y-2">
      <h2 class="text-xs font-bold text-slate-400 uppercase tracking-wider px-1">Ideas para la semana</h2>
      <p class="text-xs text-slate-500 px-1">Comidas normales y fáciles. Son ejemplos: cámbialas por lo que te apetezca siguiendo la regla del plato.</p>
      <div class="bg-white rounded-2xl border border-slate-200 shadow-sm divide-y divide-slate-100 overflow-hidden">${semana}</div>
    </section>
    <section class="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-2">
      <h2 class="text-sm font-bold text-slate-800">🍽️ Regla del plato (en cada comida)</h2>
      <ol class="text-sm text-slate-700 space-y-1 list-decimal list-inside">
        <li><b>1 ración de proteína</b> de la guía</li>
        <li><b>1 puño de hidrato:</b> arroz, pasta, patata o pan</li>
        <li><b>Verdura o ensalada</b> libre</li>
        <li><b>Un chorro de aceite de oliva</b> o un puñado de frutos secos</li>
        <li><b>Fruta</b></li>
      </ol>
      <p class="text-xs text-slate-500">Con 4 comidas así rondas tus 2.600–2.800 kcal sin contar nada. Los días que entrenas fuerte, sírvete más hidrato; los días tranquilos, menos.</p>
    </section>
    <section class="space-y-2">
      <h2 class="text-xs font-bold text-slate-400 uppercase tracking-wider px-1">Guía de proteínas (elige libre)</h2>
      <p class="text-xs text-slate-500 px-1">Una ración = una de estas opciones, unos 150 g de proteína al día con una ración en cada comida. Varía y no repitas la misma fuente más de 1–2 veces.</p>
      <div class="bg-white rounded-2xl border border-slate-200 shadow-sm divide-y divide-slate-100 overflow-hidden">${guia}</div>
      <p class="text-xs text-slate-500 px-1"><b>Reparto fácil de un día:</b> carne o pescado en la comida, carne o pescado distinto en la cena, y huevos o lácteos en desayuno y merienda. Así llegas sin pesar nada.</p>
      <p class="text-xs text-slate-500 px-1"><b>En la semana, a ojo:</b> 2–3 días pescado (1–2 de pescado azul), 2–3 días carne blanca, 1 día carne roja, 2 días legumbre. Huevos y lácteos, los días que quieras.</p>
    </section>
    <section class="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-2">
      <h2 class="text-sm font-bold text-slate-800">⚖️ La báscula es tu cuenta de calorías</h2>
      <p class="text-xs text-slate-500">No hace falta contar calorías a diario. Pésate 1 vez por semana, el mismo día en ayunas, y mira la media.</p>
      <div class="divide-y divide-slate-100 text-sm">
        <div class="py-2"><b>Se mantiene:</b> perfecto, no cambies nada.</div>
        <div class="py-2"><b>Baja:</b> te quedas corto. Sube a 2 puños de hidrato en las comidas y añade frutos secos o una tostada con aceite.</div>
        <div class="py-2"><b>Sube más de 0,5 kg/semana:</b> baja un poco el hidrato en las cenas.</div>
      </div>
    </section>`;
}
