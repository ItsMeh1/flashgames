const CACHE_NAME = 'flashgames-v2-recovery-6';

const APP_SHELL = [
  './', './index.html', './styles.css', './refinement.css', './precision.css', './issue-fixes.css', './performance.css', './final-fixes.css',
  './app.js', './data.js', './legacy-cache.js', './admin.js', './auth.js', './sync.js', './login-gate.js', './player-fixes.js',
  './custom-install.js', './moderation-fixes.js', './profile-fixes.js', './update.json', './offline/logo.png'
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
  const fresh = request.mode === 'navigate' || url.pathname.endsWith('/index.html') || url.pathname.endsWith('/sw.js') || url.pathname.endsWith('/update.json');
  if (fresh) {
    event.respondWith(fetch(request, { cache: 'no-store' }).catch(async () => { const cache = await caches.open(CACHE_NAME); return cache.match('./index.html') || new Response('Offline', { status: 503 }); }));
    return;
  }
  event.respondWith(fetch(request).catch(async () => {
    const cache = await caches.open(CACHE_NAME);
    return cache.match(request, { ignoreSearch: true }) || new Response('Offline', { status: 503 });
  }));
});
