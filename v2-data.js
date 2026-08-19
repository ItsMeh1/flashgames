/* Flash Games v2 data layer. Keeps retrieval independent from the UI. */
(() => {
  const CACHE_KEY = 'flash.v2.gameData';
  const CACHE_TTL = 5 * 60 * 1000;
  const configured = () => (localStorage.getItem('flash.v2.apiBase') || window.FLASH_API_BASE || '').replace(/\/$/, '');

  // v2-app expects a build marker for Settings/update information. Keep it
  // non-invasive: it is created only when the host page does not provide one.
  if (!document.getElementById('build')) {
    const build = document.createElement('span');
    build.id = 'build';
    build.hidden = true;
    document.body.appendChild(build);
  }

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
    const local = normalize(await readJson('./offline.json'));
    writeCache(local);
    return { games: local, source: 'offline', stale: Boolean(base) };
  }

  async function loadGames() {
    try {
      const result = await load();
      window.dispatchEvent(new CustomEvent('flash:data-ready', { detail: result }));
      return result;
    } catch (error) {
      const result = { games: [], source: 'unavailable', stale: true, error };
      window.dispatchEvent(new CustomEvent('flash:data-ready', { detail: result }));
      return result;
    }
  }

  // update.json is now the single source of truth for the changelog. v2-app
  // still renders its initial fallback immediately; this replaces that view
  // with the remotely editable JSON once the page is ready.
  async function loadUpdates() {
    try {
      const response = await fetch('./update.json', { cache: 'no-store', headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      const releases = Array.isArray(payload) ? payload : (Array.isArray(payload.releases) ? payload.releases : []);
      const target = document.getElementById('updatesContent');
      if (!target || !releases.length) return;
      const escapeHtml = value => String(value ?? '').replace(/[&<>\"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '\"':'&quot;', "'":'&#39;' }[c]));
      const icons = {
        add: '<b class="log-add">+</b>',
        edit: '<b class="log-edit">⌁</b>',
        mod: '<b class="log-mod">⚒</b>',
        stop: '<b class="log-stop">■</b>'
      };
      target.innerHTML = `<div class="page-head"><div><div class="eyebrow">CHANGELOG</div><h1>What's new</h1><p>Readable release history for the current build.</p></div></div><div class="timeline">${releases.map(release => `<article class="release"><span class="release-dot"></span><div class="release-head"><strong>v${escapeHtml(release.version)}</strong><span>${escapeHtml(release.date)}</span></div><p>${escapeHtml(release.desc || '')}</p>${(Array.isArray(release.items) ? release.items : []).map(item => `<div class="log-item">${icons[item[0]] || '<b>•</b>'}<span>${escapeHtml(item[1])}</span></div>`).join('')}</article>`).join('')}</div>`;
    } catch (error) {
      console.warn('Could not load update.json:', error);
    }
  }

  window.FlashData = { load, loadGames, clearCache: () => localStorage.removeItem(CACHE_KEY) };
  window.loadGames = loadGames;
  window.FlashUpdates = { load: loadUpdates };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', loadUpdates, { once: true });
  else loadUpdates();
})();
