(() => {
  'use strict';

  const CACHE_NAME = 'flash-games-cache';
  const LEGACY_METADATA_KEY = 'flash_offline_folder';
  const original = window.FlashGamesStore ? { ...window.FlashGamesStore } : {};
  let migrationPromise = null;

  const clean = (value) => String(value ?? '').trim();
  const prettyName = (value) => clean(value).split('/').pop().replace(/\.html?$/i, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/\b\w/g, (c) => c.toUpperCase()) || 'HTML Game';

  function metadata() {
    try { const list = JSON.parse(localStorage.getItem(LEGACY_METADATA_KEY) || '[]'); return Array.isArray(list) ? list : []; } catch { return []; }
  }
  function metaFor(url) {
    const normalized = clean(url);
    return metadata().find((item) => clean(item?.url || item?.rawUrl) === normalized) || {};
  }
  function stableId(url) {
    const known = metaFor(url);
    if (known?.id) return known.id;
    return `legacy-${clean(url).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 110)}`;
  }
  function normalize(url, meta = {}, extra = {}) {
    const source = clean(url), item = meta || {};
    const name = clean(extra.name || item.name || item.title) || prettyName(source);
    return {
      id: clean(extra.id || item.id) || stableId(source), name, title: name, url: source, rawUrl: source,
      zone: clean(extra.zone || item.zone || 'offline'), category: clean(extra.category || item.category || 'HTML Games'),
      description: clean(extra.description || item.description || item.desc || 'Installed HTML game.'),
      cover: clean(extra.cover || item.cover || item.image || item.icon), icon: clean(extra.icon || item.icon),
      tags: Array.isArray(extra.tags || item.tags) ? (extra.tags || item.tags) : ['HTML', 'Offline'],
      source: clean(extra.source || item.source || 'Legacy Flash Games cache'),
      installedAt: Number(extra.installedAt || item.installedAt || 0), legacyCache: true
    };
  }
  async function cacheHandle() {
    if (!('caches' in window)) throw new Error('Cache Storage is unavailable in this browser.');
    return caches.open(CACHE_NAME);
  }
  async function readCacheGames() {
    const cache = await cacheHandle();
    const requests = await cache.keys();
    return requests.map((request) => normalize(request.url, metaFor(request.url))).filter((game) => game.rawUrl);
  }
  async function putGame(game) {
    const url = clean(game?.rawUrl || game?.url), html = clean(game?.html);
    if (!url || !html) throw new Error('The game has no downloadable HTML content.');
    const cache = await cacheHandle();
    await cache.put(url, new Response(html, { status: 200, statusText: 'OK', headers: { 'Content-Type': 'text/html; charset=utf-8', 'X-Flash-Games-Installed': '1' } }));
    return normalize(url, metaFor(url), { ...game, installedAt: Date.now() });
  }
  async function migrateOldV2() {
    if (migrationPromise) return migrationPromise;
    migrationPromise = (async () => {
      if (!original.getAllCachedGames) return;
      try {
        const oldGames = await original.getAllCachedGames();
        for (const game of oldGames || []) if (game?.html && (game.rawUrl || game.url)) await putGame(game);
      } catch { /* Old v2 storage is optional; never block the real legacy cache. */ }
    })();
    return migrationPromise;
  }
  async function getAllCachedGames() {
    const current = await readCacheGames();
    if (current.length) return current;
    await migrateOldV2();
    return readCacheGames();
  }
  async function getCachedGame(id) {
    const games = await getAllCachedGames(), game = games.find((item) => item.id === id);
    if (!game) return null;
    const cache = await cacheHandle(), response = await cache.match(game.rawUrl || game.url);
    if (!response) return null;
    return { ...game, html: await response.text(), size: Number(response.headers.get('Content-Length')) || 0 };
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
    const cached = await getCachedGame(game.id);
    if (cached?.html) return URL.createObjectURL(new Blob([cached.html], { type: 'text/html' }));
    return clean(game?.rawUrl || game?.url);
  }
  async function removeGame(id) {
    const game = await getCachedGame(id); if (!game) return;
    await (await cacheHandle()).delete(game.rawUrl || game.url);
  }
  async function clearGames() { if ('caches' in window) await caches.delete(CACHE_NAME); }

  window.FlashGamesStore = { ...original, getAllCachedGames, getCachedGame, install: installGame, installCustom: installCustomGame, launch: launchGame, deleteCachedGame: removeGame, clearGameCache: clearGames, cacheName: CACHE_NAME };
  window.FlashGamesLegacyCache = { CACHE_NAME, migrateOldV2, readCacheGames };
})();
