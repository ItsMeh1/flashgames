const CACHE_NAME = 'flashgames-v2-2.2.4';
const APP_SHELL = [
  './',
  './index.html',
  './styles.css',
  './refinement.css',
  './precision.css',
  './app.js',
  './data.js',
  './admin.js',
  './auth.js',
  './update.json',
  './offline/logo.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key.startsWith('flashgames-') && key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET' || !request.url.startsWith(self.location.origin)) return;

  const url = new URL(request.url);
  const isUpdateFile = url.pathname.endsWith('/update.json');
  const isServiceWorker = url.pathname.endsWith('/sw.js');
  const isDocument = request.mode === 'navigate' || url.pathname === '/' || url.pathname.endsWith('/index.html');

  if (isUpdateFile || isServiceWorker || isDocument) {
    event.respondWith(
      fetch(request, { cache: 'no-store' })
        .then((response) => {
          if (response.ok && !isUpdateFile && !isServiceWorker) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)).catch(() => {});
          }
          return response;
        })
        .catch(async () => {
          const cache = await caches.open(CACHE_NAME);
          const fallback = await cache.match('./index.html');
          return fallback || new Response('Offline and this resource is not cached.', { status: 503 });
        })
    );
    return;
  }

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)).catch(() => {});
        }
        return response;
      })
      .catch(async () => {
        const cache = await caches.open(CACHE_NAME);
        const cached = await cache.match(request, { ignoreSearch: true });
        return cached || new Response('Offline and this resource is not cached.', { status: 503 });
      })
  );
});
