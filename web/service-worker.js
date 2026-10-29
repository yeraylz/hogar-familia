'use strict';

const CACHE_VERSION = 'hogar-v1';
const APP_SHELL = [
  '/',
  '/css/app.css',
  '/js/app.js',
  '/js/offline.js',
  '/js/usuarios.js',
  '/js/version.js',
  '/js/notas.js',
  '/js/enlaces.js',
  '/js/sistema.js',
  '/js/gastos.js',
  '/js/personalizar.js',
  '/css/tailwind.css',
  '/css/fuentes.css',
  '/vendor/fonts/inter-400.woff',
  '/vendor/fonts/inter-500.woff',
  '/vendor/fonts/inter-600.woff',
  '/vendor/fonts/inter-700.woff',
  '/js/prevision.js',
  '/js/hipoteca.js',
  '/manifest-reto.json',
  '/icons/reto-192.png',
  '/icons/reto-512.png',
  '/js/reto-menu.js',
  '/js/reto-tecnica.js',
  '/js/menu.js',
  '/js/actualizar.js',
  '/js/perfil.js',
  '/js/mis-cosas.js',
  '/js/reto-progreso.js',
  '/js/reto.js',
  '/js/reto-guiado.js',
  '/js/visor.js',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/badge-96.png'
];

// Rutas de la API: siempre se intentan por red primero (los datos cambian).
const ES_RUTA_API = (url) =>
  ['/compra', '/tareas', '/eventos', '/pagos', '/menu', '/documentos', '/usuarios', '/me', '/notas', '/enlaces', '/ajustes', '/backup', '/gastos', '/presupuestos', '/hipoteca', '/reto', '/perfiles', '/estados', '/mis-cosas', '/sorteos', '/cuentas-atras', '/tiempo'].some(p => url.pathname.startsWith(p));

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return; // no interceptar POST/PUT/DELETE

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // no tocar CDNs externos (tailwind, fullcalendar, fonts)
  if (url.searchParams.has('chk')) return; // comprobación de versión nueva: siempre directa a la red

  // Datos de la API: red primero, si falla se usa la última copia en caché (modo offline)
  if (ES_RUTA_API(url)) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copia = res.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(req, copia));
          }
          return res;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  // Abrir o recargar la app (la página principal): red primero. Así, si caduca la
  // sesión de Cloudflare Access, el navegador llega a su pantalla de acceso en vez
  // de abrir una copia vieja. Sin conexión de verdad, se usa la copia guardada.
  // (Solo la ruta "/": otras navegaciones, como abrir un PDF, no deben guardarse aquí.)
  if (req.mode === 'navigate' && url.pathname === '/') {
    // La app Reto (/?app=reto) se guarda aparte para no pisar la página de Hogar.
    const clavePagina = url.searchParams.get('app') === 'reto' ? '/?app=reto' : '/';
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copia = res.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(clavePagina, copia));
          }
          return res; // si es una redirección (login de Access), el navegador la sigue
        })
        .catch(() => caches.match(clavePagina).then((c) => c || caches.match('/')))
    );
    return;
  }

  // App shell (html/css/js/iconos): caché primero, red de refresco en segundo plano
  event.respondWith(
    caches.match(req).then((cached) => {
      const fetchPromise = fetch(req)
        .then((res) => {
          const copia = res.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(req, copia));
          return res;
        })
        .catch(() => cached);
      return cached || fetchPromise;
    })
  );
});

self.addEventListener('push', (event) => {
  let data = { title: 'Hogar Familia', body: '' };
  try {
    if (event.data) data = event.data.json();
  } catch (e) {
    if (event.data) data.body = event.data.text();
  }
  // Si la app está abierta y a la vista, se lo decimos a ella (aviso dentro de la app) y no se muestra la notificación del móvil.
  const trabajo = self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((lista) => {
    lista.forEach((c) => c.postMessage({ tipo: 'push', tag: data.tag || '', titulo: data.title || '', cuerpo: data.body || '' }));
    const aLaVista = lista.some((c) => c.visibilityState === 'visible');
    if (aLaVista) return;
    return self.registration.showNotification(data.title || 'Hogar Familia', {
      body: data.body || '',
      icon: '/icons/icon-192.png',   // icono a color, se ve en la notificación expandida
      badge: '/icons/badge-96.png',  // silueta blanca sobre transparente, para la barra de estado
      tag: data.tag || undefined,
      renotify: !!data.tag,
      vibrate: [200, 100, 200]
    });
  });
  event.waitUntil(trabajo);
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow('/');
    })
  );
});

