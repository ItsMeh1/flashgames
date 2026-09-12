(() => {
  'use strict';
  const FAVOURITES_KEY = 'flashgames.favourites.v1';
  const GAME_CACHE = 'flashgames.catalogue.v8';

  const clean = (value) => String(value ?? '').trim();
  const esc = (value) => clean(value).replace(/[&<>\"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '\"': '&quot;', "'": '&#39;' })[char]);

  function readFavourites() {
    try {
      const value = JSON.parse(localStorage.getItem(FAVOURITES_KEY) || '[]');
      return new Set(Array.isArray(value) ? value.map(String) : []);
    } catch { return new Set(); }
  }
  function saveFavourites(value) {
    const list = [...new Set((Array.isArray(value) ? value : [...value]).map(String))];
    localStorage.setItem(FAVOURITES_KEY, JSON.stringify(list));
    return list;
  }

  function getStoreFallback() {
    return {
      getFavourites: async () => readFavourites(),
      setFavourites: async (items) => saveFavourites(items),
      addFavourite: async (id) => saveFavourites([...readFavourites(), id]),
      removeFavourite: async (id) => saveFavourites([...readFavourites()].filter((item) => item !== String(id))),
      toggleFavourite: async (id) => {
        const key = String(id), current = readFavourites();
        if (current.has(key)) current.delete(key); else current.add(key);
        return saveFavourites(current);
      }
    };
  }

  function getFallbackGames() {
    try {
      const value = JSON.parse(localStorage.getItem(GAME_CACHE) || 'null');
      const games = Array.isArray(value?.games) ? value.games : Array.isArray(value) ? value : [];
      return games.map((game) => ({ ...game, url: game.url || game.rawUrl, rawUrl: game.rawUrl || game.url }));
    } catch { return []; }
  }

  async function loadGames(force = false) {
    const cacheKey = `${GAME_CACHE}${force ? ':forced' : ''}`;
    if (!force) {
      const cached = getFallbackGames();
      if (cached.length) return { games: cached, source: 'compat-cache' };
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
    return { games: getFallbackGames(), source: cacheKey };
  }

  async function loadUpdates() {
    try {
      const response = await fetch(`./update.json?v=${Date.now()}`, { cache: 'no-store' });
      if (!response.ok) throw new Error('Updates unavailable');
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
      const snapshot = uid
        ? await collection.where('uid', '==', uid).limit(30).get().catch(() => collection.limit(30).get())
        : await collection.limit(30).get();
      return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    } catch { return []; }
  }

  const fallbackData = { loadGames, loadUpdates, loadNotifications, syncGames: () => loadGames(true), clearCache: () => localStorage.removeItem(GAME_CACHE), esc };
  const fallbackStore = getStoreFallback();

  function patchData(value) { return { ...fallbackData, ...(value || {}) }; }
  function patchStore(value) { return { ...fallbackStore, ...(value || {}) }; }

  let dataValue = patchData(window.FlashData);
  let storeValue = patchStore(window.FlashGamesStore);

  try {
    Object.defineProperty(window, 'FlashData', {
      configurable: true,
      enumerable: true,
      get: () => dataValue,
      set: (value) => { dataValue = patchData(value); }
    });
    Object.defineProperty(window, 'FlashGamesStore', {
      configurable: true,
      enumerable: true,
      get: () => storeValue,
      set: (value) => { storeValue = patchStore(value); }
    });
  } catch {
    window.FlashData = dataValue;
    window.FlashGamesStore = storeValue;
  }
})();
