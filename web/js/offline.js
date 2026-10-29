'use strict';

const OFFLINE_DB_NAME = 'hogar-offline';
const OFFLINE_DB_VERSION = 1;
const OFFLINE_STORE = 'cola';

function abrirDBOffline() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(OFFLINE_DB_NAME, OFFLINE_DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(OFFLINE_STORE)) {
        db.createObjectStore(OFFLINE_STORE, { keyPath: 'id', autoIncrement: true });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

const ColaOffline = {
  async encolar(accion) {
    const db = await abrirDBOffline();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(OFFLINE_STORE, 'readwrite');
      tx.objectStore(OFFLINE_STORE).add({ ...accion, timestamp: Date.now() });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    actualizarBannerOffline();
  },

  async obtenerTodas() {
    const db = await abrirDBOffline();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(OFFLINE_STORE, 'readonly');
      const req = tx.objectStore(OFFLINE_STORE).getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  },

  async eliminar(id) {
    const db = await abrirDBOffline();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(OFFLINE_STORE, 'readwrite');
      tx.objectStore(OFFLINE_STORE).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  },

  async contar() {
    const todas = await this.obtenerTodas();
    return todas.length;
  }
};

let sincronizandoCola = false;

async function sincronizarColaOffline() {
  if (sincronizandoCola || !navigator.onLine) return;
  sincronizandoCola = true;
  actualizarBannerOffline();
  try {
    const acciones = await ColaOffline.obtenerTodas();
    acciones.sort((a, b) => a.timestamp - b.timestamp);
    for (const accion of acciones) {
      try {
        // Si la conexión se queda a medias (por ejemplo justo tras un corte de luz, con el
        // router o el servidor aún no del todo listos), fetch() puede quedarse colgado sin
        // fallar ni acertar, y el aviso de «Sincronizando…» se queda pegado para siempre.
        // Con este límite de tiempo, pasados unos segundos se da por fallida esa conexión en
        // concreto y se reintenta más tarde, en vez de quedarse esperando indefinidamente.
        const limite = AbortSignal.timeout ? AbortSignal.timeout(15000) : undefined;
        const response = await fetch(accion.url, {
          method: accion.method,
          headers: accion.body ? { 'Content-Type': 'application/json' } : {},
          body: accion.body || undefined,
          signal: limite
        });
        if (response.status === 401) {
          // Sin sesión: las acciones se conservan hasta volver a identificarse.
          throw new Error('Sin sesión, se reintentará tras iniciar sesión');
        }
        if (response.ok || response.status < 500) {
          // Éxito, o error del servidor no recuperable (ej. ya no existe):
          // en ambos casos la acción queda resuelta y se retira de la cola.
          await ColaOffline.eliminar(accion.id);
        } else {
          throw new Error('Error temporal del servidor, se reintentará');
        }
      } catch (err) {
        console.error('No se pudo sincronizar, se reintentará más tarde:', err);
        break; // probablemente seguimos sin conexión real; paramos aquí
      }
    }
  } finally {
    sincronizandoCola = false;
    actualizarBannerOffline();
    refrescarVistaTrasSincronizar();
  }
}

function refrescarVistaTrasSincronizar() {
  try {
    if (typeof moduloActual === 'undefined') return;
    if (moduloActual === 'hoy' && typeof cargarDashboardHoy === 'function') cargarDashboardHoy();
    else if (moduloActual === 'compra' && typeof cargarLista === 'function') cargarLista();
    else if (moduloActual === 'tareas' && typeof cargarTareas === 'function') cargarTareas();
    else if (moduloActual === 'pagos' && typeof cargarPagos === 'function') cargarPagos();
    else if (moduloActual === 'calendario' && typeof calendar !== 'undefined' && calendar) calendar.refetchEvents();
  } catch (e) {
    console.error('Error al refrescar tras sincronizar:', e);
  }
}

function actualizarBannerOffline() {
  const banner = document.getElementById('banner-offline');
  if (!banner) return;
  ColaOffline.contar().then(n => {
    if (!navigator.onLine) {
      banner.textContent = n > 0
        ? `📡 Sin conexión · ${n} cambio${n === 1 ? '' : 's'} pendiente${n === 1 ? '' : 's'} de guardar`
        : '📡 Sin conexión';
      banner.classList.remove('hidden');
    } else if (sincronizandoCola) {
      banner.textContent = '🔄 Sincronizando cambios...';
      banner.classList.remove('hidden');
    } else if (n > 0) {
      banner.textContent = `🔄 ${n} cambio${n === 1 ? '' : 's'} pendiente${n === 1 ? '' : 's'} de sincronizar...`;
      banner.classList.remove('hidden');
    } else {
      banner.classList.add('hidden');
    }
  }).catch(() => {});
}

window.addEventListener('online', sincronizarColaOffline);
window.addEventListener('offline', actualizarBannerOffline);

document.addEventListener('DOMContentLoaded', () => {
  actualizarBannerOffline();
  if (navigator.onLine) sincronizarColaOffline();
});
