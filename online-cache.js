(() => {
  'use strict';

  const META_KEY = 'flash_offline_folder';
  const URL_KEYS = ['game_url','gameUrl','play_url','playUrl','iframe_url','iframeUrl','launch_url','launchUrl','url','href','link'];
  const BAD_URL_KEYS = /image|thumb|thumbnail|cover|icon|logo|avatar|screenshot|preview/i;
  const pending = new Set();
  const clean = (value) => String(value ?? '').trim();
  const idFor = (game) => `online-${clean(game?.id || game?.game_id || game?.slug || game?.name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 100)}`;

  function findGameUrl(game) {
    if (!game || typeof game !== 'object') return '';
    for (const key of URL_KEYS) {
      if (BAD_URL_KEYS.test(key)) continue;
      const value = clean(game[key]);
      if (/^https?:\/\//i.test(value)) return value;
    }
    for (const key of ['game','data','launch','embed']) {
      const nested = game[key];
      if (nested && typeof nested === 'object') {
        const value = findGameUrl(nested);
        if (value) return value;
      }
    }
    return '';
  }

  function metadataFor(game, url) {
    return { id:idFor(game), name:clean(game?.title || game?.name) || 'Online Game', title:clean(game?.title || game?.name) || 'Online Game', rawUrl:url, url, zone:'LUMIN', category:clean(game?.category || game?.genre) || 'Online', description:clean(game?.description) || 'Online game cached by Flash Games.', cover:clean(game?.image_url || game?.thumbnail_url || game?.image || game?.thumbnail), source:'Lumin' };
  }

  function saveMetadata(game, url) {
    try {
      const current = JSON.parse(localStorage.getItem(META_KEY) || '[]');
      const list = Array.isArray(current) ? current : [];
      const item = metadataFor(game, url);
      const index = list.findIndex((entry) => clean(entry?.url || entry?.rawUrl) === url);
      if (index >= 0) list[index] = { ...list[index], ...item };
      else list.push(item);
      localStorage.setItem(META_KEY, JSON.stringify(list));
    } catch {}
  }

  async function cacheOne(game) {
    const url = findGameUrl(game);
    if (!url || !window.FlashGamesStore?.install || pending.has(url)) return false;
    pending.add(url);
    try {
      await window.FlashGamesStore.install(metadataFor(game, url));
      saveMetadata(game, url);
      return true;
    } catch (error) {
      console.debug('[Flash Games] Online game cache skipped:', error?.message || error);
      return false;
    } finally { pending.delete(url); }
  }

  async function cacheGames(games) {
    if (!navigator.onLine || !Array.isArray(games)) return;
    const queue = games.filter((game) => findGameUrl(game));
    let cursor = 0;
    const worker = async () => { while (cursor < queue.length) await cacheOne(queue[cursor++]); };
    await Promise.all([worker(), worker(), worker()]);
  }

  function patchLumin() {
    const lumin = window.Lumin;
    if (!lumin || lumin.__flashOnlineCachePatched || typeof lumin.getGames !== 'function') return !!lumin;
    const original = lumin.getGames.bind(lumin);
    lumin.getGames = async (...args) => {
      const result = await original(...args);
      const games = Array.isArray(result?.games) ? result.games : Array.isArray(result) ? result : [];
      queueMicrotask(() => cacheGames(games));
      return result;
    };
    lumin.__flashOnlineCachePatched = true;
    return true;
  }

  function boot() {
    if (patchLumin()) return;
    let attempts = 0;
    const timer = setInterval(() => { if (patchLumin() || ++attempts >= 120) clearInterval(timer); }, 100);
  }

  window.FlashOnlineCache = Object.freeze({ cacheGames, cacheOne, findGameUrl });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once:true });
  else boot();
})();
