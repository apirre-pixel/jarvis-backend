// Service Worker — J.A.R.V.I.S v1.12
// Versión incrementada para forzar actualización de caché
const CACHE_NAME = 'jarvis-v2';
const STATIC_ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './voice.js',
  './waveform.js',
  './manifest.json'
];

self.addEventListener('install', (e) => {
  // Forzar activación inmediata sin esperar a que se cierren pestañas
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
  );
});

self.addEventListener('activate', (e) => {
  // Eliminar cachés antiguas
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  // Nunca interceptar llamadas a la API
  if (e.request.method !== 'GET' || e.request.url.includes('/api/')) return;

  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});
