const CACHE_NAME = 'flash-portal-v2';

// The core shell of your app
const APP_SHELL = [
    './',
    './index.html',
    './offline.json',
    './manifest.json'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL))
        .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then(keys => Promise.all(
            keys.map(key => {
                if (key !== CACHE_NAME) return caches.delete(key);
            })
        )).then(() => self.clients.claim())
    );
});

// Cache-First Strategy for local assets, Network-First for remote endpoints
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);
    
    // Only cache requests from our own origin (the offline folder & app shell)
    if (url.origin === location.origin) {
        event.respondWith(
            caches.match(event.request).then((cachedResponse) => {
                if (cachedResponse) return cachedResponse;

                // If not in cache, fetch it, and store it for next time (crucial for heavy game assets)
                return fetch(event.request).then((networkResponse) => {
                    if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
                        return networkResponse;
                    }
                    const responseToCache = networkResponse.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, responseToCache);
                    });
                    return networkResponse;
                });
            })
        );
    }
});

// Listen for explicit caching commands from the UI button
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SYNC_GAMES') {
        caches.open(CACHE_NAME).then((cache) => {
            cache.addAll(event.data.urls)
                .then(() => event.source.postMessage({ type: 'SYNC_COMPLETE' }))
                .catch((err) => console.error("Sync failed:", err));
        });
    }
});
