'use strict';

// ---------------- RETO: cómo se hace cada ejercicio + consejos ----------------
// Se enlaza por el nombre exacto del ejercicio de RETO_RUTINAS.
const RETO_TECNICA = {
  'Jalón al pecho con banda': {
    musculos: 'Espalda (dorsales), bíceps y parte trasera del hombro',
    pasos: [
      'Ancla la banda en lo alto: encima de una puerta (con el nudo o tope por el otro lado, puerta cerrada) o en una barra o rama del parque.',
      'Arrodíllate o siéntate debajo, agarra la banda con las manos algo más abiertas que los hombros.',
      'Pecho alto y hombros hacia atrás y abajo, sin encogerlos hacia las orejas.',
      'Tira llevando los codos hacia las costillas hasta que las manos queden a la altura de la barbilla o el pecho.',
      'Sube despacio (3 s) sin soltar de golpe.'
    ],
    errores: ['Tirar con los brazos y encoger los hombros: piensa en llevar los codos al bolsillo.', 'Echar el cuerpo hacia atrás para ayudarte.', 'Soltar la banda de golpe al subir.'],
    tip: 'Sustituye a las dominadas, así no necesitas barra en casa. Empieza con la amarilla (20 kg); cuando hagas 3 × 20 fácil, pasa a la naranja (30 kg) o agárrala más cerca del anclaje.',
    buscar: 'jalón al pecho con banda elástica puerta'
  },
  'Aperturas hacia atrás con banda': {
    musculos: 'Parte trasera del hombro y entre los omóplatos (postura)',
    pasos: [
      'De pie, agarra la banda con las dos manos a la altura del pecho, brazos estirados al frente.',
      'Con los brazos casi rectos, ábrelos hacia los lados estirando la banda.',
      'Junta los omóplatos al final y aguanta 1 segundo.',
      'Vuelve despacio a la posición inicial.'
    ],
    errores: ['Subir los hombros hacia las orejas.', 'Arquear la espalda para ayudarte.', 'Usar una banda tan dura que no puedas controlar la vuelta.'],
    tip: 'Es un ejercicio suave pero muy útil para la postura si pasas horas sentado. Mejor muchas repeticiones limpias. Usa la amarilla (20 kg) agarrándola más abierta o más cerrada para ajustar la dureza; las minibandas son demasiado cortas para esto.',
    buscar: 'band pull apart técnica'
  },
  'Sentadilla goblet con mancuerna': {
    musculos: 'Piernas (cuádriceps y glúteos) y abdomen',
    pasos: [
      'Sujeta una mancuerna en vertical contra el pecho, con las dos manos y los codos hacia abajo.',
      'Pies un poco más abiertos que los hombros, con las puntas ligeramente hacia fuera.',
      'Baja sentándote hacia atrás y abajo, con el pecho alto y la espalda recta.',
      'Baja hasta que los muslos queden paralelos al suelo, o hasta donde mantengas la espalda recta.',
      'Sube empujando el suelo con todo el pie.'
    ],
    errores: ['Las rodillas se van hacia dentro: empújalas hacia fuera, en línea con los pies.', 'Se levantan los talones: reparte el peso en todo el pie.', 'Se redondea la zona lumbar al bajar: baja menos.'],
    tip: 'Con banda: pisa la naranja (30 kg) con los dos pies y sujétala a la altura de los hombros, o ponte una miniband por encima de las rodillas y empuja las rodillas hacia fuera (trabaja más el glúteo); añade tensión arriba cuando la mancuerna se te quede corta. Baja en 2–3 segundos y sube con fuerza. Si te cuesta saber hasta dónde bajar, pon una silla detrás y roza el asiento con los glúteos.',
    buscar: 'sentadilla goblet técnica'
  },
  'Flexiones (pies elevados cuando sean fáciles)': {
    musculos: 'Pecho, hombros, tríceps y abdomen',
    pasos: [
      'Manos en el suelo, un poco más abiertas que los hombros, y cuerpo en línea recta de la cabeza a los talones.',
      'Aprieta glúteos y abdomen para que la cadera no se caiga.',
      'Baja el pecho hasta casi tocar el suelo, con los codos a unos 45° del cuerpo (no abiertos en cruz).',
      'Sube estirando los brazos sin perder la línea recta.'
    ],
    errores: ['La cadera cae o sube: mantén el cuerpo como una tabla.', 'Los codos van muy abiertos: fuerzan el hombro.', 'Recorrido corto: baja hasta casi tocar el suelo.'],
    tip: 'Con banda: pasa la amarilla (20 kg) por la espalda y sujétala con las manos; así la subida cuesta más. Si no llegas a las repeticiones, apoya las manos en un banco o un sofá. Cuando te resulten fáciles, eleva los pies. En «máximo», para cuando la técnica se rompa; no sigas con repeticiones feas.',
    buscar: 'flexiones técnica correcta'
  },
  'Remo con mancuerna a una mano': {
    musculos: 'Espalda (dorsal), parte trasera del hombro y bíceps',
    pasos: [
      'Apoya una mano y la rodilla del mismo lado en un banco o una silla firme; el otro pie en el suelo.',
      'Espalda plana, casi paralela al suelo, y la mancuerna colgando con el brazo estirado.',
      'Tira del codo hacia la cadera (no hacia el techo) juntando la escápula.',
      'Baja despacio, en 2 segundos, hasta estirar el brazo.'
    ],
    errores: ['Girar el tronco para subir el peso: mantén los hombros paralelos al suelo.', 'Tirar con la mano en vez de con el codo.', 'Encoger el hombro hacia la oreja.'],
    tip: 'Imagina que llevas el codo al bolsillo trasero del pantalón. Haz una pausa de 1 segundo arriba.',
    buscar: 'remo con mancuerna a una mano técnica'
  },
  'Zancadas hacia atrás': {
    musculos: 'Piernas (cuádriceps y glúteos)',
    pasos: [
      'De pie, con una mancuerna en cada mano a los lados del cuerpo.',
      'Da un paso largo hacia atrás con una pierna.',
      'Baja la rodilla de atrás hacia el suelo sin tocarlo; la rodilla de delante queda sobre el tobillo y el tronco erguido.',
      'Empuja con el talón de la pierna de delante para volver a la posición inicial.',
      'Haz todas las repeticiones con una pierna y luego con la otra, o ve alternando.'
    ],
    errores: ['Paso demasiado corto: la rodilla de delante se pasa de los dedos del pie.', 'La rodilla de delante se va hacia dentro.', 'Inclinar el tronco hacia delante.'],
    tip: 'Es más fácil de equilibrar que la zancada hacia delante y cuida más las rodillas. Si pierdes el equilibrio, apóyate con una mano en una pared o una silla.',
    buscar: 'zancada hacia atrás con mancuernas técnica'
  },
  'Plancha': {
    musculos: 'Abdomen, glúteos y hombros',
    pasos: [
      'Apoya los antebrazos en el suelo con los codos justo debajo de los hombros.',
      'Cuerpo en línea recta de la cabeza a los talones; mira al suelo.',
      'Aprieta glúteos y abdomen, como si fueras a recibir un golpe.',
      'Respira con normalidad mientras aguantas.'
    ],
    errores: ['La cadera cae (se carga la lumbar) o sube demasiado.', 'Aguantar la respiración.', 'Hombros hacia las orejas.'],
    tip: 'Importa más la calidad que el tiempo: si la cadera se cae, para y descansa. Si hace falta, apoya las rodillas.',
    buscar: 'plancha abdominal técnica'
  },
  'Peso muerto rumano con mancuernas': {
    musculos: 'Parte trasera del muslo (isquios), glúteos y espalda baja',
    pasos: [
      'De pie, con las mancuernas delante de los muslos y los pies a la anchura de la cadera.',
      'Rodillas ligeramente flexionadas y fijas: no las muevas durante todo el ejercicio.',
      'Empuja la cadera hacia atrás, como si cerraras una puerta con el culo, y baja las mancuernas pegadas a las piernas con la espalda recta.',
      'Baja hasta notar la tensión en la parte de atrás de los muslos (suele ser por debajo de las rodillas).',
      'Sube apretando los glúteos y llevando la cadera hacia delante.'
    ],
    errores: ['Redondear la espalda: baja menos y mantén el pecho alto.', 'Doblar las rodillas hasta hacer una sentadilla.', 'Las mancuernas se alejan de las piernas.', 'Echar el cuerpo hacia atrás al subir.'],
    tip: 'Con banda: pisa la naranja (30 kg) y agárrala junto a las mancuernas para sumar resistencia al subir. Mira un punto del suelo a unos 2 metros. Si notas la espalda baja, reduce el recorrido y el peso: lo que debe trabajar es la parte de atrás del muslo.',
    buscar: 'peso muerto rumano con mancuernas técnica'
  },
  'Remo inclinado con dos mancuernas': {
    musculos: 'Espalda (dorsal y zona media), hombro trasero y bíceps',
    pasos: [
      'Pies a la anchura de los hombros y rodillas algo flexionadas.',
      'Inclina el tronco hacia delante, unos 45°, con la espalda plana y llevando la cadera hacia atrás.',
      'Deja las mancuernas colgando bajo los hombros.',
      'Tira de los dos codos hacia atrás y hacia las caderas, juntando las escápulas.',
      'Baja controlado, en 2 segundos.'
    ],
    errores: ['Redondear la espalda.', 'Subir el tronco para ayudarte a levantar el peso.', 'Encoger los hombros.'],
    tip: 'Cuello neutro: mira al suelo, un poco por delante de tus pies. Aprieta la espalda arriba durante 1 segundo.',
    buscar: 'remo inclinado con mancuernas técnica'
  },
  'Press de hombro con mancuernas': {
    musculos: 'Hombros y tríceps',
    pasos: [
      'De pie o sentado, con las mancuernas a la altura de los hombros y los codos algo por delante.',
      'Aprieta abdomen y glúteos para no arquear la espalda.',
      'Empuja hacia arriba hasta casi estirar los brazos sobre la cabeza.',
      'Baja controlado hasta la altura de los hombros.'
    ],
    errores: ['Arquear la zona lumbar al empujar.', 'Ayudarte con las piernas.', 'Bajar de golpe.'],
    tip: 'Con banda: pisa la amarilla (20 kg) y empuja con ella a la vez que las mancuernas para sumar tensión arriba. Si arqueas la espalda, siéntate con respaldo o baja el peso. El hombro se carga con poco peso: sube en saltos pequeños (1 kg).',
    buscar: 'press de hombros con mancuernas técnica'
  },
  'Fondos en banco o paralelas': {
    musculos: 'Tríceps, pecho y hombro delantero',
    pasos: [
      'Apoya las manos en el borde de un banco o una silla firme detrás de ti, con los dedos hacia delante.',
      'Piernas estiradas (más fácil: rodillas dobladas, con los pies cerca).',
      'Baja doblando los codos hacia atrás hasta unos 90°, con la espalda cerca del banco.',
      'Sube estirando los codos sin encoger los hombros.'
    ],
    errores: ['Codos abiertos hacia los lados.', 'Bajar demasiado: molesta el hombro por delante.', 'Hombros hacia las orejas.'],
    tip: 'Asegúrate de que la silla o el banco no se mueven (contra una pared). Si te molesta el hombro, reduce el recorrido o haz flexiones con las manos juntas en su lugar.',
    buscar: 'fondos de tríceps en banco técnica'
  },
  'Elevaciones de piernas tumbado': {
    musculos: 'Abdomen inferior y flexores de cadera',
    pasos: [
      'Túmbate boca arriba con las manos bajo los glúteos o a los lados.',
      'Pega la zona lumbar al suelo.',
      'Sube las piernas estiradas (o con las rodillas ligeramente flexionadas) hasta que queden en vertical.',
      'Baja despacio, sin tocar el suelo con los talones.'
    ],
    errores: ['Arquear la zona lumbar al bajar.', 'Balancear las piernas con impulso.', 'Bajar de golpe.'],
    tip: 'Si la lumbar se despega del suelo, flexiona las rodillas o baja solo hasta donde la mantengas pegada. Lento y controlado vale más que muchas repeticiones.',
    buscar: 'elevaciones de piernas tumbado técnica'
  }
};

const RETO_CONSEJOS_GENERALES = [
  ['Técnica primero', 'Haz bien cada repetición antes de subir peso. Si la técnica se rompe, la serie ha terminado.'],
  ['Respiración', 'Echa el aire al hacer el esfuerzo (al subir en la sentadilla, al empujar en el press) y coge aire al bajar. No aguantes la respiración.'],
  ['Ritmo', 'Baja en 2–3 segundos y sube de forma controlada. Sin rebotes ni impulsos.'],
  ['Repeticiones en reserva', 'En la mayoría de series termina con 1–2 repeticiones «en el tanque». En los ejercicios marcados «al fallo», llega hasta donde no puedas hacer una más con buena técnica.'],
  ['Cuándo subir peso', 'Cuando llegues al máximo del rango de repeticiones (por ejemplo 20) en todas las series, la app te avisa de que toca subir.'],
  ['Calentamiento', 'Haz 5–8 minutos de movilidad (hombros, caderas) y, en el primer ejercicio, una serie de aproximación con la mitad del peso.'],
  ['Descansos', 'Respeta los tiempos que marca cada ejercicio: es lo que permite repetir bien la siguiente serie.'],
  ['Semana de descarga', 'Cada cuarta semana haces la mitad de series con menos peso. No es perder el tiempo: es cuando el cuerpo asimila el trabajo.'],
  ['Molestia o dolor', 'Quemazón o cansancio muscular es normal. Un dolor agudo o en una articulación (rodilla, hombro, lumbar) no lo es: para, baja el peso o cambia el ejercicio. Si persiste, consulta con un profesional.'],
  ['Tus bandas',  'Con las bandas amarilla (20 kg) y naranja (30 kg) haces el jalón y las aperturas, y puedes sumarlas a sentadilla, peso muerto, press y flexiones cuando las mancuernas se queden cortas (mira «Con banda» en cada ejercicio). Las minibandas (5–7 kg) sirven para activar glúteos: ponlas por encima de las rodillas en sentadilla y zancadas. Si entrenas en la calle, la banda sustituye a la mancuerna.'],
  ['Constancia', 'Lo que da resultado es cumplir las semanas, no una sesión perfecta. Mejor una sesión algo corta que ninguna.']
];

function retoTecnicaHTML(nombre) {
  const t = RETO_TECNICA[nombre];
  if (!t) return '';
  const li = a => a.map(x => `<li>${escapeHTML(x)}</li>`).join('');
  return `<div class="rounded-xl bg-slate-50 border border-slate-200 px-3 py-3 space-y-2.5 text-sm text-slate-700">
    <p class="text-xs text-slate-500">Trabaja: <b class="text-slate-700">${escapeHTML(t.musculos)}</b></p>
    <div><p class="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Cómo se hace</p>
      <ol class="list-decimal list-inside space-y-1">${li(t.pasos)}</ol></div>
    <div><p class="text-xs font-bold text-rose-500 uppercase tracking-wide mb-1">Errores típicos</p>
      <ul class="list-disc list-inside space-y-1">${li(t.errores)}</ul></div>
    <div class="rounded-lg bg-emerald-50 border border-emerald-200 px-2.5 py-2"><p class="text-xs font-bold text-emerald-700">💡 Consejo</p><p class="text-xs text-emerald-900 mt-0.5">${escapeHTML(t.tip)}</p></div>
    <a href="https://www.youtube.com/results?search_query=${encodeURIComponent(t.buscar)}" target="_blank" rel="noopener" class="inline-block text-xs font-semibold text-sky-700 underline">Buscar un vídeo de este ejercicio ↗</a>
  </div>`;
}

function retoHTMLConsejos() {
  const generales = RETO_CONSEJOS_GENERALES.map(c => `<div class="px-3.5 py-2.5"><p class="text-sm font-semibold text-slate-800">${escapeHTML(c[0])}</p><p class="text-xs text-slate-500 mt-0.5">${escapeHTML(c[1])}</p></div>`).join('');
  const ejercicios = Object.keys(RETO_TECNICA).map(n => `<details class="px-3.5 py-2.5"><summary class="text-sm font-semibold text-slate-800 cursor-pointer">${escapeHTML(n)}</summary><div class="mt-2">${retoTecnicaHTML(n)}</div></details>`).join('');
  return `
    <section class="space-y-2"><h2 class="text-xs font-bold text-slate-400 uppercase tracking-wider px-1">Consejos para entrenar</h2>
      <div class="bg-white rounded-2xl border border-slate-200 shadow-sm divide-y divide-slate-100 overflow-hidden">${generales}</div></section>
    <section class="space-y-2"><h2 class="text-xs font-bold text-slate-400 uppercase tracking-wider px-1">Cómo se hace cada ejercicio</h2>
      <div class="bg-white rounded-2xl border border-slate-200 shadow-sm divide-y divide-slate-100 overflow-hidden">${ejercicios}</div></section>`;
}
