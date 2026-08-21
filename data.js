(() => {
  'use strict';

  const GAME_CACHE = 'flashgames.catalogue.v7';
  const LEGACY_CACHES = ['flashgames.catalogue.v6', 'flashgames.catalogue.v5', 'flashgames.catalogue.v4', 'flashgames.catalogue.v3'];
  const DB_NAME = 'flashgames-library';
  const DB_VERSION = 4;
  const STORE_NAME = 'games';
  const SOURCE_ROOT = 'https://raw.githubusercontent.com/CoolDude2349/Offline-HTML-Games-Pack/master/offline/';
  const TREE_URL = 'https://api.github.com/repos/CoolDude2349/Offline-HTML-Games-Pack/git/trees/master?recursive=1';
  const FAVOURITES_KEY = 'flashgames.favourites.v1';

  let dbPromise = null;
  let cataloguePromise = null;

  const clean = (value) => String(value ?? '').trim();

  function esc(value) {
    return clean(value).replace(/[&<>\"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '\"': '&quot;', "'": '&#39;' })[char]);
  }

  function readCache(key) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || 'null');
      return Array.isArray(value?.games) ? value.games : Array.isArray(value) ? value : [];
    } catch {
      return [];
    }
  }

  function normalizeGame(game, index = 0) {
    if (!game || typeof game !== 'object') return null;
    const name = clean(game.name || game.title);
    const url = clean(game.rawUrl || game.url || game.href || game.link);
    if (!name || !url) return null;
    const rating = game.rating == null ? null : Number(game.rating);
    return {
      id: clean(game.id) || `game-${index}-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
      name,
      title: name,
      url,
      rawUrl: url,
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
    const result = [];
    const seen = new Set();
    lists.flat().forEach((raw, index) => {
      const game = normalizeGame(raw, index);
      if (!game) return;
      const key = game.rawUrl || game.url || game.id;
      if (seen.has(key)) return;
      seen.add(key);
      result.push(game);
    });
    return result;
  }

  function readCachedCatalogue() {
    return mergeGames(...[GAME_CACHE, ...LEGACY_CACHES].map(readCache));
  }

  function writeCatalogue(games) {
    try {
      localStorage.setItem(GAME_CACHE, JSON.stringify({ version: 7, generatedAt: Date.now(), games }));
    } catch {
      // Storage can be full; the in-memory catalogue remains usable.
    }
  }

  async function fetchJson(url, timeout = 20000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const response = await fetch(url, { cache: 'no-store', signal: controller.signal, headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } finally {
      clearTimeout(timer);
    }
  }

  function prettyName(filename) {
    return clean(filename)
      .replace(/\.html?$/i, '')
      .replace(/[_-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/\b\w/g, (letter) => letter.toUpperCase())
      .replace(/\bFnaf\b/gi, 'FNAF')
      .replace(/\bLol\b/gi, 'LoL')
      .replace(/\bAgar Io\b/gi, 'Agar.io');
  }

  function chooseCover(htmlPath, imageFiles) {
    const directory = htmlPath.slice(0, htmlPath.lastIndexOf('/') + 1);
    const filename = htmlPath.slice(htmlPath.lastIndexOf('/') + 1);
    const stem = filename.replace(/\.html?$/i, '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const candidates = imageFiles
      .filter((path) => path.startsWith(directory))
      .map((path) => {
        const imageName = path.slice(path.lastIndexOf('/') + 1);
        const imageStem = imageName.replace(/\.[^.]+$/, '').toLowerCase().replace(/[^a-z0-9]/g, '');
        let score = 0;
        if (imageStem === stem) score += 100;
        if (imageStem.includes(stem) || stem.includes(imageStem)) score += 45;
        if (/cover|thumbnail|thumb|preview|icon/i.test(imageName)) score += 25;
        return { path, score };
      })
      .sort((a, b) => b.score - a.score);
    if (!candidates.length || candidates[0].score < 25) return '';
    return `https://raw.githubusercontent.com/CoolDude2349/Offline-HTML-Games-Pack/master/${candidates[0].path}`;
  }

  async function fetchFullOfflineCatalogue() {
    const tree = await fetchJson(TREE_URL);
    const entries = Array.isArray(tree?.tree) ? tree.tree : [];
    const htmlFiles = entries.filter((entry) => entry.type === 'blob' && /^offline\/.*\.html?$/i.test(entry.path)).map((entry) => entry.path).sort();
    const imageFiles = entries.filter((entry) => entry.type === 'blob' && /^offline\/.*\.(png|jpe?g|webp|gif|svg)$/i.test(entry.path)).map((entry) => entry.path);

    return htmlFiles.map((path) => {
      const filename = path.slice(path.lastIndexOf('/') + 1);
      const encoded = encodeURIComponent(filename);
      const rawUrl = `${SOURCE_ROOT}${encoded}`;
      const name = prettyName(filename);
      return {
        id: `offline-${filename.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
        name,
        title: name,
        url: rawUrl,
        rawUrl,
        zone: 'OFFLINE PACK',
        category: 'HTML Games',
        description: 'Single-file HTML game from the Offline HTML Games Pack.',
        cover: chooseCover(path, imageFiles),
        tags: ['HTML', 'Offline'],
        source: 'CoolDude2349/Offline-HTML-Games-Pack'
      };
    });
  }

  function extractEmbeddedArrays(source) {
    const arrays = [];
    const markers = ['STORE_GAMES', 'window.STORE_GAMES', 'GAME_LIST', 'games'];
    for (const marker of markers) {
      let cursor = 0;
      while ((cursor = source.indexOf(marker, cursor)) >= 0) {
        const open = source.indexOf('[', cursor);
        if (open < 0) break;
        let depth = 0;
        let quote = '';
        let escaped = false;
        for (let i = open; i < source.length; i += 1) {
          const char = source[i];
          if (quote) {
            if (escaped) escaped = false;
            else if (char === '\\') escaped = true;
            else if (char === quote) quote = '';
            continue;
          }
          if (char === '"' || char === "'") quote = char;
          else if (char === '[') depth += 1;
          else if (char === ']') depth -= 1;
          if (depth === 0) {
            try {
              const value = Function(`"use strict"; return (${source.slice(open, i + 1)})`)();
              if (Array.isArray(value)) arrays.push(value);
            } catch {
              // Ignore malformed candidates.
            }
            break;
          }
        }
        cursor = open + 1;
      }
    }
    return arrays;
  }

  async function loadLegacyStore() {
    const urls = ['./legacy.html', './index-legacy.html', 'https://raw.githubusercontent.com/ItsMeh1/flashgames/main/index.html'];
    for (const url of urls) {
      try {
        const response = await fetch(`${url}${url.includes('?') ? '&' : '?'}v=${Date.now()}`, { cache: 'no-store' });
        if (!response.ok) continue;
        const source = await response.text();
        for (const candidate of extractEmbeddedArrays(source)) {
          const games = mergeGames(candidate);
          if (games.length >= 20) return games;
        }
      } catch {
        // Continue to the next source.
      }
    }
    return [];
  }

  async function loadGames(force = false) {
    if (cataloguePromise && !force) return cataloguePromise;
    cataloguePromise = (async () => {
      const cached = readCachedCatalogue();
      if (!force && cached.length >= 300) return { games: cached, source: 'cache' };

      const [offline, legacy] = await Promise.all([
        fetchFullOfflineCatalogue().catch(() => []),
        loadLegacyStore().catch(() => [])
      ]);
      const games = mergeGames(offline, legacy, cached);
      if (games.length) writeCatalogue(games);
      return { games, source: games.length ? 'offline-pack+legacy+cache' : 'empty' };
    })();
    try {
      return await cataloguePromise;
    } finally {
      cataloguePromise = null;
    }
  }

  function openDatabase() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      };
      request.onsuccess = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.close();
          dbPromise = null;
          reject(new Error('Game cache store is missing.'));
          return;
        }
        db.onversionchange = () => db.close();
        resolve(db);
      };
      request.onerror = () => {
        dbPromise = null;
        reject(request.error || new Error('IndexedDB unavailable.'));
      };
    });
    return dbPromise;
  }

  async function storeRequest(mode, operation) {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      let transaction;
      try {
        transaction = db.transaction(STORE_NAME, mode);
      } catch (error) {
        reject(error);
        return;
      }
      const store = transaction.objectStore(STORE_NAME);
      let result;
      try {
        result = operation(store);
      } catch (error) {
        reject(error);
        return;
      }
      transaction.oncomplete = () => resolve(result);
      transaction.onerror = () => reject(transaction.error || new Error('IndexedDB transaction failed.'));
      transaction.onabort = () => reject(transaction.error || new Error('IndexedDB transaction aborted.'));
    });
  }

  async function getAllCachedGames() {
    try {
      const db = await openDatabase();
      return await new Promise((resolve, reject) => {
        const request = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).getAll();
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error);
      });
    } catch {
      return [];
    }
  }

  async function getCachedGame(id) {
    try {
      const db = await openDatabase();
      return await new Promise((resolve, reject) => {
        const request = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(id);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error);
      });
    } catch {
      return null;
    }
  }

  async function installGame(game) {
    const rawUrl = clean(game?.rawUrl || game?.url);
    if (!rawUrl) throw new Error('This game has no source URL.');
    const response = await fetch(rawUrl, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Game download failed (${response.status}).`);
    const html = await response.text();
    const cached = { ...normalizeGame(game), html, installedAt: Date.now(), size: html.length };
    await storeRequest('readwrite', (store) => store.put(cached));
    return cached;
  }

  async function removeGame(id) {
    try { await storeRequest('readwrite', (store) => store.delete(id)); } catch { /* storage failure is non-fatal */ }
  }

  async function clearGames() {
    try { await storeRequest('readwrite', (store) => store.clear()); } catch { /* storage failure is non-fatal */ }
  }

  async function launchGame(game) {
    const cached = await getCachedGame(game.id);
    if (cached?.html) return URL.createObjectURL(new Blob([cached.html], { type: 'text/html' }));
    return clean(game?.rawUrl || game?.url);
  }

  function getFavourites() {
    try {
      const value = JSON.parse(localStorage.getItem(FAVOURITES_KEY) || '[]');
      return new Set(Array.isArray(value) ? value : []);
    } catch {
      return new Set();
    }
  }

  function setFavourite(id, enabled) {
    const favourites = getFavourites();
    if (enabled) favourites.add(id); else favourites.delete(id);
    localStorage.setItem(FAVOURITES_KEY, JSON.stringify([...favourites]));
  }

  async function loadUpdates() {
    try {
      const data = await fetchJson(`./update.json?v=${Date.now()}`);
      const releases = Array.isArray(data) ? data : data.releases || [];
      return { version: clean(data.version || releases[0]?.version || '0.0.0'), releases };
    } catch {
      return { version: '0.0.0', releases: [] };
    }
  }

  async function loadNotifications(uid) {
    const db = window.__flashFirebase?.db;
    if (!db) return [];
    try {
      const collection = db.collection('notifications');
      const snapshot = uid ? await collection.where('uid', '==', uid).limit(30).get().catch(() => collection.limit(30).get()) : await collection.limit(30).get();
      return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    } catch {
      return [];
    }
  }

  window.FlashGamesStore = { getFavourites, setFavourite, getAllCachedGames, getCachedGame, install: installGame, launch: launchGame, deleteCachedGame: removeGame, clearGameCache: clearGames };
  window.FlashData = { loadGames, loadUpdates, loadNotifications, clearCache: () => localStorage.removeItem(GAME_CACHE), esc };
})();
