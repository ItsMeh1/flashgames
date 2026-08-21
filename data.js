(() => {
  'use strict';

  const GAME_CACHE = 'flashgames.catalogue.v6';
  const LEGACY_CACHES = ['flashgames.catalogue.v5', 'flashgames.catalogue.v4', 'flashgames.catalogue.v3'];
  const clean = (value) => String(value ?? '').trim();
  const escapeHtml = (value) => clean(value).replace(/[&<>\"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '\"': '&quot;', "'": '&#39;' })[char]);

  function readCache(key) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || 'null');
      return Array.isArray(value?.games) ? value.games : [];
    } catch {
      return [];
    }
  }

  function normalizeGame(game, index) {
    if (!game || typeof game !== 'object') return null;
    const name = clean(game.name || game.title);
    const url = clean(game.url || game.href || game.link);
    if (!name || !url) return null;
    const rating = game.rating == null ? null : Number(game.rating);
    return {
      id: clean(game.id) || url || `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${index}`,
      name,
      title: name,
      url,
      rawUrl: clean(game.rawUrl || url),
      zone: clean(game.zone || game.type || 'STORE'),
      category: clean(game.category || game.genre || 'Games'),
      description: clean(game.description || game.desc),
      cover: clean(game.cover || game.image || game.thumbnail || game.icon),
      tags: Array.isArray(game.tags) ? game.tags.map(clean).filter(Boolean) : [],
      rating: Number.isFinite(rating) ? rating : null
    };
  }

  function readAllCaches() {
    const seen = new Set();
    return [GAME_CACHE, ...LEGACY_CACHES]
      .flatMap(readCache)
      .map(normalizeGame)
      .filter(Boolean)
      .filter((game) => {
        const key = game.rawUrl || game.url;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  }

  function writeCache(games) {
    try {
      localStorage.setItem(GAME_CACHE, JSON.stringify({ version: 6, time: Date.now(), games }));
    } catch {
      // Browser storage can be unavailable or full.
    }
  }

  async function fetchJson(url, timeout = 12000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const response = await fetch(url, { cache: 'no-store', signal: controller.signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } finally {
      clearTimeout(timer);
    }
  }

  function extractArrays(source) {
    const results = [];
    for (const marker of ['STORE_GAMES', 'window.STORE_GAMES', 'GAME_LIST']) {
      let cursor = 0;
      while ((cursor = source.indexOf(marker, cursor)) !== -1) {
        const open = source.indexOf('[', cursor);
        if (open < 0) break;
        let depth = 0;
        let quote = '';
        let escaped = false;
        for (let i = open; i < source.length; i += 1) {
          const character = source[i];
          if (quote) {
            if (escaped) escaped = false;
            else if (character === '\\') escaped = true;
            else if (character === quote) quote = '';
            continue;
          }
          if (character === '"' || character === "'") quote = character;
          else if (character === '[') depth += 1;
          else if (character === ']') depth -= 1;
          if (depth === 0) {
            try {
              const value = Function(`"use strict"; return (${source.slice(open, i + 1)})`)();
              if (Array.isArray(value)) results.push(value);
            } catch {
              // Continue searching for another real catalogue.
            }
            break;
          }
        }
        cursor = open + 1;
      }
    }
    return results;
  }

  async function loadLegacyStore() {
    const urls = ['./legacy.html', './index-legacy.html', 'https://raw.githubusercontent.com/ItsMeh1/flashgames/main/index.html'];
    for (const url of urls) {
      try {
        const response = await fetch(`${url}${url.includes('?') ? '&' : '?'}v=${Date.now()}`, { cache: 'no-store' });
        if (!response.ok) continue;
        const source = await response.text();
        for (const candidate of extractArrays(source)) {
          const games = candidate.map(normalizeGame).filter(Boolean);
          if (games.length) return games;
        }
      } catch {
        // Continue to the next source.
      }
    }
    return [];
  }

  async function loadOfflineCatalogue() {
    try {
      const data = await fetchJson(`./offline.json?v=${Date.now()}`);
      return (Array.isArray(data) ? data : data.games || data.data || []).map(normalizeGame).filter(Boolean);
    } catch {
      return [];
    }
  }

  async function loadGames(force = false) {
    const cached = readAllCaches();
    if (!force && cached.length) return { games: cached, source: 'cache' };
    const [legacy, offline] = await Promise.all([loadLegacyStore(), loadOfflineCatalogue()]);
    const merged = [...legacy, ...offline, ...cached];
    const seen = new Set();
    const games = merged.filter((game) => {
      const key = game.rawUrl || game.url;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    if (games.length) writeCache(games);
    return { games, source: games.length ? 'legacy+offline+cache' : 'empty' };
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

  window.FlashData = {
    loadGames,
    loadUpdates,
    loadNotifications,
    clearCache: () => localStorage.removeItem(GAME_CACHE),
    esc: escapeHtml
  };
})();

if (!window.FlashGamesStore) {
  document.write('<script src="./game-store.js"><\\/script>');
}
