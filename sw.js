const CACHE_NAME = 'flashgames-v2-2.0.0';
const APP_SHELL = ['./','./index.html','./v2-data.js','./v2-store.js','./offline.json','./offline/logo.png'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key.startsWith('flashgames-') && key !== CACHE_NAME).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || !event.request.url.startsWith('http')) return;
  event.respondWith(
    fetch(event.request).then(response => {
      if (response.ok && new URL(event.request.url).origin === self.location.origin) {
        const copy = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy)).catch(() => {});
      }
      return response;
    }).catch(async () => {
      const cache = await caches.open(CACHE_NAME);
      if (event.request.mode === 'navigate') return cache.match('./index.html');
      return cache.match(event.request, {ignoreSearch:true}) || Promise.reject(new Error('Offline and file not cached.'));
    })
  );
});
