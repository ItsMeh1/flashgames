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
      { id: 'cloud-roblox', name: 'Roblox', url: 'https://nowgg.fun/apps/roblox-corporation/5349/roblox.html', cover: './offline/logo.png', description: 'Play Roblox in the cloud via nowgg.fun. No install needed.' },
      { id: 'cloud-rocket-league', name: 'Rocket League', url: 'https://nowgg.fun/apps/psyonix-studios/4656/rocket-league.html', cover: './offline/logo.png', description: 'Rocket League in the cloud via nowgg.fun.' },
      { id: 'cloud-paper-minecraft', name: 'Paper Minecraft', url: 'https://nowgg.fun/apps/griffpatch/51381/paper-minecraft.html', cover: './offline/logo.png', description: 'Minecraft-style building in the cloud via nowgg.fun.' },
      { id: 'cloud-miniblox', name: 'Miniblox', url: 'https://nowgg.fun/apps/hv-studios/51764/miniblox.html', cover: './offline/logo.png', description: 'Voxel sandbox in the cloud via nowgg.fun.' },
      { id: 'cloud-among-us', name: 'Among Us', url: 'https://nowgg.fun/apps/innersloth-llc/4047/among-us.html', cover: './offline/logo.png', description: 'Social deduction in the cloud via nowgg.fun.' },
      { id: 'cloud-pubg', name: 'PUBG Mobile', url: 'https://nowgg.fun/apps/proxima-beta/2609/pubg-mobile-resistance.html', cover: './offline/logo.png', description: 'Battle royale in the cloud via nowgg.fun.' },
      { id: 'cloud-free-fire', name: 'Free Fire', url: 'https://nowgg.fun/apps/garena-international-i/1398/free-fire.html', cover: './offline/logo.png', description: 'Fast battle royale in the cloud via nowgg.fun.' },
      { id: 'cloud-genshin', name: 'Genshin Impact', url: 'https://nowgg.fun/apps/cognosphere-pte-ltd-/1773/genshin-impact.html', cover: './offline/logo.png', description: 'Open-world RPG in the cloud via nowgg.fun.' },
      { id: 'cloud-cod', name: 'Call of Duty', url: 'https://nowgg.fun/apps/activision-publishing-inc/7935/call-of-duty.html', cover: './offline/logo.png', description: 'FPS action in the cloud via nowgg.fun.' },
      { id: 'cloud-blox-fruit', name: 'Blox Fruit', url: 'https://nowgg.fun/apps/blox-fruit/19901/blox-fruit.html', cover: './offline/logo.png', description: 'Roblox adventure in the cloud via nowgg.fun.' },
      { id: 'cloud-adopt-me', name: 'Adopt Me', url: 'https://nowgg.fun/apps/adopt-me/19912/adopt-me.html', cover: './offline/logo.png', description: 'Pets and roleplay in the cloud via nowgg.fun.' },
      { id: 'cloud-moto-x3m', name: 'Moto X3M', url: 'https://nowgg.fun/apps/madpuffers/51036/moto-x3m.html', cover: './offline/logo.png', description: 'Stunt biking in the cloud via nowgg.fun.' }
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

  /* ---------- catalogue ---------- */

  let cataloguePromise = null;

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
    try { localStorage.setItem(GAME_CACHE, JSON.stringify({ version: 8, generatedAt: Date.now(), games })); } catch {}
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

  async function fetchFullCatalogue() {
    const tree = await fetchJson(TREE_URL);
    const entries = Array.isArray(tree?.tree) ? tree.tree : [];
    const html = entries.filter((e) => e.type === 'blob' && /^offline\/.*\.html?$/i.test(e.path)).map((e) => e.path).sort();
    const images = entries.filter((e) => e.type === 'blob' && /^offline\/.*\.(png|jpe?g|webp|gif|svg)$/i.test(e.path)).map((e) => e.path);
    return html.map((path) => {
      const file = path.slice(path.lastIndexOf('/') + 1);
      const rawUrl = `${SOURCE_ROOT}${encodeURIComponent(file)}`;
      const name = prettyName(file).replace(/\bFnaf\b/gi, 'FNAF').replace(/\bLol\b/gi, 'LoL').replace(/\bAgar Io\b/gi, 'Agar.io');
      return {
        id: `offline-${file.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
        name, title: name, url: rawUrl, rawUrl, zone: 'OFFLINE PACK', category: 'HTML Games',
        description: 'Single-file HTML game from the Offline HTML Games Pack.',
        cover: chooseCover(path, images), tags: ['HTML', 'Offline'], source: 'CoolDude2349/Offline-HTML-Games-Pack'
      };
    });
  }

  async function loadLocalManifest() {
    try {
      const r = await fetch(`${OFFLINE_MANIFEST_URL}?v=${Date.now()}`, { cache: 'no-store', headers: { Accept: 'application/json' } });
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
    } catch { return []; }
  }

  function loadGames(force = false) {
    if (cataloguePromise && !force) return cataloguePromise;
    cataloguePromise = (async () => {
      const cached = readCachedCatalogue();
      const local = await loadLocalManifest();
      if (!force && cached.length >= 300) {
        const games = mergeGames(local, cached);
        if (games.length !== cached.length) writeCatalogue(games);
        return { games, source: 'cache+manifest' };
      }
      const remote = await fetchFullCatalogue().catch(() => []);
      const games = mergeGames(local, remote, cached);
      if (games.length) writeCatalogue(games);
      return { games, source: games.length ? 'catalogue' : 'empty' };
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
      return { version: clean(data.version || releases[0]?.version || '0.0.0'), releases };
    } catch { return { version: '0.0.0', releases: [] }; }
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
    clearCache() { try { localStorage.removeItem(GAME_CACHE); } catch {} }
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

  async function fetchHtml(url) {
    const tries = [url];
    try { const d = decodeURIComponent(url); if (d !== url) tries.push(d); } catch {}
    let lastErr = new Error('Download failed.');
    for (const u of tries) {
      try {
        const r = await fetch(u, { cache: 'no-store' });
        if (!r.ok) throw new Error(`Download failed (${r.status}).`);
        const text = await r.text();
        if (!text) throw new Error('The download was empty.');
        return text;
      } catch (e) { lastErr = e; }
    }
    throw lastErr;
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

  async function installGame(game) {
    const url = clean(game?.rawUrl || game?.url);
    if (!url) throw new Error('This game has no source URL.');
    return putRecord(game, await fetchHtml(url));
  }

  async function installCustom({ url, name, description, cover }) {
    const source = clean(url);
    if (!/^https?:\/\//i.test(source)) throw new Error('Enter a valid http(s) game URL.');
    const html = await fetchHtml(source);
    if (!/<html[\s>]/i.test(html) && !/<body[\s>]/i.test(html)) throw new Error('The URL did not return an HTML game.');
    const parsed = clean(name) || prettyName(source.split('/').pop() || 'Custom Game');
    return putRecord(
      { id: `custom-${Date.now().toString(36)}`, name: parsed, rawUrl: source, description: clean(description) || 'Custom HTML game.', cover: clean(cover), zone: 'CUSTOM', category: 'Custom', source: 'Custom URL', custom: true },
      html
    );
  }

  async function launchGame(game) {
    const source = clean(game?.rawUrl || game?.url || game?.id);
    if (!source) throw new Error('This game has no source URL.');
    let cached = (game?.id && await getCachedGame(game.id).catch(() => null))
      || (await getCachedGame(source).catch(() => null));
    if (!cached?.html) {
      const html = await fetchHtml(source);
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

  async function bodyToText(res) {
    if (!res) throw new Error('Empty response.');
    if (typeof res.text === 'function') return await res.text();
    if (res.body && typeof res.body.getReader === 'function') {
      const chunks = [];
      const reader = res.body.getReader();
      for (;;) {
        const step = await reader.read();
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

  function responseLocation(res, base) {
    try {
      const headers = (res && res.headers) || {};
      const loc = typeof headers.get === 'function' ? headers.get('location') : (headers.location || headers.Location);
      return loc ? new URL(loc, base).toString() : '';
    } catch { return ''; }
  }

  // Every cloud document goes through the static engine,
  // following redirects until it loads.
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
              engine.fetch(current, { headers: FETCH_HEADERS }),
              new Promise((_, reject) => setTimeout(() => reject(new Error('Request timed out.')), timeoutMs))
            ]);
            const status = Number(res && res.status);
            if ([301, 302, 303, 307, 308].includes(status)) {
              const next = responseLocation(res, current);
              noteRegion(next);
              if (!next) throw new Error(`Request failed (${status}).`);
              current = next;
              continue;
            }
            if (!Number.isFinite(status) || status < 200 || status >= 400) throw new Error(`Request failed (${Number.isFinite(status) ? status : 'unknown'}).`);
            const text = await bodyToText(res);
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
  async function openCloud(url, name) {
    const base = clean(url);
    if (!base) throw new Error('This cloud game has no URL.');
    if (!/^https?:\/\//i.test(base)) throw new Error('Only http(s) cloud URLs are supported.');
    // Go straight to the regional host when it is known.
    const target = regionalUrl(base);
    const overlay = document.getElementById('playerOverlay');
    const frame = document.getElementById('gameFrame');
    try {
      // Verify reachability through the engine; throws on refusal.
      await Promise.race([
        engineFetchText(target),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timed out.')), 22000))
      ]);
      if (!overlay || !frame) throw new Error('Player unavailable.');
      // Real navigation (never srcdoc): the browser follows nowgg.fun's
      // region-matching redirect chain natively, so no DNS dead-ends.
      frame.removeAttribute('sandbox');
      frame.removeAttribute('srcdoc');
      frame.title = name || 'Cloud game';
      overlay.hidden = false;
      document.body.classList.add('player-open');
      frame.src = bridge.lastFinalUrl || target;
      try { window.lucide?.createIcons?.({ root: overlay, attrs: { 'stroke-width': 1.5 } }); } catch {}
      return 'playing';
    } catch (error) {
      window.open(target, '_blank', 'noopener,noreferrer');
      throw error instanceof Error ? error : new Error('Cloud title could not be loaded.');
    }
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
    fetchText: (url) => engineFetchText(url),
    open: openCloud
  });

  /* ---------- game packs: curated bundles, installed locally ---------- */

  const PACK_DEFS = [
    { id: 'pack-clients', name: 'Client Classics', icon: 'gamepad-2', description: 'Eaglercraft clients and Minecraft-style builds. Everything runs offline after install.', match: ['client', 'eagler', 'astra', 'pixel', 'tuff', 'resent', 'minecraft', 'mine', 'craft', 'blox'], max: 24 },
    { id: 'pack-puzzle', name: 'Puzzle & Brain', icon: 'puzzle', description: '2048, logic, memory and number puzzlers for quiet sessions.', match: ['puzzle', '2048', 'sudoku', 'memory', 'quiz', 'trivia', 'chess', 'maze', 'tetris', 'block', 'logic', 'brain'], max: 30 },
    { id: 'pack-arcade', name: 'Arcade Classics', icon: 'ghost', description: 'Snake, Pong, Breakout, runners and endless arcade loops.', match: ['pac', 'snake', 'pong', 'breakout', 'invader', 'asteroid', 'arcade', 'retro', 'pinball', 'runner', 'dash', 'jump'], max: 30 },
    { id: 'pack-action', name: 'Action & Shooter', icon: 'zap', description: 'Zombies, stickmen, battles and fast shooters.', match: ['shooter', 'zombie', 'battle', 'fight', 'war', 'strike', 'sniper', 'gun', 'stickman', 'ninja'], max: 30 },
    { id: 'pack-racing', name: 'Racing & Sports', icon: 'flag', description: 'Cars, bikes, drifts and sports minigames.', match: ['rac', 'car', 'moto', 'bike', 'soccer', 'football', 'basket', 'sport', 'drift', 'parking', 'drive'], max: 30 },
    { id: 'pack-starter', name: 'Starter Vault', icon: 'package', description: 'The offline essentials: every bundled Flash game, ready without internet.', local: true, max: 30 }
  ];

  function resolvePack(packId, games) {
    const def = PACK_DEFS.find((p) => p.id === packId);
    if (!def || !Array.isArray(games)) return [];
    const pool = games.filter((g) => g && g.zone !== 'LUMIN' && (g.rawUrl || g.url));
    let picked;
    if (def.local) {
      picked = pool.filter((g) => /^\.\//.test(clean(g.rawUrl || g.url)));
    } else {
      const keys = def.match.map((k) => k.toLowerCase());
      picked = pool.filter((g) => {
        const hay = `${g.name} ${g.category} ${(g.tags || []).join(' ')}`.toLowerCase();
        return keys.some((k) => hay.includes(k));
      });
    }
    const seen = new Set(), out = [];
    for (const g of [...picked, ...pool]) {
      const key = g.rawUrl || g.url || g.id;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(g);
      if (out.length >= def.max) break;
    }
    return out;
  }

  async function installPack(packId, games, onProgress) {
    const list = resolvePack(packId, games);
    if (!list.length) throw new Error('This pack has no installable games right now.');
    let done = 0, failed = 0;
    const queue = list.slice();
    const worker = async () => {
      while (queue.length) {
        const game = queue.shift();
        try {
          const cached = await getCachedGame(game.id).catch(() => null) || await getCachedGame(game.rawUrl || game.url).catch(() => null);
          if (!cached?.html) await installGame(game);
        } catch { failed += 1; }
        done += 1;
        try { onProgress && onProgress(done, list.length); } catch {}
      }
    };
    await Promise.all([worker(), worker(), worker(), worker()]);
    return { total: list.length, installed: done - failed, failed };
  }

  window.FlashPacks = Object.freeze({
    defs: PACK_DEFS.map((p) => ({ ...p })),
    resolve: resolvePack,
    install: installPack
  });
})();
