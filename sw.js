const CACHE_NAME = 'flashgames-v2-platform-2';
const APP_SHELL = ['./','./index.html','./styles.css','./refinement.css','./precision.css','./issue-fixes.css','./performance.css','./final-fixes.css','./alignment-reset.css','./app.js','./data.js','./legacy-cache.js','./admin.js','./auth.js','./sync.js','./login-gate.js','./player-fixes.js','./custom-install.js','./moderation-fixes.js','./profile-fixes.js','./platform-upgrades.js','./v2-hotfixes.js','./cache-manifest.json','./manifest.json','./offline.json','./update.json','./offline/logo.png'];

async function fresh(url){
  return fetch(`${url}${url.includes('?')?'&':'?'}v=${Date.now()}-${Math.random().toString(36).slice(2)}`,{cache:'no-store'});
}
async function warm(assets){
  const cache=await caches.open(CACHE_NAME);
  for(const asset of [...new Set(assets)]){
    try{const url=new URL(asset,self.registration.scope).href;const r=await fresh(url);if(r.ok)await cache.put(url,r.clone())}catch(_){}}
}
self.addEventListener('install',e=>e.waitUntil(warm(APP_SHELL).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil((async()=>{const keys=await caches.keys();await Promise.all(keys.filter(k=>k.startsWith('flashgames-')&&k!==CACHE_NAME).map(k=>caches.delete(k)));await self.clients.claim()})()));
self.addEventListener('message',e=>{if(e.data?.type!=='FLASHGAMES_CACHE_SYNC')return;e.waitUntil(warm(Array.isArray(e.data.assets)?e.data.assets:APP_SHELL))});
self.addEventListener('fetch',e=>{const r=e.request;if(r.method!=='GET'||!r.url.startsWith(self.location.origin))return;const u=new URL(r.url);e.respondWith((async()=>{const c=await caches.open(CACHE_NAME);try{const n=await fresh(u.href);if(n.ok)c.put(u.href,n.clone()).catch(()=>{});return n}catch(_){return (await c.match(r,{ignoreSearch:true}))||new Response('Offline',{status:503})}})())});