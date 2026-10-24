/* Flash Games core — catalogue, library, favourites, session, online cache.
 * Merged from data.js + legacy-cache.js + data-compat.js + favourites-fix.js
 * + offline-session.js + online-cache.js + sync.js (single source of truth). */
(() => {
  'use strict';

  const GAME_CACHE = 'flashgames.catalogue.v8';
  const LEGACY_CATALOGUES = ['flashgames.catalogue.v7', 'flashgames.catalogue.v6', 'flashgames.catalogue.v5', 'flashgames.catalogue.v4', 'flashgames.catalogue.v3'];
  const CACHE_NAME = 'flash-games-cache';
  const META_KEY = 'flash_offline_folder';
  const FAVOURITES_KEY = 'flashgames.favourites.v1';
  const SESSION_KEY = 'flashgames.offline.session.v1';
  const SOURCE_ROOT = 'https://raw.githubusercontent.com/CoolDude2349/Offline-HTML-Games-Pack/master/offline/';
  const TREE_URL = 'https://api.github.com/repos/CoolDude2349/Offline-HTML-Games-Pack/git/trees/master?recursive=1';
  const OFFLINE_MANIFEST_URL = './offline.json';

  const clean = (value) => String(value ?? '').trim();
  const esc = (value) => clean(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const prettyName = (value) => clean(value).split('/').pop().replace(/\.html?$/i, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/\b\w/g, (c) => c.toUpperCase()) || 'HTML Game';

  /* ---------- built-in catalogues ---------- */

  if (!Array.isArray(window.FlashExclusiveGames)) {
    window.FlashExclusiveGames = [
      { id: 'flash-orbital', name: 'Orbital', rawUrl: './offline/orbital.html', cover: '', category: 'Exclusive', description: 'Try to not get hit by the missiles!' },
      { id: 'flash-infinity-rng', name: 'Infinity RNG', rawUrl: './offline/infinityrng.html', cover: './offline/rng.png', category: 'Exclusive', description: 'Test your luck! Updates weekly!' },
      { id: 'flash-infinity-rng-legacy', name: 'Legacy Infinity RNG', rawUrl: './offline/infinityrnglegacy.html', cover: './offline/rng.png', category: 'Exclusive', description: 'Only the OGs played this' },
      { id: 'flash-2048', name: '2048', rawUrl: './offline/2048.html', cover: './offline/2048.png', category: 'Exclusive', description: 'Its really just 2048, nothing special' },
      { id: 'pixelclient-112', name: 'PixelClient 1.12', rawUrl: './offline/PixelClient 1.12.2 WASM.html', cover: './offline/pixelclient.svg', category: 'Exclusive', description: 'PixelClient: An Eaglercraft client with 20+ built-in mods' },
      { id: 'pixelclient-18', name: 'PixelClient 1.8', rawUrl: './offline/PixelClient 1.8.8 WASM.html', cover: './offline/pixelclient.svg', category: 'Exclusive', description: 'PixelClient: An Eaglercraft client with 20+ built-in mods & 1.8 PVP!' },
      { id: 'tuffclient', name: 'Tuff Client', rawUrl: './offline/eaglercraft.dev_Tuff_Client_WASM.html', cover: './offline/tuffclient.png', category: 'Exclusive', description: 'Anyone remember this?' },
      { id: 'astra112', name: 'AstraClient 1.12', rawUrl: './offline/astra112.html', cover: './offline/astraclient.jpeg', category: 'Exclusive', description: 'One of the best clients' }
    ];
  }

  // Cloud catalog: nowgg.fun titles, opened through FlashBridge (see below).
  // App paths below were verified against now.gg listing pages.
  if (!Array.isArray(window.FlashCloudGames)) {
    window.FlashCloudGames = [
      { id: 'cloud-roblox', name: 'Roblox', url: 'https://nowgg.fun/apps/a/19900/b.html', cover: 'https://nowgg.fun/img/roadblock.png', description: 'Play Roblox in the cloud via nowgg.fun. No install needed.' },
      { id: 'cloud-stumble-guys', name: 'Stumble Guys', url: 'https://nowgg.fun/apps/a/10011/b.html', cover: 'https://nowgg.fun/img/stumbleguys.jpg', description: 'Chaotic multiplayer races in the cloud via nowgg.fun.' },
      { id: 'cloud-cod', name: 'Call of Duty', url: 'https://nowgg.fun/apps/a/10008/b.html', cover: 'https://nowgg.fun/img/cod.jpg', description: 'FPS action in the cloud via nowgg.fun.' },
      { id: 'cloud-cookie-run', name: 'Cookie Run', url: 'https://nowgg.fun/apps/a/10019/b.html', cover: 'https://nowgg.fun/img/cookierun.jpg', description: 'Oven-break running in the cloud via nowgg.fun.' },
      { id: 'cloud-rocket-league', name: 'Rocket League', url: 'https://nowgg.fun/apps/psyonix-studios/4656/rocket-league.html', cover: 'https://nowgg.fun/img/rocketleague.webp', description: 'Car soccer in the cloud via nowgg.fun.' },
      { id: 'cloud-geometry-dash', name: 'Geometry Dash', url: 'https://nowgg.fun/apps/robtop-games/1400/geometry-dash.html', cover: 'https://nowgg.fun/img/geodash.png', description: 'Rhythm platforming in the cloud via nowgg.fun.' },
      { id: 'cloud-melon-sandbox', name: 'Melon Sandbox', url: 'https://nowgg.fun/apps/playducky/7199/melon-sandbox.html', cover: 'https://nowgg.fun/img/melon-sandbox.png', description: 'Physics playground in the cloud via nowgg.fun.' },
      { id: 'cloud-fortnite', name: 'Fortnite', url: 'https://nowgg.fun/apps/aptoide/5874/aptoide.html?deep_link=aptoidesearch://com.epicgames.fortnite', cover: 'https://nowgg.fun/img/fortnite.png', description: 'Battle royale in the cloud via nowgg.fun.' },
      { id: 'cloud-minecraft-trial', name: 'Minecraft Trial', url: 'https://nowgg.fun/apps/aptoide/5874/aptoide.html?deep_link=aptoidesearch://com.mojang.minecrafttrialpe', cover: './offline/logo.png', description: 'Block building in the cloud via nowgg.fun.' },
      { id: 'cloud-aptoide', name: 'Aptoide', url: 'https://nowgg.fun/apps/aptoide/5874/aptoide.html', cover: 'https://nowgg.fun/img/aptoide.png', description: 'App store games in the cloud via nowgg.fun.' },
      { id: 'cloud-uncube', name: 'Uncube Now', url: 'https://nowgg.fun/apps/uncube/7074/now.html', cover: 'https://nowgg.fun/img/android.jpg', description: 'Android gaming in the cloud via nowgg.fun.' }
    ];
  }

  /* ---------- offline session ---------- */

  const session = {
    read() {
      try {
        const v = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
        return v && v.version === 1 && v.uid && v.banStatus === 'clear' ? v : null;
      } catch { return null; }
    },
    write(user, profile = {}) {
      if (!user?.uid) return false;
      try {
        localStorage.setItem(SESSION_KEY, JSON.stringify({
          version: 1, uid: String(user.uid), email: String(user.email || '').slice(0, 320),
          displayName: String(profile.displayName || user.displayName || '').slice(0, 120),
          photoURL: String(profile.photoURL || user.photoURL || '').slice(0, 2048),
          role: String(profile.role || '').slice(0, 40), banStatus: 'clear', verifiedAt: Date.now()
        }));
        return true;
      } catch { return false; }
    },
    clear() { try { localStorage.removeItem(SESSION_KEY); } catch {} },
    isOffline() { return navigator.onLine === false; }
  };
  window.FlashOfflineSession = Object.freeze(session);

  /* ---------- catalogue ----------
   * Fast path: cache + manifest resolve instantly. Remote listings refresh
   * in the background (stale-while-revalidate) at most every REFRESH_AFTER.
   * Listings come from a mirror ladder so a single dead/rate-limited source
   * never breaks the store. */

  let cataloguePromise = null;
  let refreshPromise = null;

  const SYNC_KEY = 'flashgames.catalogue.sync.v1';
  const REFRESH_AFTER = 30 * 60 * 1000; // background re-sync at most every 30 min
  const FAST_CACHE_MIN = 300;           // cache is "good enough" below this many? no: above

  function readCache(key) {
    try {
      const v = JSON.parse(localStorage.getItem(key) || 'null');
      return Array.isArray(v?.games) ? v.games : Array.isArray(v) ? v : [];
    } catch { return []; }
  }
  function readCachedCatalogue() {
    return mergeGames(...[GAME_CACHE, ...LEGACY_CATALOGUES].map(readCache));
  }
  function writeCatalogue(games) {
    try { localStorage.setItem(GAME_CACHE, JSON.stringify({ version: 9, generatedAt: Date.now(), games })); } catch {}
  }

  function readSyncMeta() {
    try {
      const v = JSON.parse(localStorage.getItem(SYNC_KEY) || 'null');
      return v && typeof v === 'object' ? v : null;
    } catch { return null; }
  }
  function writeSyncMeta(patch) {
    const next = { ...readSyncMeta(), ...patch, at: Date.now() };
    try { localStorage.setItem(SYNC_KEY, JSON.stringify(next)); } catch {}
    return next;
  }

  // Bundled files get a stable id from their filename, so the manifest entry,
  // an install record and an old exclusive entry all resolve to ONE game.
  // Only same-origin/relative offline/ files qualify — never remote pack
  // files that happen to share a filename.
  function canonicalLocalId(url) {
    const raw = clean(url).split('?')[0];
    if (!raw) return '';
    let path = raw;
    if (/^[a-z][a-z0-9+.-]*:/i.test(raw) || raw.startsWith('//')) {
      try {
        const loc = typeof location !== 'undefined' ? location.origin : '';
        if (!loc || !raw.startsWith(loc)) return '';
        path = raw.slice(loc.length);
      } catch { return ''; }
    }
    const m = /(?:^|\/)offline\/([^/]+\.html?)$/i.exec(path);
    if (!m) return '';
    const slug = m[1].toLowerCase().replace(/\.html?$/i, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    return slug ? `local-${slug}` : '';
  }

  function normalizeGame(game, index = 0) {
    if (!game || typeof game !== 'object') return null;
    const name = clean(game.name || game.title);
    const url = clean(game.rawUrl || game.url || game.href || game.link);
    if (!name || !url) return null;
    const rating = game.rating == null ? null : Number(game.rating);
    return {
      id: canonicalLocalId(url) || clean(game.id) || `game-${index}-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
      name, title: name, url, rawUrl: url,
      zone: clean(game.zone || game.type || 'OFFLINE PACK'),
      category: clean(game.category || game.genre || 'HTML Games'),
      description: clean(game.description || game.desc || 'Single-file HTML game.'),
      cover: clean(game.cover || game.image || game.thumbnail || game.icon),
      tags: Array.isArray(game.tags) ? game.tags.map(clean).filter(Boolean) : [],
      rating: Number.isFinite(rating) ? rating : null,
      source: clean(game.source || 'CoolDude2349/Offline-HTML-Games-Pack')
    };
  }

  function mergeGames(...lists) {
    const out = [], seen = new Set();
    lists.flat().forEach((raw, i) => {
      const g = normalizeGame(raw, i);
      if (!g) return;
      const key = g.rawUrl || g.url || g.id;
      if (seen.has(key)) return;
      seen.add(key);
      out.push(g);
    });
    return out;
  }

  async function fetchJson(url, timeout = 15000) {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), timeout);
    try {
      const r = await fetch(url, { cache: 'no-store', signal: c.signal, headers: { Accept: 'application/json' } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.json();
    } finally { clearTimeout(t); }
  }

  function chooseCover(htmlPath, images) {
    const dir = htmlPath.slice(0, htmlPath.lastIndexOf('/') + 1);
    const stem = htmlPath.slice(htmlPath.lastIndexOf('/') + 1).replace(/\.html?$/i, '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const best = images
      .filter((p) => p.startsWith(dir))
      .map((path) => {
        const imgName = path.slice(path.lastIndexOf('/') + 1);
        const imgStem = imgName.replace(/\.[^.]+$/, '').toLowerCase().replace(/[^a-z0-9]/g, '');
        let score = 0;
        if (imgStem === stem) score += 100;
        if (imgStem.includes(stem) || stem.includes(imgStem)) score += 45;
        if (/cover|thumbnail|thumb|preview|icon/i.test(imgName)) score += 25;
        return { path, score };
      })
      .sort((a, b) => b.score - a.score)[0];
    if (!best || best.score < 25) return '';
    return `https://raw.githubusercontent.com/CoolDude2349/Offline-HTML-Games-Pack/master/${best.path}`;
  }

  function parseGameFiles(payload) {
    // GitHub git-trees API: {tree:[{path,type,size}]}, ungh.cc: {files:[{path,size}]}.
    const entries = Array.isArray(payload?.tree) ? payload.tree
      : Array.isArray(payload?.files) ? payload.files : [];
    const isFile = Array.isArray(payload?.tree)
      ? (e) => e.type === 'blob'
      : (e) => !e.type || /^100\d{3}$/.test(String(e.mode || ''));
    const sizes = new Map();
    for (const e of entries) {
      if (isFile(e) && typeof e.size === 'number' && e.size >= 0) sizes.set(String(e.path), e.size);
    }
    return {
      html: entries.filter((e) => isFile(e) && /^offline\/.*\.html?$/i.test(e.path)).map((e) => e.path).sort(),
      images: entries.filter(isFile).filter((e) => /^offline\/.*\.(png|jpe?g|webp|gif|svg)$/i.test(e.path)).map((e) => e.path),
      sizes
    };
  }

  // Mirror ladder for the pack listing. ungh.cc is an open GitHub proxy and
  // is immune to the API's 60 req/h per-IP rate limit.
  const CATALOGUE_SOURCES = [
    { id: 'github', label: 'GitHub API', url: TREE_URL },
    { id: 'ungh', label: 'ungh.cc mirror', url: 'https://ungh.cc/repos/CoolDude2349/Offline-HTML-Games-Pack/files/master' }
  ];

  async function fetchGameListing(timeout = 12000) {
    let lastErr = new Error('No catalogue source was reachable.');
    for (const src of CATALOGUE_SOURCES) {
      try {
        const payload = await fetchJson(src.url, timeout);
        const listing = parseGameFiles(payload);
        if (!listing.html.length) throw new Error('Listing has no game files.');
        return { ...listing, source: src.label };
      } catch (e) { lastErr = e; }
    }
    throw lastErr;
  }

  function gamesFromListing(listing) {
    return listing.html.map((path) => {
      const file = path.slice(path.lastIndexOf('/') + 1);
      const rawUrl = `${SOURCE_ROOT}${encodeURIComponent(file)}`;
      const name = prettyName(file).replace(/\bFnaf\b/i, 'FNAF').replace(/\bLol\b/i, 'LoL').replace(/\bAgar Io\b/i, 'Agar.io');
      return {
        id: `offline-${file.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
        name, title: name, url: rawUrl, rawUrl, zone: 'OFFLINE PACK', category: 'HTML Games',
        description: 'Single-file HTML game from the Offline HTML Games Pack.',
        cover: chooseCover(path, listing.images), tags: ['HTML', 'Offline'], source: 'CoolDude2349/Offline-HTML-Games-Pack',
        size: listing.sizes ? (listing.sizes.get(path) || 0) : 0
      };
    });
  }

  async function loadLocalManifest() {
    // Cache-busted fetch keeps the manifest fresh; when offline the service
    // worker serves the pre-cached copy (exact-URL fetch), then storage.
    const attempts = [
      () => fetch(`${OFFLINE_MANIFEST_URL}?v=${Date.now()}`, { cache: 'no-store', headers: { Accept: 'application/json' } }),
      () => fetch(OFFLINE_MANIFEST_URL, { cache: 'no-store', headers: { Accept: 'application/json' } })
    ];
    for (const attempt of attempts) {
      try {
        const r = await attempt();
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const data = await r.json();
        const list = Array.isArray(data) ? data : data.games || [];
        // Bundled local games ARE the Flash exclusives: they ship with the app.
        return list.map((g, i) => normalizeGame({
          ...g,
          zone: 'FLASH EXCLUSIVE',
          source: 'Flash Exclusive',
          category: (!g.category || g.category === 'Standard') ? 'Exclusive' : g.category
        }, i)).filter(Boolean);
      } catch { /* try the next fallback */ }
    }
    return [];
  }

  // One shared refresh: fetch listing (mirror ladder), merge with cache and
  // the local manifest, persist, then tell the UI exactly what changed.
  function refreshCatalogue() {
    if (refreshPromise) return refreshPromise;
    refreshPromise = (async () => {
      const [local, listing] = await Promise.all([loadLocalManifest(), fetchGameListing().catch(() => null)]);
      const remote = listing ? gamesFromListing(listing) : [];
      const games = mergeGames(local, remote, readCachedCatalogue());
      if (games.length) writeCatalogue(games);
      writeSyncMeta({ source: listing ? listing.source : 'network', games: games.length, refreshed: remote.length > 0 });
      try { window.dispatchEvent(new CustomEvent('flashgames:catalogue-updated', { detail: { games, refreshed: remote.length > 0, source: listing ? listing.source : '' } })); } catch {}
      return {
        games,
        source: games.length ? (remote.length ? 'catalogue' : 'cache+manifest') : 'empty',
        error: remote.length || games.length ? '' : (listing ? '' : 'offline')
      };
    })().catch(async () => {
      const games = mergeGames(await loadLocalManifest(), readCachedCatalogue());
      return { games, source: games.length ? 'cache' : 'empty', error: 'offline' };
    }).finally(() => { refreshPromise = null; });
    return refreshPromise;
  }

  function loadGames(force = false) {
    if (cataloguePromise && !force) return cataloguePromise;
    if (force) return refreshCatalogue();
    cataloguePromise = (async () => {
      const cached = readCachedCatalogue();
      const local = await loadLocalManifest();
      const combined = mergeGames(local, cached);
      const meta = readSyncMeta();
      // Fast path: resolvable games from cache+manifest. A healthy cached
      // catalogue renders instantly; a stale one quietly re-syncs while the
      // user browses.
      if (combined.length >= FAST_CACHE_MIN) {
        const stale = !meta || !meta.at || (Date.now() - meta.at) > REFRESH_AFTER;
        if (stale) refreshCatalogue().catch(() => {});
        return { games: combined, source: 'cache+manifest' };
      }
      // First run / thin cache: wait for a real listing.
      const result = await refreshCatalogue();
      if (result.games.length) return result;
      return { games: combined, source: combined.length ? 'cache' : 'empty', error: result.error || 'offline' };
    })();
    return cataloguePromise.then(
      (v) => { cataloguePromise = null; return v; },
      (e) => { cataloguePromise = null; throw e; }
    );
  }

  async function loadUpdates() {
    try {
      const r = await fetch(`./update.json?v=${Date.now()}`, { cache: 'no-store' });
      if (!r.ok) throw new Error();
      const data = await r.json();
      const releases = Array.isArray(data) ? data : data.releases || [];
      const articles = Array.isArray(data.articles) ? data.articles : [];
      return { version: clean(data.version || releases[0]?.version || '0.0.0'), releases, articles };
    } catch { return { version: '0.0.0', releases: [], articles: [] }; }
  }

  async function loadNotifications(uid) {
    const db = window.__flashFirebase?.db;
    if (!db) return [];
    try {
      const col = db.collection('notifications');
      const snap = uid
        ? await col.where('uid', '==', uid).limit(30).get().catch(() => col.limit(30).get())
        : await col.limit(30).get();
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    } catch { return []; }
  }

  window.FlashData = {
    esc, prettyName, normalizeGame,
    loadGames, loadUpdates, loadNotifications,
    syncGames: () => loadGames(true),
    getCachedCatalogue: () => ({ games: readCachedCatalogue(), source: 'cache' }),
    getSyncMeta: () => readSyncMeta() || {},
    clearCache() {
      try { localStorage.removeItem(GAME_CACHE); } catch {}
      for (const key of LEGACY_CATALOGUES) { try { localStorage.removeItem(key); } catch {} }
    }
  };

  /* ---------- favourites (sync API) ---------- */

  function readFavs() {
    try {
      const v = JSON.parse(localStorage.getItem(FAVOURITES_KEY) || '[]');
      return new Set(Array.isArray(v) ? v.map(String) : []);
    } catch { return new Set(); }
  }
  function writeFavs(set) {
    const list = [...new Set([...set].map(String))];
    try { localStorage.setItem(FAVOURITES_KEY, JSON.stringify(list)); } catch {}
    return new Set(list);
  }

  /* ---------- game library (Cache Storage) ---------- */

  let cachePromise = null;
  let idbMigrated = false;

  function cacheHandle() {
    if (!cachePromise) {
      if (!('caches' in window)) return Promise.reject(new Error('Cache Storage is unavailable in this browser.'));
      cachePromise = caches.open(CACHE_NAME);
    }
    return cachePromise;
  }

  function metaList() {
    try {
      const v = JSON.parse(localStorage.getItem(META_KEY) || '[]');
      return Array.isArray(v) ? v : [];
    } catch { return []; }
  }
  function metaFor(url) {
    const n = clean(url);
    const list = metaList();
    const direct = list.find((m) => clean(m?.url || m?.rawUrl) === n);
    if (direct) return direct;
    // Same-origin cache keys are absolute; metadata is kept relative.
    const m = /\/offline\/([^/]+\.html?)(\?.*)?$/i.exec(n);
    if (m) {
      const rel = `./offline/${m[1]}`;
      const found = list.find((item) => clean(item?.url || item?.rawUrl) === rel);
      if (found) return found;
    }
    return {};
  }
  function saveMeta(item) {
    try {
      const list = metaList();
      const i = list.findIndex((m) => clean(m?.url || m?.rawUrl) === clean(item.url || item.rawUrl));
      if (i >= 0) list[i] = { ...list[i], ...item };
      else list.push(item);
      localStorage.setItem(META_KEY, JSON.stringify(list));
    } catch {}
  }

  function toRecord(url, meta = {}, extra = {}) {
    const source = clean(url);
    const name = clean(extra.name || meta.name || meta.title) || prettyName(source);
    return {
      ...meta, ...extra,
      id: canonicalLocalId(source) || clean(extra.id || meta.id) || `game-${source.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 100)}`,
      name, title: name, url: source, rawUrl: source,
      zone: clean(extra.zone || meta.zone || 'offline'),
      category: clean(extra.category || meta.category || 'HTML Games'),
      description: clean(extra.description || meta.description || 'Installed HTML game.'),
      cover: clean(extra.cover || meta.cover || meta.image || ''),
      tags: Array.isArray(extra.tags || meta.tags) ? (extra.tags || meta.tags) : ['HTML', 'Offline'],
      installedAt: Number(extra.installedAt || meta.installedAt || Date.now())
    };
  }

  // One-time best-effort migration of the old IndexedDB library (data.js era).
  async function migrateIndexedDb() {
    if (idbMigrated) return;
    idbMigrated = true;
    try {
      if (!('indexedDB' in window)) return;
      const db = await new Promise((resolve, reject) => {
        const req = indexedDB.open('flashgames-library');
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
        req.onblocked = () => reject(new Error('blocked'));
      });
      if (!db.objectStoreNames.length) { db.close(); return; }
      const storeName = [...db.objectStoreNames].includes('games') ? 'games' : [...db.objectStoreNames][0];
      const rows = await new Promise((resolve) => {
        try {
          const req = db.transaction(storeName, 'readonly').objectStore(storeName).getAll();
          req.onsuccess = () => resolve(req.result || []);
          req.onerror = () => resolve([]);
        } catch { resolve([]); }
      });
      db.close();
      const cache = await cacheHandle();
      for (const g of rows) {
        const url = clean(g?.rawUrl || g?.url);
        const html = typeof g?.html === 'string' ? g.html : '';
        if (!url || !html) continue;
        if (await cache.match(url)) continue;
        const rec = toRecord(url, metaFor(url), g);
        await cache.put(url, new Response(html, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } }));
        saveMeta(rec);
      }
    } catch {}
  }

  // Download pipeline with live progress and a mirror ladder so a slow or
  // blocked direct fetch doesn't leave the player with a dead spinner:
  //   1. already-cached copy (instant / offline)
  //   2. direct fetch, streamed with a real progress bar
  //   3. jsDelivr gh mirror (for raw.githubusercontent paths)
  //   4. public CORS proxies, in order, streamed too
  function fmtBytes(n) {
    if (!Number.isFinite(n) || n <= 0) return '';
    if (n >= 1e9) return `${(n / 1e9).toFixed(2)} GB`;
    if (n >= 1e6) return `${(n / 1e6).toFixed(1)} MB`;
    if (n >= 1e3) return `${Math.round(n / 1e3)} KB`;
    return `${n} B`;
  }

  function mirrorUrls(source) {
    const ladder = [];
    const gh = /^https?:\/\/raw\.githubusercontent\.com\/([^?#]+)/i.exec(source);
    if (gh) {
      try {
        const path = decodeURIComponent(gh[1]);
        const jsdh = `https://cdn.jsdelivr.net/gh/${path}`;
        if (jsdh !== source) ladder.push(jsdh);
      } catch {}
    }
    ladder.push(`https://api.codetabs.com/v1/proxy/?quest=${encodeURIComponent(source)}`);
    ladder.push(`https://api.allorigins.win/raw?url=${encodeURIComponent(source)}`);
    return ladder;
  }

  function validateGameHtml(text) {
    if (!text) throw new Error('The download was empty.');
    if (text.length < 40) throw new Error('The download was too small to be a game page.');
    if (!/</.test(text) || !/<!doctype html|<html|<script|<body|<iframe/i.test(text.slice(0, 1200))) {
      throw new Error('The server did not return a game page (not HTML).');
    }
    return text;
  }

  async function drainResponse(res, onProgress, atLeastOnce) {
    const reader = res?.body && typeof res.body.getReader === 'function' ? res.body.getReader() : null;
    const totalRaw = Number(res?.headers?.get?.('content-length') || 0);
    const total = totalRaw > 0 && Number.isFinite(totalRaw) ? totalRaw : 0;
    if (!reader) {
      const text = typeof res?.text === 'function' ? await res.text() : '';
      if (!atLeastOnce) onProgress({ loaded: total || 0, total, pct: total ? 100 : null });
      return text;
    }
    const decoder = new TextDecoder();
    let loaded = 0;
    let lastPaint = 0;
    let text = '';
    for (;;) {
      let step;
      try { step = await reader.read(); }
      catch (e) { throw new Error('Connection dropped while downloading.'); }
      if (step.done) break;
      const chunk = step.value instanceof Uint8Array ? step.value : null;
      if (chunk) {
        loaded += chunk.length;
        text += decoder.decode(chunk, { stream: true });
      } else if (typeof step.value === 'string') {
        loaded += step.value.length;
        text += step.value;
      }
      const now = Date.now();
      if (now - lastPaint > 80) {
        lastPaint = now;
        onProgress({ loaded, total, pct: total ? Math.min(99, Math.round((loaded / total) * 100)) : null });
      }
    }
    text += decoder.decode();
    onProgress({ loaded: loaded || text.length, total: total || loaded, pct: 99 });
    return text;
  }

  async function attemptUrl(url, onProgress) {
    // Cap how long a dead host can stall the ladder.
    const ctl = new AbortController();
    const abort = setTimeout(() => ctl.abort(), 30000);
    try {
      const res = await fetch(url, { cache: 'no-store', redirect: 'follow', signal: ctl.signal });
      if (!res.ok) throw new Error(`Download failed (${res.status}).`);
      const totalRaw = Number(res?.headers?.get?.('content-length') || 0);
      if (totalRaw > 0) onProgress({ loaded: 0, total: totalRaw, pct: 0, mirror: url });
      return validateGameHtml(await drainResponse(res, onProgress, true));
    } finally { clearTimeout(abort); }
  }

  async function downloadHtml(url, opts = {}) {
    const on = (typeof opts === 'function' ? opts : (opts && opts.onProgress) || (() => {}));
    const source = clean(url);
    if (!source) throw new Error('This game has no source URL.');
    // Fast path: already installed → climb straight out of the cache.
    try {
      const cache = await cacheHandle();
      const hit = await cache.match(source).catch(() => null);
      if (hit) {
        on({ loaded: 1, total: 1, pct: 100, cached: true });
        return validateGameHtml(await hit.text());
      }
    } catch { /* cache unavailable, keep downloading */ }
    // Mirror ladder: CDN (GitHub files) → direct → relay engine → proxies.
    // The engine step boots the WASM relay on demand — a freshly opened
    // page has it cold, and direct fetches die on CORS-walled hosts.
    const fetchPlain = async (u) => {
      on({ loaded: 0, total: 0, pct: null, mirror: u !== source });
      return attemptUrl(u, on);
    };
    const engineStep = async () => {
      if (!window.FlashBridge?.ensure || !window.FlashBridge?.fetchText) throw new Error('Relay engine unavailable.');
      if (!window.FlashBridge?.status?.().engine) {
        try { await Promise.race([window.FlashBridge.ensure(), new Promise((_, rej) => setTimeout(() => rej(new Error('Engine boot timed out.')), 6000))]); } catch {}
      }
      on({ loaded: 0, total: 0, pct: null, mirror: true });
      return validateGameHtml(await window.FlashBridge.fetchText(source, 12000));
    };
    const ghRaw = /^https?:\/\/raw\.githubusercontent\.com\//i.test(source);
    const mirrors = mirrorUrls(source);
    const cdnMirrors = ghRaw ? mirrors.filter((m) => /cdn\.jsdelivr\.net/i.test(m)) : [];
    const steps = [];
    const pushUrl = (u, viaEngine = false) => { if (u && !steps.some((x) => x.url === u && x.viaEngine === viaEngine)) steps.push({ url: u, viaEngine }); };
    // CDN copy first when the canonical file is on GitHub raw — it is
    // closer to the player, always CORS-ready, and rarely rate-limited.
    for (const u of cdnMirrors) pushUrl(u);
    pushUrl(source);
    for (const m of mirrors) if (!cdnMirrors.includes(m)) pushUrl(m);
    let ladder = steps.map((step) => () => fetchPlain(step.url));
    // Engine after direct, before the public proxies.
    const directCount = ladder.length;
    ladder.splice(Math.min(2, directCount), 0, engineStep);
    const errors = [];
    for (const step of ladder) {
      try {
        const text = await step();
        return text;
      } catch (e) {
        errors.push((e && e.message) || String(e));
      }
    }
    throw new Error(`Download failed after ${ladder.length} attempts — ${errors.pop() || 'all mirrors blocked'}.`);
  }

  async function putRecord(game, html) {
    const url = clean(game?.rawUrl || game?.url);
    if (!url || !html) throw new Error('This game has no downloadable content.');
    const cache = await cacheHandle();
    await cache.put(url, new Response(html, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } }));
    const rec = toRecord(url, metaFor(url), { ...game, html: undefined, cached: true });
    saveMeta(rec);
    return { ...rec, html };
  }

  async function readByUrl(url) {
    const source = clean(url);
    if (!source) return null;
    await migrateIndexedDb().catch(() => {});
    const cache = await cacheHandle();
    const res = await cache.match(source);
    if (!res) return null;
    const html = await res.text();
    return { ...toRecord(source, metaFor(source)), html, cached: true };
  }

  // One-time repair: records cached under retired ids (flash-*, game-N-*)
  // are re-keyed to canonical file ids; favourites + metadata follow.
  function migrateStaleIds() {
    const remap = new Map();
    try {
      const list = metaList();
      for (const m of list) {
        if (!m || typeof m !== 'object') continue;
        const u = clean(m.url || m.rawUrl);
        const canon = canonicalLocalId(u);
        if (canon && m.id && m.id !== canon) {
          remap.set(String(m.id), canon);
          m.id = canon;
        }
      }
      if (remap.size) localStorage.setItem(META_KEY, JSON.stringify(list));
    } catch {}
    if (remap.size) {
      const next = new Set();
      let changed = false;
      for (const id of readFavs()) {
        if (remap.has(id)) { next.add(remap.get(id)); changed = true; }
        else next.add(id);
      }
      if (changed) writeFavs(next);
      try {
        const recent = JSON.parse(localStorage.getItem('flashgames.recent') || '[]');
        if (Array.isArray(recent)) {
          const mapped = [...new Set(recent.map((id) => remap.get(String(id)) || id))];
          if (mapped.join('|') !== recent.join('|')) localStorage.setItem('flashgames.recent', JSON.stringify(mapped));
        }
      } catch {}
    }
  }

  async function getAllCachedGames() {
    await migrateIndexedDb().catch(() => {});
    migrateStaleIds();
    const cache = await cacheHandle();
    const keys = await cache.keys();
    return keys.map((req) => toRecord(req.url, metaFor(req.url))).filter((g) => g.rawUrl);
  }

  async function getCachedGame(id) {
    const key = clean(id);
    if (!key) return null;
    const direct = await readByUrl(key).catch(() => null);
    if (direct) return direct;
    const all = await getAllCachedGames().catch(() => []);
    const match = all.find((g) => g.id === key || g.rawUrl === key || g.url === key);
    return match ? readByUrl(match.rawUrl || match.url).catch(() => null) : null;
  }

  async function installGame(game, opts) {
    const url = clean(game?.rawUrl || game?.url);
    if (!url) throw new Error('This game has no source URL.');
    return putRecord(game, await downloadHtml(url, opts));
  }

  async function installCustom(payload, opts) {
    let { url, name, description, cover } = payload || {};
    const source = clean(url);
    if (!/^https?:\/\//i.test(source)) throw new Error('Enter a valid http(s) game URL.');
    const html = await downloadHtml(source, opts);
    if (!/<html[\s>]/i.test(html) && !/<body[\s>]/i.test(html)) throw new Error('The URL did not return an HTML game.');
    const parsed = clean(name) || prettyName(source.split('/').pop() || 'Custom Game');
    return putRecord(
      { id: `custom-${Date.now().toString(36)}`, name: parsed, rawUrl: source, description: clean(description) || 'Custom HTML game.', cover: clean(cover), zone: 'CUSTOM', category: 'Custom', source: 'Custom URL', custom: true },
      html
    );
  }

  async function launchGame(game, opts) {
    const source = clean(game?.rawUrl || game?.url || game?.id);
    if (!source) throw new Error('This game has no source URL.');
    let cached = (game?.id && await getCachedGame(game.id).catch(() => null))
      || (await getCachedGame(source).catch(() => null));
    if (!cached?.html) {
      const html = await downloadHtml(source, opts);
      cached = await putRecord({ ...(game || {}), rawUrl: source, url: source }, html);
    }
    return URL.createObjectURL(new Blob([cached.html], { type: 'text/html' }));
  }

  window.FlashGamesStore = {
    getAllCachedGames, getCachedGame,
    install: installGame, installCustom,
    launch: launchGame,
    deleteCachedGame: async (id) => {
      const g = await getCachedGame(id);
      if (!g) return;
      (await cacheHandle()).delete(g.rawUrl || g.url).catch(() => {});
    },
    clearGameCache: async () => { await caches.delete(CACHE_NAME).catch(() => {}); cachePromise = null; },
    getFavourites: () => readFavs(),
    setFavourite: (id, on) => { const s = readFavs(); if (on) s.add(String(id)); else s.delete(String(id)); writeFavs(s); },
    setFavourites: (items) => writeFavs(new Set((Array.isArray(items) ? items : [...items]).map(String))),
    addFavourite: (id) => writeFavs(readFavs().add(String(id))),
    removeFavourite: (id) => { const s = readFavs(); s.delete(String(id)); writeFavs(s); },
    toggleFavourite: (id) => { const s = readFavs(), k = String(id); if (s.has(k)) s.delete(k); else s.add(k); writeFavs(s); },
    cacheName: CACHE_NAME, sourceRoot: SOURCE_ROOT
  };

  /* ---------- online-game cache helpers ---------- */

  const URL_KEYS = ['game_url', 'gameUrl', 'play_url', 'playUrl', 'iframe_url', 'iframeUrl', 'launch_url', 'launchUrl', 'url', 'href', 'link'];
  const BAD_URL_KEYS = /image|thumb|thumbnail|cover|icon|logo|avatar|screenshot|preview/i;

  function findGameUrl(game) {
    if (!game || typeof game !== 'object') return '';
    for (const key of URL_KEYS) {
      if (BAD_URL_KEYS.test(key)) continue;
      const v = clean(game[key]);
      if (/^https?:\/\//i.test(v)) return v;
    }
    for (const key of ['game', 'data', 'launch', 'embed']) {
      const nested = game[key];
      if (nested && typeof nested === 'object') {
        const v = findGameUrl(nested);
        if (v) return v;
      }
    }
    return '';
  }

  const pendingOnline = new Set();

  async function cacheOneOnline(game) {
    const url = findGameUrl(game?.__raw || game);
    if (!url || pendingOnline.has(url)) return false;
    pendingOnline.add(url);
    try {
      await installGame({
        id: `online-${clean(game?.luminId || game?.id).toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 100)}`,
        name: clean(game?.name) || 'Online Game', rawUrl: url, zone: 'LUMIN',
        category: clean(game?.category) || 'Online',
        description: clean(game?.description) || 'Online game cached by Flash Games.',
        cover: clean(game?.cover), source: 'Lumin'
      });
      return true;
    } catch { return false; }
    finally { pendingOnline.delete(url); }
  }

  window.FlashOnlineCache = Object.freeze({
    findGameUrl,
    cacheOne: cacheOneOnline,
    async cacheGames(games) {
      if (!navigator.onLine || !Array.isArray(games)) return;
      const queue = games.filter((g) => findGameUrl(g?.__raw || g));
      let cursor = 0;
      const worker = async () => { while (cursor < queue.length) await cacheOneOnline(queue[cursor++]); };
      await Promise.all([worker(), worker(), worker()]).catch(() => {});
    }
  });

  /* ---------- static fetch engine (vendored, no CDN) ----------
   * Wired against vendor/libcurl/libcurl.mjs v0.7.4: it exports
   * `libcurl` with load_wasm(), set_websocket(), fetch() and HTTPSession,
   * loading through its bundled client:
   *   import { libcurl } from './vendor/libcurl/libcurl.mjs';
   *   await libcurl.load_wasm('./vendor/libcurl/libcurl.wasm');
   *   libcurl.set_websocket(linkUrl);
   *   await libcurl.fetch(url, { headers });
   * Endpoints rotate on failure; anything fatal falls back to direct. */

  const ENGINE_JS = './vendor/libcurl/libcurl.mjs';
  const ENGINE_WASM = './vendor/libcurl/libcurl.wasm';
  const LINK_KEY = 'flashgames.link.v1';
  const LINK_DEFAULTS = ['wss://wisp.mercurywork.shop/', 'wss://wisp.terbiumon.top/wisp/', 'wss://nebulabridge.io/wisp/', 'wss://definitelyscience.com/wisp/', 'wss://invisibridge.com/wisp/'];
  const bridge = { engine: null, engineError: '', endpointUrl: '', lastFinalUrl: '', region: '', status: 'idle', engineAttempt: null };

  function linkEndpoints() {
    let list;
    try {
      const custom = JSON.parse(localStorage.getItem(LINK_KEY) || 'null');
      if (Array.isArray(custom) && custom.length) list = custom.filter(Boolean).map(String);
    } catch {}
    if (!list || !list.length) list = LINK_DEFAULTS.slice();
    try {
      const last = localStorage.getItem(LINK_KEY + '.last');
      if (last && list.includes(last)) return [last, ...list.filter((u) => u !== last)];
    } catch {}
    return list;
  }

  // nowgg.fun geo-matches IPs by redirecting to a regional host like
  // 24.ip.nowgg.fun. Whatever hop reveals it wins: remembered for next time.
  function noteRegion(url) {
    try {
      const m = /^https?:\/\/([a-z0-9-]+)\.ip\.nowgg\.fun/i.exec(String(url));
      if (m) {
        bridge.region = m[1];
        try { localStorage.setItem(LINK_KEY + '.region', m[1]); } catch {}
      }
    } catch {}
  }

  function regionalUrl(url) {
    if (!bridge.region) {
      try { bridge.region = localStorage.getItem(LINK_KEY + '.region') || ''; } catch {}
    }
    try {
      const u = new URL(url);
      if (u.hostname.toLowerCase() === 'nowgg.fun' && bridge.region) {
        u.hostname = `${bridge.region}.ip.nowgg.fun`;
        return u.toString();
      }
    } catch {}
    return url;
  }

  async function loadEngine() {
    if (bridge.engine) return bridge.engine;
    if (bridge.engineAttempt) return bridge.engineAttempt;
    bridge.engineAttempt = (async () => {
      const mod = await import(ENGINE_JS);
      const libcurl = mod.libcurl || mod.default || mod;
      if (!libcurl || typeof libcurl.load_wasm !== 'function') throw new Error('Engine export missing.');
      await Promise.race([
        libcurl.load_wasm(ENGINE_WASM),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Engine timed out.')), 12000))
      ]);
      bridge.engine = libcurl;
      bridge.engineError = '';
      return libcurl;
    })();
    try { return await bridge.engineAttempt; }
    finally { bridge.engineAttempt = null; }
  }

  async function bodyToText(res, idleMs = 0) {
    if (!res) throw new Error('Empty response.');
    if (typeof res.text === 'function') return await res.text();
    if (res.body && typeof res.body.getReader === 'function') {
      const chunks = [];
      const reader = res.body.getReader();
      const readIdle = (ms) => new Promise((_, reject) => setTimeout(() => reject(new Error('Stalled while downloading.')), ms));
      let step = null;
      for (;;) {
        try { step = idleMs > 0 ? await Promise.race([reader.read(), readIdle(idleMs)]) : await reader.read(); }
        catch (e) { try { reader.cancel(); } catch {} throw e; }
        if (step.done) break;
        if (step.value) chunks.push(step.value);
      }
      const total = chunks.reduce((a, c) => a + c.length, 0);
      const buf = new Uint8Array(total);
      let offset = 0;
      for (const c of chunks) { buf.set(c, offset); offset += c.length; }
      return new TextDecoder().decode(buf);
    }
    if (typeof res.arrayBuffer === 'function') return new TextDecoder().decode(await res.arrayBuffer());
    if (res.data instanceof Uint8Array) return new TextDecoder().decode(res.data);
    if (typeof res.data === 'string') return res.data;
    if (typeof res === 'string') return res;
    throw new Error('Unreadable response.');
  }

  const FETCH_HEADERS = {
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Upgrade-Insecure-Requests': '1',
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
  };

  function hostOf(u) { try { return new URL(String(u)).hostname.toLowerCase(); } catch { return ''; } }

  // Pages in broken geo states navigate to mangled hosts (e.g. a region
  // prefix glued onto "srcdoc"). Never fetch those, never frame those.
  function isGarbageHost(host) {
    return /(^|\.)srcdoc(\.|$|:)/i.test(String(host || ''));
  }

  function responseLocation(res, base) {
    try {
      const headers = (res && res.headers) || {};
      const loc = typeof headers.get === 'function' ? headers.get('location') : (headers.location || headers.Location);
      if (!loc) return '';
      const abs = new URL(loc, base).toString();
      if (isGarbageHost(hostOf(abs))) return '';
      return abs;
    } catch { return ''; }
  }

  // Every cloud document goes through the static engine,
  // following redirects until it loads.
  // The engine egress IP is a datacenter: geo-matching breaks on it.
  // Learn the device IP once (best-effort, direct) and forward it so
  // relayed requests resolve to the USER's geography instead.
  async function learnClientIp() {
    if (bridge.clientIp) return bridge.clientIp;
    if (typeof fetch !== 'function') return '';
    try {
      const res = await Promise.race([
        fetch('https://api64.ipify.org?format=json', { cache: 'no-store' }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('ip timeout')), 3500))
      ]);
      const data = await res.json();
      const ip = String((data && (data.ip || data.address)) || '').trim();
      if (/^[0-9a-fA-F:.]{3,45}$/.test(ip)) bridge.clientIp = ip;
    } catch {}
    return bridge.clientIp || '';
  }

  function fetchHeaders(extra) {
    const headers = { ...(extra || {}) };
    if (bridge.clientIp) {
      headers['X-Forwarded-For'] = bridge.clientIp;
      headers['X-Real-IP'] = bridge.clientIp;
      headers['Forwarded'] = `for=${bridge.clientIp}`;
    }
    return headers;
  }

  async function engineFetchText(url, timeoutMs = 8000) {
    const engine = await loadEngine();
    if (typeof engine.fetch !== 'function') throw new Error('Engine fetch unavailable.');
    let lastErr = new Error('No connection available.');
    noteRegion(url);
    for (const endpoint of linkEndpoints()) {
      try {
        if (typeof engine.set_websocket === 'function') engine.set_websocket(endpoint);
      } catch (e) { lastErr = e instanceof Error ? e : new Error(String(e)); continue; }
      {
        let current = url;
        for (let hop = 0; hop < 4; hop++) {
          try {
            const res = await Promise.race([
              engine.fetch(current, { headers: fetchHeaders(FETCH_HEADERS) }),
              new Promise((_, reject) => setTimeout(() => reject(new Error('Request timed out.')), timeoutMs))
            ]);
            // timeoutMs caps the HEADERS only — a slow-but-moving body is
            // fine; only a stalled body gets cut (20s of silence).
            const status = Number(res && res.status);
            if ([301, 302, 303, 307, 308].includes(status)) {
              const next = responseLocation(res, current);
              noteRegion(next);
              if (!next) throw new Error(`Request failed (${status}).`);
              current = next;
              continue;
            }
            if (!Number.isFinite(status) || status < 200 || status >= 400) throw new Error(`Request failed (${Number.isFinite(status) ? status : 'unknown'}).`);
            const text = await bodyToText(res, 20000);
            if (!text) throw new Error('Empty page.');
            bridge.endpointUrl = endpoint;
            bridge.status = 'live';
            noteRegion(current);
            bridge.lastFinalUrl = current;
            try { localStorage.setItem(LINK_KEY + '.last', endpoint); } catch {}
            return text;
          } catch (e) {
            lastErr = e instanceof Error ? e : new Error(String(e));
            break;
          }
        }
      }
    }
    bridge.status = 'direct';
    throw lastErr;
  }
  // Cloud titles open in the sandboxed player frame. Region + reachability
  // probes stay parallel and capped so the frame appears in ~1-3s.
  function clearBlobs() {
    try {
      for (const u of bridge.blobs || []) { try { URL.revokeObjectURL(u); } catch {} }
    } catch {}
    bridge.blobs = [];
  }

  // Region the way their launcher does: STUN srflx candidate → public IP
  // → first octet. Native page, real WebRTC: this is exactly what top-level
  // nowgg.fun runs, so we get the same answer it would.
  async function detectOctet(timeoutMs = 2500) {
    try {
      if (typeof RTCPeerConnection !== 'function') return '';
      const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
      const octet = await new Promise((resolve) => {
        let done = false;
        const finish = (value) => {
          if (done) return;
          done = true;
          try { pc.close(); } catch {}
          resolve(value || '');
        };
        try {
          pc.onicecandidate = (ev) => {
            try {
              const cand = ev && ev.candidate && ev.candidate.candidate;
              if (!cand) return;
              if (!/typ (srflx|relay)/.test(cand)) return;
              const parts = cand.split(' ');
              const ip = parts[4] || '';
              if (!ip || ip.includes(':')) return;
              const first = ip.split('.')[0];
              if (/^\d{1,3}$/.test(first)) finish(first);
            } catch {}
          };
          pc.createDataChannel('x');
          pc.createOffer()
            .then((offer) => pc.setLocalDescription(offer))
            .catch(() => finish(''));
        } catch { finish(''); }
        setTimeout(() => finish(''), timeoutMs);
      });
      return octet;
    } catch { return ''; }
  }

  function toRegional(base, octet) {
    try {
      const u = new URL(base);
      if (u.hostname.toLowerCase() === 'nowgg.fun' && octet) {
        u.hostname = `${octet}.ip.nowgg.fun`;
        return u.toString();
      }
    } catch {}
    return base;
  }

  function deviceReachable(url, timeoutMs = 8000) {
    if (typeof fetch !== 'function') return Promise.resolve(true);
    return Promise.race([
      fetch(url, { mode: 'no-cors', cache: 'no-store', credentials: 'omit', redirect: 'follow' }).then(() => true),
      new Promise((resolve) => setTimeout(() => resolve(false), timeoutMs))
    ]).catch(() => false);
  }

  function disarmHandoff() { /* retired: the frame is never handed off; the launcher runs sandboxed, in-frame */ }

  async function openCloud(url, name) {
    const base = clean(url);
    if (!base) throw new Error('This cloud game has no URL.');
    if (!/^https?:\/\//i.test(base)) throw new Error('Only http(s) cloud URLs are supported.');
    const apex = base;
    disarmHandoff();
    // Everything warm-up runs in PARALLEL and never blocks framing: the IP
    // lookup and one relayed request teach the engine our region, and the
    // STUN octet picks the regional door. Recompute 'predicted' as soon as
    // the octet answers — typically well under a second.
    let predicted = regionalUrl(base);
    const octetTask = detectOctet().catch(() => null).then((octet) => {
      try { if (octet) predicted = toRegional(base, octet); } catch {}
      return octet;
    });
    // Warm the relay engine in the background (no blocking, no verify round).
    try { engineFetchText(regionalUrl(base)).catch(() => {}); } catch {}
    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const regionTask = octetTask.then(() =>
      Promise.race([deviceReachable(predicted, 6000), wait(6000).then(() => false)])
    );
    try { await learnClientIp().catch(() => {}); } catch {}
    const apexOk = await Promise.race([deviceReachable(apex, 6000), wait(6000).then(() => false)]);
    const regionOk = await regionTask;
    if (!apexOk && !regionOk) {
      return 'tab-unreachable';
    }
    // Frame the launcher in the player: real location, working STUN,
    // correct regional self-navigation. If Framing fails the gameplay page
    // tells the player in-app — never a tab.
    const overlay = document.getElementById('playerOverlay');
    const frame = document.getElementById('gameFrame');
    if (!overlay || !frame) {
      return 'framing';
    }
    overlay.hidden = false;
    document.body.classList.add('player-open');
    try { window.lucide?.createIcons?.({ root: overlay, attrs: { 'stroke-width': 1.5 } }); } catch {}
    try {
      frame.removeAttribute('sandbox');
      frame.removeAttribute('srcdoc');
      frame.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms allow-modals');
      frame.title = name || 'Cloud game';
      frame.src = apexOk ? apex : predicted;
    } catch {
      return 'framing';
    }
    return 'framing';
  }

  window.FlashBridge = Object.freeze({
    status: () => ({ mode: bridge.status, region: bridge.region || '', endpointUrl: bridge.endpointUrl, engine: !!bridge.engine, engineError: bridge.engineError }),
    endpoints: linkEndpoints,
    setEndpoints(list) {
      try { localStorage.setItem(LINK_KEY, JSON.stringify(list)); } catch {}
      try { localStorage.removeItem(LINK_KEY + '.last'); } catch {}
      bridge.endpointUrl = '';
      if (bridge.status === 'live') bridge.status = 'idle';
    },
    region: () => bridge.region || '',
    setRegion(value) {
      const v = String(value || '').trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
      bridge.region = v;
      try {
        if (v) localStorage.setItem(LINK_KEY + '.region', v);
        else localStorage.removeItem(LINK_KEY + '.region');
      } catch {}
      return v;
    },
    ensure: () => loadEngine().then(() => window.FlashBridge.status(), () => window.FlashBridge.status()),
    prewarm() {
      // Warm the WASM engine early (e.g. when the Cloud view opens) so the
      // first Play click doesn't pay compile + instantiate latency.
      return loadEngine().then(
        (engine) => {
          try {
            if (engine && typeof engine.set_websocket === 'function') engine.set_websocket(linkEndpoints()[0]);
          } catch {}
          return window.FlashBridge.status();
        },
        () => window.FlashBridge.status()
      );
    },
    fetchText: (url, timeoutMs = 12000) => engineFetchText(url, timeoutMs),
    lastUrl: () => bridge.lastFinalUrl || '',
    reset() { try { disarmHandoff(); } catch {} try { clearBlobs(); } catch {} },
    open: openCloud
  });

  /* ---------- game packs: curated bundles, installed locally ---------- */

  const PACK_DEFS = [
    { id: 'pack-clients', name: 'Client Classics', icon: 'gamepad-2', description: 'Eaglercraft clients and Minecraft-style builds. Everything runs offline after install.', match: ['client', 'eagler', 'astra', 'pixel', 'tuff', 'resent', 'minecraft', 'mine', 'craft', 'blox'], max: 24 },
    { id: 'pack-puzzle', name: 'Puzzle & Brain', icon: 'puzzle', description: '2048, logic, memory and number puzzlers for quiet sessions.', match: ['puzzle', '2048', 'sudoku', 'memory', 'quiz', 'trivia', 'chess', 'maze', 'tetris', 'block', 'logic', 'brain'], max: 30 },
    { id: 'pack-arcade', name: 'Arcade Classics', icon: 'ghost', description: 'Snake, Pong, Breakout, runners and endless arcade loops.', match: ['pac', 'snake', 'pong', 'breakout', 'invader', 'asteroid', 'arcade', 'retro', 'pinball', 'runner', 'dash', 'jump'], max: 30 },
    { id: 'pack-action', name: 'Action & Shooter', icon: 'zap', description: 'Zombies, stickmen, battles and fast shooters.', match: ['shooter', 'zombie', 'battle', 'fight', 'war', 'strike', 'sniper', 'gun', 'stickman', 'ninja'], max: 30 },
    { id: 'pack-racing', name: 'Racing & Sports', icon: 'flag', description: 'Cars, bikes, drifts and sports minigames.', match: ['rac', 'car', 'moto', 'bike', 'soccer', 'football', 'basket', 'sport', 'drift', 'parking', 'drive'], max: 30 },
    { id: 'pack-starter', name: 'Starter Vault', icon: 'package', description: 'The offline essentials: every bundled Flash game, ready without internet.', local: true, max: 30 },
    { id: 'pack-offline-all', name: 'Every Offline Game', icon: 'package-open', description: 'The complete offline vault: bundled exclusives plus the whole catalogued pack, cached locally in one go.', offlineAll: true, max: 1200 },
    { id: 'pack-online-all', name: 'Every Online Game', icon: 'globe', description: 'Every instantly-playable online title, downloaded and stored for offline play.', onlineAll: true, max: 1200 },
    { id: 'pack-everything', name: 'The Whole Vault', icon: 'archive', description: 'Every single game Flash Games can cache — offline pack, exclusives, clients and online titles straight from Lumin.', everything: true, max: 2400, recommended: true }
  ];

  function isLuminPlayable(g) {
    if (!g) return false;
    if (g.zone !== 'LUMIN' && !(g.__raw || g.luminId)) return false;
    return !!(findGameUrl(g?.__raw || g) || clean(g.rawUrl) || clean(g.url));
  }

  function resolvePack(packId, games) {
    const def = PACK_DEFS.find((p) => p.id === packId);
    if (!def || !Array.isArray(games)) return [];
    const offlinePool = games.filter((g) => g && g.zone !== 'LUMIN' && (g.rawUrl || g.url));
    const onlinePool = games.filter(isLuminPlayable);
    let picked;
    if (def.onlineAll) {
      picked = resolvePack('pack-everything', onlinePool);
    } else if (def.everything) {
      picked = resolvePack('pack-offline-all', offlinePool).concat(onlinePool);
    } else if (def.offlineAll) {
      picked = offlinePool.filter((g) => g.zone === 'OFFLINE PACK' || g.source === 'Flash Exclusive' || g.zone === 'FLASH EXCLUSIVE');
    } else if (def.local) {
      picked = offlinePool.filter((g) => /^\.\//.test(clean(g.rawUrl || g.url)));
    } else {
      const keys = def.match.map((k) => k.toLowerCase());
      picked = offlinePool.filter((g) => {
        const hay = `${g.name} ${g.category} ${(g.tags || []).join(' ')}`.toLowerCase();
        return keys.some((k) => hay.includes(k));
      });
    }
    const seen = new Set(), out = [];
    for (const g of [...picked, ...offlinePool]) {
      const key = g.rawUrl || g.url || g.id;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(g);
      if (out.length >= def.max) break;
    }
    if (def.onlineAll || def.everything) {
      const seenIds = new Set(out.map((g) => String(g.id)));
      for (const g of onlinePool) {
        const key = findGameUrl(g?.__raw || g) || g.rawUrl || g.url || g.id;
        if (seenIds.has(String(g.id))) continue;
        seenIds.add(String(g.id));
        out.push(g);
        if (out.length >= def.max) break;
      }
    }
    return out;
  }

  async function installPack(packId, games, onProgress) {
    const list = resolvePack(packId, games);
    if (!list.length) throw new Error('This pack has no installable games right now.');
    // Installed copies are reused, not re-downloaded: cache first, then the
    // direct game source, and each failure just moves on.
    const cache = await cacheHandle().catch(() => null);
    const alreadyHave = async (game) => {
      const urls = [...new Set([clean(game.rawUrl), clean(game.url)].filter(Boolean))];
      try {
        const cache = await cacheHandle();
        for (const u of urls) { if (await cache.match(u).catch(() => null)) return true; }
      } catch {}
      if (game.id && (await getCachedGame(game.id).catch(() => null))?.html) return true;
      return urls.some((u) => metaList().some((m) => clean(m?.url || m?.rawUrl) === u));
    };
    let done = 0, failed = 0;
    const queue = list.slice();
    const worker = async () => {
      while (queue.length) {
        const game = queue.shift();
        try {
          if (await alreadyHave(game)) { /* cached copy reused */ }
          else {
            const source = (game.zone === 'LUMIN' || game.luminId) ? findGameUrl(game.__raw || game) : clean(game.rawUrl || game.url);
            if (source) await installGame({ ...game, rawUrl: source, url: source });
            else throw new Error('No playable source.');
          }
        } catch { failed += 1; }
        done += 1;
        try { onProgress && onProgress(done, list.length); } catch {}
      }
    };
    await Promise.all([worker(), worker(), worker(), worker(), worker(), worker()]);
    return { total: list.length, installed: done - failed, failed };
  }

  window.FlashPacks = Object.freeze({
    defs: PACK_DEFS.map((p) => ({ ...p })),
    resolve: resolvePack,
    install: installPack
  });

  /* ---------- eaglercraft launcher manifest ----------
   * Clients live in ./eagler/ (files/ + imgs/ + clients.json). Entries with
   * a plain "file"/"image" path resolve relative to ./eagler/; explicit
   * "./…" paths (used by the bundled defaults) resolve from the app root. */

  const EAGLER_MANIFEST_URL = './eagler/clients.json';
  const EAGLER_CACHE_KEY = 'flashgames.eagler.v1';
  const EAGLER_BUNDLED = [
    { id: 'pixelclient-112', name: 'PixelClient 1.12.2', version: '1.12.2', file: './offline/PixelClient 1.12.2 WASM.html', image: './offline/pixelclient.svg', description: 'PixelClient: an Eaglercraft client with 20+ built-in mods.', tags: ['WASM', '1.12.2', 'Mods'], featured: true },
    { id: 'pixelclient-18', name: 'PixelClient 1.8.8', version: '1.8.8', file: './offline/PixelClient 1.8.8 WASM.html', image: './offline/pixelclient.svg', description: 'PixelClient with 1.8 PVP and 20+ built-in mods.', tags: ['WASM', '1.8.8', 'PVP'] },
    { id: 'astra-112', name: 'AstraClient 1.12', version: '1.12', file: './offline/astra112.html', image: './offline/astraclient.jpeg', description: 'One of the best clients.', tags: ['1.12'] },
    { id: 'astra-18', name: 'AstraClient 1.8', version: '1.8', file: './offline/astra18.html', image: './offline/astraclient.jpeg', description: 'The 1.8 build of AstraClient — fast on low-end devices.', tags: ['1.8', 'PVP'] },
    { id: 'resent-5', name: 'Resent Client 5.0', version: '5.0', file: './offline/eaglercraft.dev_Resent_Client_5.0_WASM.html', image: './offline/resentclient.png', description: 'Resent Client 5.0 — a module-based Eaglercraft client.', tags: ['WASM', 'Modules'] },
    { id: 'shadownet', name: 'ShadowNet Client', version: '', file: './offline/eaglercraft.dev_ShadowNetClient_WASM.html', image: '', description: 'ShadowNet Eaglercraft client.', tags: ['WASM'] },
    { id: 'tuffclient', name: 'Tuff Client', version: '', file: './offline/eaglercraft.dev_Tuff_Client_WASM.html', image: './offline/tuffclient.png', description: 'Anyone remember this?', tags: ['Classic'] }
  ];

  function resolveEaglerPath(value) {
    const v = clean(value);
    if (!v) return '';
    if (/^[a-z][a-z0-9+.-]*:/i.test(v)) return v;      // absolute http(s)/data/etc
    if (v.startsWith('./') || v.startsWith('/') || v.startsWith('../')) return v; // explicit from app root
    return `./eagler/${v.replace(/^\/+/, '')}`;       // relative to ./eagler/
  }

  function normalizeEaglerClient(entry, index = 0) {
    if (!entry || typeof entry !== 'object') return null;
    const name = clean(entry.name || entry.title);
    const file = clean(entry.file || entry.url || entry.path || entry.href);
    if (!name || !file) return null;
    const url = resolveEaglerPath(file);
    if (!url) return null;
    const slug = clean(entry.id)
      || `${name}${entry.version ? `-${clean(entry.version)}` : ''}`
      || `client-${index + 1}`;
    return {
      id: `eagler-${slug.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')}`,
      name, title: name,
      url, rawUrl: url,
      version: clean(entry.version),
      zone: entry.zone || 'EAGLECRAFT',
      category: 'Eaglercraft',
      description: clean(entry.description || 'Eaglercraft client.'),
      image: resolveEaglerPath(entry.image || entry.cover || entry.icon || ''),
      cover: resolveEaglerPath(entry.image || entry.cover || entry.icon || ''),
      tags: Array.isArray(entry.tags) ? entry.tags.map(clean).filter(Boolean) : ['Eaglercraft'],
      featured: entry.featured === true,
      source: 'Eaglercraft'
    };
  }

  let eaglerPromise = null;

  function loadEaglerClients() {
    if (eaglerPromise) return eaglerPromise;
    eaglerPromise = (async () => {
      try {
        const r = await fetch(`${EAGLER_MANIFEST_URL}?v=${Date.now()}`, { cache: 'no-store', headers: { Accept: 'application/json' } });
        if (r.ok) {
          const data = await r.json();
          const parsed = (Array.isArray(data) ? data : data.clients || []).map(normalizeEaglerClient).filter(Boolean);
          if (parsed.length) {
            try { localStorage.setItem(EAGLER_CACHE_KEY, JSON.stringify({ clients: parsed, at: Date.now() })); } catch {}
            return parsed;
          }
        }
      } catch { /* offline below */ }
      // Offline: last cached manifest, else the bundled defaults.
      try {
        const stored = JSON.parse(localStorage.getItem(EAGLER_CACHE_KEY) || 'null');
        const cached = Array.isArray(stored?.clients) ? stored.clients : [];
        if (cached.length) return cached.map(normalizeEaglerClient).filter(Boolean);
      } catch {}
      return EAGLER_BUNDLED.map(normalizeEaglerClient).filter(Boolean);
    })();
    return eaglerPromise.then(
      (v) => { eaglerPromise = null; return v; },
      (e) => {
        eaglerPromise = null;
        return EAGLER_BUNDLED.map(normalizeEaglerClient).filter(Boolean);
      }
    );
  }

  window.FlashEagler = Object.freeze({
    load: loadEaglerClients,
    defaults: () => EAGLER_BUNDLED.map(normalizeEaglerClient).filter(Boolean),
    normalize: normalizeEaglerClient
  });
})();
