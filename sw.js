// Service worker: permite usar Alexandria sin internet.
// Estrategia: primero la red (para recibir cambios), y si no hay conexión, la copia guardada.
const CACHE = 'alexandria-v1';
const SHELL = [
  './', 'index.html', 'manifest.webmanifest', 'css/styles.css',
  'js/app.js', 'js/util.js', 'js/store.js', 'js/fsrs.js', 'js/library.js', 'js/cards.js', 'js/gemini.js',
  'js/content/topics.js', 'js/content/lessons.js',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  if (url.hostname === 'generativelanguage.googleapis.com') return; // nunca guardar respuestas de Gemini

  const isFont = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  if (isFont) {
    // Fuentes: usa la copia guardada si existe y actualízala en segundo plano.
    e.respondWith(caches.open(CACHE).then(async (cache) => {
      const hit = await cache.match(e.request);
      const net = fetch(e.request).then((res) => { cache.put(e.request, res.clone()); return res; }).catch(() => hit);
      return hit || net;
    }));
    return;
  }

  if (url.origin !== self.location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res.ok) caches.open(CACHE).then((c) => c.put(e.request, res.clone()));
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then((hit) => hit || caches.match('index.html'))),
  );
});
