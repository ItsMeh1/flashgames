/* Flash Games service worker — minimal offline shell, no HTML rewriting. */
const CACHE_NAME = 'flashgames-v39';
const APP_SHELL = [
  './', './index.html', './assets/css/styles.css', './assets/css/quickq.css', './assets/css/chat.css',
  './assets/js/eagler-gpu.js', './assets/js/core.js', './assets/js/app.js', './assets/js/admin.js', './assets/js/auth.js', './assets/js/extras.js', './assets/js/quickq.js', './assets/js/social-chat.js',
  './assets/data/legal.json', './manifest.json', './assets/data/update.json', './assets/data/offline.json',
  './eagler/clients.json',
  './offline/logo.png'
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
    // Shell assets: app code always goes network-first so users never run
    // stale JS; the cache is only the offline fallback.
    const staleShell = /\.(js|mjs|css|json)$/i.test(u.pathname) && u.origin === self.location.origin;
    if (staleShell) {
      let fresh = null;
      try {
        const n = await fetch(r, { cache: 'no-store' });
        if (n.ok) { c.put(r.url, n.clone()).catch(() => {}); fresh = n; }
      } catch (_) {}
      if (fresh) return fresh;
      const cached = await c.match(r, { ignoreSearch: true });
      if (cached) return cached;
      return new Response('Offline', { status: 503 });
    }
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
