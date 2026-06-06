const CACHE_NAME = 'flashgames-cache-v1';

// Install instantly
self.addEventListener('install', (event) => {
    self.skipWaiting();
});

// Take control of the page immediately upon activation
self.addEventListener('activate', (event) => {
    event.waitUntil(clients.claim());
});

// The Traffic Cop: Intercept network requests
self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') return;
    if (!event.request.url.startsWith('http')) return;

    event.respondWith(
        fetch(event.request).catch(async () => {
            const cache = await caches.open(CACHE_NAME);
            
            // NEW: If the browser is trying to load/navigate to the app itself (e.g. from the home screen)
            if (event.request.mode === 'navigate') {
                // Ignore the ?query and exact path, just force-feed it index.html
                const indexMatch = await cache.match('./index.html');
                if (indexMatch) return indexMatch;
            }
            
            // Standard fallback for everything else (games, images, json)
            const cachedResponse = await cache.match(event.request, { ignoreSearch: true });
            
            if (cachedResponse) {
                return cachedResponse;
            }
            
            throw new Error('Offline and file not cached.');
        })
    );
});
