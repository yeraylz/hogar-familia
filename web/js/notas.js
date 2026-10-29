'use strict';

// Contador de notas por elemento: { tarea: {"12": 2}, pago: {...}, evento: {...} }
let conteoNotas = {};
let notaContexto = null; // { tipo, id } del elemento cuyas notas están abiertas

async function cargarConteoNotas() {
  try {
    const res = await fetch('/notas/conteo');
    if (res.ok) conteoNotas = await res.json();
  } catch (e) {
    // sin red: se queda el último conteo conocido
  }
}

function numNotas(tipo, id) {
  return (conteoNotas[tipo] && conteoNotas[tipo][String(id)]) || 0;
}

// Botón 💬 con contador, para las tarjetas de tareas y pagos.
// Los elementos creados sin conexión (id negativo) aún no existen en el
// servidor, así que de momento no admiten notas.
function botonNotasHTML(tipo, id) {
  if (id < 0) return '';
  const n = numNotas(tipo, id);
  const contador = n > 0
    ? `<span class="absolute top-0 right-0 min-w-[16px] h-4 px-1 rounded-full bg-indigo-600 text-white text-[9px] font-bold flex items-center justify-center">${n}</span>`
    : '';
  return `<button onclick="abrirNotas('${tipo}', ${id})" class="relative p-2 text-slate-400 hover:text-indigo-600" title="Notas">💬${contador}</button>`;
}

function tituloParaNotas(tipo, id) {
  let elemento = null;
  if (tipo === 'tarea' && typeof cacheTareas !== 'undefined') elemento = cacheTareas.find(t => t.id === id);
  if (tipo === 'pago' && typeof cachePagos !== 'undefined') elemento = cachePagos.find(p => p.id === id);
  if (tipo === 'evento' && typeof eventosCache !== 'undefined') elemento = eventosCache.find(e => e.id === id);
  if (!elemento) return 'Notas';
  return elemento.titulo || elemento.nombre || elemento.title || 'Notas';
}

// "2026-10-05 15:30:12" -> "hoy 15:30" / "05/10 15:30"
function formatearMomentoNota(creado) {
  const [fecha, hora] = (creado || '').split(' ');
  if (!fecha) return '';
  const hhmm = (hora || '').slice(0, 5);
  const hoy = new Date();
  const hoyISO = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`;
  if (fecha === hoyISO) return `hoy ${hhmm}`;
  const [, m, d] = fecha.split('-');
  return `${d}/${m} ${hhmm}`;
}

async function abrirNotas(tipo, id) {
  notaContexto = { tipo, id };
  document.getElementById('notas-titulo').textContent = tituloParaNotas(tipo, id);
  document.getElementById('nota-texto').value = '';
  document.getElementById('modal-notas').classList.remove('hidden');
  await cargarNotas();
  document.getElementById('nota-texto').focus();
}

function abrirNotasDesdeEvento() {
  const id = eventoSeleccionadoId;
  if (!id) return;
  cerrarModal();
  abrirNotas('evento', id);
}

// Pone el contador en el botón "Notas" del detalle del evento.
function actualizarBotonNotasEvento(id) {
  const btn = document.getElementById('modal-btn-notas');
  if (!btn) return;
  const n = numNotas('evento', id);
  btn.textContent = n > 0 ? `💬 Notas (${n})` : '💬 Notas';
}

async function cargarNotas() {
  const cont = document.getElementById('notas-lista');
  cont.innerHTML = '<p class="text-xs text-slate-400 py-6 text-center">Cargando...</p>';
  try {
    const res = await fetch(`/notas?tipo=${notaContexto.tipo}&ref=${notaContexto.id}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    renderizarNotas(await res.json());
  } catch (e) {
    cont.innerHTML = '<p class="text-xs text-rose-500 py-6 text-center">No se pudieron cargar las notas.</p>';
  }
}

function renderizarNotas(notas) {
  const cont = document.getElementById('notas-lista');
  if (!notas.length) {
    cont.innerHTML = '<p class="text-xs text-slate-400 py-6 text-center">Aún no hay notas. Escribe la primera 👇</p>';
    return;
  }
  cont.innerHTML = notas.map(n => {
    const puedeBorrar = n.autor === 'Alguien' || (typeof usuarioActualNombre !== 'undefined' && n.autor === usuarioActualNombre);
    const esMia = typeof usuarioActualNombre !== 'undefined' && n.autor === usuarioActualNombre;
    const colores = typeof colorAvatarPersona === 'function' ? colorAvatarPersona(n.autor) : 'bg-slate-100 text-slate-600';
    const icono = (typeof AVATAR_INICIAL !== 'undefined' && AVATAR_INICIAL[n.autor]) || '👤';
    return `
      <div class="rounded-xl border border-slate-200 p-2.5 ${esMia ? 'bg-indigo-50' : 'bg-slate-50'}">
        <div class="flex items-center justify-between gap-2 mb-1">
          <div class="flex items-center gap-1.5 min-w-0">
            <span class="text-[10px] font-semibold px-1.5 py-0.5 rounded-md ${colores}">${icono} ${escapeHTML(n.autor)}</span>
            <span class="text-[10px] text-slate-400">${formatearMomentoNota(n.creado)}</span>
          </div>
          ${puedeBorrar ? `<button onclick="borrarNota(${n.id})" class="text-slate-300 hover:text-rose-500 text-xs shrink-0" title="Borrar nota">✕</button>` : ''}
        </div>
        <p class="text-sm text-slate-700 break-words">${escapeHTML(n.texto)}</p>
      </div>`;
  }).join('');
  cont.scrollTop = cont.scrollHeight;
}

async function borrarNota(id) {
  try {
    const res = await fetch(`/notas/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error(await res.text().catch(() => `HTTP ${res.status}`));
    await cargarNotas();
    await cargarConteoNotas();
    refrescarListasConNotas();
  } catch (e) {
    mostrarError('Error al borrar la nota', e);
  }
}

function cerrarNotas() {
  document.getElementById('modal-notas').classList.add('hidden');
  notaContexto = null;
  refrescarListasConNotas();
}

// Vuelve a pintar la lista que esté a la vista para actualizar los contadores.
function refrescarListasConNotas() {
  if (typeof moduloActual === 'undefined') return;
  if (moduloActual === 'tareas' && typeof renderizarTareas === 'function') renderizarTareas();
  if (moduloActual === 'pagos' && typeof renderizarPagos === 'function') renderizarPagos();
}

document.addEventListener('DOMContentLoaded', () => {
  const modal = document.getElementById('modal-notas');
  if (modal) modal.addEventListener('click', (e) => { if (e.target.id === 'modal-notas') cerrarNotas(); });

  const form = document.getElementById('form-nota');
  if (!form) return;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!notaContexto) return;
    const input = document.getElementById('nota-texto');
    const texto = input.value.trim();
    if (!texto) return;

    if (!navigator.onLine) {
      alert('📡 Necesitas conexión para añadir una nota.');
      return;
    }
    try {
      const res = await fetch('/notas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo: notaContexto.tipo, ref_id: notaContexto.id, texto })
      });
      if (!res.ok) throw new Error(await res.text().catch(() => `HTTP ${res.status}`));
      input.value = '';
      await cargarNotas();
      await cargarConteoNotas();
    } catch (err) {
      mostrarError('Error al guardar la nota', err);
    }
  });
});
