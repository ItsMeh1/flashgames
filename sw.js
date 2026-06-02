const CACHE_NAME = 'flash-vault-v2.3'; // Bumped version

self.addEventListener('install', (e) => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(clients.claim()));

self.addEventListener('message', async (event) => {
    if (event.data.type === 'SYNC_GAMES') {
        const urls = event.data.urls;
        const cache = await caches.open(CACHE_NAME);
        
        let syncedCount = 0;
        let failedCount = 0;
        let totalCount = urls.length;

        // Broadcast initial start
        const clientsList = await clients.matchAll();
        
        for (let i = 0; i < totalCount; i++) {
            const url = urls[i];
            try {
                const isExternal = url.startsWith('http') && !url.includes(location.hostname);
                const requestOptions = isExternal ? { mode: 'no-cors' } : { mode: 'cors' };
                const response = await fetch(url, requestOptions);
                
                if (response.ok || response.type === 'opaque') {
                    await cache.put(url, response);
                    syncedCount++;
                } else {
                    failedCount++;
                }
            } catch (err) {
                failedCount++;
            }

            // Stream live progress back to index.html
            clientsList.forEach(client => {
                client.postMessage({ 
                    type: 'SYNC_PROGRESS', 
                    current: syncedCount + failedCount, 
                    total: totalCount, 
                    synced: syncedCount, 
                    failed: failedCount 
                });
            });
        }

        // Final completion message
        clientsList.forEach(client => {
            client.postMessage({ type: 'SYNC_COMPLETE', synced: syncedCount, failed: failedCount });
        });
    }
});

self.addEventListener('fetch', (event) => {
    if (!event.request.url.startsWith('http')) return;
    event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
            return cachedResponse || fetch(event.request).catch(() => new Response(
                '<h1>Offline Content Unavailable</h1><p>This game hasn\'t been successfully synced.</p>', 
                { status: 503, headers: { 'Content-Type': 'text/html' } }
            ));
        })
    );
});
