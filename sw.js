const CACHE_NAME = 'flashgames-v2-platform-1';

const APP_SHELL = [
  './', './index.html', './styles.css', './refinement.css', './precision.css', './issue-fixes.css', './performance.css', './final-fixes.css', './alignment-reset.css',
  './app.js', './data.js', './legacy-cache.js', './admin.js', './auth.js', './sync.js', './login-gate.js', './player-fixes.js',
  './custom-install.js', './moderation-fixes.js', './profile-fixes.js', './platform-upgrades.js', './cache-manifest.json', './manifest.json', './offline.json', './update.json', './offline/logo.png'
];

async function warmCache(assets) {
  const cache = await caches.open(CACHE_NAME);
  for (const asset of [...new Set(assets)]) {
    try {
      const url = new URL(asset, self.registration.scope).href;
      const response = await fetch(`${url}${url.includes('?') ? '&' : '?'}cacheBust=${Date.now()}`, { cache: 'reload' });
      if (response.ok) await cache.put(url, response.clone());
    } catch (_) {}
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(warmCache(APP_SHELL).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key.startsWith('flashgames-') && key !== CACHE_NAME).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data?.type !== 'FLASHGAMES_CACHE_SYNC') return;
  const assets = Array.isArray(event.data.assets) ? event.data.assets : APP_SHELL;
  event.waitUntil(warmCache(assets));
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET' || !request.url.startsWith(self.location.origin)) return;

  const url = new URL(request.url);
  const alwaysFresh = request.mode === 'navigate'
    || url.pathname.endsWith('/index.html')
    || url.pathname.endsWith('/sw.js')
    || url.pathname.endsWith('/cache-manifest.json')
    || url.pathname.endsWith('/update.json')
    || url.pathname.endsWith('/manifest.json');

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    if (alwaysFresh) {
      try {
        const network = await fetch(request, { cache: 'no-store' });
        if (network.ok && !url.pathname.endsWith('/sw.js')) cache.put(url.href, network.clone()).catch(() => {});
        return network;
      } catch (_) {
        return cache.match(request, { ignoreSearch: true }) || cache.match('./index.html') || new Response('Offline', { status: 503 });
      }
    }
    try {
      const network = await fetch(request, { cache: 'no-store' });
      if (network.ok) cache.put(url.href, network.clone()).catch(() => {});
      return network;
    } catch (_) {
      return cache.match(request, { ignoreSearch: true }) || new Response('Offline', { status: 503 });
    }
  })());
});
