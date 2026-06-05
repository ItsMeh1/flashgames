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
    // We only care about standard GET requests
    if (event.request.method !== 'GET') return;

    // Ignore Chrome extension requests or weird schemes
    if (!event.request.url.startsWith('http')) return;

    event.respondWith(
        // Step 1: Try to fetch from the live internet
        fetch(event.request).catch(async () => {
            // Step 2: The internet failed! Look inside our synced vault.
            const cache = await caches.open(CACHE_NAME);
            
            // ignoreSearch: true ensures that even if a URL has ?v=2 on it, 
            // it still finds the base file we synced.
            const cachedResponse = await cache.match(event.request, { ignoreSearch: true });
            
            if (cachedResponse) {
                return cachedResponse;
            }
            
            // If it's not in the cache, let it fail naturally.
            throw new Error('Offline and file not cached.');
        })
    );
});
