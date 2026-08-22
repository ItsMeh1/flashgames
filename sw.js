const CACHE_NAME = 'flashgames-v2-2.2.5';
const APP_SHELL = [
  './', './index.html', './styles.css', './refinement.css', './precision.css',
  './ux.css', './app.js', './ux.js', './data.js', './admin.js', './auth.js',
  './update.json', './offline/logo.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith('flashgames-') && key !== CACHE_NAME).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET' || !request.url.startsWith(self.location.origin)) return;
  const url = new URL(request.url);
  const fresh = request.mode === 'navigate' || /\/(?:index\.html|sw\.js|update\.json)$/.test(url.pathname);

  if (fresh) {
    event.respondWith(fetch(request, { cache: 'no-store' }).then((response) => response).catch(async () => (await caches.open(CACHE_NAME)).match('./index.html') || new Response('Offline', { status: 503 })));
    return;
  }

  event.respondWith(fetch(request).then((response) => {
    if (response.ok) caches.open(CACHE_NAME).then((cache) => cache.put(request, response.clone())).catch(() => {});
    return response;
  }).catch(async () => (await caches.open(CACHE_NAME)).match(request, { ignoreSearch: true }) || new Response('Offline', { status: 503 })));
});
