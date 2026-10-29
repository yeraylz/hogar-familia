'use strict';

// Avisa cuando hay una versión nueva de la app y la aplica con un toque.
// Comprueba al volver a la app y cada 5 minutos si el servidor tiene otra versión.
let avisoVersionMostrado = false;

async function comprobarVersionNueva() {
  if (avisoVersionMostrado || !navigator.onLine) return;
  try {
    const res = await fetch('/js/version.js?chk=' + Date.now(), { cache: 'no-store' });
    if (!res.ok) return;
    const m = (await res.text()).match(/APP_VERSION\s*=\s*'([^']+)'/);
    if (m && typeof APP_VERSION !== 'undefined' && m[1] !== APP_VERSION) mostrarAvisoVersion(m[1]);
  } catch (e) { /* sin red: se reintenta luego */ }
}

function mostrarAvisoVersion(nueva) {
  if (document.getElementById('aviso-version')) return;
  avisoVersionMostrado = true;
  const b = document.createElement('div');
  b.id = 'aviso-version';
  b.className = 'fixed left-3 right-3 bottom-24 z-[70] flex items-center gap-3 bg-indigo-600 text-white rounded-2xl shadow-xl px-4 py-3';
  b.innerHTML = `<span class="text-xl">🔄</span><p class="flex-grow text-sm font-semibold">Hay una versión nueva (${nueva})</p>
    <button type="button" onclick="aplicarVersionNueva()" class="px-3 py-1.5 rounded-xl bg-white text-indigo-700 text-sm font-bold active:scale-95">Actualizar</button>
    <button type="button" onclick="document.getElementById('aviso-version').remove(); avisoVersionMostrado = false;" class="text-white/70 text-xl leading-none" aria-label="Más tarde">×</button>`;
  document.body.appendChild(b);
}

// Vacía las copias guardadas y recarga: así se descargan todos los archivos nuevos.
async function aplicarVersionNueva() {
  try {
    if ('caches' in window) (await caches.keys()).forEach(k => caches.delete(k));
    if (navigator.serviceWorker) (await navigator.serviceWorker.getRegistrations()).forEach(r => r.unregister());
  } catch (e) { /* se recarga igualmente */ }
  setTimeout(() => location.reload(), 300);
}

document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') comprobarVersionNueva(); });
setInterval(comprobarVersionNueva, 5 * 60 * 1000);
setTimeout(comprobarVersionNueva, 4000);
