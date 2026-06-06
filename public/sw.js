const CACHE_NAME = 'jarvis-v1';

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll([
        './',
        './index.html',
        './style.css',
        './app.js',
        './voice.js',
        './waveform.js',
        './icon.png'
      ]);
    })
  );
});

self.addEventListener('fetch', (e) => {
  // Only cache GET requests for static assets, let API calls go to network
  if (e.request.method !== 'GET' || e.request.url.includes('/api/')) return;

  e.respondWith(
    caches.match(e.request).then((response) => {
      return response || fetch(e.request);
    })
  );
});
