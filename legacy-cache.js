(() => {
  'use strict';

  const CACHE_NAME = 'flash-games-cache';
  const METADATA_KEY = 'flash_offline_folder';
  const FAVOURITES_KEY = 'flashgames.favourites.v1';
  const GAME_CACHE = 'flashgames.catalogue.v8';
  const original = window.FlashGamesStore ? { ...window.FlashGamesStore } : {};
  let migrationPromise = null;
  let libraryPromise = null;
  let cachePromise = null;

  const clean = (value) => String(value ?? '').trim();
  const prettyName = (value) => clean(value).split('/').pop().replace(/\.html?$/i, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/\b\w/g, (c) => c.toUpperCase()) || 'HTML Game';

  function metadata() {
    try {
      const list = JSON.parse(localStorage.getItem(METADATA_KEY) || '[]');
      return Array.isArray(list) ? list : [];
    } catch { return []; }
  }

  function metaFor(url) {
    const normalized = clean(url);
    return metadata().find((item) => clean(item?.url || item?.rawUrl) === normalized) || {};
  }

  function stableId(url, meta = {}) {
    if (meta.id) return String(meta.id);
    return `legacy-${clean(url).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 110)}`;
  }

  function normalize(url, meta = {}, extra = {}) {
    const source = clean(url);
    const item = meta || {};
    const name = clean(extra.name || item.name || item.title) || prettyName(source);
    return {
      ...item,
      ...extra,
      id: clean(extra.id || item.id) || stableId(source, item),
      name,
      title: name,
      url: source,
      rawUrl: source,
      zone: clean(extra.zone || item.zone || 'offline'),
      category: clean(extra.category || item.category || 'HTML Games'),
      description: clean(extra.description || item.description || item.desc || 'Installed HTML game.'),
      cover: clean(extra.cover || item.cover || item.image || item.icon),
      icon: clean(extra.icon || item.icon),
      tags: Array.isArray(extra.tags || item.tags) ? (extra.tags || item.tags) : ['HTML', 'Offline'],
      source: clean(extra.source || item.source || 'Legacy Flash Games cache'),
      installedAt: Number(extra.installedAt || item.installedAt || 0),
      legacyCache: true,
      cached: true
    };
  }

  async function cacheHandle() {
    if (!cachePromise) {
      if (!('caches' in window)) throw new Error('Cache Storage is unavailable in this browser.');
      cachePromise = caches.open(CACHE_NAME);
    }
    return cachePromise;
  }

  async function readCacheGames() {
    if (libraryPromise) return libraryPromise;
    libraryPromise = (async () => {
      const cache = await cacheHandle();
      const requests = await cache.keys();
      return requests.map((request) => normalize(request.url, metaFor(request.url))).filter((game) => game.rawUrl);
    })();
    try { return await libraryPromise; } finally { libraryPromise = null; }
  }

  async function readGameByUrl(url) {
    const source = clean(url);
    if (!source) return null;
    const cache = await cacheHandle();
    const response = await cache.match(source);
    if (!response) return null;
    const html = await response.text();
    return normalize(source, metaFor(source), { html, size: html.length });
  }

  async function putGame(game) {
    const url = clean(game?.rawUrl || game?.url);
    const html = clean(game?.html);
    if (!url || !html) throw new Error('The game has no downloadable HTML content.');
    const cache = await cacheHandle();
    await cache.put(url, new Response(html, { status: 200, statusText: 'OK', headers: { 'Content-Type': 'text/html; charset=utf-8', 'X-Flash-Games-Installed': '1' } }));
    libraryPromise = null;
    return normalize(url, metaFor(url), { ...game, html, installedAt: Date.now(), cached: true });
  }

  async function migrateOldV2() {
    if (migrationPromise) return migrationPromise;
    migrationPromise = (async () => {
      if (!original.getAllCachedGames) return;
      try {
        const oldGames = await original.getAllCachedGames();
        for (const game of oldGames || []) if (game?.html && (game.rawUrl || game.url)) await putGame(game);
      } catch {}
    })();
    return migrationPromise;
  }

  async function getAllCachedGames() {
    const current = await readCacheGames();
    if (current.length) return current;
    await migrateOldV2();
    return readCacheGames();
  }

  async function getCachedGame(identifier) {
    const key = clean(identifier);
    if (!key) return null;
    const direct = await readGameByUrl(key);
    if (direct) return direct;
    const games = await getAllCachedGames();
    const match = games.find((item) => item.id === key || item.rawUrl === key || item.url === key);
    return match ? readGameByUrl(match.rawUrl || match.url) : null;
  }

  async function installGame(game) {
    const url = clean(game?.rawUrl || game?.url);
    if (!url) throw new Error('This game has no source URL.');
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Game download failed (${response.status}).`);
    return putGame({ ...game, html: await response.text(), installedAt: Date.now() });
  }

  async function installCustomGame({ url, name, description, cover }) {
    const source = clean(url);
    if (!/^https?:\/\//i.test(source)) throw new Error('Enter a valid http(s) game URL.');
    const response = await fetch(source, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Game download failed (${response.status}).`);
    const html = await response.text();
    if (!/<html[\s>]/i.test(html) && !/<body[\s>]/i.test(html)) throw new Error('The URL did not return an HTML game.');
    return putGame({ id: `custom-${btoa(unescape(encodeURIComponent(source))).replace(/[^a-z0-9]/gi, '').slice(0, 48)}`, name: clean(name) || prettyName(source), description: clean(description) || 'Custom HTML game.', cover: clean(cover), url: source, rawUrl: source, zone: 'CUSTOM', category: 'Custom', source: 'Custom URL', custom: true, html, installedAt: Date.now() });
  }

  async function launchGame(game) {
    const source = clean(game?.rawUrl || game?.url || game?.id);
    if (!source) throw new Error('This game has no source URL.');
    let cached = await getCachedGame(game?.id || source);
    if (!cached && game?.rawUrl) cached = await getCachedGame(game.rawUrl);
    if (!cached?.html) {
      const response = await fetch(source, { cache: 'no-store' });
      if (!response.ok) throw new Error(`Game download failed (${response.status}).`);
      cached = await putGame({ ...game, html: await response.text(), rawUrl: source, url: source });
    }
    return URL.createObjectURL(new Blob([cached.html], { type: 'text/html' }));
  }

  async function removeGame(id) {
    const game = await getCachedGame(id);
    if (!game) return;
    await (await cacheHandle()).delete(game.rawUrl || game.url);
    libraryPromise = null;
  }

  async function clearGames() {
    await caches.delete(CACHE_NAME);
    cachePromise = null;
    libraryPromise = null;
  }

  function readFavourites() {
    try {
      const value = JSON.parse(localStorage.getItem(FAVOURITES_KEY) || '[]');
      return new Set(Array.isArray(value) ? value.map(String) : []);
    } catch { return new Set(); }
  }
  function writeFavourites(value) {
    const list = [...new Set((Array.isArray(value) ? value : [...value]).map(String))];
    localStorage.setItem(FAVOURITES_KEY, JSON.stringify(list));
    return list;
  }
  function getFavourites() { return readFavourites(); }
  function setFavourite(id, enabled) { const current = readFavourites(); if (enabled) current.add(String(id)); else current.delete(String(id)); return writeFavourites(current); }

  window.FlashGamesStore = {
    ...original,
    getFavourites,
    setFavourite,
    setFavourites: writeFavourites,
    addFavourite: (id) => writeFavourites([...readFavourites(), id]),
    removeFavourite: (id) => writeFavourites([...readFavourites()].filter((item) => item !== String(id))),
    toggleFavourite: (id) => { const key = String(id), current = readFavourites(); if (current.has(key)) current.delete(key); else current.add(key); return writeFavourites(current); },
    getAllCachedGames,
    getCachedGame,
    install: installGame,
    installCustom: installCustomGame,
    launch: launchGame,
    deleteCachedGame: removeGame,
    clearGameCache: clearGames,
    cacheName: CACHE_NAME
  };

  function fallbackGames() {
    try {
      const value = JSON.parse(localStorage.getItem(GAME_CACHE) || 'null');
      return Array.isArray(value?.games) ? value.games : Array.isArray(value) ? value : [];
    } catch { return []; }
  }

  async function loadGames(force = false) {
    if (!force) {
      const cached = fallbackGames();
      if (cached.length) return { games: cached, source: 'cache' };
    }
    try {
      const response = await fetch(`./offline.json?v=${Date.now()}`, { cache: 'no-store' });
      if (response.ok) {
        const data = await response.json();
        const games = (Array.isArray(data) ? data : data.games || []).filter(Boolean);
        if (games.length) {
          try { localStorage.setItem(GAME_CACHE, JSON.stringify({ version: 8, generatedAt: Date.now(), games })); } catch {}
          return { games, source: 'offline-manifest' };
        }
      }
    } catch {}
    return { games: fallbackGames(), source: 'cache' };
  }

  async function loadUpdates() {
    try {
      const response = await fetch(`./update.json?v=${Date.now()}`, { cache: 'no-store' });
      if (!response.ok) throw new Error();
      const data = await response.json();
      const releases = Array.isArray(data) ? data : data.releases || [];
      return { version: clean(data.version || releases[0]?.version || '0.0.0'), releases };
    } catch { return { version: '0.0.0', releases: [] }; }
  }

  async function loadNotifications(uid) {
    const db = window.__flashFirebase?.db;
    if (!db) return [];
    try {
      const collection = db.collection('notifications');
      const snapshot = uid ? await collection.where('uid', '==', uid).limit(30).get().catch(() => collection.limit(30).get()) : await collection.limit(30).get();
      return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    } catch { return []; }
  }

  const existingData = window.FlashData || {};
  window.FlashData = {
    ...existingData,
    loadGames,
    loadUpdates,
    loadNotifications,
    syncGames: () => loadGames(true),
    clearCache: () => localStorage.removeItem(GAME_CACHE),
    esc: existingData.esc || ((value) => clean(value).replace(/[&<>\"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '\"': '&quot;', "'": '&#39;' })[char]))
  };
  window.FlashData.prettyName = window.FlashData.prettyName || prettyName;
})();
