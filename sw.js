const CACHE_NAME = 'flashgames-v2-2.2.3';
const APP_SHELL = [
  './',
  './index.html',
  './styles.css',
  './refinement.css',
  './app.js',
  './data.js',
  './admin.js',
  './auth.js',
  './update.json',
  './offline/logo.png'
];

const stripConflictingFirestoreSetting = async (response) => {
  if (!response || !response.ok) return response;
  const type = response.headers.get('content-type') || '';
  if (!type.includes('text/html')) return response;
  try {
    const text = await response.text();
    const fixed = text
      .replace(/\s*experimentalAutoDetectLongPolling\s*:\s*(?:true|false)\s*,?/g, '')
      .replace(/\s*experimentalAutoDetectLongPolling\s*:\s*[^,}]+\s*,?/g, '');
    if (fixed === text) return new Response(text, { status: response.status, statusText: response.statusText, headers: response.headers });
    const headers = new Headers(response.headers);
    headers.delete('content-length');
    return new Response(fixed, { status: response.status, statusText: response.statusText, headers });
  } catch {
    return response;
  }
};

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
  if (request.method !== 'GET') return;
  if (!request.url.startsWith(self.location.origin)) return;

  const url = new URL(request.url);
  const isUpdateFile = url.pathname.endsWith('/update.json');
  const isServiceWorker = url.pathname.endsWith('/sw.js');
  const isIndex = url.pathname === '/' || url.pathname.endsWith('/index.html');

  if (isUpdateFile || isServiceWorker) {
    event.respondWith(fetch(request, { cache: 'no-store' }));
    return;
  }

  event.respondWith(
    fetch(request, { cache: isIndex ? 'no-store' : 'default' })
      .then(async (response) => {
        if (!response.ok) return response;
        const output = isIndex ? await stripConflictingFirestoreSetting(response) : response;
        const copy = output.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)).catch(() => {});
        return output;
      })
      .catch(async () => {
        const cache = await caches.open(CACHE_NAME);
        if (request.mode === 'navigate' || isIndex) {
          const fallback = await cache.match('./index.html');
          if (fallback) return stripConflictingFirestoreSetting(fallback);
        }
        const cached = await cache.match(request, { ignoreSearch: true });
        if (cached) return cached;
        return new Response('Offline and this resource is not cached.', {
          status: 503,
          headers: { 'Content-Type': 'text/plain; charset=utf-8' }
        });
      })
  );
});
