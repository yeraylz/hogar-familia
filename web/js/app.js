
'use strict';

/* ============================================================
   Utilidades comunes
   ============================================================ */

const API = {
  async request(url, options = {}) {
    const response = await fetch(url, {
      ...options,
      headers: {
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(options.headers || {})
      }
    });

    if (response.status === 401 && typeof mostrarPantallaLogin === 'function' && !url.startsWith('/me') && document.getElementById('pantalla-login').classList.contains('hidden')) {
      // Sesión caducada o inexistente: se vuelve a la pantalla de login.
      mostrarPantallaLogin();
    }

    if (!response.ok) {
      const message = await response.text().catch(() => '');
      throw new Error(message || `HTTP ${response.status}`);
    }

    const contentType = response.headers.get('content-type') || '';
    return contentType.includes('application/json')
      ? response.json()
      : null;
  },

  get(url) {
    return this.request(url);
  },

  // Las mutaciones (POST/PUT/DELETE) se encolan en IndexedDB cuando no hay
  // red, para sincronizarse solas en cuanto vuelva la conexión.
  async mutar(method, url, data) {
    const options = { method, body: data !== undefined ? JSON.stringify(data) : undefined };

    if (!navigator.onLine) {
      await ColaOffline.encolar({ method, url, body: options.body });
      return { success: true, offline: true };
    }
    try {
      return await this.request(url, options);
    } catch (err) {
      if (err instanceof TypeError) {
        // Fallo real de red (no un error de validación del servidor): se encola.
        await ColaOffline.encolar({ method, url, body: options.body });
        return { success: true, offline: true };
      }
      throw err;
    }
  },

  post(url, data) {
    return this.mutar('POST', url, data);
  },

  put(url, data) {
    return this.mutar('PUT', url, data);
  },

  delete(url) {
    return this.mutar('DELETE', url);
  }
};

function hoyLocalISO() {
  const ahora = new Date();
  const year = ahora.getFullYear();
  const month = String(ahora.getMonth() + 1).padStart(2, '0');
  const day = String(ahora.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function escapeHTML(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function mostrarError(contexto, error) {
  console.error(contexto, error);
  alert(`No se pudo completar la operación.\n\n${error.message || error}`);
}

function actualizarContador(texto) {
  const contador = document.getElementById('contador-general');
  if (contador) contador.textContent = texto;
}

let calendar = null;
    let moduloActual = 'hoy';
    const COLORES_SUPERMERCADO = {
      'Lidl': 'bg-amber-50 text-amber-700 border-amber-200',
      'Mercadona': 'bg-emerald-50 text-emerald-700 border-emerald-200',
      'Carrefour': 'bg-sky-50 text-sky-700 border-sky-200',
      'Alcampo': 'bg-rose-50 text-rose-700 border-rose-200',
      'Eroski': 'bg-indigo-50 text-indigo-700 border-indigo-200'
    };
    function colorSupermercado(nombre) {
      return COLORES_SUPERMERCADO[nombre] || 'bg-slate-100 text-slate-600 border-slate-200';
    }
    let eventoSeleccionadoId = null;
    let eventosCache = [];

    // --- Festivos de Madrid ---
    // Calendarios oficiales ya publicados (se pueden añadir años aquí: [mes-día, nombre]).
    // Para cualquier otro año se calculan los festivos fijos y la Semana Santa; esos años
    // pueden diferir del calendario oficial (traslados por caer en domingo, San José...).
    const FESTIVOS_OFICIALES = {
      2026: [
        ['01-01', '🎉 Año Nuevo'], ['01-06', '👑 Reyes Magos'], ['04-02', '✝️ Jueves Santo'], ['04-03', '✝️ Viernes Santo'],
        ['05-01', '🛠️ Día del Trabajo'], ['05-02', '🏛️ Día Com. Madrid'], ['05-15', '🌾 San Isidro (Madrid)'],
        ['07-25', '⚔️ Santiago Apóstol'], ['08-15', '🕊️ Asunción Virgen'], ['10-12', '🇪🇸 Fiesta Nacional'],
        ['11-02', '💐 Todos los Santos'], ['11-09', '👑 La Almudena (Madrid)'], ['12-06', '📜 Constitución'],
        ['12-08', '✨ Inmaculada'], ['12-25', '🎄 Navidad']
      ],
      2027: [
        ['01-01', '🎉 Año Nuevo'], ['01-06', '👑 Reyes Magos'], ['03-19', '🔨 San José'], ['03-25', '✝️ Jueves Santo'],
        ['03-26', '✝️ Viernes Santo'], ['05-15', '🌾 San Isidro (Madrid)'], ['08-16', '🕊️ Asunción Virgen (trasladado)'],
        ['10-12', '🇪🇸 Fiesta Nacional'], ['11-01', '💐 Todos los Santos'], ['11-09', '👑 La Almudena (Madrid)'],
        ['12-06', '📜 Constitución'], ['12-08', '✨ Inmaculada'], ['12-25', '🎄 Navidad']
      ]
    };

    // Domingo de Pascua (algoritmo gregoriano de Meeus/Jones/Butcher).
    function domingoPascua(anio) {
      const a = anio % 19, b = Math.floor(anio / 100), c = anio % 100;
      const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
      const g = Math.floor((b - f + 1) / 3);
      const h = (19 * a + b - d - g + 15) % 30;
      const i = Math.floor(c / 4), k = c % 4;
      const l = (32 + 2 * e + 2 * i - h - k) % 7;
      const m = Math.floor((a + 11 * h + 22 * l) / 451);
      const mes = Math.floor((h + l - 7 * m + 114) / 31);
      const dia = ((h + l - 7 * m + 114) % 31) + 1;
      return `${anio}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
    }

    function festivosMadrid(anio) {
      let lista = FESTIVOS_OFICIALES[anio];
      if (!lista) {
        const pascua = domingoPascua(anio);
        const mmdd = (iso) => iso.slice(5);
        lista = [
          ['01-01', '🎉 Año Nuevo'], ['01-06', '👑 Reyes Magos'],
          [mmdd(sumarDiasISO(pascua, -3)), '✝️ Jueves Santo'], [mmdd(sumarDiasISO(pascua, -2)), '✝️ Viernes Santo'],
          ['05-01', '🛠️ Día del Trabajo'], ['05-02', '🏛️ Día Com. Madrid'], ['05-15', '🌾 San Isidro (Madrid)'],
          ['08-15', '🕊️ Asunción Virgen'], ['10-12', '🇪🇸 Fiesta Nacional'], ['11-01', '💐 Todos los Santos'],
          ['11-09', '👑 La Almudena (Madrid)'], ['12-06', '📜 Constitución'], ['12-08', '✨ Inmaculada'], ['12-25', '🎄 Navidad']
        ];
      }
      return lista.map(([mmdd, titulo]) => ({
        start: `${anio}-${mmdd}`, title: titulo, allDay: true,
        backgroundColor: '#e11d48', borderColor: '#e11d48', extendedProps: { isFestivo: true }
      }));
    }

    document.addEventListener('DOMContentLoaded', () => {
      aplicarIconoModoOscuro();
      registrarServiceWorker();
      comprobarPermisosNotif();
      document.getElementById('fecha-evento').value = hoyLocalISO();
      const elemFechaPago = document.getElementById('fecha-pago');
      if (elemFechaPago) elemFechaPago.value = hoyLocalISO();
      
      if (window.RETO_APP) cambiarModulo('reto');
      else cargarDashboardHoy();
    });

    function cambiarModulo(modulo) {
      moduloActual = modulo;
      const mHoy = document.getElementById('modulo-hoy');
      const mCompra = document.getElementById('modulo-compra');
      const mTareas = document.getElementById('modulo-tareas');
      const mCal = document.getElementById('modulo-calendario');
      const mPagos = document.getElementById('modulo-pagos');
      const mMas = document.getElementById('modulo-mas');
      const mDocumentos = document.getElementById('modulo-documentos');
      const mCole = document.getElementById('modulo-cole');
      const mEnlaces = document.getElementById('modulo-enlaces');
      const mReto = document.getElementById('modulo-reto');
      const mActividad = document.getElementById('modulo-actividad');
      const mSistema = document.getElementById('modulo-sistema');
      const mMisCosas = document.getElementById('modulo-mis-cosas');

      const tabHoy = document.getElementById('tab-hoy');
      const tabCompra = document.getElementById('tab-compra');
      const tabTareas = document.getElementById('tab-tareas');
      const tabCal = document.getElementById('tab-calendario');
      const tabPagos = document.getElementById('tab-pagos');
      const tabMas = document.getElementById('tab-mas');
      const titulo = document.getElementById('titulo-modulo');

      const claseInactiva = 'flex flex-col items-center justify-center gap-0.5 py-1.5 rounded-lg text-slate-500 hover:text-slate-900 transition-all';
      const claseActiva = 'flex flex-col items-center justify-center gap-0.5 py-1.5 rounded-lg bg-white shadow-sm text-slate-900 transition-all';

      [tabHoy, tabCompra, tabTareas, tabCal, tabPagos, tabMas].forEach(t => t.className = claseInactiva);
      [mHoy, mCompra, mTareas, mCal, mPagos, mMas, mDocumentos, mCole, mEnlaces, mReto, mActividad, mSistema, mMisCosas].forEach(m => m.classList.add('hidden'));

      if (modulo === 'hoy') {
        mHoy.classList.remove('hidden');
        tabHoy.className = claseActiva;
        titulo.textContent = 'Hoy';
        cargarDashboardHoy();
      } else if (modulo === 'compra') {
        mCompra.classList.remove('hidden');
        tabCompra.className = claseActiva;
        titulo.textContent = 'Lista de la Compra';
        cargarLista();
      } else if (modulo === 'tareas') {
        mTareas.classList.remove('hidden');
        tabTareas.className = claseActiva;
        titulo.textContent = 'Tareas del Hogar';
        cargarTareas();
      } else if (modulo === 'calendario') {
        mCal.classList.remove('hidden');
        tabCal.className = claseActiva;
        titulo.textContent = 'Calendario Familiar';
        setTimeout(() => inicializarCalendario(), 50);
      } else if (modulo === 'pagos') {
        mPagos.classList.remove('hidden');
        tabPagos.className = claseActiva;
        titulo.textContent = 'Dinero';
        cargarPagos();
        aplicarPestanaPagos();
      } else if (modulo === 'mas') {
        mMas.classList.remove('hidden');
        tabMas.className = claseActiva;
        titulo.textContent = 'Más';
        cargarAjustesMas();
      } else if (modulo === 'documentos') {
        mDocumentos.classList.remove('hidden');
        tabMas.className = claseActiva;
        titulo.textContent = 'Documentación';
        cargarDocumentos();
      } else if (modulo === 'cole') {
        mCole.classList.remove('hidden');
        tabMas.className = claseActiva;
        titulo.textContent = 'Cole';
        cargarMenuCole();
      } else if (modulo === 'reto') {
        mReto.classList.remove('hidden');
        tabMas.className = claseActiva;
        titulo.textContent = 'Reto';
        retoFecha = hoyLocalISO();
        cargarReto();
      } else if (modulo === 'enlaces') {
        mEnlaces.classList.remove('hidden');
        tabMas.className = claseActiva;
        titulo.textContent = 'Enlaces';
        cargarEnlaces();
      } else if (modulo === 'actividad') {
        mActividad.classList.remove('hidden');
        tabMas.className = claseActiva;
        titulo.textContent = 'Actividad';
        cargarActividad();
      } else if (modulo === 'sistema') {
        mSistema.classList.remove('hidden');
        tabMas.className = claseActiva;
        titulo.textContent = 'Copias y red';
        cargarSistema();
      } else if (modulo === 'mis-cosas') {
        mMisCosas.classList.remove('hidden');
        tabMas.className = claseActiva;
        titulo.textContent = 'Mis cosas';
        if (typeof misCosasAbrir === 'function') misCosasAbrir();
      }
    }

    // --- DASHBOARD "HOY" ---
    async function cargarDashboardHoy() {
      const hoy = hoyLocalISO();
      if (typeof pintarFamiliaHoy === 'function') pintarFamiliaHoy();
      const contador = document.getElementById('contador-general');
      const contAlertas = document.getElementById('hoy-alertas');
      const contEventos = document.getElementById('hoy-eventos');
      const contTareas = document.getElementById('hoy-tareas');
      const contProximos = document.getElementById('hoy-proximos');
      const contCompra = document.getElementById('hoy-compra');

      const [eventos, pagos, tareas, compra] = await Promise.allSettled([
        API.get('/eventos'), API.get('/pagos'), API.get('/tareas'), API.get('/compra')
      ]);

      // --- 1) Avisos urgentes (solo aparecen si hay algo): sin cole hoy/mañana y pagos vencidos ---
      let alertas = '';
      if (eventos.status === 'fulfilled') {
        const sinCole = eventos.value.filter(e => /sin cole/i.test(e.title || ''));
        [['Hoy', hoy], ['Mañana', sumarDiasISO(hoy, 1)]].forEach(([cuando, dia]) => {
          sinCole.filter(e => eventoCubreDia(e, dia)).forEach(e => {
            alertas += `<div class="flex items-center gap-3 p-3 bg-amber-50 border border-amber-200 rounded-2xl">
              <span class="text-xl">🏫</span>
              <p class="text-sm font-semibold text-amber-800">${cuando}: ${escapeHTML((e.title || '').replace('🏫', '').trim())}${e.descripcion ? ' <span class="font-normal text-xs">(' + escapeHTML(e.descripcion.split(' · ')[0]) + ')</span>' : ''}</p>
            </div>`;
          });
        });
      }
      if (pagos.status === 'fulfilled') {
        pagos.value.filter(p => !p.pagado && p.fecha <= hoy).sort((a, b) => a.fecha.localeCompare(b.fecha)).forEach(p => {
          const vencido = p.fecha < hoy;
          alertas += `
            <div class="flex items-center justify-between p-3 bg-rose-50/60 border border-rose-300 rounded-2xl shadow-sm">
              <div class="flex items-center gap-3 min-w-0">
                <div class="w-9 h-9 rounded-xl bg-fuchsia-50 text-fuchsia-600 flex items-center justify-center text-sm font-bold shrink-0">€</div>
                <div class="min-w-0">
                  <p class="text-sm font-semibold text-slate-800 truncate">${escapeHTML(p.nombre)}</p>
                  <span class="text-[10px] font-semibold px-2 py-0.5 bg-rose-100 text-rose-700 rounded-md">
                    ${vencido ? '⚠️ Vencido' : '📅 Vence hoy'} ${formatearFechaCorta(p.fecha)} · ${formatearImporte(p.importe)} €
                  </span>
                </div>
              </div>
              <button onclick="marcarPagoRealizado(${p.id}).then(cargarDashboardHoy)" class="p-2 text-slate-400 hover:text-emerald-600 shrink-0" title="Marcar como pagado">✓</button>
            </div>`;
        });
      }
      contAlertas.innerHTML = alertas;
      contAlertas.hidden = !alertas;

      // --- 2) Hoy en el calendario (incluye eventos repetidos y los de varios días que cubren hoy) ---
      if (eventos.status === 'fulfilled') {
        const deHoy = eventos.value.filter(e => eventoCubreDia(e, hoy))
          .sort((a, b) => (a.hora_inicio || '').localeCompare(b.hora_inicio || ''));
        contEventos.innerHTML = `<h2 class="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 px-1">📅 Hoy en el calendario</h2>`;
        if (deHoy.length === 0) {
          contEventos.innerHTML += `<div class="text-center py-4 border border-dashed border-slate-200 rounded-2xl"><p class="text-slate-400 text-sm">Sin eventos para hoy 🙌</p></div>`;
        } else {
          deHoy.forEach(e => {
            const hora = e.hora_inicio ? `${e.hora_inicio}${e.hora_fin ? ' - ' + e.hora_fin : ''}` : 'Todo el día';
            contEventos.innerHTML += `
              <div class="flex items-center gap-3 p-3 bg-white border border-slate-200 rounded-2xl shadow-sm mb-2">
                <div class="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center text-sm font-bold shrink-0">📅</div>
                <div class="flex-grow">
                  <p class="text-sm font-semibold text-slate-800">${e.repeticion === 'anual' ? '🎂 ' : ''}${escapeHTML(tituloConEdad(e, hoy))}</p>
                  <div class="flex flex-wrap gap-1 mt-0.5">
                    <span class="text-[10px] font-semibold px-2 py-0.5 bg-slate-100 text-slate-600 rounded-md">🕒 ${escapeHTML(hora)}</span>
                    ${e.persona ? `<span class="text-[10px] font-semibold px-2 py-0.5 bg-indigo-50 text-indigo-600 rounded-md">${escapeHTML(e.persona)}</span>` : ''}
                  </div>
                </div>
              </div>`;
          });
        }
      }

      // --- 3) Tareas pendientes (hoy o vencidas; las de fecha futura no cuentan aquí) ---
      if (tareas.status === 'fulfilled') {
        const pendientes = tareas.value.filter(t => !t.completada && (!t.fecha || t.fecha <= hoy)).sort((a, b) => (b.prioridad || 0) - (a.prioridad || 0));
        contTareas.innerHTML = `<h2 class="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 px-1">✅ Tareas pendientes (${pendientes.length})</h2>`;
        if (pendientes.length === 0) {
          contTareas.innerHTML += `<div class="text-center py-4 border border-dashed border-slate-200 rounded-2xl"><p class="text-slate-400 text-sm">Todo ordenado 🎉</p></div>`;
        } else {
          pendientes.slice(0, 5).forEach(t => {
            contTareas.innerHTML += `
              <div class="flex items-center gap-3 p-3 bg-white border border-slate-200 rounded-2xl shadow-sm mb-2 cursor-pointer" onclick="toggleTarea(${t.id}, true).then(cargarDashboardHoy)">
                <div class="w-6 h-6 rounded-lg border border-slate-300 shrink-0"></div>
                <div class="flex-grow">
                  <p class="text-sm font-medium text-slate-800">${escapeHTML(t.titulo)}</p>
                  <span class="text-[10px] font-semibold px-2 py-0.5 bg-indigo-50 text-indigo-600 rounded-md">${escapeHTML(t.asignado_a)}</span>
                </div>
              </div>`;
          });
          if (pendientes.length > 5) {
            contTareas.innerHTML += `<button onclick="cambiarModulo('tareas')" class="text-xs font-semibold text-fuchsia-600 px-1">Ver las ${pendientes.length - 5} restantes →</button>`;
          }
        }
      }

      // --- 4) Próximos días: eventos, cumpleaños (30 días), tareas con fecha y pagos de la semana ---
      const proximos = [];
      if (eventos.status === 'fulfilled') {
        eventos.value.forEach(e => {
          if (e.repeticion === 'anual') {
            const f = fechasOcurrencia(e, sumarDiasISO(hoy, 1), sumarDiasISO(hoy, 31))[0];
            if (f) proximos.push({ f, h: '', icono: '🎂', texto: tituloConEdad(e, f), modulo: 'calendario' });
          } else {
            fechasOcurrencia(e, sumarDiasISO(hoy, 1), sumarDiasISO(hoy, 8)).forEach(f => {
              proximos.push({ f, h: e.hora_inicio || '', icono: '📅', texto: e.title, modulo: 'calendario' });
            });
          }
        });
      }
      if (tareas.status === 'fulfilled') {
        tareas.value.filter(t => !t.completada && t.fecha && t.fecha > hoy && t.fecha <= sumarDiasISO(hoy, 7)).forEach(t => {
          proximos.push({ f: t.fecha, h: t.hora || '', icono: '✅', texto: t.titulo, modulo: 'tareas' });
        });
      }
      if (pagos.status === 'fulfilled') {
        pagos.value.filter(p => !p.pagado && p.fecha > hoy && p.fecha <= sumarDiasISO(hoy, 7)).forEach(p => {
          proximos.push({ f: p.fecha, h: '', icono: '💳', texto: `${p.nombre} · ${formatearImporte(p.importe)} €`, modulo: 'pagos' });
        });
      }
      proximos.sort((a, b) => (a.f + a.h).localeCompare(b.f + b.h));
      if (proximos.length === 0) {
        contProximos.innerHTML = '';
      } else {
        const etiquetaDia = (f) => {
          const dias = Math.round((parseFechaISO(f) - parseFechaISO(hoy)) / 86400000);
          const d = parseFechaISO(f);
          const fechaCorta = d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', timeZone: 'UTC' }).replace('.', '');
          let grande;
          if (dias === 1) grande = 'Mañana';
          else if (dias <= 6) grande = d.toLocaleDateString('es-ES', { weekday: 'long', timeZone: 'UTC' });
          else grande = `En ${dias} días`;
          return `<span class="block text-xs font-bold text-slate-700 capitalize leading-tight">${escapeHTML(grande)}</span><span class="block text-[10px] text-slate-400">${escapeHTML(fechaCorta)}</span>`;
        };
        contProximos.innerHTML = `<h2 class="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 px-1">📌 Próximos días</h2>
          <div class="bg-white border border-slate-200 rounded-2xl shadow-sm divide-y divide-slate-100">` +
          proximos.slice(0, 8).map(x => `
            <button type="button" onclick="cambiarModulo('${x.modulo}')" class="w-full flex items-center gap-3 px-3 py-2 text-left">
              <span class="w-20 shrink-0">${etiquetaDia(x.f)}</span>
              <span class="shrink-0">${x.icono}</span>
              <p class="text-sm text-slate-700 min-w-0 truncate flex-grow">${escapeHTML(x.texto)}</p>
              ${x.h ? `<span class="text-[11px] text-slate-400 shrink-0">${escapeHTML(x.h)}</span>` : ''}
            </button>`).join('') + '</div>' +
          (proximos.length > 8 ? `<button onclick="cambiarModulo('calendario')" class="text-xs font-semibold text-sky-600 px-1 mt-1">Ver ${proximos.length - 8} más en el calendario →</button>` : '');
      }

      // --- 5) Compra pendiente ---

      if (compra.status === 'fulfilled') {
        const pendientes = compra.value.filter(i => !i.archivado && !i.comprado);
        contCompra.innerHTML = `<h2 class="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 px-1">🛒 Compra pendiente (${pendientes.length})</h2>`;
        if (pendientes.length === 0) {
          contCompra.innerHTML += `<div class="text-center py-4 border border-dashed border-slate-200 rounded-2xl"><p class="text-slate-400 text-sm">Cesta vacía 👍</p></div>`;
        } else {
          contCompra.innerHTML += `<div class="flex flex-wrap gap-1.5">` +
            pendientes.map(i => `<span class="px-3 py-1.5 bg-white border border-slate-200 text-slate-700 text-xs font-medium rounded-xl shadow-sm">${escapeHTML(i.producto)}${i.cantidad ? ' (' + escapeHTML(i.cantidad) + ')' : ''}${i.supermercado ? ' · 🏬 ' + escapeHTML(i.supermercado) : ''}</span>`).join('') +
            `</div>`;
        }
      }

      contador.textContent = hoy.split('-').reverse().join('/');
    }

    // ¿El evento (de un día, de varios o repetido) cae en este día?
    function eventoCubreDia(e, dia) {
      const dur = (e.fecha_fin && e.fecha_fin > e.start)
        ? Math.round((parseFechaISO(e.fecha_fin) - parseFechaISO(e.start)) / 86400000) : 0;
      return fechasOcurrencia(e, sumarDiasISO(dia, -dur), sumarDiasISO(dia, 1)).length > 0;
    }

    // --- NOTIFICACIONES ---
    // --- MODO OSCURO ---
    // El tema tiene un único «dueño»: pers.tema ('auto' | 'claro' | 'oscuro', en personalizar.js).
    // Este botón solo lo lee y lo cambia a través de él (persTemaAplicar/persGuardar), para que
    // nunca se quede un ajuste «de verdad» (auto) tapado por otro fijo puesto desde aquí sin que
    // se note.
    function aplicarIconoModoOscuro() {
      const btn = document.getElementById('btn-modo-oscuro');
      const tema = (typeof pers !== 'undefined' && pers.tema) || 'auto';
      const oscuro = document.documentElement.classList.contains('dark');
      if (btn) {
        btn.textContent = tema === 'auto' ? '🌓' : (oscuro ? '🌙' : '☀️');
        btn.title = tema === 'auto' ? 'Tema automático (sigue el del móvil)' : (tema === 'oscuro' ? 'Tema oscuro' : 'Tema claro');
      }
      const metaTema = document.querySelector('meta[name="theme-color"]');
      if (metaTema) metaTema.setAttribute('content', oscuro ? '#0f172a' : '#4f46e5');
    }

    function alternarModoOscuro() {
      if (typeof pers === 'undefined') return;
      // Auto → Claro → Oscuro → Auto… así siempre hay una forma fácil de volver a «sigue el sistema».
      pers.tema = pers.tema === 'auto' ? 'claro' : pers.tema === 'claro' ? 'oscuro' : 'auto';
      if (typeof persTemaAplicar === 'function') persTemaAplicar();
      if (typeof persGuardar === 'function') persGuardar();
      aplicarIconoModoOscuro();
      if (calendar) setTimeout(() => calendar.render(), 50);
    }

    function registrarServiceWorker() {
      if (!('serviceWorker' in navigator)) return;
      navigator.serviceWorker.register('/service-worker.js')
        .then((reg) => {
          // En iPhone no hay "deslizar para refrescar" en la PWA instalada:
          // al volver a primer plano, comprobamos activamente si hay versión nueva.
          document.addEventListener('visibilitychange', () => {
            if (!document.hidden) reg.update().catch(() => {});
          });
        })
        .catch((err) => console.error('No se pudo registrar el service worker:', err));
    }

    function solicitarPermisoNotificaciones() {
      if (!("Notification" in window)) {
        alert("Este navegador no soporta notificaciones web.");
        return;
      }

      if (window.location.protocol !== 'https:' && window.location.hostname !== 'localhost') {
        alert("⚠️ ATENCIÓN: Los navegadores bloquean las notificaciones si entras por IP local (http://192.168.1.50). Para probarlas en este PC, entra usando: http://localhost:8080");
      }

      Notification.requestPermission().then(perm => {
        if (perm === "granted") {
          document.getElementById('btn-permiso-notif').classList.add('hidden');
          lanzarNotificacionPrueba("🔔 ¡Notificaciones Activadas!", "Te avisaremos cuando se acerque la hora de un evento o venza un pago, aunque tengas la app cerrada.");
          suscribirsePush();
        } else if (perm === "denied") {
          alert("Has denegado los permisos. Debes activarlos manualmente en los ajustes del candado/sitio de tu navegador.");
        }
      });
    }

    function urlBase64ToUint8Array(base64String) {
      const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
      const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
      const rawData = atob(base64);
      return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)));
    }

    async function suscribirsePush() {
      // App de Android (APK): los avisos van por Firebase; el WebView no soporta los avisos web.
      if (window.MjNative && typeof MjNative.token === 'function') {
        for (let i = 0; i < 20; i++) {
          let t = '';
          try { t = MjNative.token() || ''; } catch (e) { /* ignorar */ }
          if (t) { try { await API.post('/push/native', { token: t }); } catch (e) { console.error('No se pudo registrar el móvil para avisos', e); } return; }
          await new Promise(r => setTimeout(r, 1500));
        }
        return;
      }
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
      try {
        const registration = await navigator.serviceWorker.ready;
        let subscription = await registration.pushManager.getSubscription();
        if (!subscription) {
          const { publicKey } = await API.get('/push/public-key');
          subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(publicKey)
          });
        }
        const json = subscription.toJSON();
        await API.post('/push/subscribe', {
          endpoint: json.endpoint,
          keys: { p256dh: json.keys.p256dh, auth: json.keys.auth }
        });
      } catch (err) {
        console.error('No se pudo suscribir a las notificaciones push:', err);
      }
    }

    function lanzarNotificacionPrueba(titulo, cuerpo) {
      if (Notification.permission === "granted") {
        if (navigator.serviceWorker && navigator.serviceWorker.controller) {
          navigator.serviceWorker.ready.then(reg => {
            reg.showNotification(titulo, { body: cuerpo });
          });
        } else {
          try {
            new Notification(titulo, { body: cuerpo });
          } catch (e) {
            alert(`${titulo}\n${cuerpo}`);
          }
        }
      }
    }

    function comprobarPermisosNotif() {
      if ("Notification" in window && Notification.permission === "granted") {
        const btn = document.getElementById('btn-permiso-notif');
        if (btn) btn.classList.add('hidden');
        suscribirsePush();
      }
    }

    // (El aviso de eventos ya lo manda el servidor por push real — ver push_handlers.go.
    // Antes había aquí un sondeo del navegador que duplicaba el aviso en cada recarga;
    // se quitó porque el servidor ya cubre este caso de forma fiable, incluso con la
    // app cerrada.)

    // --- COMPRA ---
    let cacheCompra = [];
    let compraEditandoId = null;

    async function cargarLista() {
      try {
        cacheCompra = await API.get('/compra');
        renderizarCompra();
      } catch (err) {
        console.error("Error al cargar la compra:", err);
      }
      cargarSugerenciasCompra();
    }

    // --- Sugerencias al escribir un producto: solo salen los que ya han estado en la lista ---
    let sugerenciasCompra = [];
    async function cargarSugerenciasCompra() {
      try {
        const lista = await API.get('/compra/sugerencias');
        if (Array.isArray(lista)) sugerenciasCompra = lista;
        renderizarHabituales();
      } catch (err) { /* sin sugerencias: se escribe a mano como siempre */ }
    }

    function normalizarTexto(t) {
      return String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
    }

    function ocultarSugerenciasProducto() {
      document.getElementById('sugerencias-producto').classList.add('hidden');
    }

    function mostrarSugerenciasProducto() {
      const caja = document.getElementById('sugerencias-producto');
      const q = normalizarTexto(document.getElementById('producto').value);
      if (!q) { ocultarSugerenciasProducto(); return; }
      const empiezan = [], contienen = [];
      sugerenciasCompra.forEach(s => {
        const n = normalizarTexto(s.producto);
        if (n === q) return; // ya está escrito tal cual
        if (n.startsWith(q)) empiezan.push(s);
        else if (n.split(/\s+/).some(p => p.startsWith(q))) contienen.push(s);
      });
      const lista = [...empiezan, ...contienen].slice(0, 6);
      if (!lista.length) { ocultarSugerenciasProducto(); return; } // si no está, no se muestra nada
      caja.innerHTML = '';
      lista.forEach(s => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'w-full flex items-center justify-between gap-2 text-left px-4 py-2.5 border-b border-slate-100 last:border-b-0 active:bg-emerald-50';
        b.innerHTML = `<span class="text-sm text-slate-800 truncate">${escapeHTML(s.producto)}</span>
          <span class="text-[10px] font-semibold text-slate-400 shrink-0">${s.en_lista ? 'ya en la lista' : escapeHTML(s.supermercado || '')}</span>`;
        // pointerdown evita que el campo pierda el foco (y se cierre el teclado) al tocar
        b.addEventListener('pointerdown', (ev) => ev.preventDefault());
        b.addEventListener('click', () => elegirSugerenciaProducto(s));
        caja.appendChild(b);
      });
      caja.classList.remove('hidden');
    }

    // Qué campos rellenó una sugerencia (y para qué producto), para deshacerlo si ya no aplica.
    let autoRellenoProducto = null;

    function limpiarAutoRellenoProducto() {
      if (!autoRellenoProducto) return;
      const cantidad = document.getElementById('cantidad-producto');
      const super_ = document.getElementById('supermercado-producto');
      if (autoRellenoProducto.cantidad && cantidad.value === autoRellenoProducto.cantidad) cantidad.value = '';
      if (autoRellenoProducto.super && super_.value === autoRellenoProducto.super) super_.value = '';
      autoRellenoProducto = null;
    }

    function elegirSugerenciaProducto(s) {
      const input = document.getElementById('producto');
      const cantidad = document.getElementById('cantidad-producto');
      const super_ = document.getElementById('supermercado-producto');
      limpiarAutoRellenoProducto();
      input.value = s.producto;
      autoRellenoProducto = { producto: normalizarTexto(s.producto), cantidad: '', super: '' };
      if (!cantidad.value && s.cantidad) { cantidad.value = s.cantidad; autoRellenoProducto.cantidad = s.cantidad; }
      if (!super_.value && s.supermercado) { super_.value = s.supermercado; autoRellenoProducto.super = s.supermercado; }
      ocultarSugerenciasProducto();
      input.focus();
    }

    document.getElementById('producto').addEventListener('input', () => {
      // Si el nombre ya no es el de la sugerencia elegida, se quitan la cantidad y el súper que puso ella.
      if (autoRellenoProducto && normalizarTexto(document.getElementById('producto').value) !== autoRellenoProducto.producto) {
        limpiarAutoRellenoProducto();
      }
      mostrarSugerenciasProducto();
    });
    document.getElementById('producto').addEventListener('focus', mostrarSugerenciasProducto);
    document.getElementById('producto').addEventListener('blur', () => setTimeout(ocultarSugerenciasProducto, 150));

    function filaCompraHTML(item) {
      const comprado = item.comprado;
      const cantidad = item.cantidad
        ? `<span class="shrink-0 text-xs font-semibold px-2 py-1 rounded-lg ${comprado ? 'bg-slate-100 text-slate-400' : 'bg-emerald-50 text-emerald-700'}">${escapeHTML(item.cantidad)}</span>`
        : '';
      const sinSync = item.id < 0 ? '<span class="shrink-0 text-xs" title="Pendiente de sincronizar">⏳</span>' : '';
      return `
        <div class="flex items-center pl-3.5 pr-1">
          <div class="flex items-center gap-3 flex-grow min-w-0 py-3.5 cursor-pointer" onclick="toggleComprado(${item.id}, ${!comprado})">
            <span class="shrink-0 w-7 h-7 rounded-full border-2 flex items-center justify-center text-sm ${comprado ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-slate-300'}">${comprado ? '✓' : ''}</span>
            <span class="flex-grow min-w-0 truncate text-base ${comprado ? 'line-through text-slate-400' : 'font-medium text-slate-800'}">${escapeHTML(item.producto)}</span>
            ${cantidad}${sinSync}
          </div>
          <button onclick="abrirModalCompra(${item.id})" aria-label="Editar" class="shrink-0 w-10 h-10 rounded-xl text-slate-300 hover:text-slate-600 hover:bg-slate-50 text-xl leading-none">⋯</button>
        </div>`;
    }

    function renderizarCompra() {
      const items = cacheCompra.filter(i => !i.archivado);
      const pendientes = items.filter(i => !i.comprado);
      const comprados = items.filter(i => i.comprado);

      const contActiva = document.getElementById('lista-activa');
      const secComprados = document.getElementById('seccion-comprados');
      const contComprados = document.getElementById('lista-comprados');
      document.getElementById('contador-general').textContent = `${pendientes.length} pendientes`;
      document.getElementById('titulo-lista-compra').textContent = pendientes.length
        ? `${pendientes.length} por comprar` : 'Por comprar';
      document.querySelectorAll('[data-vista-compra]').forEach(b => {
        const on = b.dataset.vistaCompra === vistaCompra;
        b.classList.toggle('bg-white', on);
        b.classList.toggle('shadow-sm', on);
        b.classList.toggle('text-slate-800', on);
        b.classList.toggle('text-slate-500', !on);
      });

      contActiva.innerHTML = '';
      if (pendientes.length === 0) {
        contActiva.innerHTML = `<div class="text-center py-10 border border-dashed border-slate-200 rounded-2xl bg-white/60">
          <p class="text-3xl mb-1">🛒</p>
          <p class="text-slate-500 text-sm font-medium">${comprados.length ? '¡Todo comprado!' : 'La lista está vacía'}</p>
          <p class="text-slate-400 text-xs mt-0.5">${comprados.length ? 'Lo ya comprado está abajo, tócalo para volver a pedirlo' : 'Añade lo que necesites arriba'}</p>
        </div>`;
      } else {
        const grupos = {};
        pendientes.forEach(i => {
          let clave = '';
          if (vistaCompra === 'super') clave = i.supermercado || '';
          else if (vistaCompra === 'seccion') clave = seccionDeProducto(i.producto);
          else clave = '*';
          if (!grupos[clave]) grupos[clave] = [];
          grupos[clave].push(i);
        });
        const claves = Object.keys(grupos).sort((a, b) => {
          if (vistaCompra === 'seccion') return SECCIONES_COMPRA.findIndex(s => s.nombre === a) - SECCIONES_COMPRA.findIndex(s => s.nombre === b);
          return a === '' ? 1 : (b === '' ? -1 : a.localeCompare(b));
        });
        const hayTiendas = vistaCompra === 'seccion' || (vistaCompra === 'super' && claves.some(k => k !== ''));

        claves.forEach(k => {
          const bloque = document.createElement('div');
          const cabecera = hayTiendas
            ? `<div class="flex items-center gap-2 px-1 mb-1.5">
                 <span class="text-xs font-bold px-2.5 py-1 rounded-lg border ${k ? (vistaCompra === 'seccion' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : colorSupermercado(k)) : 'bg-slate-100 text-slate-500 border-slate-200'}">${vistaCompra === 'seccion' ? escapeHTML(k) : '🏬 ' + (k ? escapeHTML(k) : 'Sin tienda')}</span>
                 <span class="text-xs text-slate-400">${grupos[k].length}</span>
               </div>`
            : '';
          bloque.innerHTML = `${cabecera}<div class="bg-white rounded-2xl border border-slate-200 shadow-sm divide-y divide-slate-100 overflow-hidden">${grupos[k].map(filaCompraHTML).join('')}</div>`;
          contActiva.appendChild(bloque);
        });
      }

      secComprados.classList.toggle('hidden', comprados.length === 0);
      document.getElementById('titulo-comprados').textContent = `Ya comprado · ${comprados.length}`;
      const q = normalizarTexto(filtroComprados);
      const visibles = q ? comprados.filter(i => normalizarTexto(i.producto).includes(q)) : comprados;
      contComprados.innerHTML = visibles.length ? visibles.map(filaCompraHTML).join('')
        : '<p class="text-center text-sm text-slate-400 py-4">Nada que coincida</p>';
      renderizarHabituales();
    }

    // --- Vista de la lista: por súper, por sección del súper o alfabética (se recuerda) ---
    let vistaCompra = 'super';
    try { const v = localStorage.getItem('hogar_vista_compra'); if (['super', 'seccion', 'alfa'].includes(v)) vistaCompra = v; } catch (e) {}
    let filtroComprados = '';
    function filtrarComprados(t) { filtroComprados = t; renderizarCompra(); }
    function cambiarVistaCompra(v) {
      vistaCompra = v;
      try { localStorage.setItem('hogar_vista_compra', v); } catch (e) {}
      renderizarCompra();
    }

    const SECCIONES_COMPRA = [
      { nombre: '🥬 Fruta y verdura', palabras: ['manzana','pera','platano','plátano','naranja','mandarina','limon','limón','fresa','uva','melon','melón','sandia','sandía','piña','kiwi','aguacate','tomate','lechuga','cebolla','ajo','patata','zanahoria','pimiento','calabacin','calabacín','pepino','espinaca','brocoli','brócoli','coliflor','berenjena','champi','seta','fruta','verdura','ensalada','puerro','judia','judía','plátano','mango','cereza','melocoton','melocotón','nectarina'] },
      { nombre: '🥩 Carne y pescado', palabras: ['pollo','pavo','ternera','cerdo','cordero','carne','chuleta','filete','hamburguesa','salchicha','jamon','jamón','chorizo','bacon','beicon','lomo','pescado','merluza','salmon','salmón','atun','atún','gamba','calamar','sepia','bacalao','dorada','lubina','sardina','mejillon','mejillón','marisco','fuet','embutido','pechuga','muslo','albondiga','albóndiga'] },
      { nombre: '🧀 Lácteos y huevos', palabras: ['leche','yogur','queso','mantequilla','nata','huevo','huevos','kefir','natilla','flan','cuajada','batido','requeson','requesón'] },
      { nombre: '🍞 Panadería', palabras: ['pan','baguette','barra','tostada','bollo','croissant','magdalena','galleta','cereal','harina','tortita','bizcocho','donut'] },
      { nombre: '🥫 Despensa', palabras: ['arroz','pasta','macarron','macarrón','espagueti','espaguetis','fideo','lenteja','garbanzo','alubia','legumbre','aceite','vinagre','sal','azucar','azúcar','tomate frito','conserva','lata','atun en','salsa','mayonesa','ketchup','mostaza','caldo','sopa','crema','cafe','café','te ','té','cacao','mermelada','miel','frutos secos','almendra','nuez','cacahuete','pipas','patatas fritas','snack','chocolate','especias','pimienta','tortilla de'] },
      { nombre: '🥤 Bebidas', palabras: ['agua','refresco','cola','zumo','cerveza','vino','sidra','gaseosa','tonica','tónica','cava','licor','ron','whisky','ginebra','vodka','bebida','isotonica','isotónica','infusion','infusión'] },
      { nombre: '🧊 Congelados', palabras: ['congelad','helado','pizza','croqueta','nugget','empanadilla','guisantes congel','hielo','varitas'] },
      { nombre: '🧴 Limpieza e higiene', palabras: ['detergente','suavizante','lejia','lejía','fregasuelos','limpia','estropajo','bayeta','papel','servilleta','bolsa','basura','jabon','jabón','gel','champu','champú','acondicionador','pasta de dientes','dentifrico','dentífrico','cepillo','desodorante','compresa','panal','pañal','toallita','colonia','crema solar','algodon','algodón','lavavajillas','pastilla','cuchilla','maquinilla','rollo','film','aluminio'] },
      { nombre: '🛒 Otros', palabras: [] }
    ];
    function seccionDeProducto(nombre) {
      const n = ' ' + normalizarTexto(nombre) + ' ';
      for (const s of SECCIONES_COMPRA) {
        if (s.palabras.some(p => {
          const q = normalizarTexto(p);
          if (q.length <= 3) return n.includes(' ' + q + ' ') || n.includes(' ' + q + 's ');
          return n.includes(q);
        })) return s.nombre;
      }
      return '🛒 Otros';
    }

    // --- Habituales: lo que más se compra, a un toque ---
    function renderizarHabituales() {
      const cont = document.getElementById('habituales-compra');
      if (!cont) return;
      const enLista = new Set(cacheCompra.filter(i => !i.archivado).map(i => normalizarTexto(i.producto)));
      const hab = sugerenciasCompra
        .filter(s => (s.veces || 0) >= 2 && !enLista.has(normalizarTexto(s.producto)))
        .sort((x, y) => (y.veces - x.veces) || x.producto.localeCompare(y.producto))
        .slice(0, 10);
      cont.classList.toggle('hidden', hab.length === 0);
      const caja = document.getElementById('habituales-chips');
      caja.innerHTML = '';
      hab.forEach(s => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'shrink-0 text-sm font-medium px-3 py-1.5 rounded-full border border-slate-200 bg-white text-slate-700 hover:border-emerald-400 active:bg-emerald-50';
        b.textContent = '+ ' + s.producto;
        b.onclick = () => añadirHabitual(s);
        caja.appendChild(b);
      });
    }

    async function añadirHabitual(s) {
      const nuevo = { producto: s.producto, cantidad: s.cantidad || '', supermercado: s.supermercado || '' };
      try {
        const res = await API.post('/compra', nuevo);
        if (res && res.offline) {
          cacheCompra.push({ id: -Date.now(), comprado: false, archivado: false, ...nuevo });
          renderizarCompra();
        } else {
          await cargarLista();
        }
      } catch (error) {
        mostrarError('Error al añadir', error);
      }
    }

    async function toggleComprado(id, nuevoEstado) {
      try {
        const res = await API.put(`/compra/${id}`, { comprado: nuevoEstado });
        if (res && res.offline) {
          const item = cacheCompra.find(i => i.id === id);
          if (item) item.comprado = nuevoEstado;
          renderizarCompra();
        } else {
          await cargarLista();
        }
        if (nuevoEstado) {
          const it = cacheCompra.find(i => i.id === id);
          mostrarToast(`${it ? it.producto : 'Producto'} comprado ✓`, 'Deshacer', () => toggleComprado(id, false));
        } else {
          const it = cacheCompra.find(i => i.id === id);
          mostrarToast(`${it ? it.producto : 'Producto'} pasa a Por comprar`, 'Deshacer', () => toggleComprado(id, true));
        }
      } catch (error) {
        mostrarError('Error al actualizar compra', error);
      }
    }

    async function borrarDefinitivo(id) {
      try {
        const res = await API.delete(`/compra/${id}`);
        if (res && res.offline) {
          cacheCompra = cacheCompra.filter(i => i.id !== id);
          renderizarCompra();
        } else {
          await cargarLista();
        }
      } catch (error) {
        mostrarError('Error al eliminar compra', error);
      }
    }

    // Quita de golpe todo lo que ya está en el carro.
    async function limpiarComprados() {
      if (!confirm('¿Vaciar todo lo ya comprado? Dejará de aparecer aquí (seguirá saliendo como sugerencia al escribir).')) return;
      const comprados = cacheCompra.filter(i => i.comprado && !i.archivado);
      if (comprados.length === 0) return;
      try {
        let sinConexion = false;
        for (const item of comprados) {
          const res = await API.delete(`/compra/${item.id}`);
          if (res && res.offline) sinConexion = true;
        }
        if (sinConexion) {
          cacheCompra = cacheCompra.filter(i => !i.comprado);
          renderizarCompra();
        } else {
          await cargarLista();
        }
      } catch (error) {
        mostrarError('Error al vaciar el carro', error);
      }
    }

    // --- Edición de un producto (hoja modal) ---
    function abrirModalCompra(id) {
      const item = cacheCompra.find(i => i.id === id);
      if (!item) return;
      compraEditandoId = id;
      document.getElementById('edit-producto').value = item.producto;
      document.getElementById('edit-cantidad').value = item.cantidad || '';
      document.getElementById('edit-supermercado').value = item.supermercado || '';
      document.getElementById('modal-compra').classList.remove('hidden');
      document.getElementById('edit-producto').focus();
    }

    function cerrarModalCompra() {
      compraEditandoId = null;
      document.getElementById('modal-compra').classList.add('hidden');
    }

    async function borrarDesdeModalCompra() {
      const id = compraEditandoId;
      cerrarModalCompra();
      if (id !== null) await borrarDefinitivo(id);
    }

    document.getElementById('form-editar-compra').addEventListener('submit', async (e) => {
      e.preventDefault();
      const id = compraEditandoId;
      if (id === null) return;
      const cambios = {
        producto: document.getElementById('edit-producto').value.trim(),
        cantidad: document.getElementById('edit-cantidad').value.trim(),
        supermercado: document.getElementById('edit-supermercado').value.trim()
      };
      if (!cambios.producto) return;
      cerrarModalCompra();
      try {
        const res = await API.put(`/compra/${id}`, cambios);
        if (res && res.offline) {
          const item = cacheCompra.find(i => i.id === id);
          if (item) Object.assign(item, cambios);
          renderizarCompra();
        } else {
          await cargarLista();
        }
      } catch (error) {
        mostrarError('Error al guardar el producto', error);
      }
    });

    document.getElementById('modal-compra').addEventListener('click', (e) => {
      if (e.target.id === 'modal-compra') cerrarModalCompra();
    });

    async function compartirListaCompra() {
      try {
        const items = cacheCompra.length ? cacheCompra : await API.get('/compra');
        const pendientes = items.filter(i => !i.archivado && !i.comprado);
        if (pendientes.length === 0) {
          alert('La lista de la compra está vacía 👍');
          return;
        }

        const grupos = {};
        pendientes.forEach(i => {
          const clave = i.supermercado || 'Sin tienda concreta';
          if (!grupos[clave]) grupos[clave] = [];
          grupos[clave].push(i);
        });

        const claves = Object.keys(grupos).sort((a, b) => {
          if (a === 'Sin tienda concreta') return 1;
          if (b === 'Sin tienda concreta') return -1;
          return a.localeCompare(b);
        });

        const fecha = new Date().toLocaleDateString('es-ES');
        let texto = `🛒 Lista de la compra (${fecha})\n`;
        claves.forEach(clave => {
          texto += `\n🏬 ${clave}\n`;
          grupos[clave].forEach(i => {
            texto += `- ${i.producto}${i.cantidad ? ' (' + i.cantidad + ')' : ''}\n`;
          });
        });

        if (navigator.share) {
          await navigator.share({ title: 'Lista de la compra', text: texto });
        } else if (navigator.clipboard) {
          await navigator.clipboard.writeText(texto);
          alert('📋 Lista copiada. Pégala donde quieras (WhatsApp, notas...)');
        } else {
          window.prompt('Copia la lista manualmente:', texto);
        }
      } catch (error) {
        if (error && error.name === 'AbortError') return; // el usuario cerró el share sheet
        mostrarError('Error al compartir la lista', error);
      }
    }

    document.getElementById('form-producto').addEventListener('submit', async (e) => {
      e.preventDefault();
      const input = document.getElementById('producto');
      const cantidad = document.getElementById('cantidad-producto');
      const supermercado = document.getElementById('supermercado-producto');
      const nuevo = { producto: input.value.trim(), cantidad: cantidad.value.trim(), supermercado: supermercado.value.trim() };
      // Los campos se vacían YA (antes de esperar al servidor) para que nada se arrastre al siguiente producto.
      // El súper se conserva solo si lo escribiste tú; si lo puso una sugerencia, se quita.
      const superAutorrellenado = autoRellenoProducto && autoRellenoProducto.super && supermercado.value === autoRellenoProducto.super;
      autoRellenoProducto = null;
      input.value = '';
      cantidad.value = '';
      if (superAutorrellenado) supermercado.value = '';
      ocultarSugerenciasProducto();
      try {
        const res = await API.post('/compra', nuevo);
        if (res && res.offline) {
          cacheCompra.push({ id: -Date.now(), comprado: false, archivado: false, ...nuevo });
          renderizarCompra();
        } else {
          await cargarLista();
        }
        input.focus();
      } catch (error) {
        // No se pudo guardar: se devuelve lo escrito para no perderlo.
        input.value = nuevo.producto;
        cantidad.value = nuevo.cantidad;
        supermercado.value = nuevo.supermercado;
        mostrarError('Error al añadir producto', error);
      }
    });

    // --- TAREAS ---
    let cacheTareas = [];
    const DIAS_TAREA = [ // orden visual lunes..domingo; el número es el día de la semana de JS/Go (0 = domingo)
      { n: 1, l: 'L' }, { n: 2, l: 'M' }, { n: 3, l: 'X' }, { n: 4, l: 'J' }, { n: 5, l: 'V' }, { n: 6, l: 'S' }, { n: 0, l: 'D' }
    ];
    const NOMBRE_DIA_TAREA = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
    let diasRepeticionTarea = new Set();
    let subtareasForm = [];
    let tareasExpandidas = new Set(); // tareas con la lista de subtareas desplegada

    // Filtro y orden (se recuerdan en este móvil)
    let filtroTareas = 'todas';      // 'todas' | 'mias' | nombre de una persona
    let ordenTareas = 'fecha';       // 'fecha' | 'prioridad' | 'persona'
    try {
      filtroTareas = localStorage.getItem('hogar_tareas_filtro') || 'todas';
      ordenTareas = localStorage.getItem('hogar_tareas_orden') || 'fecha';
    } catch (e) { /* sin almacenamiento */ }

    function cambiarFiltroTareas(v) {
      filtroTareas = v;
      try { localStorage.setItem('hogar_tareas_filtro', v); } catch (e) { /* sin almacenamiento */ }
      renderizarTareas();
    }
    function cambiarOrdenTareas(v) {
      ordenTareas = v;
      try { localStorage.setItem('hogar_tareas_orden', v); } catch (e) { /* sin almacenamiento */ }
      renderizarTareas();
    }

    async function cargarTareas() {
      try {
        cacheTareas = await API.get('/tareas');
        await cargarConteoNotas();
        renderizarTareas();
      } catch (err) {
        console.error("Error al cargar las tareas:", err);
      }
    }

    function textoRepeticionTarea(t) {
      if (t.repetir_modo === 'mes') return '🔁 Cada mes';
      if (t.repetir_modo && t.repetir_modo.startsWith('dias:')) {
        const dias = t.repetir_modo.slice(5).split(',').map(Number);
        const orden = [1, 2, 3, 4, 5, 6, 0];
        return '🔁 ' + orden.filter(n => dias.includes(n)).map(n => NOMBRE_DIA_TAREA[n]).join(', ');
      }
      if (t.repetir_dias === 1) return '🔁 Diario';
      if (t.repetir_dias === 7) return '🔁 Semanal';
      if (t.repetir_dias === 14) return '🔁 Cada 2 semanas';
      if (t.repetir_dias === 15) return '🔁 Quincenal';
      if (t.repetir_dias === 30) return '🔁 Mensual';
      return '';
    }

    // Misma regla que el servidor, para la vista optimista sin conexión.
    function siguienteFechaTareaJS(fechaISO, repetirDias, modo) {
      const [y, m, d] = fechaISO.split('-').map(Number);
      if (modo && modo.startsWith('dias:')) {
        const dias = modo.slice(5).split(',').map(Number);
        let f = fechaISO;
        for (let i = 0; i < 8; i++) {
          f = sumarDiasISO(f, 1);
          const [fy, fm, fd] = f.split('-').map(Number);
          if (dias.includes(new Date(Date.UTC(fy, fm - 1, fd)).getUTCDay())) return f;
        }
        return sumarDiasISO(fechaISO, 7);
      }
      if (modo === 'mes') {
        const ultimo = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
        return new Date(Date.UTC(y, m, Math.min(d, ultimo))).toISOString().slice(0, 10);
      }
      return sumarDiasISO(fechaISO, Math.max(1, repetirDias || 1));
    }

    function tareaEsMia(t) {
      return t.asignado_a === 'Todos' || t.asignado_a === usuarioActualNombre;
    }

    function ordenarTareasLista(lista) {
      const clave = (t) => (t.fecha || '9999-99-99') + ' ' + (t.hora || '99:99');
      const copia = lista.slice();
      if (ordenTareas === 'prioridad') {
        copia.sort((a, b) => (b.prioridad || 0) - (a.prioridad || 0) || clave(a).localeCompare(clave(b)));
      } else if (ordenTareas === 'persona') {
        copia.sort((a, b) => a.asignado_a.localeCompare(b.asignado_a, 'es') || clave(a).localeCompare(clave(b)));
      } else {
        copia.sort((a, b) => clave(a).localeCompare(clave(b)) || (b.prioridad || 0) - (a.prioridad || 0));
      }
      return copia;
    }

    function pintarBarraFiltrosTareas() {
      const cont = document.getElementById('barra-filtros-tareas');
      if (!cont) return;
      const personas = [...new Set(cacheTareas.map(t => t.asignado_a).filter(p => p && p !== 'Todos'))].sort((a, b) => a.localeCompare(b, 'es'));
      const filtros = [['todas', 'Todas'], ['mias', 'Mías'], ...personas.map(p => [p, p])];
      if (!filtros.some(f => f[0] === filtroTareas)) filtroTareas = 'todas';
      cont.innerHTML = `
        <div class="flex gap-1.5 overflow-x-auto no-scrollbar pb-1 flex-grow">
          ${filtros.map(([v, l]) => `<button type="button" onclick="cambiarFiltroTareas('${escapeHTML(v)}')" class="shrink-0 text-xs font-semibold px-3 py-1.5 rounded-full border ${filtroTareas === v ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white border-slate-200 text-slate-600'}">${escapeHTML(l)}</button>`).join('')}
        </div>
        <select onchange="cambiarOrdenTareas(this.value)" aria-label="Ordenar tareas" class="shrink-0 bg-white border border-slate-200 rounded-full text-xs font-semibold text-slate-600 px-2 py-1.5 focus:outline-none">
          <option value="fecha" ${ordenTareas === 'fecha' ? 'selected' : ''}>↕ Fecha</option>
          <option value="prioridad" ${ordenTareas === 'prioridad' ? 'selected' : ''}>↕ Prioridad</option>
          <option value="persona" ${ordenTareas === 'persona' ? 'selected' : ''}>↕ Persona</option>
        </select>`;
    }

    function renderizarTareas() {
      const contPendientes = document.getElementById('lista-tareas-pendientes');
      const contProximas = document.getElementById('lista-tareas-proximas');
      const contCompletadas = document.getElementById('lista-tareas-completadas');
      const contador = document.getElementById('contador-general');
      const seccionProximas = contProximas.closest('section');

      pintarBarraFiltrosTareas();

      contPendientes.innerHTML = '';
      contProximas.innerHTML = '';
      contCompletadas.innerHTML = '';

      const hoy = hoyLocalISO();
      const pasaFiltro = (t) => filtroTareas === 'todas' || (filtroTareas === 'mias' ? tareaEsMia(t) : t.asignado_a === filtroTareas);
      const todasPendientesGlobal = cacheTareas.filter(t => !t.completada);
      const tareas = cacheTareas.filter(pasaFiltro);
      const todasPendientes = tareas.filter(t => !t.completada);
      const completadas = tareas.filter(t => t.completada);

      // Sin fecha o con fecha de hoy/vencida -> bloque principal
      const pendientes = ordenarTareasLista(todasPendientes.filter(t => !t.fecha || t.fecha <= hoy));
      // Con fecha futura -> bloque "Próximas"
      const proximas = ordenarTareasLista(todasPendientes.filter(t => t.fecha && t.fecha > hoy));

      contador.textContent = `${todasPendientesGlobal.length} pendientes`;

      function badgeFecha(t) {
        if (!t.fecha) return '';
        const vencida = t.fecha < hoy;
        const esHoy = t.fecha === hoy;
        const clase = vencida ? 'bg-rose-100 text-rose-700' : (esHoy ? 'bg-amber-50 text-amber-700' : 'bg-sky-50 text-sky-700');
        const texto = vencida ? `⚠️ ${formatearFechaCorta(t.fecha)}` : (esHoy ? '📅 Hoy' : `📅 ${formatearFechaCorta(t.fecha)}`);
        return `<span class="text-[10px] font-semibold px-2 py-0.5 ${clase} rounded-md">${texto}</span>`;
      }

      function tarjetaPendiente(t) {
        const envoltorio = document.createElement('div');
        envoltorio.className = 'relative overflow-hidden rounded-2xl';
        envoltorio.innerHTML = `
          <div class="absolute inset-0 flex items-center justify-between px-5 text-sm font-bold text-white">
            <span class="swipe-fondo-ok absolute inset-0 bg-emerald-500 flex items-center pl-5 opacity-0">✓ Completar</span>
            <span class="swipe-fondo-borrar absolute inset-0 bg-rose-500 flex items-center justify-end pr-5 opacity-0">🗑 Borrar</span>
          </div>`;
        const card = document.createElement('div');
        const colorPrio = t.prioridad > 0 ? 'border-l-4 border-l-rose-500' : (t.prioridad < 0 ? 'border-l-4 border-l-slate-300' : '');
        card.className = `tarea-card relative flex items-center justify-between p-3.5 bg-white border border-slate-200 rounded-2xl shadow-sm ${colorPrio}`;
        card.style.touchAction = 'pan-y';

        const badgeRepetir = textoRepeticionTarea(t);
        const subs = t.subtareas || [];
        const hechas = subs.filter(x => x.hecha).length;
        const expandida = tareasExpandidas.has(t.id);
        const progreso = subs.length ? `
          <button type="button" onclick="event.stopPropagation(); alternarSubtareasVisibles(${t.id})" class="mt-1.5 w-full text-left">
            <div class="flex items-center gap-2">
              <div class="flex-grow h-1.5 bg-slate-100 rounded-full overflow-hidden"><div class="h-full bg-emerald-500" style="width:${Math.round(hechas * 100 / subs.length)}%"></div></div>
              <span class="text-[10px] font-semibold text-slate-500 shrink-0">☑ ${hechas}/${subs.length} ${expandida ? '▴' : '▾'}</span>
            </div>
          </button>
          ${expandida ? `<div class="mt-1.5 space-y-1">${subs.map((x, k) => `
            <label class="flex items-center gap-2 text-xs text-slate-700 py-0.5" onclick="event.stopPropagation()">
              <input type="checkbox" ${x.hecha ? 'checked' : ''} onchange="toggleSubtarea(${t.id}, ${k}, this.checked)" class="w-4 h-4 rounded accent-indigo-600">
              <span class="${x.hecha ? 'line-through text-slate-400' : ''}">${escapeHTML(x.texto)}</span>
            </label>`).join('')}</div>` : ''}` : '';

        card.innerHTML = `
          <div class="flex items-start gap-3 cursor-pointer flex-grow min-w-0" onclick="toggleTarea(${t.id}, true)">
            <div class="w-6 h-6 mt-0.5 rounded-lg border border-slate-300 flex items-center justify-center shrink-0"></div>
            <div class="min-w-0 flex-grow">
              <p class="text-sm font-medium text-slate-800">${t.prioridad > 0 ? '❗ ' : ''}${escapeHTML(t.titulo)}</p>
              <div class="flex flex-wrap gap-1 mt-0.5">
                <span class="text-[10px] font-semibold px-2 py-0.5 bg-indigo-50 text-indigo-600 rounded-md">${escapeHTML(t.asignado_a)}</span>
                ${badgeFecha(t)}
                ${t.hora ? `<span class="text-[10px] font-semibold px-2 py-0.5 bg-violet-50 text-violet-700 rounded-md">⏰ ${escapeHTML(t.hora)}</span>` : ''}
                ${badgeRepetir ? `<span class="text-[10px] font-semibold px-2 py-0.5 bg-amber-50 text-amber-700 rounded-md">${badgeRepetir}</span>` : ''}
                ${t.id < 0 ? '<span class="text-[10px] font-semibold px-2 py-0.5 bg-slate-100 text-slate-500 rounded-md">⏳ sin sincronizar</span>' : ''}
              </div>
              ${progreso}
            </div>
          </div>
          <div class="flex items-center gap-1 pl-2 shrink-0">
            ${botonNotasHTML('tarea', t.id)}
            <button onclick="iniciarEdicionTarea(${t.id})" class="p-2 text-slate-400 hover:text-sky-600" title="Editar">✏️</button>
            <button onclick="borrarTarea(${t.id})" class="p-2 text-slate-400 hover:text-rose-600">❌</button>
          </div>`;
        envoltorio.appendChild(card);
        activarDeslizarTarea(card, envoltorio, t);
        return envoltorio;
      }

      if (pendientes.length === 0) {
        contPendientes.innerHTML = `<div class="text-center py-6 border border-dashed border-slate-200 rounded-2xl"><p class="text-slate-400 text-sm">${cacheTareas.some(x => !x.completada) && filtroTareas !== 'todas' ? 'Nada pendiente con este filtro' : 'Todo ordenado 🎉'}</p></div>`;
      } else {
        pendientes.forEach(t => contPendientes.appendChild(tarjetaPendiente(t)));
      }

      if (seccionProximas) seccionProximas.classList.toggle('hidden', proximas.length === 0);
      proximas.forEach(t => contProximas.appendChild(tarjetaPendiente(t)));

      completadas.forEach(t => {
        const card = document.createElement('div');
        card.className = "flex items-center justify-between p-3.5 bg-slate-50 border border-slate-200/60 rounded-2xl opacity-60";
        card.innerHTML = `
          <div class="flex items-center gap-3 cursor-pointer flex-grow" onclick="toggleTarea(${t.id}, false)">
            <div class="w-6 h-6 rounded-lg bg-indigo-600 text-white flex items-center justify-center shrink-0">✓</div>
            <p class="text-sm font-medium text-slate-800 comprado">${escapeHTML(t.titulo)}</p>
          </div>
          <button onclick="borrarTarea(${t.id})" class="p-2 text-slate-400 hover:text-rose-600">❌</button>`;
        contCompletadas.appendChild(card);
      });
    }

    // Deslizar una tarea: derecha = completar, izquierda = borrar (con confirmación).
    function activarDeslizarTarea(card, envoltorio, t) {
      const fondoOk = envoltorio.querySelector('.swipe-fondo-ok');
      const fondoBorrar = envoltorio.querySelector('.swipe-fondo-borrar');
      const UMBRAL = 90;
      let x0 = 0, y0 = 0, dx = 0, activo = false, horizontal = false;

      card.addEventListener('touchstart', (e) => {
        if (e.touches.length !== 1 || e.target.closest('button, input, label')) { activo = false; return; }
        x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; dx = 0; activo = true; horizontal = false;
        card.style.transition = 'none';
      }, { passive: true });

      card.addEventListener('touchmove', (e) => {
        if (!activo) return;
        const ddx = e.touches[0].clientX - x0;
        const ddy = e.touches[0].clientY - y0;
        if (!horizontal) {
          if (Math.abs(ddx) > 12 && Math.abs(ddx) > Math.abs(ddy) * 1.5) horizontal = true;
          else if (Math.abs(ddy) > 12) { activo = false; return; }
          else return;
        }
        e.preventDefault();
        dx = ddx;
        card.style.transform = `translateX(${dx}px)`;
        fondoOk.style.opacity = dx > 0 ? Math.min(1, dx / UMBRAL) : 0;
        fondoBorrar.style.opacity = dx < 0 ? Math.min(1, -dx / UMBRAL) : 0;
      }, { passive: false });

      const soltar = () => {
        if (!activo) return;
        activo = false;
        card.style.transition = 'transform .2s ease';
        card.style.transform = 'translateX(0)';
        fondoOk.style.opacity = 0; fondoBorrar.style.opacity = 0;
        if (!horizontal) return;
        if (dx >= UMBRAL) toggleTarea(t.id, true);
        else if (dx <= -UMBRAL && confirm(`¿Borrar la tarea "${t.titulo}"?`)) borrarTarea(t.id);
      };
      card.addEventListener('touchend', soltar);
      card.addEventListener('touchcancel', soltar);
    }

    function alternarSubtareasVisibles(id) {
      if (tareasExpandidas.has(id)) tareasExpandidas.delete(id); else tareasExpandidas.add(id);
      renderizarTareas();
    }

    async function toggleSubtarea(id, indice, hecha) {
      const t = cacheTareas.find(x => x.id === id);
      if (!t || !t.subtareas || !t.subtareas[indice]) return;
      t.subtareas[indice].hecha = hecha;
      renderizarTareas();
      if (id < 0) return;
      try {
        await API.put(`/tareas/${id}`, { subtareas: t.subtareas });
      } catch (error) {
        t.subtareas[indice].hecha = !hecha;
        renderizarTareas();
        mostrarError('No se pudo guardar la subtarea', error);
      }
    }

    function sumarDiasISO(fechaISO, dias) {
      const [y, m, d] = fechaISO.split('-').map(Number);
      const fecha = new Date(Date.UTC(y, m - 1, d));
      fecha.setUTCDate(fecha.getUTCDate() + dias);
      return fecha.toISOString().slice(0, 10);
    }

    async function toggleTarea(id, completada) {
      try {
        const res = await API.put(`/tareas/${id}`, { completada });
        if (res && res.offline) {
          const t = cacheTareas.find(x => x.id === id);
          if (t) {
            t.completada = completada;
            if (completada && (t.repetir_dias > 0 || t.repetir_modo)) {
              const siguienteFecha = siguienteFechaTareaJS(t.fecha || hoyLocalISO(), t.repetir_dias, t.repetir_modo);
              cacheTareas.push({
                id: -Date.now(), titulo: t.titulo, asignado_a: t.asignado_a, repetir_dias: t.repetir_dias,
                repetir_modo: t.repetir_modo || '', hora: t.hora || '', prioridad: t.prioridad || 0,
                subtareas: (t.subtareas || []).map(x => ({ texto: x.texto, hecha: false })),
                fecha: siguienteFecha, completada: false
              });
            }
          }
          renderizarTareas();
        } else {
          await cargarTareas();
        }
      } catch (error) {
        mostrarError('Error al actualizar tarea', error);
      }
    }

    async function borrarTarea(id) {
      try {
        const res = await API.delete(`/tareas/${id}`);
        if (res && res.offline) {
          cacheTareas = cacheTareas.filter(x => x.id !== id);
          renderizarTareas();
        } else {
          await cargarTareas();
        }
      } catch (error) {
        mostrarError('Error al eliminar tarea', error);
      }
    }

    // --- Formulario de tareas: repetición por días, subtareas ---
    function pintarChipsDiasTarea() {
      const cont = document.getElementById('chips-dias-tarea');
      if (!cont) return;
      cont.innerHTML = DIAS_TAREA.map(d => `<button type="button" onclick="alternarDiaTarea(${d.n})" class="w-8 h-8 rounded-full text-xs font-bold border ${diasRepeticionTarea.has(d.n) ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white border-slate-200 text-slate-600'}">${d.l}</button>`).join('');
    }
    function alternarDiaTarea(n) {
      if (diasRepeticionTarea.has(n)) diasRepeticionTarea.delete(n); else diasRepeticionTarea.add(n);
      pintarChipsDiasTarea();
    }
    function actualizarUIRepeticionTarea() {
      const v = document.getElementById('repetir-tarea').value;
      document.getElementById('fila-dias-tarea').classList.toggle('hidden', v !== 'dias');
      if (v === 'dias') pintarChipsDiasTarea();
    }

    function pintarSubtareasForm() {
      const cont = document.getElementById('lista-subtareas-form');
      if (!cont) return;
      cont.innerHTML = subtareasForm.map((x, k) => `
        <div class="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1">
          <input type="checkbox" ${x.hecha ? 'checked' : ''} onchange="subtareasForm[${k}].hecha = this.checked" class="w-4 h-4 accent-indigo-600">
          <span class="flex-grow text-xs text-slate-700 break-words min-w-0">${escapeHTML(x.texto)}</span>
          <button type="button" onclick="quitarSubtareaForm(${k})" class="text-slate-400 hover:text-rose-600 px-1" aria-label="Quitar">✕</button>
        </div>`).join('');
    }
    function anadirSubtareaForm() {
      const input = document.getElementById('subtarea-input');
      const texto = input.value.trim();
      if (!texto) return;
      if (subtareasForm.length >= 50) return;
      subtareasForm.push({ texto, hecha: false });
      input.value = '';
      pintarSubtareasForm();
      input.focus();
    }
    function quitarSubtareaForm(k) {
      subtareasForm.splice(k, 1);
      pintarSubtareasForm();
    }
    document.getElementById('subtarea-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); anadirSubtareaForm(); }
    });

    let tareaEditandoId = null;

    function iniciarEdicionTarea(id) {
      const t = cacheTareas.find(x => x.id === id);
      if (!t) return;
      tareaEditandoId = id;

      document.getElementById('titulo-tarea').value = t.titulo;
      document.getElementById('asignado-tarea').value = t.asignado_a;
      document.getElementById('fecha-tarea').value = t.fecha || '';
      document.getElementById('hora-tarea').value = t.hora || '';
      document.getElementById('prioridad-tarea').value = String(t.prioridad || 0);
      if (t.repetir_modo === 'mes') {
        document.getElementById('repetir-tarea').value = 'mes';
      } else if (t.repetir_modo && t.repetir_modo.startsWith('dias:')) {
        document.getElementById('repetir-tarea').value = 'dias';
        diasRepeticionTarea = new Set(t.repetir_modo.slice(5).split(',').map(Number));
      } else {
        document.getElementById('repetir-tarea').value = String(t.repetir_dias || 0);
      }
      actualizarUIRepeticionTarea();
      subtareasForm = (t.subtareas || []).map(x => ({ texto: x.texto, hecha: !!x.hecha }));
      pintarSubtareasForm();

      document.getElementById('aviso-editando-tarea').classList.remove('hidden');
      document.getElementById('btn-submit-tarea').textContent = '💾 Guardar cambios';
      document.getElementById('form-tarea').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    function cancelarEdicionTarea() {
      tareaEditandoId = null;
      document.getElementById('aviso-editando-tarea').classList.add('hidden');
      document.getElementById('btn-submit-tarea').textContent = '➕ Añadir Tarea';
      document.getElementById('form-tarea').reset();
      diasRepeticionTarea = new Set();
      subtareasForm = [];
      actualizarUIRepeticionTarea();
      pintarSubtareasForm();
    }

    document.getElementById('form-tarea').addEventListener('submit', async (e) => {
      e.preventDefault();
      const titulo = document.getElementById('titulo-tarea');
      const asignado = document.getElementById('asignado-tarea');
      const repetir = document.getElementById('repetir-tarea');
      const fecha = document.getElementById('fecha-tarea');
      const hora = document.getElementById('hora-tarea');
      const prioridad = document.getElementById('prioridad-tarea');

      // El texto pendiente en el campo de subtareas también cuenta.
      const pendienteSub = document.getElementById('subtarea-input').value.trim();
      if (pendienteSub) { subtareasForm.push({ texto: pendienteSub, hecha: false }); document.getElementById('subtarea-input').value = ''; }

      let repetirDias = 0, repetirModo = '';
      if (repetir.value === 'mes') repetirModo = 'mes';
      else if (repetir.value === 'dias') {
        if (diasRepeticionTarea.size === 0) { mostrarError('Repetición', new Error('Elige al menos un día de la semana')); return; }
        repetirModo = 'dias:' + [...diasRepeticionTarea].sort((a, b) => a - b).join(',');
      } else repetirDias = Number.parseInt(repetir.value, 10) || 0;

      // Una hora sin fecha no avisaría nunca: se asume hoy.
      const fechaFinal = fecha.value || (hora.value ? hoyLocalISO() : '');

      const nueva = {
        titulo: titulo.value.trim(),
        asignado_a: asignado.value,
        repetir_dias: repetirDias,
        repetir_modo: repetirModo,
        fecha: fechaFinal,
        hora: hora.value || '',
        prioridad: Number.parseInt(prioridad.value, 10) || 0,
        subtareas: subtareasForm.map(x => ({ texto: x.texto, hecha: !!x.hecha }))
      };
      try {
        const res = await (tareaEditandoId ? API.put(`/tareas/${tareaEditandoId}`, nueva) : API.post('/tareas', nueva));
        if (res && res.offline) {
          if (tareaEditandoId) {
            const t = cacheTareas.find(x => x.id === tareaEditandoId);
            if (t) Object.assign(t, nueva);
          } else {
            cacheTareas.unshift({ id: -Date.now(), completada: false, ...nueva });
          }
          renderizarTareas();
        } else {
          await cargarTareas();
        }
        cancelarEdicionTarea();
      } catch (error) {
        mostrarError(tareaEditandoId ? 'Error al guardar los cambios' : 'Error al crear tarea', error);
      }
    });

    // --- CALENDARIO (ESTILO GOOGLE CALENDAR + FESTIVOS MADRID) ---
    let eventoEditandoId = null;
    let repetirAnualActual = false; // true si se está creando/editando un cumpleaños (solo cambia el aviso del formulario)
    let ocurrenciaSeleccionada = null; // fecha ISO de la ocurrencia tocada en el calendario
    let modoEdicionSerie = null;       // null | 'solo' | 'siguientes' | 'todos'
    let ocurrenciaEdicion = null;
    let avisosSeleccionados = new Set();
    let diasRepeticion = new Set();
    let fechaPendienteNuevoEventoInfo = null;

    // En la vista Agenda, baja directamente al día de hoy (o al siguiente con eventos).
    let agendaPendienteDeScroll = false;
    function irAHoyEnAgenda() {
      if (!agendaPendienteDeScroll || !calendar || calendar.view.type !== 'listMonth') return;
      setTimeout(() => {
        const cab = [...document.querySelectorAll('#calendar .fc-list-day[data-date]')];
        if (!cab.length) return; // aún sin eventos cargados: se reintenta cuando lleguen
        agendaPendienteDeScroll = false;
        const hoy = isoLocal(new Date());
        const destino = cab.find(e => e.dataset.date >= hoy);
        if (!destino || destino.dataset.date !== cab[0].dataset.date) {
          if (!destino) return; // mes ya pasado entero: se queda arriba
          const y = destino.getBoundingClientRect().top + window.scrollY - 70;
          window.scrollTo({ top: Math.max(0, y), behavior: 'auto' });
        }
      }, 50);
    }

    // Deslizar a izquierda/derecha en el calendario cambia de periodo (mes, semana, día, agenda).
    function activarGestoCalendario(el) {
      let x0 = 0, y0 = 0, t0 = 0, activo = false;
      el.addEventListener('touchstart', e => {
        activo = e.touches.length === 1;
        if (!activo) return;
        x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; t0 = Date.now();
      }, { passive: true });
      el.addEventListener('touchcancel', () => { activo = false; }, { passive: true });
      el.addEventListener('touchend', e => {
        if (!activo || !calendar) return;
        activo = false;
        const t = e.changedTouches[0];
        const dx = t.clientX - x0, dy = t.clientY - y0;
        // Gesto claramente horizontal, razonablemente rápido y largo (no un arrastre de evento ni un scroll)
        if (Math.abs(dx) < 70 || Math.abs(dx) < Math.abs(dy) * 1.8 || Date.now() - t0 > 700) return;
        if (document.querySelector('.fc-event-dragging, .fc-event-selected')) return;
        if (dx < 0) calendar.next(); else calendar.prev();
      }, { passive: true });
    }

    function inicializarCalendario() {
      comprobarPermisosNotif();
      const calendarEl = document.getElementById('calendar');
      
      if (!calendar) {
        let vistaGuardada = 'dayGridMonth';
        try {
          const v = localStorage.getItem('hogar_vista_cal');
          if (['listMonth', 'dayGridMonth', 'timeGridWeek', 'timeGridDay'].includes(v)) vistaGuardada = v;
        } catch (e) { /* sin almacenamiento: vista por defecto */ }
        calendar = new FullCalendar.Calendar(calendarEl, {
          initialView: vistaGuardada,
          datesSet: function(info) {
            try { localStorage.setItem('hogar_vista_cal', info.view.type); } catch (e) { /* sin almacenamiento */ }
            agendaPendienteDeScroll = info.view.type === 'listMonth';
            irAHoyEnAgenda();
          },
          eventsSet: function() { irAHoyEnAgenda(); },
          locale: 'es',
          firstDay: 1,
          dayMaxEvents: true,
          nowIndicator: true,
          editable: true,
          eventResizableFromStart: true,
          // Como Google: mantener pulsado (móvil) o arrastrar (ratón) sobre las horas o los días
          // para crear un evento con esa duración.
          selectable: true,
          selectMirror: true,
          longPressDelay: 350,
          selectLongPressDelay: 350,
          select: function(info) {
            const dur = info.end - info.start;
            const minimo = info.allDay ? 36 * 3600 * 1000 : 31 * 60 * 1000; // un simple toque ya lo gestiona dateClick
            calendar.unselect();
            if (dur < minimo) return;
            fechaPendienteNuevoEventoInfo = { fecha: info.start, fin: info.end, esDiaCompleto: info.allDay };
            mostrarMenuNuevoEvento();
          },
          slotMinTime: '07:00:00',
          slotMaxTime: '23:00:00',
          height: 'auto',
          headerToolbar: {
            left: 'prev,next today',
            center: 'title',
            right: 'listMonth,dayGridMonth,timeGridWeek,timeGridDay'
          },
          buttonText: { today: 'Hoy', month: 'Mes', week: 'Semana', day: 'Día', list: 'Agenda' },
          noEventsText: 'No hay eventos en este periodo',
          displayEventTime: true,
          eventTimeFormat: { hour: '2-digit', minute: '2-digit', hour12: false },
          eventDisplay: 'block',
          eventDidMount: function(info) {
            // Agenda: cada evento es una tarjeta con barra de color, hora y detalles (lugar y notas).
            if (info.view.type !== 'listMonth' || info.event.extendedProps.isFestivo) return;
            const fila = info.el;
            fila.style.setProperty('--ag-color', info.event.backgroundColor || '#2563eb');
            const tit = fila.querySelector('.fc-list-event-title');
            if (!tit) return;
            const p = info.event.extendedProps || {};
            const extra = document.createElement('div');
            extra.className = 'ag-extra';
            if (p.ubicacion && p.ubicacion.trim()) {
              const l = document.createElement('div');
              l.className = 'ag-lugar';
              l.textContent = '📍 ' + p.ubicacion.trim();
              extra.appendChild(l);
            }
            if (p.descripcion && p.descripcion.trim()) {
              const d = document.createElement('div');
              d.className = 'ag-desc';
              d.textContent = p.descripcion.trim();
              extra.appendChild(d);
            }
            if (extra.childNodes.length) tit.appendChild(extra);
          },
          views: {
            listMonth: { listDayFormat: { day: 'numeric', weekday: 'long' }, listDaySideFormat: false },
            // En la vista de mes la celda es muy estrecha: quitamos la hora de la
            // pastilla para que quepan más caracteres del título (la hora se sigue
            // viendo al tocar el evento, y en semana/día/agenda si aparece).
            dayGridMonth: { displayEventTime: false }
          },
          events: async function(fetchInfo, successCallback, failureCallback) {
            try {
              const data = await API.get('/eventos');
              eventosCache = data;
              await cargarConteoNotas();

              const eventosGenerados = [];
              const desdeISO = isoLocal(fetchInfo.start);
              const hastaISO = isoLocal(fetchInfo.end); // exclusivo

              data.forEach(e => {
                const color = typeof colorHexPersona === 'function' ? colorHexPersona(e.persona) : '#2563eb';

                const esTemporal = !!e.hora_inicio;
                const prefijo = e.repeticion === 'anual' ? '🎂 ' : '';
                const duracionDias = (e.fecha_fin && e.fecha_fin > e.start)
                  ? Math.round((parseFechaISO(e.fecha_fin) - parseFechaISO(e.start)) / 86400000) : 0;

                const extendedPropsBase = {
                  tituloOriginal: e.title,
                  persona: e.persona,
                  horaInicio: e.hora_inicio,
                  horaFin: e.hora_fin,
                  fecha: e.start,
                  fechaFin: e.fecha_fin,
                  descripcion: e.descripcion,
                  ubicacion: e.ubicacion || '',
                  avisos: e.avisos || [],
                  repeticion: e.repeticion || '',
                  anioNacimiento: e.anio_nacimiento || 0,
                  realId: e.id,
                  isFestivo: false
                };

                // Rango de una ocurrencia que empieza en fechaInicioISO (mantiene la duración original).
                function construirRango(fechaInicioISO) {
                  if (esTemporal) {
                    if (duracionDias > 0) {
                      // Evento con hora que además dura varios días (ej. un viaje viernes 18:00 - domingo).
                      return {
                        start: `${fechaInicioISO}T${e.hora_inicio}:00`,
                        end: `${sumarDiasISO(fechaInicioISO, duracionDias)}T${e.hora_fin || '23:59'}:00`,
                        allDay: false
                      };
                    }
                    return {
                      start: `${fechaInicioISO}T${e.hora_inicio}:00`,
                      end: e.hora_fin ? `${fechaInicioISO}T${e.hora_fin}:00` : null,
                      allDay: false
                    };
                  }
                  if (duracionDias > 0) {
                    return { start: fechaInicioISO, end: sumarDiasISO(fechaInicioISO, duracionDias + 1), allDay: true }; // el "end" de FullCalendar es exclusivo
                  }
                  return { start: fechaInicioISO, end: null, allDay: true };
                }

                // Fechas de inicio de cada ocurrencia que pueden verse en este rango
                // (se retrocede la duración por si una ocurrencia empezó antes pero llega hasta aquí).
                const fechas = fechasOcurrencia(e, sumarDiasISO(desdeISO, -duracionDias), hastaISO);
                fechas.forEach(fechaOcurrencia => {
                  eventosGenerados.push({
                    id: e.repeticion ? `${e.id}_${fechaOcurrencia}` : String(e.id),
                    title: prefijo + tituloConEdad(e, fechaOcurrencia),
                    ...construirRango(fechaOcurrencia),
                    backgroundColor: color,
                    borderColor: color,
                    extendedProps: { ...extendedPropsBase, fechaOcurrencia }
                  });
                });
              });

              // Combinar eventos del usuario con festivos laborales (de cada año visible)
              const festivos = [];
              for (let anio = fetchInfo.start.getFullYear(); anio <= fetchInfo.end.getFullYear(); anio++) {
                festivos.push(...festivosMadrid(anio));
              }
              const todosLosEventos = [...festivos, ...eventosGenerados];

              document.getElementById('contador-general').textContent = `${data.length} eventos`;
              successCallback(todosLosEventos);
            } catch (err) {
              failureCallback(err);
            }
          },
          eventClick: function(info) {
            if (!info.event.extendedProps.isFestivo) {
              abrirModal(info.event);
            }
          },
          dateClick: function(info) {
            fechaPendienteNuevoEventoInfo = { fecha: info.date, esDiaCompleto: info.allDay };
            mostrarMenuNuevoEvento();
          },
          eventDrop: async function(info) {
            if (info.event.extendedProps.isFestivo || info.event.extendedProps.repeticion) { info.revert(); return; }
            await moverOReprogramarEvento(info.event);
          },
          eventResize: async function(info) {
            if (info.event.extendedProps.isFestivo || info.event.extendedProps.repeticion) { info.revert(); return; }
            await moverOReprogramarEvento(info.event);
          }
        });
        calendar.render();
        activarGestoCalendario(calendarEl);
        activarSelectorFechaCalendario(calendarEl);
      } else {
        calendar.updateSize();
        calendar.refetchEvents();
      }
    }

    // --- Helpers de fechas para eventos de varios días y recurrencia anual ---
    function parseFechaISO(iso) {
      const [y, m, d] = iso.split('-').map(Number);
      return new Date(Date.UTC(y, m - 1, d));
    }
    function sumarDiasISO(iso, dias) {
      const f = parseFechaISO(iso);
      f.setUTCDate(f.getUTCDate() + dias);
      return f.toISOString().slice(0, 10);
    }
    function isoLocal(fecha) {
      return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}-${String(fecha.getDate()).padStart(2, '0')}`;
    }
    function diasEnMesJS(anio, mes) { return new Date(Date.UTC(anio, mes, 0)).getUTCDate(); } // mes 1-12

    // ¿Tiene el evento una ocurrencia que EMPIECE en este día? Copia equivalente de
    // ocurreEnDia en eventos_repeticion.go (si se cambia una, hay que cambiar la otra).
    function ocurreEnDia(e, diaISO) {
      const inicio = e.start;
      if (diaISO < inicio) return false;
      if (e.repetir_hasta && diaISO > e.repetir_hasta) return false;
      if (e.excepciones && e.excepciones.split(',').some(x => x.trim() === diaISO)) return false;
      const rep = e.repeticion || '';
      const cada = Math.max(1, e.repetir_cada || 1);
      const d = parseFechaISO(diaISO), i = parseFechaISO(inicio);
      switch (rep) {
        case '': return diaISO === inicio;
        case 'diaria': return Math.round((d - i) / 86400000) % cada === 0;
        case 'semanal': {
          let permitidos = (e.repetir_dias || '').split(',').map(x => x.trim()).filter(x => x !== '').map(Number);
          if (!permitidos.length) permitidos = [i.getUTCDay()];
          if (!permitidos.includes(d.getUTCDay())) return false;
          const lunes = (t) => Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate() - ((t.getUTCDay() + 6) % 7));
          const semanas = Math.round((lunes(d) - lunes(i)) / 86400000 / 7);
          return semanas % cada === 0;
        }
        case 'mensual': {
          const meses = (d.getUTCFullYear() - i.getUTCFullYear()) * 12 + d.getUTCMonth() - i.getUTCMonth();
          if (meses % cada !== 0) return false;
          const dia = Math.min(i.getUTCDate(), diasEnMesJS(d.getUTCFullYear(), d.getUTCMonth() + 1));
          return d.getUTCDate() === dia;
        }
        case 'anual': {
          if ((d.getUTCFullYear() - i.getUTCFullYear()) % cada !== 0 || d.getUTCMonth() !== i.getUTCMonth()) return false;
          const dia = Math.min(i.getUTCDate(), diasEnMesJS(d.getUTCFullYear(), d.getUTCMonth() + 1));
          return d.getUTCDate() === dia;
        }
      }
      return false;
    }

    // Fechas (ISO) en [desde, hasta) donde empieza una ocurrencia del evento.
    function fechasOcurrencia(e, desdeISO, hastaISO) {
      if (!e.repeticion) return (e.start >= desdeISO && e.start < hastaISO) ? [e.start] : [];
      const out = [];
      let dia = desdeISO < e.start ? e.start : desdeISO;
      for (let n = 0; dia < hastaISO && n < 800; n++, dia = sumarDiasISO(dia, 1)) {
        if (ocurreEnDia(e, dia)) out.push(dia);
      }
      return out;
    }

    // Edad que cumple en la ocurrencia (solo si se guardó el año de nacimiento).
    function edadEn(e, fechaOcurrencia) {
      const anio = e.anio_nacimiento || e.anioNacimiento || 0;
      if (!anio || !fechaOcurrencia) return 0;
      const edad = Number(fechaOcurrencia.slice(0, 4)) - anio;
      return edad > 0 && edad < 130 ? edad : 0;
    }
    function textoEdadJS(n) { return n === 1 ? '1 año' : `${n} años`; }
    function tituloConEdad(e, fechaOcurrencia) {
      const edad = edadEn(e, fechaOcurrencia);
      return edad ? `${e.title} · ${textoEdadJS(edad)}` : e.title;
    }

    const NOMBRES_DIA_CORTO = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    function describirRepeticion(e) {
      const rep = e.repeticion || '';
      if (!rep) return '';
      const cada = Math.max(1, e.repetir_cada || 1);
      const unidad = { diaria: ['día', 'días'], semanal: ['semana', 'semanas'], mensual: ['mes', 'meses'], anual: ['año', 'años'] }[rep];
      let t = cada === 1 ? `cada ${unidad[0]}` : `cada ${cada} ${unidad[1]}`;
      if (rep === 'semanal' && e.repetir_dias) {
        t += ' (' + e.repetir_dias.split(',').filter(x => x !== '').map(n => NOMBRES_DIA_CORTO[Number(n)]).join(', ') + ')';
      }
      if (e.repetir_hasta) t += ` hasta el ${formatearFechaCorta(e.repetir_hasta)}`;
      return t;
    }

    const ETIQUETAS_AVISO = { 5: '5 minutos', 15: '15 minutos', 30: '30 minutos', 60: '1 hora', 120: '2 horas', 1440: '1 día', 2880: '2 días' };
    function textoAviso(min) {
      if (ETIQUETAS_AVISO[min]) return ETIQUETAS_AVISO[min];
      if (min % 1440 === 0) return `${min / 1440} días`;
      if (min % 60 === 0) return `${min / 60} horas`;
      return `${min} minutos`;
    }

    // --- Buscador y duplicar ---
    function sinTildes(t) {
      return String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    }
    function alternarBuscadorCalendario() {
      const panel = document.getElementById('buscador-cal');
      panel.classList.toggle('hidden');
      if (!panel.classList.contains('hidden')) {
        const input = document.getElementById('buscar-evento-input');
        input.focus();
        buscarEventosCalendario();
      }
    }
    // Representa un evento guardado como si fuera uno de FullCalendar (para abrir su ficha).
    function eventoComoFC(e, fechaOcurrencia) {
      return {
        id: String(e.id),
        extendedProps: {
          tituloOriginal: e.title, persona: e.persona, horaInicio: e.hora_inicio, horaFin: e.hora_fin,
          fecha: e.start, fechaFin: e.fecha_fin, descripcion: e.descripcion, ubicacion: e.ubicacion || '', avisos: e.avisos || [],
          repeticion: e.repeticion || '', anioNacimiento: e.anio_nacimiento || 0, realId: e.id, fechaOcurrencia, isFestivo: false
        }
      };
    }
    function buscarEventosCalendario() {
      const q = sinTildes(document.getElementById('buscar-evento-input').value.trim());
      const cont = document.getElementById('resultados-buscar-cal');
      cont.innerHTML = '';
      const hoy = hoyLocalISO();
      let lista = eventosCache
        .filter(e => !q || sinTildes(e.title).includes(q) || sinTildes(e.descripcion).includes(q) || sinTildes(e.ubicacion || '').includes(q))
        .map(e => {
          // Próxima ocurrencia (o la última si ya pasó).
          let fecha = e.start;
          if (e.repeticion) {
            const prox = fechasOcurrencia(e, hoy, sumarDiasISO(hoy, 800))[0];
            if (prox) fecha = prox;
            else if (e.repetir_hasta) fecha = e.repetir_hasta;
          }
          return { e, fecha };
        });
      const futuros = lista.filter(x => x.fecha >= hoy).sort((a, b) => a.fecha.localeCompare(b.fecha));
      const pasados = lista.filter(x => x.fecha < hoy).sort((a, b) => b.fecha.localeCompare(a.fecha));
      lista = [...futuros, ...pasados].slice(0, 30);
      if (!lista.length) {
        cont.innerHTML = '<p class="text-center text-xs text-slate-400 py-3">Ningún evento coincide</p>';
        return;
      }
      lista.forEach(({ e, fecha }) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'w-full flex items-center justify-between gap-2 text-left bg-white border border-slate-200 rounded-xl px-3 py-2';
        b.innerHTML = `<span class="min-w-0"><span class="block text-sm font-semibold text-slate-800 truncate">${escapeHTML(e.repeticion === 'anual' ? '🎂 ' + tituloConEdad(e, fecha) : e.title)}</span>
          <span class="block text-[11px] text-slate-400">${e.repeticion ? '🔁 ' : ''}${escapeHTML(e.persona)}${e.hora_inicio ? ' · ' + e.hora_inicio : ''}</span></span>
          <span class="text-xs font-semibold ${fecha < hoy ? 'text-slate-400' : 'text-sky-600'} shrink-0">${formatearFechaCorta(fecha)}</span>`;
        b.onclick = () => {
          if (calendar) calendar.gotoDate(fecha);
          abrirModal(eventoComoFC(e, fecha));
        };
        cont.appendChild(b);
      });
    }

    function duplicarEvento() {
      const ev = eventosCache.find(e => e.id === eventoSeleccionadoId);
      if (!ev) return;
      const fecha = ocurrenciaSeleccionada || ev.start;
      const duracion = (ev.fecha_fin && ev.fecha_fin > ev.start)
        ? Math.round((parseFechaISO(ev.fecha_fin) - parseFechaISO(ev.start)) / 86400000) : 0;
      resetearFormularioEvento();
      document.getElementById('titulo-evento').value = ev.title;
      document.getElementById('descripcion-evento').value = ev.descripcion || '';
      document.getElementById('ubicacion-evento').value = ev.ubicacion || '';
      document.getElementById('fecha-evento').value = fecha;
      document.getElementById('todo-dia-evento').checked = !ev.hora_inicio;
      aplicarTodoDiaUI();
      document.getElementById('hora-inicio-evento').value = ev.hora_inicio || '';
      document.getElementById('hora-fin-evento').value = ev.hora_fin || '';
      document.getElementById('fecha-fin-evento').value = duracion > 0 ? sumarDiasISO(fecha, duracion) : '';
      seleccionarPersonaEvento(ev.persona);
      avisosSeleccionados = new Set(ev.avisos || []);
      repetirAnualActual = ev.repeticion === 'anual';
      document.getElementById('repeticion-evento').value = ev.repeticion || '';
      document.getElementById('repetir-cada-evento').value = String(ev.repetir_cada || 1);
      document.getElementById('repetir-hasta-evento').value = ev.repetir_hasta || '';
      document.getElementById('anio-nacimiento-evento').value = ev.anio_nacimiento || '';
      diasRepeticion = new Set((ev.repetir_dias || '').split(',').filter(x => x !== '').map(Number));
      actualizarUIRepeticion(false);
      const aviso = document.getElementById('aviso-editando-evento');
      aviso.textContent = '📋 Nuevo evento a partir de una copia: cambia lo que quieras y guarda';
      aviso.classList.remove('hidden');
      cerrarModal();
      mostrarFormularioEvento();
    }

    // --- Menú flotante: elegir "Evento" o "Cumpleaños" antes de abrir el formulario ---
    function mostrarMenuNuevoEvento() {
      document.getElementById('menu-nuevo-evento').classList.remove('hidden');
    }
    function cerrarMenuNuevoEvento() {
      document.getElementById('menu-nuevo-evento').classList.add('hidden');
      fechaPendienteNuevoEventoInfo = null;
    }
    function elegirTipoNuevoEvento(tipo) {
      document.getElementById('menu-nuevo-evento').classList.add('hidden');
      const fechaInfo = fechaPendienteNuevoEventoInfo;
      fechaPendienteNuevoEventoInfo = null;

      resetearFormularioEvento();
      repetirAnualActual = (tipo === 'cumple');
      document.getElementById('repeticion-evento').value = repetirAnualActual ? 'anual' : '';
      actualizarUIRepeticion(false);
      actualizarAvisoTipoEvento();

      if (fechaInfo) {
        aplicarFechaAlFormulario(fechaInfo.fecha, fechaInfo.esDiaCompleto, fechaInfo.fin);
      }
      mostrarFormularioEvento();
    }
    function actualizarAvisoTipoEvento() {
      document.getElementById('aviso-tipo-cumple').classList.toggle('hidden', !(repetirAnualActual && document.getElementById('repeticion-evento').value === 'anual'));
    }

    // Rellena la fecha/hora del formulario a partir de un punto del calendario (clic en un día/hueco).
    // Tocar el título del calendario (p. ej. "octubre 2026") abre un selector para saltar a cualquier fecha.
    function activarSelectorFechaCalendario(calendarEl) {
      let input = document.getElementById('cal-saltar-fecha');
      if (!input) {
        input = document.createElement('input');
        input.type = 'date';
        input.id = 'cal-saltar-fecha';
        input.setAttribute('aria-label', 'Ir a una fecha');
        input.style.cssText = 'position:fixed;left:50%;top:30%;width:1px;height:1px;opacity:0;pointer-events:none;';
        input.addEventListener('change', () => { if (input.value && calendar) calendar.gotoDate(input.value); });
        document.body.appendChild(input);
      }
      calendarEl.addEventListener('click', (ev) => {
        if (!ev.target.closest('.fc-toolbar-title')) return;
        try { input.value = isoLocal(calendar.getDate()); } catch (e) { /* sin valor previo */ }
        try {
          if (input.showPicker) input.showPicker(); else { input.style.pointerEvents = 'auto'; input.focus(); input.click(); }
        } catch (e) { input.focus(); input.click(); }
      });
    }

    function aplicarFechaAlFormulario(fecha, esDiaCompleto, fin) {
      const y = fecha.getFullYear();
      const m = String(fecha.getMonth() + 1).padStart(2, '0');
      const d = String(fecha.getDate()).padStart(2, '0');
      document.getElementById('fecha-evento').value = `${y}-${m}-${d}`;

      const check = document.getElementById('todo-dia-evento');
      if (!esDiaCompleto) {
        check.checked = false;
        aplicarTodoDiaUI();
        const hh = String(fecha.getHours()).padStart(2, '0');
        const mm = String(fecha.getMinutes()).padStart(2, '0');
        document.getElementById('hora-inicio-evento').value = `${hh}:${mm}`;
        const finH = fin ? new Date(fin) : new Date(fecha.getTime() + 30 * 60 * 1000);
        document.getElementById('hora-fin-evento').value = finH.getDate() === fecha.getDate()
          ? `${String(finH.getHours()).padStart(2, '0')}:${String(finH.getMinutes()).padStart(2, '0')}`
          : '23:59';
      } else {
        check.checked = true;
        aplicarTodoDiaUI();
        // Varios días seleccionados: el "fin" de FullCalendar es exclusivo, se resta un día.
        if (fin) {
          const ultimo = new Date(fin.getTime() - 24 * 3600 * 1000);
          if (isoLocal(ultimo) > isoLocal(fecha)) document.getElementById('fecha-fin-evento').value = isoLocal(ultimo);
        }
      }
    }

    // Arrastrar/redimensionar un evento en el calendario reprograma su fecha/hora directamente.
    async function moverOReprogramarEvento(evento) {
      const props = evento.extendedProps;
      const start = evento.start;
      const y = start.getFullYear();
      const m = String(start.getMonth() + 1).padStart(2, '0');
      const d = String(start.getDate()).padStart(2, '0');
      const nuevaFecha = `${y}-${m}-${d}`;

      let horaInicio = '';
      let horaFin = '';
      let fechaFin = '';
      if (!evento.allDay) {
        horaInicio = `${String(start.getHours()).padStart(2, '0')}:${String(start.getMinutes()).padStart(2, '0')}`;
        if (evento.end) {
          horaFin = `${String(evento.end.getHours()).padStart(2, '0')}:${String(evento.end.getMinutes()).padStart(2, '0')}`;
          const finY = evento.end.getFullYear();
          const finM = String(evento.end.getMonth() + 1).padStart(2, '0');
          const finD = String(evento.end.getDate()).padStart(2, '0');
          const finFechaISO = `${finY}-${finM}-${finD}`;
          if (finFechaISO > nuevaFecha) fechaFin = finFechaISO;
        }
      } else if (evento.end) {
        // "end" de FullCalendar es exclusivo: restamos un día para guardar el último día real.
        const finInclusivo = new Date(evento.end.getTime() - 86400000);
        const finISO = `${finInclusivo.getFullYear()}-${String(finInclusivo.getMonth() + 1).padStart(2, '0')}-${String(finInclusivo.getDate()).padStart(2, '0')}`;
        if (finISO > nuevaFecha) fechaFin = finISO;
      }

      try {
        const res = await API.put(`/eventos/${evento.id}`, {
          title: props.tituloOriginal,
          start: nuevaFecha,
          fecha_fin: fechaFin,
          hora_inicio: horaInicio,
          hora_fin: horaFin,
          persona: props.persona,
          descripcion: props.descripcion,
          ubicacion: props.ubicacion || '',
          avisos: props.avisos || [],
          repeticion: ''
        });
        if (!(res && res.offline)) {
          calendar.refetchEvents();
        }
      } catch (error) {
        mostrarError('Error al mover el evento', error);
        calendar.refetchEvents(); // revertir visualmente al estado real
      }
    }

    function abrirModal(evento) {
      const props = evento.extendedProps;
      eventoSeleccionadoId = props.realId != null ? props.realId : Number(evento.id);
      ocurrenciaSeleccionada = props.fechaOcurrencia || props.fecha;
      actualizarBotonNotasEvento(eventoSeleccionadoId);
      const raw = eventosCache.find(x => x.id === eventoSeleccionadoId) || {};

      document.getElementById('modal-titulo').textContent = (props.repeticion === 'anual' ? '🎂 ' : '') + tituloConEdad({ title: props.tituloOriginal, anio_nacimiento: props.anioNacimiento }, props.repeticion ? ocurrenciaSeleccionada : props.fecha);
      const inicioMostrado = props.repeticion ? ocurrenciaSeleccionada : props.fecha;
      const duracion = (props.fechaFin && props.fechaFin > props.fecha)
        ? Math.round((parseFechaISO(props.fechaFin) - parseFechaISO(props.fecha)) / 86400000) : 0;
      const rangoFecha = duracion > 0
        ? `${formatearFechaCorta(inicioMostrado)} – ${formatearFechaCorta(sumarDiasISO(inicioMostrado, duracion))}`
        : formatearFechaCorta(inicioMostrado);
      document.getElementById('modal-fecha').textContent = `📅 Fecha: ${rangoFecha}${props.repeticion ? ' · 🔁 ' + describirRepeticion(raw) : ''}`;

      let horaTexto = "⏰ Hora: Todo el día";
      if (props.horaInicio) {
        horaTexto = `⏰ Hora: ${props.horaInicio}${props.horaFin ? ' a ' + props.horaFin : ''}`;
      }
      document.getElementById('modal-hora').textContent = horaTexto;

      const avisos = props.avisos || [];
      document.getElementById('modal-notif').textContent = avisos.length
        ? `🔔 Aviso: ${avisos.map(m => textoAviso(m) + ' antes').join(' y ')}`
        : '🔔 Sin aviso';

      const ubi = document.getElementById('modal-ubicacion');
      if (props.ubicacion && props.ubicacion.trim()) {
        ubi.textContent = '📍 ' + props.ubicacion;
        ubi.href = 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(props.ubicacion);
        ubi.classList.remove('hidden');
      } else {
        ubi.classList.add('hidden');
      }

      const descBox = document.getElementById('modal-desc-box');
      if (props.descripcion && props.descripcion.trim() !== '') {
        document.getElementById('modal-descripcion').textContent = props.descripcion;
        descBox.classList.remove('hidden');
      } else {
        descBox.classList.add('hidden');
      }

      const tag = document.getElementById('modal-persona-tag');
      tag.textContent = props.persona;

      const colorTag = typeof colorAvatarPersona === 'function' ? colorAvatarPersona(props.persona) : 'bg-sky-100 text-sky-700';
      tag.className = 'text-xs font-bold px-3 py-1 rounded-full ' + (props.persona === 'Todos' ? 'bg-sky-100 text-sky-700' : colorTag);

      document.getElementById('modal-evento').classList.remove('hidden');
    }

    function cerrarModal() {
      document.getElementById('modal-evento').classList.add('hidden');
      eventoSeleccionadoId = null;
    }

    // --- Eventos repetidos: ¿solo este, este y siguientes, o toda la serie? ---
    let resolverAlcanceSerie = null;
    function preguntarAlcanceSerie(titulo) {
      document.getElementById('modal-serie-titulo').textContent = titulo;
      document.getElementById('modal-serie').classList.remove('hidden');
      return new Promise(resolve => { resolverAlcanceSerie = resolve; });
    }
    function responderAlcanceSerie(modo) {
      document.getElementById('modal-serie').classList.add('hidden');
      if (resolverAlcanceSerie) resolverAlcanceSerie(modo);
      resolverAlcanceSerie = null;
    }

    // Cuerpo completo de un evento tal como lo guarda el servidor (para reenviarlo con cambios).
    function cuerpoEvento(raw, cambios = {}) {
      return {
        title: raw.title, start: raw.start, fecha_fin: raw.fecha_fin || '',
        hora_inicio: raw.hora_inicio || '', hora_fin: raw.hora_fin || '',
        persona: raw.persona, descripcion: raw.descripcion || '', ubicacion: raw.ubicacion || '',
        avisos: raw.avisos || [], repeticion: raw.repeticion || '',
        repetir_cada: raw.repetir_cada || 1, repetir_dias: raw.repetir_dias || '',
        repetir_hasta: raw.repetir_hasta || '', anio_nacimiento: raw.anio_nacimiento || 0,
        ...cambios
      };
    }

    document.getElementById('modal-btn-borrar').addEventListener('click', async () => {
      if (!eventoSeleccionadoId) return;
      const id = eventoSeleccionadoId;
      const ocurrencia = ocurrenciaSeleccionada;
      const raw = eventosCache.find(e => e.id === id);
      try {
        let modo = 'todos';
        if (raw && raw.repeticion) {
          modo = await preguntarAlcanceSerie('¿Qué eventos quieres borrar?');
          if (!modo) return;
        }
        if (modo === 'siguientes' && ocurrencia === raw.start) modo = 'todos';
        if (modo === 'solo') {
          await API.post(`/eventos/${id}/excepcion`, { fecha: ocurrencia });
        } else if (modo === 'siguientes') {
          await API.put(`/eventos/${id}`, cuerpoEvento(raw, { repetir_hasta: sumarDiasISO(ocurrencia, -1) }));
        } else {
          await API.delete(`/eventos/${id}`);
        }
        cerrarModal();
        if (calendar) calendar.refetchEvents();
      } catch (error) {
        mostrarError('Error al borrar el evento', error);
      }
    });

    document.getElementById('form-evento').addEventListener('submit', async (e) => {
      e.preventDefault();
      const todoElDia = document.getElementById('todo-dia-evento').checked;
      const horaInicio = todoElDia ? '' : document.getElementById('hora-inicio-evento').value;
      const horaFin = todoElDia ? '' : document.getElementById('hora-fin-evento').value;
      const repeticion = modoEdicionSerie === 'solo' ? '' : document.getElementById('repeticion-evento').value;
      const fechaInicio = document.getElementById('fecha-evento').value;
      const fechaFin = document.getElementById('fecha-fin-evento').value;

      if (horaInicio && horaFin && horaFin <= horaInicio) {
        alert('La hora de fin debe ser posterior a la de inicio.');
        return;
      }
      if (fechaFin && fechaFin < fechaInicio) {
        alert('La fecha de fin no puede ser anterior a la de inicio.');
        return;
      }

      const datos = {
        title: document.getElementById('titulo-evento').value.trim(),
        descripcion: document.getElementById('descripcion-evento').value.trim(),
        ubicacion: document.getElementById('ubicacion-evento').value.trim(),
        start: fechaInicio,
        fecha_fin: fechaFin,
        hora_inicio: horaInicio,
        hora_fin: horaInicio ? horaFin : '',
        persona: document.getElementById('persona-evento').value,
        avisos: [...avisosSeleccionados].sort((a, b) => b - a),
        repeticion: repeticion,
        repetir_cada: repeticion ? Math.max(1, Number.parseInt(document.getElementById('repetir-cada-evento').value, 10) || 1) : 1,
        repetir_dias: repeticion === 'semanal' ? [...diasRepeticion].sort().join(',') : '',
        repetir_hasta: repeticion ? document.getElementById('repetir-hasta-evento').value : '',
        anio_nacimiento: repeticion === 'anual' ? (Number.parseInt(document.getElementById('anio-nacimiento-evento').value, 10) || 0) : 0
      };
      if (repeticion && datos.repetir_hasta && datos.repetir_hasta < fechaInicio) {
        alert('La repetición no puede terminar antes de que empiece el evento.');
        return;
      }

      try {
        let res;
        const raw = eventosCache.find(x => x.id === eventoEditandoId);
        if (eventoEditandoId && raw && modoEdicionSerie === 'solo') {
          // Solo esta ocurrencia: se quita de la serie y se crea un evento suelto con los cambios.
          await API.post(`/eventos/${eventoEditandoId}/excepcion`, { fecha: ocurrenciaEdicion });
          res = await API.post('/eventos', datos);
        } else if (eventoEditandoId && raw && modoEdicionSerie === 'siguientes') {
          // Esta y las siguientes: la serie original termina el día anterior y empieza una nueva.
          await API.put(`/eventos/${eventoEditandoId}`, cuerpoEvento(raw, { repetir_hasta: sumarDiasISO(ocurrenciaEdicion, -1) }));
          res = await API.post('/eventos', datos);
        } else {
          res = await (eventoEditandoId ? API.put(`/eventos/${eventoEditandoId}`, datos) : API.post('/eventos', datos));
        }

        cancelarEdicionEvento();
        if (calendar && !(res && res.offline)) calendar.refetchEvents();
      } catch (error) {
        mostrarError('Error al guardar evento', error);
      }
    });

    // --- Formulario de evento: mostrar/ocultar, persona, "todo el día" ---
    function seleccionarPersonaEvento(nombre) {
      document.getElementById('persona-evento').value = nombre;
      document.querySelectorAll('#chips-persona-evento .chip-persona').forEach(chip => {
        const activo = chip.dataset.persona === nombre;
        const color = typeof colorHexPersona === 'function' ? colorHexPersona(chip.dataset.persona) : '#2563eb';
        chip.style.backgroundColor = activo ? color : '#ffffff';
        chip.style.borderColor = activo ? color : '#e2e8f0';
        chip.style.color = activo ? '#ffffff' : '#475569';
      });
    }

    function aplicarTodoDiaUI() {
      const todo = document.getElementById('todo-dia-evento').checked;
      document.getElementById('fila-horas-evento').classList.toggle('hidden', todo);
      if (todo) {
        document.getElementById('hora-inicio-evento').value = '';
        document.getElementById('hora-fin-evento').value = '';
      }
    }

    // Al quitar "Todo el día" se propone la próxima hora en punto (30 min de duración).
    function alternarTodoDiaEvento() {
      aplicarTodoDiaUI();
      const todo = document.getElementById('todo-dia-evento').checked;
      const inicio = document.getElementById('hora-inicio-evento');
      if (todo || inicio.value) return;
      const ini = new Date();
      ini.setHours(ini.getHours() + 1, 0, 0, 0);
      const fin = new Date(ini.getTime() + 30 * 60 * 1000);
      const fmt = (d) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
      inicio.value = fmt(ini);
      document.getElementById('hora-fin-evento').value = fin.getDate() === ini.getDate() ? fmt(fin) : '23:59';
    }

    // Al escribir/cambiar la hora de inicio a mano, se propone la de fin media hora después.
    function actualizarHoraFinPorDefecto() {
      const inicio = document.getElementById('hora-inicio-evento').value;
      if (!inicio) return;
      const [hh, mm] = inicio.split(':').map(Number);
      const ini = new Date();
      ini.setHours(hh, mm, 0, 0);
      const fin = new Date(ini.getTime() + 30 * 60 * 1000);
      document.getElementById('hora-fin-evento').value = fin.getDate() === ini.getDate()
        ? `${String(fin.getHours()).padStart(2, '0')}:${String(fin.getMinutes()).padStart(2, '0')}`
        : '23:59';
    }

    function mostrarFormularioEvento() {
      renderizarChipsAvisos();
      document.getElementById('form-evento').classList.remove('hidden');
      document.getElementById('fab-nuevo-evento').classList.add('hidden');
      const form = document.getElementById('form-evento');
      form.scrollIntoView({ behavior: 'smooth', block: 'start' });
      document.getElementById('titulo-evento').focus({ preventScroll: true });
    }

    // Deja el formulario limpio y en modo "crear" (sin cambiar si está visible u oculto).
    function resetearFormularioEvento() {
      eventoEditandoId = null;
      repetirAnualActual = false;
      modoEdicionSerie = null;
      ocurrenciaEdicion = null;
      avisosSeleccionados = new Set();
      diasRepeticion = new Set();
      document.getElementById('aviso-editando-evento').classList.add('hidden');
      document.getElementById('btn-submit-evento').textContent = 'Guardar evento';
      document.getElementById('form-evento').reset();
      document.getElementById('fecha-evento').value = hoyLocalISO();
      document.getElementById('fecha-fin-evento').value = '';
      document.getElementById('todo-dia-evento').checked = true;
      seleccionarPersonaEvento('Todos');
      aplicarTodoDiaUI();
      document.getElementById('repeticion-evento').value = '';
      document.getElementById('repetir-cada-evento').value = '1';
      document.getElementById('repetir-hasta-evento').value = '';
      document.getElementById('anio-nacimiento-evento').value = '';
      document.getElementById('bloque-repeticion').classList.remove('hidden');
      actualizarUIRepeticion(false);
      renderizarChipsAvisos();
      actualizarAvisoTipoEvento();
    }

    // --- Repetición y avisos en el formulario ---
    const UNIDADES_REPETICION = { diaria: 'días', semanal: 'semanas', mensual: 'meses', anual: 'años' };

    function actualizarUIRepeticion(cambioManual) {
      const rep = document.getElementById('repeticion-evento').value;
      document.getElementById('detalle-repeticion').classList.toggle('hidden', !rep);
      document.getElementById('fila-anio-nacimiento').classList.toggle('hidden', rep !== 'anual');
      document.getElementById('unidad-repeticion').textContent = UNIDADES_REPETICION[rep] || '';
      document.getElementById('dias-repeticion').classList.toggle('hidden', rep !== 'semanal');
      if (rep === 'semanal' && cambioManual && diasRepeticion.size === 0) {
        // Por defecto, el día de la semana de la fecha del evento.
        const f = document.getElementById('fecha-evento').value;
        if (f) diasRepeticion.add(parseFechaISO(f).getUTCDay());
      }
      if (rep !== 'anual') repetirAnualActual = false;
      pintarDiasRepeticion();
      actualizarAvisoTipoEvento();
    }
    function alternarDiaRepeticion(n) {
      if (diasRepeticion.has(n)) diasRepeticion.delete(n); else diasRepeticion.add(n);
      pintarDiasRepeticion();
    }
    function pintarDiasRepeticion() {
      document.querySelectorAll('#dias-repeticion .dia-rep').forEach(b => {
        b.classList.toggle('activo', diasRepeticion.has(Number(b.dataset.dia)));
      });
    }

    const OPCIONES_AVISO = [5, 15, 30, 60, 120, 1440, 2880];
    function renderizarChipsAvisos() {
      const cont = document.getElementById('chips-avisos-evento');
      // Si el evento ya tenía un aviso poco habitual, también se muestra.
      const opciones = [...new Set([...OPCIONES_AVISO, ...avisosSeleccionados])].sort((a, b) => a - b);
      cont.innerHTML = '';
      opciones.forEach(min => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'chip-aviso' + (avisosSeleccionados.has(min) ? ' activo' : '');
        b.textContent = textoAviso(min);
        b.onclick = () => {
          if (avisosSeleccionados.has(min)) avisosSeleccionados.delete(min);
          else if (avisosSeleccionados.size >= 5) { alert('Máximo 5 avisos por evento.'); return; }
          else avisosSeleccionados.add(min);
          renderizarChipsAvisos();
        };
        cont.appendChild(b);
      });
      document.getElementById('ayuda-avisos-evento').textContent = avisosSeleccionados.size
        ? 'Avisará ' + [...avisosSeleccionados].sort((a, b) => b - a).map(m => textoAviso(m)).join(' y ') + ' antes.'
        : 'Sin aviso. Toca uno o varios.';
    }

    async function iniciarEdicionEvento() {
      const ev = eventosCache.find(e => e.id === eventoSeleccionadoId);
      if (!ev) return;
      const ocurrencia = ocurrenciaSeleccionada || ev.start;

      let modo = 'todos';
      if (ev.repeticion) {
        modo = await preguntarAlcanceSerie('¿Qué eventos quieres editar?');
        if (!modo) return;
        if (modo === 'siguientes' && ocurrencia === ev.start) modo = 'todos';
      }

      resetearFormularioEvento();
      eventoEditandoId = ev.id;
      modoEdicionSerie = modo;
      ocurrenciaEdicion = ocurrencia;

      const duracion = (ev.fecha_fin && ev.fecha_fin > ev.start)
        ? Math.round((parseFechaISO(ev.fecha_fin) - parseFechaISO(ev.start)) / 86400000) : 0;
      const fechaForm = modo === 'todos' ? ev.start : ocurrencia;

      document.getElementById('titulo-evento').value = ev.title;
      document.getElementById('descripcion-evento').value = ev.descripcion || '';
      document.getElementById('ubicacion-evento').value = ev.ubicacion || '';
      document.getElementById('fecha-evento').value = fechaForm;
      document.getElementById('todo-dia-evento').checked = !ev.hora_inicio;
      aplicarTodoDiaUI();
      document.getElementById('hora-inicio-evento').value = ev.hora_inicio || '';
      document.getElementById('hora-fin-evento').value = ev.hora_fin || '';
      document.getElementById('fecha-fin-evento').value = duracion > 0 ? sumarDiasISO(fechaForm, duracion) : '';
      seleccionarPersonaEvento(ev.persona);

      avisosSeleccionados = new Set(ev.avisos || []);
      renderizarChipsAvisos();

      // Repetición: en "solo este" el evento pasa a ser suelto, así que no se muestra.
      repetirAnualActual = ev.repeticion === 'anual';
      document.getElementById('repeticion-evento').value = ev.repeticion || '';
      document.getElementById('repetir-cada-evento').value = String(ev.repetir_cada || 1);
      document.getElementById('repetir-hasta-evento').value = ev.repetir_hasta || '';
      document.getElementById('anio-nacimiento-evento').value = ev.anio_nacimiento || '';
      diasRepeticion = new Set((ev.repetir_dias || '').split(',').filter(x => x !== '').map(Number));
      document.getElementById('bloque-repeticion').classList.toggle('hidden', modo === 'solo');
      actualizarUIRepeticion(false);

      const aviso = document.getElementById('aviso-editando-evento');
      aviso.textContent = modo === 'solo' ? `✏️ Editando solo el evento del ${formatearFechaCorta(ocurrencia)}`
        : modo === 'siguientes' ? `✏️ Editando este y los siguientes (desde el ${formatearFechaCorta(ocurrencia)})`
        : ev.repeticion ? '✏️ Editando toda la serie' : '✏️ Editando un evento existente';
      aviso.classList.remove('hidden');
      document.getElementById('btn-submit-evento').textContent = 'Guardar cambios';

      cerrarModal();
      mostrarFormularioEvento();
    }

    function cancelarEdicionEvento() {
      resetearFormularioEvento();
      document.getElementById('form-evento').classList.add('hidden');
      document.getElementById('fab-nuevo-evento').classList.remove('hidden');
    }

    document.getElementById('modal-btn-editar').addEventListener('click', iniciarEdicionEvento);

    // --- PAGOS / FACTURAS ---
    const ETIQUETAS_FRECUENCIA = {
      mensual: 'Mensual',
      bimestral: 'Cada 2 meses',
      trimestral: 'Trimestral',
      semestral: 'Semestral',
      anual: 'Anual',
      puntual: 'Puntual'
    };

    function formatearImporte(valor) {
      return Number(valor || 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    function formatearFechaCorta(iso) {
      const [y, m, d] = iso.split('-');
      return `${d}/${m}/${y}`;
    }

    function siguienteFechaJS(fechaISO, frecuencia) {
      const [y, m, d] = fechaISO.split('-').map(Number);
      const fecha = new Date(Date.UTC(y, m - 1, d));
      switch (frecuencia) {
        case 'mensual': fecha.setUTCMonth(fecha.getUTCMonth() + 1); break;
        case 'bimestral': fecha.setUTCMonth(fecha.getUTCMonth() + 2); break;
        case 'trimestral': fecha.setUTCMonth(fecha.getUTCMonth() + 3); break;
        case 'semestral': fecha.setUTCMonth(fecha.getUTCMonth() + 6); break;
        case 'anual': fecha.setUTCFullYear(fecha.getUTCFullYear() + 1); break;
        default: break;
      }
      const yy = fecha.getUTCFullYear();
      const mm = String(fecha.getUTCMonth() + 1).padStart(2, '0');
      const dd = String(fecha.getUTCDate()).padStart(2, '0');
      return `${yy}-${mm}-${dd}`;
    }

    let cachePagos = [];
    let cacheHistorialPagos = [];
    let verTodoHistorialPagos = false;
    let pagoEditandoId = null;
    let toastTimer = null;

    const MESES_LARGOS = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];

    function mostrarToast(texto, accionTexto, accion) {
      let t = document.getElementById('toast-hogar');
      if (!t) {
        t = document.createElement('div');
        t.id = 'toast-hogar';
        t.className = 'fixed left-1/2 -translate-x-1/2 bottom-24 z-50 flex items-center gap-3 bg-slate-900 text-white text-sm rounded-2xl shadow-lg px-4 py-2.5';
        document.body.appendChild(t);
      }
      t.innerHTML = '';
      const span = document.createElement('span');
      span.textContent = texto;
      t.appendChild(span);
      if (accionTexto) {
        const btn = document.createElement('button');
        btn.textContent = accionTexto;
        btn.className = 'font-bold text-emerald-300 uppercase text-xs tracking-wide';
        btn.onclick = () => { t.classList.add('hidden'); clearTimeout(toastTimer); accion(); };
        t.appendChild(btn);
      }
      t.classList.remove('hidden');
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => t.classList.add('hidden'), 7000);
    }

    async function cargarPagos() {
      try {
        const [pagos, hist] = await Promise.all([
          API.get('/pagos'),
          API.get('/pagos/historial').catch(() => cacheHistorialPagos)
        ]);
        cachePagos = pagos;
        cacheHistorialPagos = Array.isArray(hist) ? hist : [];
        await cargarConteoNotas();
        renderizarPagos();
      } catch (err) {
        console.error("Error al cargar los pagos:", err);
      }
    }

    function diasHasta(iso, hoy) {
      return Math.round((Date.parse(iso + 'T00:00:00Z') - Date.parse(hoy + 'T00:00:00Z')) / 86400000);
    }

    function tarjetaPagoPendiente(p, hoy) {
      const dias = diasHasta(p.fecha, hoy);
      const vencido = dias < 0;
      let cuando = formatearFechaCorta(p.fecha);
      if (vencido) cuando = `Venció hace ${-dias} d`;
      else if (dias === 0) cuando = 'Hoy';
      else if (dias === 1) cuando = 'Mañana';
      else if (dias <= 7) cuando = `En ${dias} días`;
      const card = document.createElement('div');
      card.className = `flex items-center justify-between p-3.5 bg-white border rounded-2xl shadow-sm ${vencido ? 'border-rose-300 bg-rose-50/60' : 'border-slate-200'}`;
      card.innerHTML = `
        <div class="flex items-center gap-3 flex-grow min-w-0">
          <button onclick="marcarPagoRealizado(${p.id})" class="w-9 h-9 rounded-full border-2 ${vencido ? 'border-rose-300' : 'border-slate-300'} text-transparent hover:border-emerald-500 hover:text-emerald-500 active:scale-90 transition-all flex items-center justify-center text-base font-bold shrink-0" title="Marcar como pagado">✓</button>
          <div class="min-w-0">
            <p class="text-sm font-semibold text-slate-800 truncate">${escapeHTML(p.nombre)}</p>
            <div class="flex flex-wrap gap-1 mt-0.5 items-center">
              <span class="text-[10px] font-semibold px-2 py-0.5 bg-fuchsia-50 text-fuchsia-700 rounded-md">${formatearImporte(p.importe)} €</span>
              <span class="text-[10px] font-semibold px-2 py-0.5 ${vencido ? 'bg-rose-100 text-rose-700' : 'bg-sky-50 text-sky-700'} rounded-md">📅 ${cuando}${dias > 7 || vencido ? ' · ' + formatearFechaCorta(p.fecha) : ''}</span>
              <span class="text-[10px] font-semibold px-2 py-0.5 bg-slate-100 text-slate-600 rounded-md">🔁 ${ETIQUETAS_FRECUENCIA[p.frecuencia] || p.frecuencia}</span>
              <span class="text-[10px] font-semibold px-2 py-0.5 bg-indigo-50 text-indigo-600 rounded-md">${escapeHTML(p.persona)}</span>
              ${p.id < 0 ? '<span class="text-[10px] font-semibold px-2 py-0.5 bg-slate-100 text-slate-500 rounded-md">⏳ sin sincronizar</span>' : ''}
            </div>
            ${p.notas ? `<p class="text-[11px] text-slate-400 mt-1">${escapeHTML(p.notas)}</p>` : ''}
          </div>
        </div>
        <div class="flex items-center gap-0.5 pl-2 shrink-0">
          ${botonNotasHTML('pago', p.id)}
          <button onclick="iniciarEdicionPago(${p.id})" class="p-2 text-slate-400 hover:text-sky-600" title="Editar">✏️</button>
          <button onclick="borrarPago(${p.id})" class="p-2 text-slate-400 hover:text-rose-600">❌</button>
        </div>`;
      return card;
    }

    function renderizarPagos() {
      const hoy = hoyLocalISO();
      const mesActual = hoy.slice(0, 7);
      const pendientes = cachePagos.filter(p => !p.pagado).sort((a, b) => a.fecha.localeCompare(b.fecha));
      const contador = document.getElementById('contador-general');
      contador.textContent = `${pendientes.length} pagos programados`;

      // --- Resumen del mes ---
      const pagadoMes = cacheHistorialPagos.filter(h => h.fecha_pago.slice(0, 7) === mesActual);
      const totalPagado = pagadoMes.reduce((t, h) => t + h.importe, 0);
      const pendienteMes = pendientes.filter(p => p.fecha.slice(0, 7) <= mesActual);
      const totalPendiente = pendienteMes.reduce((t, p) => t + p.importe, 0);
      const total = totalPagado + totalPendiente;
      const pct = total > 0 ? Math.round((totalPagado / total) * 100) : (pagadoMes.length ? 100 : 0);
      const resumen = document.getElementById('resumen-pagos');
      const mesNombre = MESES_LARGOS[Number(mesActual.slice(5, 7)) - 1];
      if (cachePagos.length === 0 && cacheHistorialPagos.length === 0) {
        resumen.innerHTML = '';
      } else {
        resumen.innerHTML = `
          <div class="bg-white border border-slate-200 rounded-2xl shadow-sm p-4">
            <div class="flex items-baseline justify-between">
              <p class="text-xs font-bold text-slate-400 uppercase tracking-wider">${mesNombre}</p>
              <p class="text-xs font-semibold text-emerald-600">${pagadoMes.length} pagado${pagadoMes.length === 1 ? '' : 's'} · ${pendienteMes.length} pendiente${pendienteMes.length === 1 ? '' : 's'}</p>
            </div>
            <div class="flex items-end justify-between mt-2">
              <div><p class="text-[10px] text-slate-400 uppercase">Pagado</p><p class="text-xl font-extrabold text-emerald-600">${formatearImporte(totalPagado)} €</p></div>
              <div class="text-right"><p class="text-[10px] text-slate-400 uppercase">Pendiente</p><p class="text-xl font-extrabold text-slate-800">${formatearImporte(totalPendiente)} €</p></div>
            </div>
            <div class="h-2 bg-slate-100 rounded-full mt-3 overflow-hidden"><div class="h-full bg-emerald-500 rounded-full transition-all" style="width:${pct}%"></div></div>
          </div>`;
      }

      // --- Pendientes agrupados ---
      const cont = document.getElementById('lista-pagos');
      cont.innerHTML = '';
      if (pendientes.length === 0) {
        cont.innerHTML = `<div class="text-center py-6 border border-dashed border-slate-200 rounded-2xl"><p class="text-slate-400 text-sm">${cachePagos.length === 0 && cacheHistorialPagos.length === 0 ? 'Aún no hay facturas registradas 💳' : 'Todo al día 🎉'}</p></div>`;
      } else {
        const grupos = [
          ['⚠️ Vencidos', pendientes.filter(p => p.fecha < hoy)],
          ['Próximos 7 días', pendientes.filter(p => p.fecha >= hoy && diasHasta(p.fecha, hoy) <= 7)],
          ['Más adelante', pendientes.filter(p => diasHasta(p.fecha, hoy) > 7)]
        ];
        grupos.forEach(([titulo, lista]) => {
          if (!lista.length) return;
          const h = document.createElement('p');
          h.className = 'text-[11px] font-bold text-slate-400 uppercase tracking-wider px-1 pt-2';
          h.textContent = titulo;
          cont.appendChild(h);
          lista.forEach(p => cont.appendChild(tarjetaPagoPendiente(p, hoy)));
        });
      }

      // --- Historial de pagados ---
      const secHist = document.getElementById('seccion-pagados');
      const lista = document.getElementById('lista-pagados');
      lista.innerHTML = '';
      secHist.classList.toggle('hidden', cacheHistorialPagos.length === 0);
      const visibles = verTodoHistorialPagos ? cacheHistorialPagos : cacheHistorialPagos.slice(0, 5);
      let mesPintado = '';
      visibles.forEach(h => {
        const mes = h.fecha_pago.slice(0, 7);
        if (verTodoHistorialPagos && mes !== mesPintado) {
          mesPintado = mes;
          const t = document.createElement('p');
          t.className = 'text-[11px] font-bold text-slate-400 uppercase tracking-wider px-1 pt-2';
          t.textContent = `${MESES_LARGOS[Number(mes.slice(5, 7)) - 1]} ${mes.slice(0, 4)}`;
          lista.appendChild(t);
        }
        const fila = document.createElement('div');
        fila.className = 'flex items-center justify-between p-3 bg-white border border-slate-200 rounded-2xl';
        fila.innerHTML = `
          <div class="flex items-center gap-3 min-w-0">
            <div class="w-9 h-9 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold shrink-0">✓</div>
            <div class="min-w-0">
              <p class="text-sm font-semibold text-slate-700 truncate">${escapeHTML(h.nombre)}</p>
              <p class="text-[11px] text-slate-400">Pagado el ${formatearFechaCorta(h.fecha_pago)}${h.fecha_vencimiento !== h.fecha_pago ? ' · vencía el ' + formatearFechaCorta(h.fecha_vencimiento) : ''} · ${escapeHTML(h.persona)}</p>
            </div>
          </div>
          <div class="flex items-center gap-1 pl-2 shrink-0">
            <span class="text-sm font-bold text-emerald-600">${formatearImporte(h.importe)} €</span>
            <button onclick="deshacerPago(${h.id})" class="p-2 text-slate-400 hover:text-amber-600" title="Deshacer: vuelve a pendiente">↩️</button>
          </div>`;
        lista.appendChild(fila);
      });
      const btn = document.getElementById('btn-ver-historial-pagos');
      btn.classList.toggle('hidden', cacheHistorialPagos.length <= 5);
      btn.textContent = verTodoHistorialPagos ? 'Ver menos' : `Ver todo el historial (${cacheHistorialPagos.length})`;
    }

    function alternarHistorialPagos() {
      verTodoHistorialPagos = !verTodoHistorialPagos;
      renderizarPagos();
    }

    async function marcarPagoRealizado(id) {
      try {
        const res = await API.put(`/pagos/${id}`, { pagado: true });
        const p = cachePagos.find(x => x.id === id);
        if (res && res.offline) {
          if (p) {
            cacheHistorialPagos.unshift({ id: -Date.now(), pago_id: p.id, nombre: p.nombre, importe: p.importe, frecuencia: p.frecuencia, persona: p.persona, notas: p.notas, fecha_vencimiento: p.fecha, fecha_pago: hoyLocalISO() });
            if (p.frecuencia === 'puntual') p.pagado = true;
            else p.fecha = siguienteFechaJS(p.fecha, p.frecuencia);
          }
          renderizarPagos();
        } else {
          await cargarPagos();
          if (p && res && res.historial_id) {
            const siguiente = p.frecuencia === 'puntual' ? '' : ' · siguiente: ' + formatearFechaCorta(siguienteFechaJS(p.fecha, p.frecuencia));
            mostrarToast(`${p.nombre} pagado ✓${siguiente}`, 'Deshacer', () => deshacerPago(res.historial_id));
          }
        }
      } catch (error) {
        mostrarError('Error al actualizar el pago', error);
      }
    }

    async function deshacerPago(historialId) {
      if (historialId < 0) { await cargarPagos(); return; }
      try {
        await API.delete(`/pagos/historial/${historialId}`);
        await cargarPagos();
        // Si estaba en el dashboard de "Hoy", se refresca también.
        if (moduloActual === 'hoy') cargarDashboardHoy();
      } catch (error) {
        mostrarError('Error al deshacer el pago', error);
      }
    }

    async function borrarPago(id) {
      try {
        const res = await API.delete(`/pagos/${id}`);
        if (res && res.offline) {
          cachePagos = cachePagos.filter(x => x.id !== id);
          renderizarPagos();
        } else {
          await cargarPagos();
        }
      } catch (error) {
        mostrarError('Error al eliminar el pago', error);
      }
    }

    function iniciarEdicionPago(id) {
      const p = cachePagos.find(x => x.id === id);
      if (!p) return;
      pagoEditandoId = id;

      document.getElementById('nombre-pago').value = p.nombre;
      document.getElementById('importe-pago').value = p.importe;
      document.getElementById('fecha-pago').value = p.fecha;
      document.getElementById('frecuencia-pago').value = p.frecuencia;
      document.getElementById('persona-pago').value = p.persona;
      document.getElementById('notas-pago').value = p.notas || '';

      document.getElementById('aviso-editando-pago').classList.remove('hidden');
      document.getElementById('btn-submit-pago').textContent = '💾 Guardar cambios';
      document.getElementById('form-pago').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    function cancelarEdicionPago() {
      pagoEditandoId = null;
      document.getElementById('aviso-editando-pago').classList.add('hidden');
      document.getElementById('btn-submit-pago').textContent = '➕ Añadir';
      document.getElementById('form-pago').reset();
      document.getElementById('fecha-pago').value = hoyLocalISO();
    }

    document.getElementById('form-pago').addEventListener('submit', async (e) => {
      e.preventDefault();
      const nombre = document.getElementById('nombre-pago');
      const importe = document.getElementById('importe-pago');
      const fecha = document.getElementById('fecha-pago');
      const frecuencia = document.getElementById('frecuencia-pago');
      const persona = document.getElementById('persona-pago');
      const notas = document.getElementById('notas-pago');

      const nuevo = {
        nombre: nombre.value.trim(),
        importe: Number.parseFloat(importe.value) || 0,
        fecha: fecha.value,
        frecuencia: frecuencia.value,
        persona: persona.value,
        notas: notas.value.trim()
      };

      try {
        const res = await (pagoEditandoId ? API.put(`/pagos/${pagoEditandoId}`, nuevo) : API.post('/pagos', nuevo));
        if (res && res.offline) {
          if (pagoEditandoId) {
            const p = cachePagos.find(x => x.id === pagoEditandoId);
            if (p) Object.assign(p, nuevo);
          } else {
            cachePagos.push({ id: -Date.now(), pagado: false, ...nuevo });
          }
          renderizarPagos();
        } else {
          await cargarPagos();
        }
        cancelarEdicionPago();
      } catch (error) {
        mostrarError(pagoEditandoId ? 'Error al guardar los cambios' : 'Error al crear el pago', error);
      }
    });

    // --- DOCUMENTACIÓN ---
    const COLORES_PERSONA_DOC = { Todos: 'bg-slate-100 text-slate-600 border-slate-200' };
    const ICONO_PERSONA_DOC = { Todos: '👥' };

    let cacheDocumentos = [];
    let filtroPersonaDocumento = null;
    let documentoAbiertoId = null;

    function formatearTamano(bytes) {
      if (!bytes) return '';
      if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
      return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    }

    function esImagen(mime) { return (mime || '').startsWith('image/'); }

    async function cargarDocumentos() {
      try {
        const res = await fetch('/documentos');
        if (res.status === 401) {
          mostrarDocumentosBloqueados();
          return;
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        cacheDocumentos = await res.json();
        renderizarDocumentos();
      } catch (err) {
        console.error('Error al cargar los documentos:', err);
      }
    }

    // Los documentos exigen haber iniciado sesión con un perfil (PIN).
    function mostrarDocumentosBloqueados() {
      cacheDocumentos = [];
      document.getElementById('filtros-persona-documento').innerHTML = '';
      document.getElementById('contador-general').textContent = 'Bloqueado';
      document.getElementById('lista-documentos').innerHTML = `
        <div class="col-span-2 text-center py-10 border border-dashed border-slate-200 rounded-2xl bg-white/60">
          <p class="text-3xl mb-1">🔒</p>
          <p class="text-slate-600 text-sm font-medium">Los documentos están protegidos</p>
          <p class="text-slate-400 text-xs mt-0.5 mb-4">Elige tu perfil e introduce tu PIN para verlos</p>
          <button onclick="mostrarPantallaLogin()" class="bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white font-semibold px-5 py-2 rounded-xl text-sm transition-all">Elegir perfil</button>
        </div>`;
    }

    function renderizarDocumentos() {
      const cont = document.getElementById('lista-documentos');
      const contFiltros = document.getElementById('filtros-persona-documento');
      const contador = document.getElementById('contador-general');
      contador.textContent = `${cacheDocumentos.length} documentos`;

      // --- Filtro por persona ---
      const personas = [...new Set(cacheDocumentos.map(d => d.persona))].sort();
      contFiltros.innerHTML = '';
      if (personas.length > 1) {
        if (filtroPersonaDocumento && !personas.includes(filtroPersonaDocumento)) filtroPersonaDocumento = null;
        const pillTodos = document.createElement('button');
        pillTodos.textContent = 'Todos';
        pillTodos.className = `text-xs font-semibold px-3 py-1.5 rounded-full border ${!filtroPersonaDocumento ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-500 border-slate-200'}`;
        pillTodos.onclick = () => { filtroPersonaDocumento = null; renderizarDocumentos(); };
        contFiltros.appendChild(pillTodos);
        personas.forEach(p => {
          const activo = filtroPersonaDocumento === p;
          const pill = document.createElement('button');
          pill.textContent = `${ICONO_PERSONA_DOC[p] || '👤'} ${p}`;
          pill.className = `text-xs font-semibold px-3 py-1.5 rounded-full border ${activo ? 'bg-slate-800 text-white border-slate-800' : (COLORES_PERSONA_DOC[p] || 'bg-slate-100 text-slate-600 border-slate-200')}`;
          pill.onclick = () => { filtroPersonaDocumento = p; renderizarDocumentos(); };
          contFiltros.appendChild(pill);
        });
      }

      const visibles = filtroPersonaDocumento
        ? cacheDocumentos.filter(d => d.persona === filtroPersonaDocumento)
        : cacheDocumentos;

      cont.innerHTML = '';
      if (visibles.length === 0) {
        cont.innerHTML = `<div class="col-span-2 text-center py-10 border border-dashed border-slate-200 rounded-2xl bg-white/60">
          <p class="text-3xl mb-1">📄</p>
          <p class="text-slate-500 text-sm font-medium">Aún no hay documentos</p>
          <p class="text-slate-400 text-xs mt-0.5">Sube el DNI, la tarjeta sanitaria...</p>
        </div>`;
        return;
      }

      visibles.forEach(d => {
        const card = document.createElement('button');
        card.type = 'button';
        card.onclick = () => abrirModalDocumento(d.id);
        card.className = 'text-left bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden hover:shadow-md transition-shadow';
        const vista = esImagen(d.mime_type)
          ? `<img src="/documentos/${d.id}" loading="lazy" class="w-full h-24 object-cover bg-slate-100">`
          : `<div class="w-full h-24 bg-slate-50 flex items-center justify-center text-3xl">📄</div>`;
        card.innerHTML = `
          ${vista}
          <div class="p-2.5">
            <p class="text-xs font-semibold text-slate-800 truncate">${escapeHTML(d.nombre || d.tipo)}</p>
            <div class="flex items-center gap-1 mt-1 flex-wrap">
              <span class="text-[10px] font-semibold px-1.5 py-0.5 rounded-md border ${COLORES_PERSONA_DOC[d.persona] || 'bg-slate-100 text-slate-600 border-slate-200'}">${ICONO_PERSONA_DOC[d.persona] || '👤'} ${escapeHTML(d.persona)}</span>
              <span class="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-indigo-50 text-indigo-600">${escapeHTML(d.tipo)}</span>
            </div>
          </div>`;
        cont.appendChild(card);
      });
    }

    function abrirModalDocumento(id) {
      const d = cacheDocumentos.find(x => x.id === id);
      if (!d) return;
      documentoAbiertoId = id;

      document.getElementById('modal-doc-titulo').textContent = d.nombre || d.tipo;
      document.getElementById('modal-doc-info').textContent = `${d.tipo} · ${d.persona} · ${formatearTamano(d.tamano)}`;
      document.getElementById('modal-doc-abrir').href = `/documentos/${id}`;
      document.getElementById('modal-doc-abrir').dataset.visor = d.nombre || d.tipo || 'Documento';

      const preview = document.getElementById('modal-doc-preview');
      preview.innerHTML = esImagen(d.mime_type)
        ? `<img src="/documentos/${id}" class="w-full max-h-72 object-contain">`
        : `<div class="py-10 text-center"><p class="text-5xl mb-2">📄</p><p class="text-xs text-slate-400">${escapeHTML(d.nombre_archivo)}</p></div>`;

      document.getElementById('modal-documento').classList.remove('hidden');
    }

    function cerrarModalDocumento() {
      documentoAbiertoId = null;
      document.getElementById('modal-documento').classList.add('hidden');
    }

    document.getElementById('modal-doc-borrar').addEventListener('click', async () => {
      if (documentoAbiertoId === null) return;
      const id = documentoAbiertoId;
      cerrarModalDocumento();
      try {
        await API.delete(`/documentos/${id}`);
        cacheDocumentos = cacheDocumentos.filter(d => d.id !== id);
        renderizarDocumentos();
      } catch (error) {
        mostrarError('Error al eliminar el documento', error);
      }
    });

    document.getElementById('modal-documento').addEventListener('click', (e) => {
      if (e.target.id === 'modal-documento') cerrarModalDocumento();
    });

    // La subida usa multipart/form-data directamente (no pasa por API.post ni
    // por la cola offline: los archivos se suben mejor con buena conexión).
    document.getElementById('form-documento').addEventListener('submit', async (e) => {
      e.preventDefault();
      const persona = document.getElementById('persona-documento');
      const tipo = document.getElementById('tipo-documento');
      const nombre = document.getElementById('nombre-documento');
      const archivoInput = document.getElementById('archivo-documento');
      const btn = document.getElementById('btn-subir-documento');

      if (!archivoInput.files || archivoInput.files.length === 0) return;

      if (!navigator.onLine) {
        alert('📡 Necesitas conexión para subir un documento. Puedes seguir viendo y borrando los que ya tienes.');
        return;
      }

      const formData = new FormData();
      formData.append('persona', persona.value);
      formData.append('tipo', tipo.value);
      formData.append('nombre', nombre.value.trim());
      formData.append('archivo', archivoInput.files[0]);

      const textoOriginal = btn.textContent;
      btn.disabled = true;
      btn.textContent = '⏳ Subiendo...';
      try {
        const response = await fetch('/documentos', { method: 'POST', body: formData });
        if (response.status === 401) {
          alert('🔒 Inicia sesión con tu perfil (PIN) para subir documentos.');
          return;
        }
        if (!response.ok) {
          const msg = await response.text().catch(() => '');
          throw new Error(msg || `HTTP ${response.status}`);
        }
        nombre.value = '';
        archivoInput.value = '';
        await cargarDocumentos();
      } catch (error) {
        mostrarError('Error al subir el documento', error);
      } finally {
        btn.disabled = false;
        btn.textContent = textoOriginal;
      }
    });

    // --- COLE (menú del comedor) ---
    const NOMBRES_MES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];

    async function cargarMenuCole() {
      const cont = document.getElementById('cole-estado');
      cont.innerHTML = '<p class="text-sm text-slate-400">Cargando...</p>';
      const ahora = new Date();
      const nombreMes = NOMBRES_MES[ahora.getMonth()];

      try {
        const res = await fetch('/menu-colegio/actual');
        const menu = res.ok ? await res.json() : null;

        if (!menu) {
          cont.innerHTML = `
            <p class="text-sm font-semibold text-slate-800 mb-1">Menú de ${nombreMes}</p>
            <p class="text-xs text-slate-400">Aún no hay menú guardado para este mes. La app lo intenta descargar sola de la web del cole cada día — si tarda, puedes subirlo tú mismo abajo.</p>`;
          return;
        }

        const origenTexto = menu.origen === 'auto' ? '🤖 Descargado automático de la web del cole' : '✍️ Subido a mano';
        cont.innerHTML = `
          <div class="flex items-center gap-3">
            <span class="w-12 h-12 shrink-0 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center text-2xl">📄</span>
            <div class="flex-grow min-w-0">
              <p class="text-sm font-semibold text-slate-800">Menú general de ${nombreMes}</p>
              <p class="text-[11px] text-slate-400">${origenTexto}</p>
            </div>
          </div>
          <a href="/menu-colegio/${menu.id}" data-visor="Menú del cole" class="mt-3 block text-center bg-amber-600 hover:bg-amber-700 active:scale-95 text-white font-semibold py-2.5 rounded-xl text-sm transition-all">Ver / Descargar PDF</a>`;
      } catch (err) {
        cont.innerHTML = '<p class="text-sm text-rose-500">No se pudo comprobar el menú. Prueba otra vez más tarde.</p>';
      }
    }

    document.getElementById('form-menu-cole').addEventListener('submit', async (e) => {
      e.preventDefault();
      const archivoInput = document.getElementById('archivo-menu-cole');
      if (!archivoInput.files || archivoInput.files.length === 0) return;

      if (!navigator.onLine) {
        alert('📡 Necesitas conexión para subir el menú.');
        return;
      }

      const formData = new FormData();
      formData.append('archivo', archivoInput.files[0]);

      try {
        const response = await fetch('/menu-colegio/subir', { method: 'POST', body: formData });
        if (!response.ok) {
          const msg = await response.text().catch(() => '');
          throw new Error(msg || `HTTP ${response.status}`);
        }
        archivoInput.value = '';
        await cargarMenuCole();
      } catch (error) {
        mostrarError('Error al subir el menú', error);
      }
    });
