/* Flash Games v2 data layer. Keeps retrieval independent from the UI. */
(() => {
  const CACHE_KEY = 'flash.v2.gameData';
  const CACHE_TTL = 5 * 60 * 1000;
  const configured = () => (localStorage.getItem('flash.v2.apiBase') || window.FLASH_API_BASE || '').replace(/\/$/, '');

  async function readJson(url, timeout = 8000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const response = await fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' }, cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } finally { clearTimeout(timer); }
  }

  function normalize(value) {
    if (!Array.isArray(value)) return [];
    return value.filter(Boolean).map((game, index) => ({
      id: String(game.id ?? game.slug ?? game.name ?? `game-${index}`),
      name: String(game.name ?? game.title ?? 'Untitled game'),
      category: String(game.category ?? game.genre ?? 'Games'),
      zone: String(game.zone ?? game.type ?? 'ONLINE'),
      url: String(game.url ?? game.launchUrl ?? ''),
      cover: String(game.cover ?? game.thumbnail ?? game.image ?? ''),
      description: String(game.description ?? ''),
      tags: Array.isArray(game.tags) ? game.tags.map(String) : []
    })).filter(game => game.url);
  }

  function readCache() {
    try {
      const parsed = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
      if (parsed && Date.now() - parsed.time < CACHE_TTL) return normalize(parsed.games);
    } catch (_) {}
    return null;
  }

  function writeCache(games) {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify({ time: Date.now(), games })); } catch (_) {}
  }

  async function load() {
    const cached = readCache();
    if (cached) return { games: cached, source: 'cache', stale: false };

    const base = configured();
    if (base) {
      const candidates = [`${base}/games.json`, `${base}/api/games`, base];
      for (const url of candidates) {
        try {
          const games = normalize(await readJson(url));
          if (games.length) { writeCache(games); return { games, source: 'api', stale: false }; }
        } catch (_) {}
      }
    }

    // offline.json is always the final deterministic fallback. It is small and static.
    const local = normalize(await readJson('./offline.json'));
    writeCache(local);
    return { games: local, source: 'offline', stale: Boolean(base) };
  }

  window.FlashData = { load, clearCache: () => localStorage.removeItem(CACHE_KEY) };
})();
