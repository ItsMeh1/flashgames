/* Flash Games service worker — minimal offline shell, no HTML rewriting. */
const CACHE_NAME = 'flashgames-v6';
const APP_SHELL = [
  './', './index.html', './styles.css',
  './core.js', './app.js', './admin.js', './auth.js', './extras.js',
  './manifest.json', './update.json', './offline.json', './offline/logo.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE_NAME);
    await Promise.allSettled(APP_SHELL.map(async (a) => {
      try {
        const u = new URL(a, self.registration.scope).href;
        const r = await fetch(u, { cache: 'no-store' });
        if (r.ok) await c.put(u, r.clone());
      } catch (_) {}
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    // NOTE: game-library caches are never deleted here (only old app shells).
    await Promise.all(keys
      .filter((k) => k.startsWith('flashgames-') && k !== CACHE_NAME)
      .map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (e) => {
  if (e.data?.type !== 'FLASHGAMES_CACHE_SYNC') return;
  const assets = Array.isArray(e.data.assets) ? e.data.assets : APP_SHELL;
  e.waitUntil((async () => {
    const c = await caches.open(CACHE_NAME);
    await Promise.allSettled(assets.map(async (a) => {
      try {
        const u = new URL(a, self.registration.scope).href;
        const r = await fetch(u, { cache: 'no-store' });
        if (r.ok) await c.put(u, r.clone());
      } catch (_) {}
    }));
  })());
});

self.addEventListener('fetch', (e) => {
  const r = e.request;
  if (r.method !== 'GET') return;
  const u = new URL(r.url);
  if (u.origin !== self.location.origin) return;
  e.respondWith((async () => {
    const c = await caches.open(CACHE_NAME);
    // Navigations: network first, fall back to cached shell.
    if (r.mode === 'navigate') {
      try {
        const n = await fetch(r);
        if (n.ok) { c.put(r.url, n.clone()).catch(() => {}); return n; }
      } catch (_) {}
      return (await c.match('./index.html')) || (await c.match(r, { ignoreSearch: true })) || Response.error();
    }
    // Shell assets: cache first, then network.
    const hit = await c.match(r, { ignoreSearch: false });
    if (hit) return hit;
    try {
      const n = await fetch(r);
      if (n.ok) c.put(r.url, n.clone()).catch(() => {});
      return n;
    } catch (_) {
      return (await c.match(r, { ignoreSearch: true })) || new Response('Offline', { status: 503 });
    }
  })());
});
