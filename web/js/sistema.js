// Pantallas "Copias y red" y "Actividad" (Más).

function textoFechaHora(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d)) return '—';
  const hoy = new Date();
  const ayer = new Date(); ayer.setDate(hoy.getDate() - 1);
  const hora = d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  if (d.toDateString() === hoy.toDateString()) return `hoy ${hora}`;
  if (d.toDateString() === ayer.toDateString()) return `ayer ${hora}`;
  return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }) + ' ' + hora;
}

function tamanoLegible(bytes) {
  if (bytes < 1024 * 1024) return Math.max(1, Math.round(bytes / 1024)) + ' KB';
  return (bytes / 1024 / 1024).toFixed(1) + ' MB';
}

// ---------- Copias y red ----------
async function cargarSistema() {
  const cont = document.getElementById('sistema-contenido');
  if (!cont) return;
  cont.innerHTML = '<p class="text-sm text-slate-400 px-1">Cargando…</p>';
  let copias = null, ddns = null;
  try { copias = await (await fetch('/backup/estado')).json(); } catch (e) { /* sin datos */ }
  try { ddns = await (await fetch('/ajustes/ddns')).json(); } catch (e) { /* sin datos */ }

  let html = '';
  if (copias) {
    const lista = copias.copias || [];
    const ultima = lista[0];
    html += `
      <section class="bg-white border border-slate-200 rounded-2xl shadow-sm p-4 space-y-3">
        <div class="flex items-start justify-between gap-3">
          <div>
            <h2 class="text-sm font-bold text-slate-800">💾 Copias de seguridad</h2>
            <p class="text-xs text-slate-400">Automática cada noche (a partir de las ${escapeHTML(copias.hora_diaria)}). Se guardan las últimas ${copias.conservadas}.</p>
          </div>
        </div>
        <p class="text-xs ${ultima ? 'text-emerald-700' : 'text-rose-600'} font-semibold">${ultima ? '✅ Última copia: ' + textoFechaHora(ultima.fecha) : '⚠️ Todavía no hay ninguna copia'}</p>
        ${copias.ultimo_error ? `<p class="text-xs text-rose-600 font-semibold">⚠️ Último error: ${escapeHTML(copias.ultimo_error)}</p>` : ''}
        <button id="btn-copia-ahora" onclick="hacerCopiaAhora()" class="w-full bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white font-semibold py-2 rounded-xl text-sm transition-all">Hacer una copia ahora</button>
        <div class="divide-y divide-slate-100">
          ${lista.map(c => `
            <div class="flex items-center justify-between py-2 text-xs">
              <span class="text-slate-700">${textoFechaHora(c.fecha)} · ${tamanoLegible(c.bytes)}</span>
              <a href="/backup/archivo/${encodeURIComponent(c.nombre)}" download class="font-semibold text-sky-600">Descargar</a>
            </div>`).join('')}
        </div>
        <p class="text-[11px] text-slate-400">Las copias están en el mismo disco del servidor. Descarga alguna de vez en cuando y guárdala fuera de casa.</p>
      </section>`;
  }

  if (ddns) {
    let estado;
    if (!ddns.activo) {
      estado = `<p class="text-xs text-slate-500">No está activada. Para activarla, añade tu token de Cloudflare en el servidor (te lo explico al actualizar).</p>`;
    } else if (ddns.error) {
      estado = `<p class="text-xs text-rose-600 font-semibold">⚠️ ${escapeHTML(ddns.error)}</p>`;
    } else {
      estado = `<p class="text-xs text-emerald-700 font-semibold">✅ Al día · IP actual ${escapeHTML(ddns.ip || '…')}</p>`;
    }
    html += `
      <section class="bg-white border border-slate-200 rounded-2xl shadow-sm p-4 space-y-2">
        <h2 class="text-sm font-bold text-slate-800">🌐 Dirección de casa (IP)</h2>
        <p class="text-xs text-slate-400">Si tu operador cambia la IP, se actualiza sola en Cloudflare.</p>
        ${estado}
        ${ddns.activo ? `<p class="text-[11px] text-slate-400">Dominios: ${ddns.nombres.map(escapeHTML).join(', ')}<br>Última revisión: ${textoFechaHora(ddns.ultima_revision)}${ddns.ultimo_cambio ? ' · Último cambio de IP: ' + textoFechaHora(ddns.ultimo_cambio) : ''}</p>` : ''}
      </section>`;
  }
  cont.innerHTML = html || '<p class="text-sm text-slate-400 px-1">No se pudo cargar el estado.</p>';
}

async function hacerCopiaAhora() {
  const btn = document.getElementById('btn-copia-ahora');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Creando copia…'; }
  try {
    const res = await fetch('/backup/ahora', { method: 'POST' });
    if (!res.ok) throw new Error(await res.text());
  } catch (e) {
    mostrarError('No se pudo crear la copia', e);
  }
  cargarSistema();
}

// ---------- Actividad ----------
let filtroActividad = '';

async function cargarActividad() {
  const cont = document.getElementById('actividad-lista');
  const chips = document.getElementById('actividad-filtros');
  if (!cont) return;
  const personas = (typeof perfilesFamilia !== 'undefined' ? perfilesFamilia : [])
    .filter(p => p.nombre !== 'Hogar').map(p => p.nombre);
  chips.innerHTML = ['', ...personas].map(p =>
    `<button type="button" onclick="cambiarFiltroActividad('${p}')" class="shrink-0 text-xs font-semibold px-3 py-1.5 rounded-full border ${filtroActividad === p ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white border-slate-200 text-slate-600'}">${p || 'Todos'}</button>`).join('');
  cont.innerHTML = '<p class="text-sm text-slate-400 px-1">Cargando…</p>';
  try {
    const res = await fetch('/ajustes/actividad' + (filtroActividad ? '?usuario=' + encodeURIComponent(filtroActividad) : ''));
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const lista = await res.json();
    if (!lista.length) {
      cont.innerHTML = '<div class="text-center py-6 border border-dashed border-slate-200 rounded-2xl"><p class="text-slate-400 text-sm">Todavía no hay actividad registrada</p></div>';
      return;
    }
    let diaActual = '';
    let html = '';
    lista.forEach(a => {
      const d = new Date(a.fecha);
      const dia = d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
      if (dia !== diaActual) {
        diaActual = dia;
        html += `<h3 class="text-xs font-bold text-slate-400 uppercase tracking-wider mt-4 mb-1 px-1 first:mt-0">${escapeHTML(dia)}</h3>`;
      }
      const hora = d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
      html += `
        <div class="flex items-start gap-3 p-3 bg-white border border-slate-200 rounded-2xl shadow-sm mb-2">
          <span class="text-[11px] font-semibold text-slate-400 w-10 shrink-0 pt-0.5">${hora}</span>
          <p class="text-sm text-slate-700 min-w-0 break-words"><b class="text-slate-900">${escapeHTML(a.usuario)}</b> ${escapeHTML(a.texto)}</p>
        </div>`;
    });
    cont.innerHTML = html;
  } catch (e) {
    cont.innerHTML = '<p class="text-sm text-rose-600 px-1">No se pudo cargar la actividad.</p>';
  }
}

function cambiarFiltroActividad(p) {
  filtroActividad = p;
  cargarActividad();
}
