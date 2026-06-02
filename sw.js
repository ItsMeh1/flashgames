const CACHE_NAME = 'flash-vault-v2.2';

// Force the service worker to activate immediately without waiting for browser restarts
self.addEventListener('install', (e) => {
    self.skipWaiting();
});

self.addEventListener('activate', (e) => {
    e.waitUntil(clients.claim());
});

// The core fault-tolerant sync engine
self.addEventListener('message', async (event) => {
    if (event.data.type === 'SYNC_GAMES') {
        const urls = event.data.urls;
        const cache = await caches.open(CACHE_NAME);
        
        let syncedCount = 0;
        let failedCount = 0;

        console.log(`Starting background sync for ${urls.length} resources...`);

        // Loop through assets individually so one failure won't crash the sync
        for (const url of urls) {
            try {
                // Check if the URL belongs to an external site
                const isExternal = url.startsWith('http') && !url.includes(location.hostname);
                
                // Use 'no-cors' for external links to bypass security blocking
                const requestOptions = isExternal ? { mode: 'no-cors' } : { mode: 'cors' };
                
                const response = await fetch(url, requestOptions);
                
                // Opaque responses (status 0) are normal for cross-origin 'no-cors' files
                if (response.ok || response.type === 'opaque') {
                    await cache.put(url, response);
                    syncedCount++;
                } else {
                    failedCount++;
                }
            } catch (err) {
                console.warn(`Skipped asset due to network/CORS restriction: ${url}`, err);
                failedCount++;
            }
        }

        console.log(`Sync complete. Saved: ${syncedCount}, Failed: ${failedCount}`);

        // Broadcast stats back to your index.html user interface
        const clientsList = await clients.matchAll();
        clientsList.forEach(client => {
            client.postMessage({ 
                type: 'SYNC_COMPLETE', 
                synced: syncedCount, 
                failed: failedCount 
            });
        });
    }
});

// Intercept network requests when offline and serve them from the local cache
self.addEventListener('fetch', (event) => {
    // Only intercept standard HTTP/S requests (ignores chrome extensions, etc.)
    if (!event.request.url.startsWith('http')) return;

    event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
            if (cachedResponse) {
                return cachedResponse; // Found it locally!
            }
            
            // If not in cache, try to fetch it live from the web
            return fetch(event.request).catch(() => {
                // If completely offline and uncached, return a graceful error response
                return new Response(
                    '<h1>Offline Content Unavailable</h1><p>This game hasn\'t been successfully synced to your local storage yet.</p>', 
                    { status: 503, headers: { 'Content-Type': 'text/html' } }
                );
            });
        })
    );
});
