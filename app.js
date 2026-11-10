(() => {
  'use strict';

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const esc = (value) => window.FlashData.esc(value);
  const icon = (name) => `<i data-lucide="${name}"></i>`;

  const state = {
    route: location.hash.replace('#', '') || 'home', games: [], installed: [], favourites: new Set(), onlineGames: [], flashExclusiveGames: Array.isArray(window.FlashExclusiveGames) ? window.FlashExclusiveGames : [], eaglerClients: [], downloads: new Map(), gamesSection: localStorage.getItem('flashgames.section') === 'mine' ? 'mine' : 'store', storeSection: 'all', storeView: 'games',
    user: null, profile: {}, updates: { version: '0.0.0', releases: [] }, articles: [], notifications: [],
    query: '', category: 'All', sort: localStorage.getItem('flashgames.sort') || 'featured', searchIndex: 0, stats: loadStats(),
    theme: localStorage.getItem('flashgames.theme') || 'dark', ui: localStorage.getItem('flashgames.ui') === 'classic' ? 'classic' : 'v2', accent: (() => { const saved = localStorage.getItem('flashgames.accent'); return !saved || saved.toLowerCase() === '#8b5cf6' ? '#ff5c35' : saved; })(),
    opacity: Number(localStorage.getItem('flashgames.opacity') || 66), blur: Number(localStorage.getItem('flashgames.blur') || 20),
    motion: localStorage.getItem('flashgames.motion') !== '0', performance: localStorage.getItem('flashgames.performance') === '1', cloakAuto: localStorage.getItem('flashgames.cloak.auto') === '1',
    updatesView: 'whatsnew', socialView: 'confer',
    objectUrl: null, gameStartedAt: 0, searchTimer: null, playerGame: null, playerUrl: '', ghGameId: '', ghBaseline: null, ghExpanded: new Set(), ghIdbCache: null
  };

  function loadStats() {
    try { const v = JSON.parse(localStorage.getItem('flashgames.stats') || '{}'); return { played: Number(v.played || 0), time: Number(v.time || 0), installs: Number(v.installs || 0), cloud: Number(v.cloud || 0) }; }
    catch { return { played: 0, time: 0, installs: 0, cloud: 0 }; }
  }
  function saveStats() { localStorage.setItem('flashgames.stats', JSON.stringify(state.stats)); }
  function refreshIcons(root = document) { const run=()=>{ try{window.lucide?.createIcons?.({root,attrs:{'stroke-width':1.5,width:18,height:18}})}catch(e){console.warn('Lucide refresh skipped',e)} }; requestAnimationFrame(run); }

  function toast(title, message, type = 'info') {
    const stack = $('#toastStack'); if (!stack) return;
    const node = document.createElement('article'); node.className = 'toast';
    node.innerHTML = `${icon(type === 'error' ? 'circle-alert' : type === 'success' ? 'circle-check' : 'info')}<div><strong>${esc(title)}</strong><p>${esc(message)}</p></div>`;
    stack.appendChild(node); requestAnimationFrame(() => node.classList.add('show')); refreshIcons(node);
    setTimeout(() => { node.classList.remove('show'); setTimeout(() => node.remove(), 250); }, 4200);
  }
  window.FlashUI = { toast };

  /* ---------- download queue & progress ---------- */

  const dlBytes = (n) => !Number.isFinite(n) || n <= 0 ? '' : n >= 1e9 ? `${(n / 1e9).toFixed(2)} GB` : n >= 1e6 ? `${(n / 1e6).toFixed(1)} MB` : n >= 1e3 ? `${Math.round(n / 1e3)} KB` : `${n} B`;
  function gameSizeText(game) {
    const size = Number(game?.size) || 0;
    if (!size) return '';
    const cached = installedSet().has(game.id);
    return `${dlBytes(size)}${cached ? ' saved' : ' to download'}`;
  }
  function packSizeText(resolved) {
    const known = (resolved || []).filter((g) => Number(g.size) > 0);
    const sum = known.reduce((a, g) => a + (Number(g.size) || 0), 0);
    const missing = resolved.filter((g) => !(Number(g.size) > 0));
    const cachedCount = resolved.filter((g) => installedSet().has(g.id)).length;
    if (!known.length) return cachedCount ? 'All cached locally' : 'Size is measured as it downloads';
    return `${dlBytes(sum)} storage${missing.length ? ` · ${missing.length} unknown` : ''}${cachedCount ? ` · ${cachedCount} already cached` : ''}`;
  }
  const dlKey = (game) => String(game?.id || game?.rawUrl || game?.url || '').trim() || `dl-${Date.now()}`;

  function dlRowHtml(entry) {
    const active = entry.status === 'active';
    const indeterminate = active && entry.pct == null;
    const pct = indeterminate ? null : Math.max(4, Math.min(100, entry.pct));
    const note = entry.status === 'error' ? 'Failed'
      : entry.status === 'done' ? 'Done'
      : indeterminate ? `${dlBytes(entry.loaded) || 'Downloading'}…${entry.speed ? ` · ${dlBytes(entry.speed)}/s` : ''}`
      : `${entry.pct}% · ${dlBytes(entry.loaded)}${entry.total ? ` of ${dlBytes(entry.total)}` : ''}${entry.speed ? ` · ${dlBytes(entry.speed)}/s` : ''}`;
    return `<div class="dl-row ${entry.status}" data-dl-id="${esc(entry.id)}">` +
      `<div class="dl-row-top"><span class="dl-name">${active || entry.status === 'error' ? icon(entry.status === 'error' ? 'triangle-alert' : 'loader-circle') : icon('circle-check')}<b>${esc(entry.name)}</b></span><span class="dl-note">${esc(note)}</span></div>` +
      (entry.status === 'error' ? `<div class="dl-error">${esc(entry.error || 'Download failed on all mirrors.')}</div>` : `<div class="dl-bar ${indeterminate ? 'indeterminate' : ''}">${indeterminate ? '<i></i>' : `<i style="width:${pct}%"></i>`}</div>`) +
      `</div>`;
  }

  function dlOrder(entry) { return entry.status === 'active' ? 0 : entry.status === 'error' ? 1 : 2; }

  const dlPaintCache = { dock: '', list: '' };
  function paintDownloads() {
    const entries = [...state.downloads.values()].sort((a, b) => dlOrder(a) - dlOrder(b) || a.startedAt - b.startedAt);
    const rowsHtml = entries.length ? entries.map((entry) => `${entry.id}|${entry.name}|${entry.status}|${entry.error}|${entry.pct}|${entry.speed}|${Math.round(entry.loaded)}|${Math.round(entry.total)}`).join('') : '';
    // DOM + icon refresh only when content actually changed (this runs on
    // every progress tick — repainting and re-scanning lucide icons 12x/s
    // across the shell was a major lag source).
    const dock = $('#dlDock');
    if (dock) {
      const fresh = entries.filter((e) => e.status !== 'done' || Date.now() - (e.doneAt || 0) < 2600);
      dock.hidden = !fresh.length;
      if (fresh.length) {
        const activeCount = fresh.filter((e) => e.status === 'active').length;
        const html = `<div class="dl-dock-head">${icon('download')}<span>Downloads</span><b>${activeCount ? `${activeCount} active` : 'Done'}</b></div>${fresh.map(dlRowHtml).join('')}`;
        if (html !== dlPaintCache.dock) { dlPaintCache.dock = html; dock.innerHTML = html; refreshIcons(dock); }
      } else dlPaintCache.dock = '';
    }
    const dlList = $('#downloadsList');
    if (dlList) {
      dlList.hidden = !entries.length;
      if (rowsHtml !== dlPaintCache.list) { dlPaintCache.list = rowsHtml; dlList.innerHTML = entries.length ? entries.map(dlRowHtml).join('') : ''; refreshIcons(dlList); }
    }
    updateNotifBadge();
  }

  function updateNotifBadge() {
    const badge = $('#notificationBadge'); if (!badge) return;
    const active = [...state.downloads.values()].filter((e) => e.status === 'active').length;
    const any = state.notifications.length + active;
    badge.hidden = !any;
    if (any) badge.textContent = String(any > 9 ? '9+' : any);
  }

  function trackDownload(game, run) {
    const key = dlKey(game);
    const prev = state.downloads.get(key);
    if (prev && prev.status === 'active') { toast('Already downloading', `${game.name} is in your download queue.`); return Promise.reject(new Error('busy')); }
    const entry = { id: key, name: game.name || 'Game', pct: null, loaded: 0, total: 0, status: 'active', startedAt: Date.now(), doneAt: 0, error: '', speed: 0, lastLoaded: 0, lastTick: Date.now() };
    state.downloads.set(key, entry);
    paintDownloads();
    const finish = (ok, err) => {
      entry.status = ok ? 'done' : 'error';
      entry.doneAt = Date.now();
      if (!ok) entry.error = err || 'Download failed.';
      if (ok) { entry.pct = 100; entry.loaded = entry.total || entry.loaded; }
      paintDownloads();
      setTimeout(() => { if (state.downloads.get(key) === entry) { state.downloads.delete(key); paintDownloads(); } }, ok ? 2600 : 8000);
    };
    return (async () => {
      try {
        const result = await run({ onProgress: (p) => {
          entry.pct = p?.pct ?? null;
          entry.loaded = p?.loaded ?? 0;
          entry.total = p?.total ?? 0;
          const now = Date.now();
          if (entry.loaded > entry.lastLoaded && now > entry.lastTick + 120) {
            entry.speed = Math.max(101, Math.round(((entry.loaded - entry.lastLoaded) / (now - entry.lastTick)) * 1000));
            entry.lastLoaded = entry.loaded;
            entry.lastTick = now;
          }
          paintDownloads();
        } });
        finish(true);
        return result;
      } catch (error) {
        if ((error?.message || error) === 'busy') throw error;
        finish(false, error?.message);
        throw error;
      }
    })();
  }


  function confirmDialog(title, text, action, danger = false) {
    const backdrop = $('#dialogBackdrop'), titleNode = $('#dialogTitle'), textNode = $('#dialogText'), iconNode = $('#dialogIcon'), confirm = $('#dialogConfirm'), cancel = $('#dialogCancel');
    if (!backdrop || !titleNode || !textNode || !iconNode || !confirm || !cancel) return;
    titleNode.textContent = title; textNode.textContent = text; iconNode.innerHTML = icon(danger ? 'triangle-alert' : 'circle-help');
    confirm.className = `btn ${danger ? 'danger' : 'primary'}`; backdrop.hidden = false;
    const close = () => { backdrop.hidden = true; confirm.onclick = null; cancel.onclick = null; };
    cancel.onclick = close; confirm.onclick = async () => { try { await action(); } catch (error) { toast('Something went wrong', error.message || 'The action failed.', 'error'); } close(); };
    refreshIcons(backdrop);
  }

  function setTheme(theme) {
    state.theme = theme; localStorage.setItem('flashgames.theme', theme);
    document.documentElement.dataset.theme = theme === 'system' ? (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark') : theme;
    $$('.theme-choices button').forEach((button) => button.classList.toggle('active', button.dataset.theme === theme));
  }

  function setUi(ui) {
    state.ui = ui === 'classic' ? 'classic' : 'v2';
    document.documentElement.dataset.ui = state.ui;
    localStorage.setItem('flashgames.ui', state.ui);
    $$('.ui-choices button').forEach((button) => button.classList.toggle('active', button.dataset.ui === state.ui));
    if (state.route === 'eagler') paintView(renderEagler);
  }

  function applyPreferences() {
    document.documentElement.dataset.ui = state.ui === 'classic' ? 'classic' : 'v2';
    $$('.ui-choices button').forEach((button) => button.classList.toggle('active', button.dataset.ui === state.ui));
    const accent = /^#[0-9a-f]{6}$/i.test(String(state.accent || '')) ? state.accent : '#ff5c35';
    const accentRgb = [1, 3, 5].map((index) => parseInt(accent.slice(index, index + 2), 16)).join(', ');
    state.accent = accent;
    document.documentElement.style.setProperty('--accent', accent);
    document.documentElement.style.setProperty('--accent-rgb', accentRgb);
    document.documentElement.style.setProperty('--opacity', String(state.opacity / 100));
    document.documentElement.style.setProperty('--blur', `${state.blur}px`);
    document.body.classList.toggle('performance-boost', state.performance); document.body.classList.toggle('reduce-motion', !state.motion);
    $$('.opacity-range').forEach((el) => { el.value = String(state.opacity); }); $$('.blur-range').forEach((el) => { el.value = String(state.blur); });
    $$('.opacity-value').forEach((el) => { el.textContent = `${state.opacity}%`; }); $$('.blur-value').forEach((el) => { el.textContent = `${state.blur}px`; });
    $$('.accent-picker').forEach((el) => { el.value = state.accent; });
    $$('.toggle-motion .switch').forEach((el) => el.classList.toggle('on', state.motion));
    $$('.toggle-performance .switch').forEach((el) => el.classList.toggle('on', state.performance));
    $$('.toggle-cloak-auto .switch').forEach((el) => el.classList.toggle('on', state.cloakAuto));
    document.body.classList.toggle('perf-plus', localStorage.getItem('flashgames.perfplus') === '1');
    setTheme(state.theme);
  }

  function avatarSource(value) {
    const source = String(value || '').trim();
    if (!source) return './offline/logo.png';
    if (/^data:image\//i.test(source) || /^https?:\/\//i.test(source) || /^blob:/i.test(source)) return source;
    if (/^[A-Za-z0-9+/]+={0,2}$/.test(source) && source.length > 40) return `data:image/png;base64,${source}`;
    return './offline/logo.png';
  }
  function setAvatar(element, value) { const image = element && $('img', element); if (!image) return; image.onerror = () => { image.onerror = null; image.src = './offline/logo.png'; }; image.src = avatarSource(value); }
  function currentDisplayName() { return state.profile.username || state.profile.displayName || state.user?.displayName || state.user?.email?.split('@')[0] || 'Sign in'; }
  function currentPfp() { return state.profile.pfp || state.profile.photoURL || state.profile.photo || state.profile.avatar || state.user?.photoURL || ''; }
  function gameCover(game) { return game.cover || './offline/logo.png'; }
  function luminImageToken(game) { return game?.__raw?.image_token || game?.__raw?.imageToken || game?.__raw?.thumbnail_token || game?.__raw?.thumbnailToken || game?.__raw?.image?.token || ''; }
  const luminImgCache = new Map();
  async function hydrateLuminImages(root=document) {
    if(!window.Lumin?.getImageUrl) return;
    const cards=[...root.querySelectorAll('[data-lumin-id]')];
    const pending=[];
    for (const card of cards) {
      const game=state.onlineGames.find(g=>String(g.id)===String(card.dataset.gameId));
      if(!game) continue;
      const raw=game.__raw || game;
      const token=raw.image_token || raw.imageToken || game.image_token || game.imageToken || luminImageToken(game);
      const img=card.querySelector('img[data-lumin-image]');
      if(!img || !token) continue;
      const cached=luminImgCache.get(token);
      if (cached) { img.src=cached; if (!game.cover) game.cover=cached; continue; }
      pending.push((async () => {
        try {
          const url=await window.Lumin.getImageUrl(token);
          if(typeof url==='string' && url) {
            luminImgCache.set(token, url);
            game.cover=url;
            img.src=url;
          }
        } catch { /* thumbnail optional */ }
      })());
    }
    if (pending.length) await Promise.allSettled(pending);
  }
  function installedSet() { return new Set(state.installed.map((game) => game.id)); }

  function sortGames(list) {
    const copy = [...list];
    const installed = installedSet();
    const favourites = state.favourites;
    const compareName = (a, b) => String(a.name || '').localeCompare(String(b.name || ''), undefined, { numeric: true, sensitivity: 'base' });
    if (state.sort === 'az') return copy.sort(compareName);
    if (state.sort === 'za') return copy.sort((a, b) => compareName(b, a));
    if (state.sort === 'rating') return copy.sort((a, b) => (Number(b.rating) || 0) - (Number(a.rating) || 0) || compareName(a, b));
    return copy.sort((a, b) => {
      const priorityA = (installed.has(a.id) ? 2 : 0) + (favourites.has(a.id) ? 1 : 0);
      const priorityB = (installed.has(b.id) ? 2 : 0) + (favourites.has(b.id) ? 1 : 0);
      return priorityB - priorityA || (Number(b.rating) || 0) - (Number(a.rating) || 0) || compareName(a, b);
    });
  }

  function filteredGames(list = state.games) {
    const query = state.query.trim().toLowerCase();
    return sortGames(list.filter((game) => {
      const haystack = `${game.name} ${game.category} ${game.zone} ${game.description} ${(game.tags || []).join(' ')}`.toLowerCase();
      return (!query || haystack.includes(query)) && (state.category === 'All' || game.category === state.category);
    }));
  }

  function gameCard(game, installed = false) {
    const favourite = state.favourites.has(game.id);
    return `<article class="game-card" data-game-id="${esc(game.id)}"${game.zone === 'LUMIN' ? ` data-lumin-id="${esc(game.luminId || game.id)}"` : ''}><div class="cover"><img loading="lazy" src="${esc(gameCover(game))}" alt="${esc(game.name)}"${game.zone === 'LUMIN' ? ' data-lumin-image' : ''} onerror="this.onerror=null;this.src='./offline/logo.png'"><span class="badge">${installed ? 'Installed' : esc(game.category || 'HTML Game')}</span><div class="card-overlay"><button class="expand-action play" data-game-action="play" aria-label="Play ${esc(game.name)}">${icon('play')}<span>Play</span></button>${installed ? '' : `<button class="expand-action" data-game-action="install" aria-label="Install ${esc(game.name)}">${icon('download')}<span>Install</span></button>`}<button class="expand-action" data-game-action="favorite" aria-label="${favourite ? 'Remove favorite' : 'Favorite'} ${esc(game.name)}">${icon(favourite ? 'heart-off' : 'heart')}<span>${favourite ? 'Unfavorite' : 'Favorite'}</span></button><button class="expand-action" data-game-action="boost" aria-label="Performance boost">${icon('gauge')}<span>Boost</span></button>${installed ? `<button class="expand-action close" data-game-action="remove" aria-label="Remove ${esc(game.name)}">${icon('trash-2')}<span>Remove</span></button>` : ''}</div></div><div class="card-body"><div class="card-title"><h3>${esc(game.name)}</h3><span class="rating">${icon('star')} ${game.rating ? esc(game.rating) : 'HTML'}</span></div><div class="meta"><span class="tag">${esc(game.zone || 'STORE')}</span>${Number(game.size) > 0 ? `<span class="tag size-tag">${esc(gameSizeText(game) || dlBytes(Number(game.size)))}</span>` : ''}</div><p class="card-desc">${esc(game.description || 'Single-file HTML game.')}</p></div></article>`;
  }
  function emptyState(title, text, glyph = 'gamepad-2') { return `<div class="empty glass">${icon(glyph)}<h3>${esc(title)}</h3><p>${esc(text)}</p></div>`; }


  async function ensureOnlineGames() {
    if (state.onlineGames.length) return state.onlineGames;
    if (window.__flashLuminLoadPromise) return window.__flashLuminLoadPromise;
    window.__flashLuminLoadPromise = (async () => {
      if (!window.Lumin) {
        await new Promise((resolve, reject) => {
          const existing = document.querySelector('script[data-flash-lumin]');
          if (existing) {
            if (window.Lumin) return resolve();
            existing.addEventListener('load', resolve, { once: true });
            existing.addEventListener('error', reject, { once: true });
            return;
          }
          const script = document.createElement('script');
          script.dataset.flashLumin = '1';
          script.src = 'https://cdn.jsdelivr.net/gh/luminsdk/script@latest/lumin.min.js';
          script.async = true;
          script.onload = resolve;
          script.onerror = () => reject(new Error('Lumin SDK could not be loaded.'));
          document.head.appendChild(script);
        });
      }
      if (!window.Lumin?.init) throw new Error('Lumin SDK is unavailable.');
      if (!window.__flashLuminReady) {
        window.__flashLuminReady = window.Lumin.init({ headless: true });
      }
      await window.__flashLuminReady;
      const listToGames = (g) => ({
        id: 'lumin:' + String(g.id || g.game_id || g.slug || g.name),
        luminId: String(g.id || g.game_id || g.slug || g.name),
        name: g.title || g.name || 'Online Game',
        description: g.description || 'Play instantly online.',
        category: g.category || g.genre || 'Online',
        zone: 'LUMIN',
        source: 'Lumin',
        cover: g.image_url || g.thumbnail_url || g.image || g.thumbnail || './offline/logo.png',
        rating: g.rating || '',
        __raw: g
      });
      // Walk every page Lumin serves so "Every Online Game" truly means all
      // of them — pages continue until a fetch repeats or comes back empty.
      const games = [];
      const seenIds = new Set();
      for (let page = 1; page <= 12; page++) {
        let batch = [];
        try {
          const response = await window.Lumin.getGames({ page, limit: 100 });
          batch = Array.isArray(response?.games) ? response.games : Array.isArray(response) ? response : [];
        } catch (e) {
          if (page > 1) break;
          throw e;
        }
        if (!batch.length) break;
        let fresh = 0;
        for (const g of batch) {
          const mapped = listToGames(g);
          if (seenIds.has(mapped.id)) continue;
          seenIds.add(mapped.id);
          games.push(mapped);
          fresh += 1;
        }
        if (fresh === 0) break;
      }
      state.onlineGames = games;
      return state.onlineGames;
    })().catch((error) => {
      window.__flashLuminLoadPromise = null;
      window.__flashLuminReady = null;
      throw error;
    });
    return window.__flashLuminLoadPromise;
  }

  function flashExclusiveGames() {
    return (state.flashExclusiveGames || []).map((g) => ({ ...g, zone: 'FLASH EXCLUSIVE', source: 'Flash Exclusive' }));
  }

  function gamesUniverse() {
    // One entry per file: the offline manifest and the built-in exclusives
    // describe the same local games, so collapse them by source URL.
    // Eaglercraft clients join the universe so search/library/install
    // pipelines work on them too (unique eagler/files URLs always surface).
    const seen = new Set();
    const out = [];
    for (const g of [...state.games, ...state.onlineGames, ...flashExclusiveGames(), ...state.eaglerClients]) {
      if (!g) continue;
      const key = String(g.rawUrl || g.url || '').trim() || String(g.id || '');
      if (key && seen.has(key)) continue;
      if (key) seen.add(key);
      out.push(g);
    }
    return out;
  }

  /* ---------- eaglercraft launcher ---------- */

  async function ensureEaglerClients() {
    if (state.eaglerClients.length) return state.eaglerClients;
    const list = (window.FlashEagler?.load && await window.FlashEagler.load().catch(() => []))
      || window.FlashEagler?.defaults?.()
      || [];
    state.eaglerClients = list.filter(Boolean);
    return state.eaglerClients;
  }

  // Incremental grid rendering: the shell (inputs included) is built once,
  // only cards stream in. This keeps focus/scroll stable while typing.
  const GRID_BATCH = 48;
  const gridState = {
    store: { items: [], shown: 0, observer: null }
  };

  function matchesStoreSection(game) {
    if (state.storeSection === 'all') return true;
    if (state.storeSection === 'offline') return game.zone !== 'LUMIN' && game.source !== 'Flash Exclusive';
    if (state.storeSection === 'lumin') return game.zone === 'LUMIN';
    if (state.storeSection === 'exclusive') return game.source === 'Flash Exclusive' || game.zone === 'FLASH EXCLUSIVE';
    if (state.storeSection === 'eagler') return game.zone === 'EAGLECRAFT' || /eagler/i.test(`${game.name} ${game.category} ${(game.tags || []).join(' ')}`);
    return true;
  }

  function storeGames() {
    const query = state.query.trim().toLowerCase();
    return sortGames(gamesUniverse().filter((game) => matchesStoreSection(game)
      && (state.category === 'All' || game.category === state.category)
      && (!query || `${game.name} ${game.category} ${game.description} ${game.zone} ${(game.tags || []).join(' ')}`.toLowerCase().includes(query))));
  }

  function observeSentinel(key, renderMore) {
    const st = gridState[key];
    if (st.shown >= st.items.length) {
      if (st.observer) { st.observer.disconnect(); st.observer = null; }
      return;
    }
    if (st.observer) { st.observer.disconnect(); st.observer = null; }
    const sentinel = $('#storeSentinel');
    if (!sentinel) return;
    st.observer = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) renderMore();
    }, { rootMargin: '1000px' });
    st.observer.observe(sentinel);
  }

  function recentGames() { try { const ids = JSON.parse(localStorage.getItem('flashgames.recent') || '[]'); return ids.map((id) => gamesUniverse().find((game) => game.id === id) || state.installed.find((game) => game.id === id)).filter(Boolean).slice(0, 8); } catch { return []; } }

  const EAGLER_TUTORIAL = `<section class="eagler-intro glass"><div class="eagler-intro-glyph">${icon('file-box')}</div><div class="eagler-intro-copy"><span class="eyebrow">New Update!</span><h2>Eaglercraft is now build in!</h2><p>Flash Games ships a dedicated Minecraft launcher with free Eaglercraft clients. Here's how it works:</p><ul class="eagler-steps"><li><b>1</b> <span>Open the launcher — tap <strong>Eaglercraft</strong> in the sidebar, the <strong>Mine</strong> button at the very bottom on mobile, or the button below.</span></li><li><b>2</b> <span>Choose a client. 1.12.2 builds carry the most built-in mods; 1.8 builds are tuned for PVP; 26.3 has the most features</span></li><li><b>3</b> <span>Press <strong>Play</strong>. The first launch downloads the client (they're big — let it finish), after that it's instant and works fully offline. Play from anywhere, any time.</span></li></ul><div class="hero-actions"><button class="btn primary" data-route="eagler">${icon('blocks')} Open Eaglercraft launcher</button></div></div></section>`;

  function renderHome() {
    const target = $('#homeView'); if (!target) return; const featured = filteredGames(state.games)[0]; const recent = recentGames();
    if (!state.eaglerClients.length) ensureEaglerClients().then((list) => { if (state.route === 'home' && list.length) renderHome(); });
    target.innerHTML = featured ? `<section class="hero glass"><div><span class="eyebrow">FLASH GAMES</span><h1>Play <em>anything.</em></h1><p>Explore the real Offline HTML Games Pack, install games when you want them, and play them from your local browser cache.</p><div class="hero-actions"><button class="btn primary" data-game-action="play" data-game-id="${esc(featured.id)}">${icon('play')} Play Now</button><button class="btn" data-route="store">${icon('store')} Browse Store</button></div></div><div class="hero-art"><img loading="eager" src="${esc(gameCover(featured))}" alt="${esc(featured.name)}" onerror="this.onerror=null;this.src='./offline/logo.png'"><div class="live-pill"><i></i>${state.games.length.toLocaleString()} games available</div></div></section>${EAGLER_TUTORIAL}<section class="section"><div class="section-head"><div><span class="eyebrow">RECENTLY PLAYED</span><h2>Jump back in</h2><p>Your recent games, right where they belong.</p></div><button class="link-btn" data-route="library">Open Library ${icon('arrow-right')}</button></div><div class="game-grid">${recent.map((game) => gameCard(game, installedSet().has(game.id))).join('') || emptyState('No recent games yet', 'Play a game and it will appear here.', 'history')}</div></section>` : `${EAGLER_TUTORIAL}${emptyState('Loading games', 'Fetching the real catalogue from GitHub.', 'loader-circle')}`;
    refreshIcons(target);
  }

  // Library shows the catalogue entry when one exists, so an installed
  // game always carries its one true name, badge and cover.
  function libraryCard(game) {
    const url = game.rawUrl || game.url || '';
    const catalog = gamesUniverse().find((g) => g.id === game.id)
      || (url ? gamesUniverse().find((g) => (g.rawUrl || g.url) === url) : null);
    return gameCard(catalog || game, true);
  }

  function renderLibrary() { state.gamesSection = 'mine'; renderGames(); }

  /* ---------- games: one unified section (installed + catalogue) ---------- */

  function gamesSwitchHtml() {
    const mine = state.gamesSection === 'mine';
    return `<div class="games-switch glass" role="tablist" aria-label="Games sections">` +
      `<button class="${mine ? 'active' : ''}" data-games-section="mine">${icon('library-big')} <span>My games</span></button>` +
      `<button class="${mine ? '' : 'active'}" data-games-section="store">${icon('compass')} <span>All games</span></button></div>`;
  }

  function renderGames() {
    const target = $('#gamesView'); if (!target) return;
    if (state.gamesSection === 'store') { renderStore(); return; }
    target.dataset.storeMode = 'mine';
    const count = state.installed.length;
    const games = sortGames(state.installed);
    const shown = games.slice(0, GRID_BATCH);
    const rest = count - shown.length;
    target.innerHTML = `${gamesSwitchHtml()}<div class="page-head"><div><span class="eyebrow">MY GAMES</span><h1>Your games</h1><p>${count ? `${count} installed — every one cached locally and launched offline.` : 'Nothing installed yet — install once, play forever offline.'}</p></div><button class="btn" data-games-section="store">${icon('compass')} Browse all games</button></div><div class="game-grid">${shown.map((game) => libraryCard(game)).join('') || emptyState('Your library is empty', 'Install any game from the collection and it stays available offline.', 'library')}</div>${rest > 0 ? `<div class="load-more-wrap"><button class="btn" id="loadAllInstalled">${icon('chevrons-down')} Show ${rest} more</button></div>` : ''}`;
    refreshIcons(target);
    $('#loadAllInstalled')?.addEventListener('click', () => {
      target.querySelector('#loadAllInstalled')?.remove();
      target.querySelector('.game-grid').insertAdjacentHTML('beforeend', games.slice(GRID_BATCH).map((game) => libraryCard(game)).join(''));
    });
  }

  const MEGA_PACK_IDS = ['pack-everything', 'pack-offline-all', 'pack-online-all'];

  function packCard(pack) {
    const games = gamesUniverse();
    const resolved = window.FlashPacks ? window.FlashPacks.resolve(pack.id, games) : [];
    if (MEGA_PACK_IDS.includes(pack.id)) return packHeroCard(pack, resolved);
    const installed = installedSet();
    const have = resolved.filter((g) => installed.has(g.id)).length;
    const done = resolved.length > 0 && have === resolved.length;
    const installing = state.packInstalling && state.packInstalling[pack.id];
    const pct = installing ? Math.round((installing.done / Math.max(1, installing.total)) * 100) : Math.round((have / Math.max(1, resolved.length)) * 100);
    const covers = resolved.slice(0, 5).map((g) => `<img loading="lazy" src="${esc(gameCover(g))}" alt="" onerror="this.onerror=null;this.src='./offline/logo.png'">`).join('');
    const label = installing ? `Installing ${installing.done}/${installing.total}…` : done ? 'Installed' : `Install ${resolved.length} games`;
    const sizeNote = packSizeText(resolved);
    return `<article class="pack-card" data-pack-id="${esc(pack.id)}"><div class="pack-top"><span class="pack-icon">${icon(pack.icon || 'package')}</span><div><h3>${esc(pack.name)}</h3><small>${resolved.length} games • ${have} installed</small></div></div><p>${esc(pack.description || '')}</p><div class="pack-covers">${covers}<span>+${Math.max(0, resolved.length - 5)} more</span></div><div class="pack-progress"${done && !installing ? ' hidden' : ''}><i style="width:${pct}%"></i></div><div class="pack-actions"><button class="btn" data-pack-action="view">${icon('layout-list')}<span>View all</span></button><button class="btn ${done && !installing ? '' : 'primary'}" data-pack-action="install" ${installing ? 'disabled' : ''}>${installing ? icon('loader-circle') : done && !installing ? icon('check') : icon('download')}<span>${label}</span></button></div><small class="pack-size">${icon('hard-drive')} ${sizeNote}</small></article>`;
  }

  function packHeroCard(pack, resolved) {
    const installed = installedSet();
    const have = resolved.filter((g) => installed.has(g.id)).length;
    const done = resolved.length > 0 && have >= resolved.length;
    const installing = state.packInstalling && state.packInstalling[pack.id];
    const pct = installing ? Math.round((installing.done / Math.max(1, installing.total)) * 100) : Math.round((have / Math.max(1, resolved.length)) * 100);
    const recommended = pack.recommended;
    const zones = [...new Set(resolved.map((g) => g.zone))].slice(0, 3).join(' · ');
    const label = installing ? `Installing ${installing.done}/${installing.total}…` : done ? 'Installed' : `Install all ${resolved.length} games`;
    const sizeNote = packSizeText(resolved);
    return `<article class="pack-card pack-hero${recommended ? ' recommended' : ''}" data-pack-id="${esc(pack.id)}">${recommended ? `<span class="hero-tag">${icon('sparkles')} RECOMMENDED</span>` : ''}<div class="pack-glyph">${icon(pack.icon || 'archive')}</div><h3>${esc(pack.name)}</h3><p>${esc(pack.description || '')}</p><div class="pack-meta"><span>${resolved.length} games</span><span>·</span><span>${zones || 'Every zone'}</span><span>·</span><span>${have} installed</span></div><div class="pack-progress"${done && !installing ? ' hidden' : ''}><i style="width:${pct}%"></i></div><div class="pack-cta"><button class="btn primary" data-pack-action="install" ${installing ? 'disabled' : ''}>${installing ? icon('loader-circle') : icon('download')}<span>${label}</span></button><button class="btn" data-pack-action="view">${icon('layout-list')}<span>View</span></button></div><small class="pack-size">${icon('hard-drive')} ${esc(sizeNote)}</small></article>`;
  }

  function renderPacks() {
    const box = $('#packsGrid'); if (!box || !window.FlashPacks) return;
    const defs = window.FlashPacks.defs.filter((p) => !MEGA_PACK_IDS.includes(p.id));
    box.innerHTML = defs.map((p) => packCard(p)).join('');
    refreshIcons(box);
    const heroBox = $('#packHeroGrid');
    if (heroBox) {
      const order = MEGA_PACK_IDS.map((id) => window.FlashPacks.defs.find((p) => p.id === id)).filter(Boolean);
      heroBox.innerHTML = order.map((p) => packHeroCard(p, window.FlashPacks.resolve(p.id, gamesUniverse()))).join('');
      refreshIcons(heroBox);
    }
  }

  function paintPackProgress(packId) {
    const card = document.querySelector(`[data-pack-id="${packId}"]`);
    const prog = state.packInstalling && state.packInstalling[packId];
    if (!card || !prog) return;
    const bar = card.querySelector('.pack-progress > i');
    if (bar) bar.style.width = `${Math.round((prog.done / Math.max(1, prog.total)) * 100)}%`;
    const btn = card.querySelector('[data-pack-action="install"]');
    if (btn) { btn.innerHTML = `${icon('loader-circle')}<span>Installing ${prog.done}/${prog.total}…</span>`; refreshIcons(btn); }
  }

  function openPackDetail(packId) {
    if (!window.FlashPacks) return;
    const pack = window.FlashPacks.defs.find((p) => p.id === packId);
    if (!pack) return;
    document.getElementById('packDetailBackdrop')?.remove();
    const resolved = window.FlashPacks.resolve(pack.id, gamesUniverse());
    const installed = installedSet();
    const rows = resolved.map((g) => {
      const isIn = installed.has(g.id);
      const online = g.zone === 'LUMIN';
      const exclusive = g.source === 'Flash Exclusive' || g.zone === 'FLASH EXCLUSIVE';
      const canInstall = !online && !exclusive && !isIn;
      return `<div class="pack-detail-row" data-game-id="${esc(g.id)}"><img loading="lazy" src="${esc(gameCover(g))}" alt="" onerror="this.onerror=null;this.src='./offline/logo.png'"><span><strong>${esc(g.name)}</strong><small>${esc(g.category || 'Game')} • ${isIn ? 'Installed' : online ? 'Online' : exclusive ? 'Exclusive' : 'Not downloaded'}• ${esc(gameSizeText(g) || (Number(g.size) ? dlBytes(Number(g.size)) : ''))}</small></span><span class="pack-detail-actions"><button class="expand-action play" data-game-action="play">${icon('play')}<span>Play</span></button>${canInstall ? `<button class="expand-action" data-game-action="install">${icon('download')}<span>Get</span></button>` : ''}</span></div>`;
    }).join('');
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.id = 'packDetailBackdrop';
    backdrop.innerHTML = `<section class="modal-card pack-detail-modal" role="dialog" aria-modal="true" data-pack-id="${esc(pack.id)}"><div class="panel-head"><div><span class="eyebrow">GAME PACK</span><h2>${esc(pack.name)}</h2></div><button class="icon-btn" data-pack-close aria-label="Close">${icon('x')}</button></div><p class="panel-note">${esc(pack.description || '')} Every title below, one tap away.</p><div class="pack-detail-list">${rows || emptyState('Empty pack', 'No games resolved for this bundle right now.', 'package')}</div><div class="dialog-actions"><button class="btn primary" data-pack-action="install">${icon('download')} Install all ${resolved.length}</button></div></section>`;
    document.body.appendChild(backdrop);
    refreshIcons(backdrop);
    backdrop.addEventListener('click', (event) => {
      if (event.target === backdrop || event.target.closest('[data-pack-close]')) backdrop.remove();
    });
  }

  function refreshPackDetail() {
    const open = document.querySelector('#packDetailBackdrop [data-pack-id]');
    if (open && open.dataset.packId) openPackDetail(open.dataset.packId);
  }

  async function installPackFlow(packId) {
    if (!window.FlashPacks) return;
    state.packInstalling = state.packInstalling || {};
    if (state.packInstalling[packId]) return;
    state.packInstalling[packId] = { done: 0, total: 1 };
    renderPacks();
    try {
      toast('Installing pack', 'Downloading every game in the bundle…');
      const res = await window.FlashPacks.install(packId, gamesUniverse(), (done, total) => {
        state.packInstalling[packId] = { done, total };
        paintPackProgress(packId);
      });
      state.stats.installs += res.installed;
      saveStats();
      await loadInstalled();
      toast(res.failed ? 'Pack partially installed' : 'Pack installed', `${res.installed}/${res.total} games cached locally.` + (res.failed ? ` ${res.failed} failed.` : ''), res.failed ? 'info' : 'success');
    } catch (error) {
      toast('Pack failed', error.message || 'The bundle could not be installed.', 'error');
    }
    delete state.packInstalling[packId];
    updateStoreGrid(true);
  }

  function renderStore() {
    const target = $('#gamesView'); if (!target) return;
    if (state.gamesSection !== 'store') state.gamesSection = 'store';
    const categories = ['All', ...new Set(gamesUniverse().map((game) => game.category).filter(Boolean))];
    const key = `${categories.join('|')}#${state.storeSection}#${state.storeView}`;
    // The view's innerHTML may currently hold the "My games" section, so a
    // matching shell key alone is not enough — track what is on screen.
    if (target.dataset.shell !== key || target.dataset.storeMode !== 'store') {
      target.dataset.shell = key;
      target.dataset.storeMode = 'store';
      const collections = [['all', 'All games'], ['offline', 'Offline'], ['lumin', 'Online'], ['exclusive', 'Exclusives'], ['eagler', 'Eaglercraft']];
      const tools = `<div class="options-bar glass"><label class="search-bar">${icon('search')}<input id="storeSearch" value="${esc(state.query)}" placeholder="Search in this collection…"></label><span class="opt-label">${icon('sliders-horizontal')}</span><div class="opt-chips">${collections.map(([value, label]) => `<button class="opt-chip" data-collection="${value}">${esc(label)}</button>`).join('')}</div><label class="sort-control"><span>Sort</span><select id="storeSort"><option value="featured">Featured</option><option value="az">A–Z</option><option value="za">Z–A</option><option value="rating">Rating</option></select></label><span class="opt-actions"><button class="btn sm" id="toolsCustom">${icon('plus')}<span>From URL</span></button><button class="btn sm" id="toolsSync">${icon('refresh-cw')}<span>Sync games</span></button></span><div class="segmented" id="storeViewToggle"><button data-store-view="games">Games</button><button data-store-view="packs">Packs</button></div><span class="opt-count" id="storeCount"></span></div>${gamesSwitchHtml()}`;
      if (state.storeView === 'packs') {
        target.innerHTML = `<div class="page-head"><div><span class="eyebrow">ALL GAMES</span><h1>Game packs</h1><p>Curated mega-bundles on top, theme packs below. Everything installs locally with mirrored downloads.</p></div>${tools}</div><section class="packs-section"><div class="pack-hero-grid" id="packHeroGrid"></div><div class="pack-grid" id="packsGrid"></div></section>`;
      } else {
        target.innerHTML = `<div class="page-head"><div><span class="eyebrow">ALL GAMES</span><h1>Game collection</h1><p>${state.games.length.toLocaleString()} offline games, plus online, exclusives and clients.</p></div>${tools}</div><div class="filter-row">${categories.filter((c) => c !== 'All').map((category) => `<button class="filter" data-category="${esc(category)}">${esc(category)}</button>`).join('')}</div><div class="game-grid" id="storeGrid"></div><div id="storeSentinel" aria-hidden="true"></div>`;
      }
      $('#storeSearch').oninput = (event) => {
        state.query = event.target.value;
        clearTimeout(state.searchTimer);
        state.searchTimer = setTimeout(() => updateStoreGrid(true), 140);
      };
      $('#toolsCustom')?.addEventListener('click', () => window.FlashExtras?.openCustom?.());
      $('#toolsSync')?.addEventListener('click', async () => {
        const btn = $('#toolsSync');
        if (!btn || btn.disabled) return;
        btn.disabled = true;
        const original = btn.innerHTML;
        btn.innerHTML = `${icon('loader-circle')}<span>Syncing…</span>`;
        refreshIcons(btn);
        try {
          const result = await FlashData.syncGames();
          state.games = result.games || state.games;
          paintView(renderGames);
          if (state.route !== 'games' && state.route !== 'home') rerenderRoute();
          toast('Catalogue synced', `${(result.games || []).length.toLocaleString()} games are up to date.`, 'success');
        } catch (error) {
          toast('Sync failed', error.message || 'The catalogue could not be refreshed.', 'error');
        } finally {
          btn.disabled = false;
          btn.innerHTML = original;
          refreshIcons(btn);
        }
      });
      $('#storeSort').addEventListener('change', (event) => { state.sort = event.target.value; localStorage.setItem('flashgames.sort', state.sort); updateStoreGrid(true); });
      $$('[data-collection]', target).forEach((b) => b.addEventListener('click', async () => {
        state.storeSection = b.dataset.collection;
        state.category = 'All';
        renderStore();
        if (state.storeSection === 'all' || state.storeSection === 'lumin') {
          try { await ensureOnlineGames(); } catch {}
          if (state.route === 'games') updateStoreGrid(true);
        }
      }));
      $$('#storeViewToggle button').forEach((b) => b.addEventListener('click', () => { state.storeView = b.dataset.storeView; renderStore(); }));
      $$('.filter', target).forEach((b) => b.addEventListener('click', () => { state.category = b.dataset.category; updateStoreGrid(true); }));
      refreshIcons(target);
    }
    const sortSel = $('#storeSort');
    if (sortSel) sortSel.value = state.sort;
    const searchBox = $('#storeSearch');
    if (searchBox) searchBox.value = state.query;
    $$('[data-collection]', target).forEach((b) => b.classList.toggle('active', b.dataset.collection === state.storeSection));
    $$('#storeViewToggle button').forEach((b) => b.classList.toggle('active', b.dataset.storeView === state.storeView));
    if ((state.storeSection === 'all' || state.storeSection === 'lumin') && !state.onlineGames.length) {
      ensureOnlineGames().then(() => { if (state.route === 'games') updateStoreGrid(true); }).catch(() => {});
    }
    updateStoreGrid(true);
  }

  function updateStoreGrid(reset) {
    const packsOnly = state.storeView === 'packs';
    if (packsOnly) { renderPacks(); return; }
    const grid = $('#storeGrid'); if (!grid) return;
    const installed = installedSet();
    const st = gridState.store;
    if (reset) {
      st.items = storeGames();
      st.shown = 0;
      grid.innerHTML = '';
      $$('#gamesView .filter').forEach((b) => b.classList.toggle('active', b.dataset.category === state.category));
    }
    const next = st.items.slice(st.shown, st.shown + GRID_BATCH);
    st.shown += next.length;
    if (!st.shown) grid.innerHTML = emptyState('No games found', 'Try a different search or collection.', 'search-x');
    else if (next.length) grid.insertAdjacentHTML('beforeend', next.map((game) => gameCard(game, installed.has(game.id))).join(''));
    const count = $('#storeCount'); if (count) count.textContent = `${st.items.length.toLocaleString()} game${st.items.length === 1 ? '' : 's'}`;
    refreshIcons(grid);
    requestAnimationFrame(() => hydrateLuminImages(grid));
    observeSentinel('store', () => updateStoreGrid(false));
  }

  function renderMermaid(root = document) {
    if (!window.mermaid) return;
    const nodes = root.querySelectorAll('.mermaid');
    if (!nodes.length) return;
    mermaid.run({ nodes, suppressErrors: true }).then(() => {
      nodes.forEach(n => n.removeAttribute('data-mermaid-src'));
    }).catch(() => {
      nodes.forEach(n => {
        if (n.dataset.mermaidSrc) {
          n.textContent = n.dataset.mermaidSrc;
          n.classList.add('mermaid-fallback');
        }
      });
    });
  }

  function sizeSocialClearance() {
    const fill = document.querySelector('.social-fill');
    if (!fill) return;
    // Social is a true full-viewport tab. The compact topbar floats over it.
    fill.style.setProperty('--social-top', '0px');
    fill.style.setProperty('--social-bottom', '0px');
  }

  function renderSocial() {
    const target = $('#socialView'); if (!target) return;
    if (!target.dataset.shell) {
      target.dataset.shell = '1';
      target.innerHTML = `<div class="social-fill">
        <iframe id="conferFrame" src="./confer.html" title="Confer" allow="camera; microphone; display-capture; fullscreen" class="social-frame-active"></iframe>
        <iframe id="discordFrame" src="about:blank" title="Discord" allow="fullscreen" class="social-frame-hidden"></iframe>
        <section id="socialChatView" class="social-chat-view social-frame-hidden" aria-label="Chat"></section>
        <div class="social-pill" role="tablist" aria-label="Social">
          <button class="social-pill-btn" data-social-view="chat">${icon('messages-square')} <span>Chat</span></button>
          <button class="social-pill-btn" data-social-view="confer">${icon('message-square')} <span>Confer</span></button>
          <button class="social-pill-btn" data-social-view="discord"><svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.675 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.083.083 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .085-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.007-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 0 7.351-2.143 9.116-5.454a.07.07 0 0 1 .077.01c.14.11.29.212.44.3.05.027.104.007.134-.033a13.879 13.879 0 0 0 1.227 1.992.076.076 0 0 0 .085.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.43-4.61-.23-9.294-1.387-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/></svg> <span>Discord</span></button>
        </div>
      </div>`;
      $('#conferReload')?.remove(); // Remove old reload button if exists
      $$('#socialView .social-pill-btn').forEach((b) => b.addEventListener('click', () => { state.socialView = b.dataset.socialView; switchSocialView(); }));
      refreshIcons(target);
    }
    switchSocialView();
    requestAnimationFrame(sizeSocialClearance);
  }

function switchSocialView() {
    const conferFrame = $('#conferFrame');
    const discordFrame = $('#discordFrame');
    const chatView = $('#socialChatView');
    const pillBtns = $$('#socialView .social-pill-btn');
    if (!conferFrame || !discordFrame) return;
    const isChat = state.socialView === 'chat';
    if (chatView) chatView.classList.toggle('social-frame-hidden', !isChat);
    if (isChat) {
      conferFrame.classList.remove('social-frame-active');
      conferFrame.classList.add('social-frame-hidden');
      discordFrame.classList.remove('social-frame-active');
      discordFrame.classList.add('social-frame-hidden');
      window.FlashSocialChat?.mount?.(chatView);
    } else if (state.socialView === 'confer') {
      conferFrame.classList.remove('social-frame-hidden');
      conferFrame.classList.add('social-frame-active');
      discordFrame.classList.remove('social-frame-active');
      discordFrame.classList.add('social-frame-hidden');
      if (discordFrame.src !== 'about:blank') discordFrame.src = 'about:blank';
    } else {
      discordFrame.classList.remove('social-frame-hidden');
      discordFrame.classList.add('social-frame-active');
      conferFrame.classList.remove('social-frame-active');
      conferFrame.classList.add('social-frame-hidden');
      if (discordFrame.src === 'about:blank' || discordFrame.src.includes('about:blank')) {
        discordFrame.src = './discord.html';
      }
    }
    pillBtns.forEach((b) => b.classList.toggle('active', b.dataset.socialView === state.socialView));
  }

  function changeIcon(type) { if (type === 'add') return `<span class="change-icon log-add">${icon('plus')}</span>`; if (type === 'remove') return `<span class="change-icon log-remove">${icon('x')}</span>`; return `<span class="change-icon log-edit">${icon('hammer')}</span>`; }

  function updatesSwitchHtml() {
    const whatsnew = state.updatesView === 'whatsnew';
    return `<div class="games-switch updates-switch" role="tablist" aria-label="Updates sections">` +
      `<button class="${whatsnew ? 'active' : ''}" data-updates-view="whatsnew">${icon('history')} <span>What's New</span></button>` +
      `<button class="${whatsnew ? '' : 'active'}" data-updates-view="articles">${icon('newspaper')} <span>Articles</span></button></div>`;
  }

  function renderUpdates() {
    const target = $('#updatesView'); if (!target) return;
    if (state.updatesView === 'whatsnew') {
      target.innerHTML = `<div class="page-head"><div><span class="eyebrow">CHANGELOG</span><h1>What's New</h1><p>Current version ${esc(state.updates.version)}.</p></div></div>${updatesSwitchHtml()}<div class="timeline">${(state.updates.releases || []).map((release) => `<article class="release glass"><div class="release-head"><div><strong>${esc(release.version || 'Update')}</strong><span>${esc(release.date || release.published || '')}</span></div>${icon('sparkles')}</div><p>${esc(release.description || release.summary || '')}</p>${Array.isArray(release.changes) ? release.changes.map((change) => `<div class="log-item">${changeIcon(change.type || change.kind)}<span>${esc(change.text || change.description || change.title || change)}</span></div>`).join('') : ''}</article>`).join('') || emptyState('No changelog entries', 'Published releases will appear here.', 'history')}</div>`;
    } else {
      target.innerHTML = `<div class="page-head"><div><span class="eyebrow">ARTICLES</span><h1>Articles</h1><p>Guides, announcements, and deep dives.</p></div></div>${updatesSwitchHtml()}<div class="articles-grid">${(state.articles || []).map((article) => `<article class="article-card" data-article-id="${esc(article.id)}"><img class="article-cover" src="${esc(article.cover)}" alt="" loading="lazy"><span class="article-category">${esc(article.tags?.[0] || 'Article')}</span><div class="article-body"><div class="article-meta"><time class="article-date">${esc(article.date)}</time><span class="dot"></span><span class="article-author">${esc(article.author)}</span><span class="dot"></span><span class="article-read-time">${article.readTimeMinutes || 5} min read</span></div><h2 class="article-title">${esc(article.title)}</h2><div class="article-excerpt">${esc(article.subtitle || article.introduction?.slice(0, 180) || '')}…</div><div class="article-tags">${(article.tags || []).slice(1).map(t => `<span class="tag">${esc(t)}</span>`).join('')}</div></div></article>`).join('') || emptyState('No articles yet', 'Articles will appear here.', 'newspaper')}</div>`;
    }
    refreshIcons(target);
    $$('#updatesView .updates-switch button').forEach((b) => b.addEventListener('click', () => { state.updatesView = b.dataset.updatesView; renderUpdates(); }));
    $$('#updatesView .article-card').forEach((card) => card.addEventListener('click', () => openArticle(card.dataset.articleId)));
  }

  function renderArticleSections(sections) {
    if (!Array.isArray(sections)) return '';
    return sections.map(s => {
      switch (s.type) {
        case 'heading':
          return `<h${s.level || 2}>${esc(s.text)}</h${s.level || 2}>`;
        case 'paragraph':
          return `<p>${esc(s.text)}</p>`;
        case 'bulletList':
          return `<ul>${s.items.map(item => typeof item === 'string' ? `<li>${esc(item)}</li>` : `<li><strong>${esc(item.text)}</strong>${item.detail ? ` — ${esc(item.detail)}` : ''}</li>`).join('')}</ul>`;
        case 'numberedList':
          return `<ol>${s.items.map(item => `<li>${esc(item)}</li>`).join('')}</ol>`;
        case 'image':
          return `<figure><img src="${esc(s.src)}" alt="${esc(s.alt || '')}" loading="lazy"><figcaption>${esc(s.caption || '')}</figcaption></figure>`;
        case 'graph':
        case 'mermaid':
          return `<div class="article-graph"><h4>${esc(s.title)}</h4><pre class="mermaid" data-mermaid-src="${esc(s.data)}">${s.data}</pre></div>`;
        case 'quote':
          return `<blockquote><p>${esc(s.text)}</p><footer>— ${esc(s.author)}${s.role ? `, ${esc(s.role)}` : ''}</footer></blockquote>`;
        case 'code':
          return `<pre><code class="language-${esc(s.language || 'text')}">${esc(s.code)}</code></pre>`;
        case 'hr':
          return `<hr>`;
        case 'conclusion':
          let html = `<section class="article-conclusion"><p>${esc(s.text)}</p>`;
          if (s.cta) {
            html += `<button class="btn primary" data-cta="${esc(s.cta.action)}">${icon('arrow-right')} ${esc(s.cta.text)}</button>`;
          }
          html += `</section>`;
          return html;
        default:
          return '';
      }
    }).join('');
  }

  function openArticle(id) {
    const article = (state.articles || []).find(a => a.id === id);
    if (!article) return;
    const target = $('#updatesView'); if (!target) return;
    const readTime = article.readTimeMinutes || 5;
    const heroHtml = article.hero ? (article.hero.type === 'image' ? `<img class="article-cover-full" src="${esc(article.hero.src)}" alt="${esc(article.hero.alt || '')}" loading="eager">` : '') : `<img class="article-cover-full" src="${esc(article.cover)}" alt="" loading="eager">`;
    const sectionsHtml = renderArticleSections(article.sections);
    target.innerHTML = `<div class="page-head"><div><span class="eyebrow">ARTICLE</span><h1>${esc(article.title)}</h1><p>${esc(article.date)} • ${esc(article.author)} • ${readTime} min read</p></div><button class="btn" data-action="back-to-articles">${icon('arrow-left')} Back</button></div><div class="article-full"><div class="article-hero">${heroHtml}<div class="article-hero-meta"><div class="article-header-meta"><time>${esc(article.date)}</time><span class="dot"></span><span>${esc(article.author)}</span><span class="dot"></span><span>${readTime} min read</span></div><div class="article-header-tags">${(article.tags || []).map(t => `<span class="tag">${esc(t)}</span>`).join('')}</div>${article.subtitle ? `<p class="article-subtitle">${esc(article.subtitle)}</p>` : ''}<h1 class="article-full-title">${esc(article.title)}</h1></div></div><div class="article-content">${sectionsHtml}</div></div>`;
    refreshIcons(target);
    target.querySelector('[data-action="back-to-articles"]')?.addEventListener('click', () => { state.updatesView = 'articles'; renderUpdates(); });
    target.querySelector('[data-cta]')?.addEventListener('click', (e) => {
      const action = e.currentTarget.dataset.cta;
      if (action.startsWith('route:')) {
        setRoute(action.slice(6));
      }
    });
    if (window.mermaid) {
      const nodes = target.querySelectorAll('.mermaid');
      if (nodes.length) {
        mermaid.run({ nodes, suppressErrors: true }).then(() => {
          nodes.forEach(n => n.removeAttribute('data-mermaid-src'));
        }).catch(() => {
          nodes.forEach(n => {
            if (n.dataset.mermaidSrc) {
              n.textContent = n.dataset.mermaidSrc;
              n.classList.add('mermaid-fallback');
            }
          });
        });
      }
    } else {
      // Mermaid not loaded yet, retry after a short delay
      setTimeout(() => {
        if (window.mermaid) {
          const nodes = target.querySelectorAll('.mermaid');
          if (nodes.length) {
            mermaid.run({ nodes, suppressErrors: true }).catch(() => {
              nodes.forEach(n => {
                if (n.dataset.mermaidSrc) {
                  n.textContent = n.dataset.mermaidSrc;
                  n.classList.add('mermaid-fallback');
                }
              });
            });
          }
        }
      }, 500);
    }
  }

  function settingsGroup(title, eyebrow, rows, hint) {
    return `<section class="settings-group glass"><div class="group-head"><div><span class="eyebrow">${esc(eyebrow)}</span><h2>${esc(title)}</h2></div>${hint ? `<span class="ghost-hint">${esc(hint)}</span>` : ''}</div><div class="settings-list">${rows.join('')}</div></section>`;
  }

  function settingsToggleRow(cls, glyph, title, text) {
    return `<button class="setting-action ${cls}" type="button"><span>${icon(glyph)}<span><strong>${esc(title)}</strong><small>${esc(text)}</small></span></span><span class="switch"><i></i></span></button>`;
  }

  function settingsLinkRow(cls, glyph, title, text) {
    return `<button class="setting-action ${cls}" type="button"${cls === 'open-diagnostics' ? '' : ''}><span>${icon(glyph)}<span><strong>${esc(title)}</strong><small>${esc(text)}</small></span></span>${icon('chevron-right')}</button>`;
  }

  async function renderSettingsPage() {
    const target = $('#settingsView'); if (!target) return;
    const appearance = settingsGroup('Appearance', 'PERSONALIZE', [
      `<div class="setting"><div><strong>Interface</strong><small>Flash+ is the new launcher-first look. Classic restores the previous UI.</small></div><div class="segmented ui-choices"><button data-ui="v2">Flash+</button><button data-ui="classic">Classic</button></div></div>`,
      `<div class="setting"><div><strong>Theme</strong><small>Choose your interface.</small></div><div class="segmented theme-choices"><button data-theme="dark">Dark</button><button data-theme="light">Light</button><button data-theme="system">Auto</button></div></div>`,
      `<div class="setting"><div><strong>Accent</strong><small>Tints the page background and interface accents.</small></div><input class="color-picker accent-picker" type="color" value="${esc(state.accent)}"></div>`,
      `<div class="setting"><div class="range-wrap"><div><strong>Glass opacity</strong><small>How solid windows look.</small></div><output class="opacity-value">${state.opacity}%</output><input class="range opacity-range" type="range" min="35" max="85" value="${state.opacity}"></div></div>`,
      `<div class="setting"><div class="range-wrap"><div><strong>Blur</strong><small>Background softness.</small></div><output class="blur-value">${state.blur}px</output><input class="range blur-range" type="range" min="8" max="36" value="${state.blur}"></div></div>`
    ], 'Applies instantly — saved on this device.');
    const behavior = settingsGroup('Motion & Performance', 'INTERFACE', [
      settingsToggleRow('toggle-motion', 'sparkles', 'Motion', 'Enable interface animations.'),
      settingsToggleRow('toggle-performance', 'gauge', 'Performance mode', 'Reduce interface effects while playing.'),
      `<button class="setting-action optimizer-open" type="button"><span>${icon('sliders-horizontal')}<span><strong>Setup Optimizer</strong><small>Run guided device tests, pick a target FPS, and auto-tune to reach it.</small></span></span>${icon('chevron-right')}</button>`,
      `<button class="setting-action gamemode-open" type="button"><span>${icon('gamepad-2')}<span><strong>Game mode</strong><small>Preview and build your own in-game HUD — custom widgets, placement, and a shortcut.</small></span></span>${icon('chevron-right')}</button>`
    ], 'Reduced effects help low-end machines.');
    const storage = settingsGroup('Storage', 'THIS DEVICE', [
      `<div class="setting"><div class="range-wrap"><div><strong>Storage used</strong><small id="storageUsedText">Measuring your device…</small></div><div class="storage-meter"><i id="storageUsedBar"></i></div></div></div>`,
      `<div class="setting"><div><strong>Installed games</strong><small id="settingsInstalledCount">0 locally cached.</small></div>${icon('library-big')}</div>`,
      settingsLinkRow('clear-library', 'trash-2', 'Clear library', 'Removes every locally installed game file.')
    ], 'Browser quota for this origin.');
    const account = state.user
      ? `<div class="setting"><div><strong>Account</strong><small>${esc(state.user.email || 'Signed in')}${window.FlashAccess?.isDeveloper?.() ? ' — developer access' : ''}</small></div>${icon('user-round')}</div>`
      : `<div class="setting"><div><strong>Account</strong><small>Local mode — creations stay on this device.</small></div>${icon('user-round')}</div>`;
    const cloak = settingsGroup('Cloak', 'PRIVACY', [
      `<button class="setting-action cloak-launch" type="button"><span>${icon('ghost')}<span><strong>Launch in about:blank window</strong><small>The whole app runs natively in a blank window — no address bar.</small></span></span>${icon('chevron-right')}</button>`,
      `<button class="setting-action cloak-launch-tab" type="button"><span>${icon('app-window')}<span><strong>Launch in about:blank tab</strong><small>Same fully native app, as an ordinary browser tab.</small></span></span>${icon('chevron-right')}</button>`,
      settingsToggleRow('toggle-cloak-auto', 'ghost', 'Auto-launch cloak', 'Open the cloaked about:blank tab automatically on startup.'),
      `<div class="setting"><div><strong>How to leave</strong><small>Press Shift+End — or close the window — to clear the cloaked session.</small></div>${icon('ghost')}</div>`
    ], 'User-initiated. Nothing opens tabs on its own.');
    const help = settingsGroup('Help', 'SUPPORT', [
      account,
      settingsLinkRow('open-diagnostics', 'stethoscope', 'Diagnostics', 'System health and connectivity checks.'),
      settingsLinkRow('open-support', 'life-buoy', 'Support & feedback', 'Open the support form without leaving Flash+.'),
      settingsLinkRow('open-legal', 'file-text', 'Terms & privacy', 'Read the rules and how your data is handled.'),
      `<button class="setting-action" type="button" data-route="updates"><span>${icon('history')}<span><strong>Release notes</strong><small>What changed in each update.</small></span></span>${icon('chevron-right')}</button>`,
      `<button class="setting-action" type="button" data-route="games"><span>${icon('gamepad-2')}<span><strong>Browse Games</strong><small>Back to the library and store.</small></span></span>${icon('chevron-right')}</button>`
    ], 'Everything here stays on your device.');
    target.innerHTML = `<div class="page-head"><div><span class="eyebrow">SETTINGS</span><h1>Settings</h1><p>Personalize Flash Games, manage storage, and control how the app behaves on this device.</p></div></div><div class="settings-page">${appearance}${behavior}${storage}${cloak}${help}</div>`;
    applyPreferences();
    paintStorageMeter(target);
    refreshIcons(target);
    handleSettings();
  }

  async function paintStorageMeter(target) {
    const bar = target?.querySelector('#storageUsedBar'); const text = target?.querySelector('#storageUsedText');
    const count = target?.querySelector('#settingsInstalledCount');
    if (count) count.textContent = `${state.installed?.length || 0} locally cached.`;
    try {
      const estimate = await navigator.storage?.estimate?.();
      if (!estimate || !bar || !text) return;
      const used = estimate.usage || 0, quota = estimate.quota || 0;
      const pct = quota > 0 ? Math.min(100, Math.max(2, Math.round((used / quota) * 100))) : 0;
      const usedText = dlBytes(used) || '0 B';
      const quotaText = dlBytes(quota) ? ` of ${dlBytes(quota)}` : '';
      text.textContent = `${usedText}${quotaText} used`;
      bar.style.width = `${pct}%`;
    } catch {
      if (text) text.textContent = 'Storage info unavailable.';
      if (bar) bar.style.width = '0%';
    }
  }


  function memberLevel() { const minutes = Math.floor(state.stats.time / 60000); if (state.stats.played >= 100 || minutes >= 600) return 'Elite Member'; if (state.stats.played >= 30 || minutes >= 120 || state.stats.installs >= 30) return 'Dedicated Member'; if (state.stats.played >= 5 || state.stats.installs >= 5) return 'Active Member'; return 'New Member'; }

  function eaglerCard(client) {
    const installed = installedSet().has(client.id);
    const favourite = state.favourites.has(client.id);
    return `<article class="game-card eagler-card${client.featured ? ' featured' : ''}" data-game-id="${esc(client.id)}"><div class="cover"><img loading="lazy" src="${esc(gameCover(client))}" alt="${esc(client.name)}" onerror="this.onerror=null;this.src='./offline/logo.png'"><span class="badge">${client.featured ? 'Featured client' : `MC ${esc(client.version || '')}`}</span><div class="card-overlay"><button class="expand-action play" data-game-action="play" aria-label="Play ${esc(client.name)}">${icon('play')}<span>Play</span></button>${installed ? '' : `<button class="expand-action" data-game-action="install" aria-label="Install ${esc(client.name)}">${icon('download')}<span>Install</span></button>`}<button class="expand-action" data-game-action="favorite" aria-label="${favourite ? 'Remove favorite' : 'Favorite'} ${esc(client.name)}">${icon(favourite ? 'heart-off' : 'heart')}<span>${favourite ? 'Unfavorite' : 'Favorite'}</span></button>${installed ? `<button class="expand-action close" data-game-action="remove" aria-label="Remove ${esc(client.name)}">${icon('trash-2')}<span>Remove</span></button>` : ''}</div></div><div class="card-body"><div class="card-title"><h3>${esc(client.name)}</h3><span class="rating">${icon('blocks')} ${esc(client.version || 'MC')}</span></div><div class="meta"><span class="tag">Eaglercraft</span>${(client.tags || []).slice(0, 2).map((tag) => `<span class="tag">${esc(tag)}</span>`).join('')}</div><p class="card-desc">${esc(client.description || 'Eaglercraft client.')}</p></div></article>`;
  }

  /* ---------- Flash+ Eaglercraft launcher ---------- */
  const EG_FILTERS = [
    ['all', 'All clients', 'blocks'],
    ['vanilla', 'Vanilla', 'package'],
    ['clients', 'Custom clients', 'gamepad-2'],
    ['wasm', 'WASM builds', 'zap'],
    ['pvp', 'PvP ready', 'target'],
    ['installed', 'Installed', 'hard-drive']
  ];
  const egNova = { filter: 'all', query: '', sort: 'featured', selected: '', clients: [] };

  function egKind(client) {
    return /wasm/i.test(`${client.version || ''} ${(client.tags || []).join(' ')} ${client.name || ''}`) ? 'WASM' : 'JS';
  }
  function egType(client) {
    const text = `${client.name || ''} ${client.category || ''} ${(client.tags || []).join(' ')}`;
    if (/modpack|explore|lite|magic|skyfactory|tech|ultimate|aether|modded|forge|create|jei|immersive/i.test(text)) return 'modpack';
    if (/alpha|beta|\bb1\b|\bc0\.|\ba1\.|legacy|\bIR\b/i.test(text)) return 'legacy';
    if (/client|astra|pixel|tuff|resent|shadow|wurst|liquid|raven|entropy|aura|auto|camo|coder|dragon|gx |justin|kerosene|lambda|mega|nit |nova|pi |prism|reborn|solar|uwu|zeta|death|eclipse|evil|3tern|actx|eb |eagly|eclient|eaglerforge|eaglite/i.test(text)) return 'client';
    return 'vanilla';
  }
  function egFilterOk(client, filter = egNova.filter) {
    if (filter === 'installed') return installedSet().has(client.id);
    if (filter === 'wasm') return egKind(client) === 'WASM';
    if (filter === 'pvp') return /pvp|1\.8|1\.7/i.test(`${client.version || ''} ${(client.tags || []).join(' ')} ${client.name || ''}`);
    if (filter === 'clients') return egType(client) === 'client';
    if (filter === 'vanilla') return egType(client) === 'vanilla';
    return true;
  }
  function egTone(client) {
    let hash = 0;
    for (const ch of String(client.id || client.name || '')) hash = ((hash << 5) - hash + ch.charCodeAt(0)) | 0;
    return Math.abs(hash) % 6;
  }
  function egInitials(client) {
    const words = String(client.name || 'Eagler').replace(/[^a-z0-9 ]/gi, ' ').split(/\s+/).filter(Boolean);
    return (words.slice(0, 2).map((word) => word[0]).join('') || 'EG').toUpperCase();
  }
  function egArt(client, extra = '') {
    const cover = String(client.cover || client.image || '');
    const hasCover = cover && !/offline\/logo\.png/i.test(cover);
    return `<div class="eg-art eg-tone-${egTone(client)} ${extra}">` +
      `<span class="eg-initials">${esc(egInitials(client))}</span>` +
      (hasCover ? `<img loading="lazy" src="${esc(cover)}" alt="" onerror="this.remove()">` : '') +
      `<span class="eg-art-version">${esc(client.version || 'JAVA')}</span></div>`;
  }
  function egActions(client) {
    const installed = installedSet().has(client.id);
    const favourite = state.favourites.has(client.id);
    return `<div class="eg-actions">` +
      `<button class="btn primary eg-play" type="button" data-game-action="play" data-game-id="${esc(client.id)}">${icon('play')} Play</button>` +
      (installed ? '' : `<button class="btn eg-install" type="button" data-game-action="install" data-game-id="${esc(client.id)}">${icon('download')} Install</button>`) +
      `<button class="btn eg-fav" type="button" data-game-action="favorite" data-game-id="${esc(client.id)}">${icon(favourite ? 'heart-off' : 'heart')} ${favourite ? 'Saved' : 'Favorite'}</button>` +
      (installed ? `<button class="btn eg-remove" type="button" data-game-action="remove" data-game-id="${esc(client.id)}">${icon('trash-2')} Remove</button>` : '') +
      `</div>`;
  }
  function egxActions(client) {
    const installed = installedSet().has(client.id);
    const favourite = state.favourites.has(client.id);
    return `<div class="egx-actions">` +
      `<button class="btn primary egx-play" type="button" data-game-action="play" data-game-id="${esc(client.id)}">${icon('play')}<span>Play now</span></button>` +
      (installed
        ? `<button class="btn egx-remove" type="button" data-game-action="remove" data-game-id="${esc(client.id)}">${icon('trash-2')}<span>Remove</span></button>`
        : `<button class="btn egx-install" type="button" data-game-action="install" data-game-id="${esc(client.id)}">${icon('download')}<span>Install</span></button>`) +
      `<button class="btn egx-fav" type="button" data-game-action="favorite" data-game-id="${esc(client.id)}">${icon(favourite ? 'heart-off' : 'heart')}<span>${favourite ? 'Saved' : 'Favorite'}</span></button>` +
      `</div>`;
  }

  function egxDetail(client) {
    if (!client) {
      return `<section class="egx-detail egx-detail-empty"><div class="egx-empty-art">${icon('blocks')}</div><div class="egx-detail-body"><span class="egx-kicker">NO BUILD SELECTED</span><h2>Choose a version</h2><p>Select a client from the library to see its details and launch it.</p></div></section>`;
    }
    const installed = installedSet().has(client.id);
    const kind = egKind(client);
    const tags = (client.tags || []).filter((tag) => !/^(eaglercraft|wasm|js|java)$/i.test(tag)).slice(0, 4);
    return `<section class="egx-detail">` +
      `<div class="egx-detail-art">${egArt(client, 'eg-art-large')}<div class="egx-detail-shade"></div><span class="egx-runtime">${esc(kind)} build</span><span class="egx-cached${installed ? ' on' : ''}">${installed ? icon('check') + ' Cached' : 'First launch downloads'}</span></div>` +
      `<div class="egx-detail-body"><span class="egx-kicker">SELECTED BUILD <span>·</span> ${esc(kind)}</span>` +
      `<h2>${esc(client.name || 'Eaglercraft')}</h2><p>${esc(client.description || 'A community Eaglercraft client.')}</p>` +
      `<div class="eg-tags"><span>MC ${esc(client.version || 'JAVA')}</span><span>${esc(kind)}</span>${installed ? '<span class="eg-on">In your library</span>' : '<span>Remote</span>'}${tags.map((tag) => `<span>${esc(tag)}</span>`).join('')}</div>` +
      `<div class="egx-meta-grid"><span><b>${esc(client.version || '—')}</b><small>Minecraft</small></span><span><b>${installed ? 'Ready' : 'One click'}</b><small>${installed ? 'Offline cache' : 'Auto download'}</small></span><span><b>${esc(kind)}</b><small>Runtime</small></span></div>` +
      egxActions(client) +
      `<p class="egx-note">${icon('shield-check')} ${installed ? 'This client is cached on this device and launches offline.' : 'The first launch downloads this client from the public Eaglercraft archive, then it works offline.'}</p></div></section>`;
  }

  function egxRow(client) {
    const installed = installedSet().has(client.id);
    const kind = egKind(client);
    return `<button class="egx-row${egNova.selected === client.id ? ' selected' : ''}" type="button" data-eg-id="${esc(client.id)}" aria-pressed="${egNova.selected === client.id ? 'true' : 'false'}">` +
      `<span class="egx-row-art">${egArt(client, 'eg-art-thumb')}</span>` +
      `<span class="egx-row-copy"><strong>${esc(client.name)}</strong><small>MC ${esc(client.version || '—')} <i>·</i> ${esc(kind)}</small><span class="egx-row-tags">${(client.tags || []).filter((tag) => !/^(eaglercraft|js|wasm)$/i.test(tag)).slice(0, 2).map((tag) => `<em>${esc(tag)}</em>`).join('') || `<em>${esc(kind)}</em>`}</span></span>` +
      `<span class="egx-row-state">${installed ? icon('check') : icon('chevron-right')}</span></button>`;
  }

  function egFiltered() {
    const query = egNova.query.trim().toLowerCase();
    const list = egNova.clients.filter((client) => egFilterOk(client)
      && (!query || `${client.name || ''} ${client.version || ''} ${(client.tags || []).join(' ')}`.toLowerCase().includes(query)));
    if (egNova.sort === 'az') return list.sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), undefined, { numeric: true, sensitivity: 'base' }));
    if (egNova.sort === 'version') {
      const versionOf = (client) => String(client.version || '').split(/[^0-9]+/).filter(Boolean).map(Number);
      return list.sort((a, b) => {
        const av = versionOf(a), bv = versionOf(b);
        for (let i = 0; i < Math.max(av.length, bv.length); i++) { const d = (bv[i] || 0) - (av[i] || 0); if (d) return d; }
        return String(a.name || '').localeCompare(String(b.name || ''), undefined, { numeric: true, sensitivity: 'base' });
      });
    }
    return list.sort((a, b) => Number(!!b.featured) - Number(!!a.featured)
      || String(a.name || '').localeCompare(String(b.name || ''), undefined, { numeric: true, sensitivity: 'base' }));
  }

  function egxPaintList() {
    const container = document.querySelector('#egList');
    if (!container) return;
    const list = egFiltered();
    const count = document.querySelector('#egCount');
    if (count) count.textContent = `${list.length} of ${egNova.clients.length} builds`;
    container.innerHTML = list.length ? list.map(egxRow).join('') : `<div class="egx-empty">${icon('search-x')}<strong>No builds match</strong><span>Try another filter or search.</span></div>`;
    const detail = document.querySelector('#egDetail');
    if (list.length) {
      const selected = list.find((client) => client.id === egNova.selected) || list[0];
      if (selected.id !== egNova.selected) {
        egxSelect(selected.id, false);
        if (detail) { detail.innerHTML = egxDetail(selected); refreshIcons(detail); }
      } else if (detail) detail.innerHTML = egxDetail(selected);
    } else if (detail) {
      detail.innerHTML = egxDetail(null);
    }
    refreshIcons(container);
    if (detail) refreshIcons(detail);
  }

  function egxSelect(id, repaint = true) {
    const client = egNova.clients.find((item) => item.id === id);
    if (!client) return;
    egNova.selected = id;
    if (repaint) {
      const detail = document.querySelector('#egDetail');
      if (detail) { detail.innerHTML = egxDetail(client); refreshIcons(detail); }
    }
    document.querySelectorAll('.egx-row').forEach((row) => {
      const active = row.dataset.egId === id;
      row.classList.toggle('selected', active);
      row.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
  }

  function egxWire(target) {
    target.querySelector('#egSearch')?.addEventListener('input', (event) => { egNova.query = event.target.value; egxPaintList(); });
    target.querySelectorAll('[data-eg-filter]').forEach((button) => button.addEventListener('click', () => {
      egNova.filter = button.dataset.egFilter || 'all';
      target.querySelectorAll('[data-eg-filter]').forEach((item) => item.classList.toggle('active', item.dataset.egFilter === egNova.filter));
      egxPaintList();
    }));
    target.querySelector('#egSort')?.addEventListener('change', (event) => { egNova.sort = event.target.value; egxPaintList(); });
    const list = target.querySelector('#egList');
    list?.addEventListener('click', (event) => {
      const row = event.target.closest('[data-eg-id]');
      if (row) egxSelect(row.dataset.egId);
    });
    list?.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      const row = event.target.closest('[data-eg-id]');
      if (row) { event.preventDefault(); egxSelect(row.dataset.egId); }
    });
  }

  function renderEaglerNova(target, clients) {
    egNova.clients = clients;
    const selected = clients.find((client) => client.id === egNova.selected) || clients.find((client) => client.featured) || clients[0] || null;
    if (selected) egNova.selected = selected.id;
    const installed = clients.filter((client) => installedSet().has(client.id)).length;
    const wasm = clients.filter((client) => egKind(client) === 'WASM').length;
    const pvp = clients.filter((client) => egFilterOk(client, 'pvp')).length;
    const counts = Object.fromEntries(EG_FILTERS.map(([id]) => [id, clients.filter((client) => egFilterOk(client, id)).length]));
    const filters = EG_FILTERS.map(([id, label, glyph]) => `<button class="egx-filter${egNova.filter === id ? ' active' : ''}" type="button" data-eg-filter="${id}">${icon(glyph)}<span>${label}</span><b>${counts[id]}</b></button>`).join('');
    target.innerHTML = `<div class="egx-head"><div class="egx-title-wrap"><button class="egx-back" type="button" data-route="home">${icon('arrow-left')}<span>Home</span></button><span class="eyebrow">FLASH+ LAUNCHER</span><h1>Eaglercraft</h1><p>Every client from the All of Eaglercraft archive, in one clean launcher. Pick a build, press play, and your world is ready.</p></div><div class="egx-head-stats"><span><i></i><b>${clients.length}</b> builds</span><span><b>${installed}</b> cached</span><span><b>${pvp}</b> PvP</span><span><b>${wasm}</b> WASM</span></div></div>` +
      `<div class="egx-launcher"><section class="egx-versions"><div class="egx-list-head"><div><span class="eyebrow">INSTALLATIONS</span><h2>Version library</h2><p><span id="egCount">${clients.length} of ${clients.length} builds</span> · <span>${pvp} PvP ready</span></p></div><label class="egx-search">${icon('search')}<input id="egSearch" type="search" placeholder="Search clients…" autocomplete="off" spellcheck="false" value="${esc(egNova.query)}"></label></div>` +
      `<div class="egx-filter-row">${filters}</div><div class="egx-list-tools"><span>${icon('sliders-horizontal')} Refine</span><select id="egSort" aria-label="Sort clients"><option value="featured"${egNova.sort === 'featured' ? ' selected' : ''}>Featured</option><option value="az"${egNova.sort === 'az' ? ' selected' : ''}>A–Z</option><option value="version"${egNova.sort === 'version' ? ' selected' : ''}>Newest version</option></select></div>` +
      `<div class="egx-list" id="egList" role="listbox" aria-label="Eaglercraft versions"></div></section>` +
      `<div id="egDetail">${egxDetail(selected)}</div></div>` +
      `<div class="egx-foot">${icon('shield-check')} Builds come from the public All of Eaglercraft archive. Cache once, play offline forever.</div>`;
    refreshIcons(target);
    egxWire(target);
    egxPaintList();
  }

  async function renderEagler() {
    const target = $('#eaglerView'); if (!target) return;
    const clients = await ensureEaglerClients();
    if (document.documentElement.dataset.ui === 'classic') return renderEaglerClassic(target, clients);
    renderEaglerNova(target, clients);
  }

  async function renderEaglerClassic(target, clients) {
    const cached = state.installed.filter((g) => clients.some((c) => c.id === g.id)).length;
    const ordered = [...clients.filter((c) => c.featured), ...clients.filter((c) => !c.featured)];
    const featured = ordered[0] || null;
    target.innerHTML =
      `<div class="eagler-topbar"><button class="btn eagler-back" data-route="home">${icon('arrow-left')} <span>Back</span></button></div>` +
      `<div class="eagler-hero glass"><div class="eagler-hero-copy"><span class="eyebrow">MINECRAFT LAUNCHER</span><h1>Eagler<span>craft</span></h1>` +
      `<p>Every classic Eaglercraft client is right here — mods included, offline ready. Pick a client, press Play, and drop into a world.</p>` +
      `<div class="eagler-hero-stats"><span class="conn-status"><span class="conn-dot on"></span>${clients.length} clients installed</span><span class="conn-status">${cached ? `${cached} cached locally` : 'Nothing cached yet'}</span></div>` +
      `<div class="hero-actions"><button class="btn primary" data-route="library">${icon('library-big')} Manage in Library</button></div></div>` +
      `<div class="eagler-hero-art">${featured ? `<img loading="eager" src="${esc(gameCover(featured))}" alt="${esc(featured.name)}" onerror="this.onerror=null;this.src='./offline/logo.png'">` : icon('blocks')}<div class="live-pill"><i></i>${featured ? `Featured · ${esc(featured.name)}` : 'Eaglercraft'}</div></div></div>` +
      `<div class="eagler-help glass">${icon('lightbulb')}<div><strong>First launch downloads the client, then it's offline forever.</strong><p>WASM builds are heavyweight — let the download finish once. After that each client launches instantly and runs without internet. You can manage cached clients in your Library.</p></div></div>` +
      `<div class="game-grid eagler-grid">${ordered.map((c) => eaglerCard(c)).join('') || emptyState('No clients yet', 'Add clients to eagler/files/ and list them in eagler/clients.json.', 'blocks')}</div>`;
    refreshIcons(target);
  }

  function isVerifiedUser(){return !!(state.profile?.verified||state.profile?.isVerified||state.profile?.verificationStatus==='verified');}
  function canUseCloud(){return isVerifiedUser()||!!(window.FlashAccess&&window.FlashAccess.isDeveloper&&window.FlashAccess.isDeveloper());}
  function renderCloud(){
    const target=$('#cloudView');if(!target)return;
    const dev=!!(window.FlashAccess&&window.FlashAccess.isDeveloper&&window.FlashAccess.isDeveloper());
    if (window.FlashBridge && window.FlashBridge.prewarm) { try { window.FlashBridge.prewarm().catch(() => {}); } catch {} }
    const link=window.FlashBridge?window.FlashBridge.status():{mode:'direct'};
    const flashReady=!!(window.Flash&&window.Flash.attach);
    const connBadge='<span class="conn-status" title="'+esc(link.engineError || 'Cloud titles render through the Flash API tunnel')+'"><span class="conn-dot'+(flashReady?' on':'')+'"></span>Flash API'+(flashReady?' · ready':' · loads on play')+'</span>';
    if(!state.user&&!dev){target.innerHTML='<div class="page-head"><div><span class="eyebrow">CLOUD GAMING</span><h1>Restricted</h1><p>Sign in, or unlock with a developer code.</p></div>'+connBadge+'</div>'+emptyState('Sign in to use Cloud Gaming','Cloud gaming is available to verified accounts and developer codes.','cloud');refreshIcons(target);return;}
    if(!canUseCloud()){target.innerHTML='<div class="page-head"><div><span class="eyebrow">CLOUD GAMING</span><h1>Verification required</h1><p>Cloud gaming is reserved for verified accounts and developer codes.</p></div>'+connBadge+'</div><div class="empty glass">'+icon('badge-check')+'<h3>Get verified</h3><p>Your account is signed in, but verification has not been granted yet.</p></div>';refreshIcons(target);return;}
    const cloudGames=Array.isArray(window.FlashCloudGames)?window.FlashCloudGames:[];
    const headBadges='<div class="cloud-badges">'+connBadge+'<span class="conn-status" title="Cloud titles render through fp.js inside the player">In-browser tunnel</span><span class="conn-status">'+esc(String(cloudGames.length))+' titles</span></div>';
    const cards=cloudGames.length?'<div class="game-grid cloud-grid">'+cloudGames.map((game,idx)=>{let host='';try{host=new URL(game.url||'').hostname.replace(/^www\./,'');}catch{}return '<article class="game-card cloud-game-card"><div class="cover"><img loading="lazy" src="'+esc(game.cover||'./offline/logo.png')+'" alt="'+esc(game.name||'Cloud Game')+'" onerror="this.onerror=null;this.src=\'./offline/logo.png\'"><span class="badge">'+esc(host||'cloud')+'</span><span class="cloud-index">'+String(idx+1).padStart(2,'0')+'</span></div><div class="game-card-body"><h3>'+esc(game.name||'Cloud Game')+'</h3><p>'+esc(game.description||'Play in the cloud.')+'</p><div class="cloud-meta"><span class="tag">Cloud</span><span class="tag">'+esc(dev?'Developer':'Verified')+'</span></div><button class="play-btn" data-cloud-url="'+esc(game.url||'')+'">Play in Cloud</button></div></article>';}).join('')+'</div>':'<div class="empty glass">'+icon('cloud-lightning')+'<h3>No cloud games yet</h3><p>Cloud titles will appear here.</p></div>';
    target.innerHTML='<div class="page-head"><div><span class="eyebrow">CLOUD GAMING</span><h1>Cloud arcade</h1><p>'+(dev?'Developer access active.':'Verified access active.')+' Titles open through the Flash API tunnel inside the player.</p></div>'+headBadges+'</div>'+cards;
    refreshIcons(target);
  }
  function renderProfile() {
    const name = currentDisplayName();
    if ($('#profileName')) $('#profileName').textContent = name; if ($('#profileEmail')) $('#profileEmail').textContent = state.user?.email || 'Your Firebase profile will appear here.'; if ($('#headerName')) $('#headerName').textContent = name;
    setAvatar($('#profileAvatar'), currentPfp()); setAvatar($('#headerAvatar'), currentPfp()); if ($('#profileGames')) $('#profileGames').textContent = String(state.installed.length); if ($('#profileTotal')) $('#profileTotal').textContent = String(state.games.length);
    if ($('#signInBtn')) $('#signInBtn').hidden = !!state.user; if ($('#signOutBtn')) $('#signOutBtn').hidden = !state.user; if ($('#authStatus')) $('#authStatus').textContent = state.user ? `Signed in as ${state.user.email || name}.` : 'Firebase account data is used when you sign in.';
  }

  function renderStats() {
    const panel = $('#profilePanel'); if (!panel) return; let card = $('.stats-card', panel);
    if (!card) { card = document.createElement('div'); card.className = 'stats-card'; card.innerHTML = `<div class="panel-head"><div><span class="eyebrow">ACTIVITY</span><h2>Stats</h2></div></div><div class="stats-grid"><div><strong id="statPlayed">0</strong><span>Games played</span></div><div><strong id="statInstalls">0</strong><span>Installed</span></div><div><strong id="statTime">0m</strong><span>Time played</span></div><div><strong id="statMember">New Member</strong><span>Member level</span></div></div>`; $('.profile-stats', panel)?.after(card); }
    if ($('#statPlayed')) $('#statPlayed').textContent = String(state.stats.played); if ($('#statInstalls')) $('#statInstalls').textContent = String(state.stats.installs); if ($('#statTime')) $('#statTime').textContent = `${Math.floor(state.stats.time / 60000)}m`; if ($('#statMember')) $('#statMember').textContent = memberLevel(); refreshIcons(card);
  }

  function renderSettings() { applyPreferences(); refreshIcons($('#settingsPanel') || document); }
  async function renderAdmin() { const target = $('#adminView'); if (target) await window.FlashAdmin?.render(target, state.user, state.profile, toast); }

  function paintView(render) {
    // One broken render must never wedge the router or swallow clicks.
    try { render(); }
    catch (error) {
      console.warn('[Flash Games] view render failure:', error);
      try { toast('Section hiccup', 'That view failed to render — pressing another section keeps working.', 'warn'); } catch {}
    }
  }
  function syncNavCondense() {
    const y = window.scrollY || document.documentElement.scrollTop || 0;
    document.body.classList.toggle('nav-condensed', state.route === 'social' || y > 140);
  }

  function setRoute(route) {
    const legacy = { library: 'games', store: 'games' };
    if (legacy[route]) {
      state.gamesSection = route === 'library' ? 'mine' : 'store';
      route = legacy[route];
    }
    const valid = ['home', 'eagler', 'games', 'quickq', 'social', 'cloud', 'updates', 'admin', 'settings']; state.route = valid.includes(route) ? route : 'home';
    if (location.hash !== `#${state.route}`) history.replaceState(null, '', `#${state.route}`);
    $$('.view').forEach((view) => view.classList.toggle('active', view.dataset.view === state.route)); $$('.nav-item, .dock-item').forEach((button) => button.classList.toggle('active', button.dataset.route === state.route));
    document.body.classList.toggle('social-route', state.route === 'social');
    syncNavCondense();
    if (state.route === 'home') paintView(renderHome); if (state.route === 'eagler') paintView(renderEagler); if (state.route === 'games') paintView(renderGames); if (state.route === 'quickq') paintView(() => window.QuickQ?.render?.()); if (state.route === 'social') paintView(renderSocial); if (state.route === 'cloud') paintView(renderCloud); if (state.route === 'updates') paintView(renderUpdates); if (state.route === 'admin') paintView(renderAdmin); if (state.route === 'settings') paintView(renderSettingsPage);
    requestAnimationFrame(refreshNavIndicator);
    requestAnimationFrame(() => renderMermaid());
  }
  function refreshNavIndicator() { const nav = $('.desktop-nav'), active = $('.desktop-nav .nav-item.active'), indicator = $('.nav-indicator'); if (!nav || !active || !indicator) return; const a = active.getBoundingClientRect(), n = nav.getBoundingClientRect(); indicator.style.transform = `translate3d(${a.left - n.left}px,0,0)`; indicator.style.width = `${a.width}px`; }
  function openPanel(id) { const panel = document.getElementById(id); if (panel) panel.hidden = false; if (id === 'profilePanel') { renderProfile(); renderStats(); } if (id === 'settingsPanel') renderSettings(); refreshIcons(panel || document); }
  function closePanel(id) { const panel = document.getElementById(id); if (panel) panel.hidden = true; }
  function openSupport() {
    const backdrop = document.getElementById('supportBackdrop');
    if (!backdrop) return;
    backdrop.hidden = false;
    refreshIcons(backdrop);
    requestAnimationFrame(() => {
      const frame = document.getElementById('supportFrame');
      if (frame) frame.focus({ preventScroll: true });
    });
  }

  /* ---------- required legal acceptance ---------- */

  const LEGAL_KEY = 'flashgames.consent.v1';
  const LEGAL_FALLBACK_VERSION = '2026-11-07.2';
  let legalData = null;
  let legalLoad = null;

  function legalVersion() { return legalData?.version || LEGAL_FALLBACK_VERSION; }

  function legalAccepted() {
    try {
      const saved = JSON.parse(localStorage.getItem(LEGAL_KEY) || 'null');
      return saved?.version === legalVersion() && !!saved.acceptedAt;
    } catch { return false; }
  }

  function legalElements() {
    return {
      gate: document.getElementById('consentGate'),
      scroll: document.getElementById('consentScroll'),
      check: document.getElementById('consentCheck'),
      checkWrap: document.getElementById('consentCheckWrap'),
      accept: document.getElementById('consentAccept'),
      close: document.getElementById('consentClose')
    };
  }

  function hideLegal() {
    const { gate } = legalElements();
    if (gate) gate.hidden = true;
    document.body.classList.remove('consent-open');
  }

  function setLegalTab(name) {
    const gate = document.getElementById('consentGate');
    if (!gate) return;
    const key = name === 'privacy' ? 'privacy' : 'terms';
    gate.querySelectorAll('[data-legal-tab]').forEach((tab) => {
      const active = tab.dataset.legalTab === key;
      tab.classList.toggle('active', active);
      tab.setAttribute('aria-selected', active ? 'true' : 'false');
      tab.setAttribute('tabindex', active ? '0' : '-1');
    });
    gate.querySelectorAll('.consent-pane').forEach((pane) => { pane.hidden = pane.id !== `${key}Panel`; });
    const scroll = document.getElementById('consentScroll');
    try { scroll?.scrollTo({ top: 0 }); } catch {}
  }

  function legalSectionHtml(section) {
    const paragraphs = (section.paragraphs || []).map((text) => `<p>${esc(text)}</p>`).join('');
    const items = Array.isArray(section.items) && section.items.length
      ? `<ul>${section.items.map((text) => `<li>${esc(text)}</li>`).join('')}</ul>`
      : '';
    const contact = section.contact
      ? `<button class="btn primary consent-contact" type="button" data-open-support>Contact support</button>`
      : '';
    return `<section class="consent-section"><h3>${esc(section.heading || '')}</h3>${paragraphs}${items}${contact}</section>`;
  }

  function bindLegalTabs() {
    const gate = document.getElementById('consentGate');
    if (!gate) return;
    const tabs = [...gate.querySelectorAll('[data-legal-tab]')];
    tabs.forEach((tab, index) => {
      tab.addEventListener('click', () => setLegalTab(tab.dataset.legalTab));
      tab.addEventListener('keydown', (event) => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
        const target = tabs[next];
        setLegalTab(target.dataset.legalTab);
        target.focus();
      });
    });
  }

  function renderLegalData() {
    if (!legalData) return;
    const gate = document.getElementById('consentGate');
    const subtitles = document.getElementById('consentSubtitle');
    const summaryTitle = document.getElementById('consentSummaryTitle');
    const summaryText = document.getElementById('consentSummaryText');
    const loading = document.getElementById('legalLoading');
    const tabsBox = document.getElementById('legalTabs');
    const panesBox = document.getElementById('legalPanes');
    if (!gate || !tabsBox || !panesBox) return;
    const entries = Object.entries(legalData.documents || {});
    if (!entries.length) return;
    if (subtitles) subtitles.textContent = legalData.subtitle || '';
    if (summaryTitle) summaryTitle.textContent = legalData.summary?.title || '';
    if (summaryText) summaryText.textContent = legalData.summary?.text || '';
    if (loading) loading.hidden = true;
    tabsBox.innerHTML = entries.map(([key, doc], index) => `<button class="consent-tab${index === 0 ? ' active' : ''}" id="${key}Tab" type="button" role="tab" data-legal-tab="${key}" aria-selected="${index === 0 ? 'true' : 'false'}" aria-controls="${key}Panel"${index === 0 ? '' : ' tabindex="-1"'}>${esc(doc.label || key)}</button>`).join('');
    panesBox.innerHTML = entries.map(([key, doc], index) => `<section class="consent-policy consent-pane" id="${key}Panel" role="tabpanel" aria-labelledby="${key}Tab"${index === 0 ? '' : ' hidden'}><div class="consent-pane-head"><h2>${esc(doc.title || doc.label || key)}</h2><p class="consent-updated">${esc(legalData.updated || '')}</p></div>${(doc.sections || []).map(legalSectionHtml).join('')}</section>`).join('');
    const version = document.getElementById('legalVersion');
    if (version) version.textContent = `Version ${legalData.version} · Review anytime in Settings.`;
    const accept = document.getElementById('consentAccept');
    if (accept) accept.disabled = !document.getElementById('consentCheck')?.checked;
    bindLegalTabs();
    setLegalTab('terms');
  }

  function showLegalError(message) {
    const loading = document.getElementById('legalLoading');
    if (loading) {
      loading.hidden = false;
      loading.innerHTML = `<span>${esc(message || 'The terms could not be loaded.')}</span><button class="btn" type="button" data-legal-retry>Retry</button>`;
    }
    const accept = document.getElementById('consentAccept');
    if (accept) accept.disabled = true;
  }

  async function ensureLegalData(force = false) {
    if (legalData && !force) return legalData;
    if (legalLoad && !force) return legalLoad;
    legalLoad = fetch('./legal.json', { cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) throw new Error(`The terms could not be loaded (${response.status}).`);
        const data = await response.json();
        if (!data?.version || !data?.documents?.terms || !data?.documents?.privacy) throw new Error('The terms file is incomplete.');
        legalData = data;
        renderLegalData();
        return data;
      })
      .catch((error) => { showLegalError(error.message); throw error; })
      .finally(() => { legalLoad = null; });
    return legalLoad;
  }

  function showLegal(mode = 'required') {
    const { gate, scroll, checkWrap, accept, close } = legalElements();
    if (!gate) return;
    const review = mode === 'review';
    gate.dataset.mode = mode;
    gate.hidden = false;
    if (legalData) setLegalTab('terms');
    else ensureLegalData().catch(() => {});
    if (checkWrap) checkWrap.hidden = review;
    if (accept) { accept.hidden = review; accept.disabled = review || !legalData || !document.getElementById('consentCheck')?.checked; }
    if (close) close.hidden = !review;
    document.body.classList.add('consent-open');
    try { scroll?.scrollTo({ top: 0 }); } catch {}
    requestAnimationFrame(() => { try { (review ? close : scroll)?.focus({ preventScroll: true }); } catch {} });
  }

  function initLegal() {
    const { check, accept, close } = legalElements();
    if (!check || !accept) return;
    const sync = () => { accept.disabled = !legalData || !check.checked; };
    check.addEventListener('change', sync);
    accept.addEventListener('click', () => {
      if (!check.checked || !legalData) return;
      try { localStorage.setItem(LEGAL_KEY, JSON.stringify({ version: legalData.version, acceptedAt: new Date().toISOString() })); } catch {}
      hideLegal();
      toast('Terms accepted', 'You can review the terms any time from Settings.', 'success');
    });
    close?.addEventListener('click', hideLegal);
    document.getElementById('legalLoading')?.addEventListener('click', (event) => {
      if (!event.target.closest('[data-legal-retry]')) return;
      const loading = document.getElementById('legalLoading');
      if (loading) loading.textContent = 'Loading terms…';
      ensureLegalData(true).catch(() => {});
    });
    ensureLegalData().then(() => {
      if (!legalAccepted()) showLegal('required');
    }).catch(() => {});
    // While the legal gate is open, keep keyboard focus and shortcuts inside
    // it so the rest of the app cannot be used behind the overlay. The support
    // sheet sits above the gate, so let it receive keys while it is open.
    document.addEventListener('keydown', (event) => {
      const support = document.getElementById('supportBackdrop');
      if (support && !support.hidden) return;
      const gate = document.getElementById('consentGate');
      if (!gate || gate.hidden) return;
      if (event.key === 'Escape' && gate.dataset.mode === 'review') { hideLegal(); return; }
      if (!gate.contains(event.target)) event.stopImmediatePropagation();
      if (event.key !== 'Tab') return;
      const focusables = [...gate.querySelectorAll('button:not([disabled]), input:not([disabled]), [tabindex="0"]')]
        .filter((el) => !el.hidden && el.offsetParent !== null);
      if (!focusables.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (!gate.contains(event.target)) { event.preventDefault(); first.focus(); return; }
      if (event.shiftKey && event.target === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && event.target === last) { event.preventDefault(); first.focus(); }
    }, true);
    sync();
    if (!legalAccepted()) showLegal('required');
  }

  function openLegal() {
    showLegal('review');
  }

  /* ---------- advanced search: fuzzy, scored, filtered ---------- */

  const SEARCH_ZONES = [
    { id: 'all', label: 'Everything' }, { id: 'mine', label: 'Installed' }, { id: 'offline', label: 'Offline' },
    { id: 'exclusive', label: 'Exclusives' }, { id: 'eagler', label: 'Eaglercraft' }, { id: 'online', label: 'Online' }, { id: 'custom', label: 'Custom' }
  ];

  function searchZoneOk(game, zone, installed) {
    if (zone === 'all') return true;
    if (zone === 'mine') return installed.has(game.id);
    if (zone === 'offline') return game.zone !== 'LUMIN' && game.source !== 'Flash Exclusive';
    if (zone === 'exclusive') return game.source === 'Flash Exclusive' || game.zone === 'FLASH EXCLUSIVE';
    if (zone === 'eagler') return game.zone === 'EAGLECRAFT' || /eagler/i.test(`${game.name} ${game.category} ${(game.tags || []).join(' ')}`);
    if (zone === 'online') return game.zone === 'LUMIN';
    if (zone === 'custom') return game.zone === 'CUSTOM' || !!game.custom;
    return true;
  }

  function fuzzyScore(query, name) {
    const haystack = name.toLowerCase();
    if (!query) return 1;
    if (haystack === query) return 1000;
    if (haystack.startsWith(query)) return 900 - Math.min(200, haystack.length);
    const direct = haystack.indexOf(query);
    if (direct >= 0) return 700 - Math.min(400, direct) + (direct === 0 || /[\s\-_:.!]/.test(haystack[direct - 1]) ? 40 : 0);
    // subsequence walk with continuity bonus (maRetc -> "Mario Kart"-ish)
    let score = 0, cursor = -1, streak = 0, hit = 0;
    for (const ch of query) {
      const at = haystack.indexOf(ch, cursor + 1);
      if (at < 0) return 0;
      score += at === cursor + 1 ? 6 + streak : 3;
      streak = at === cursor + 1 ? Math.min(12, streak + 1) : 0;
      if (at === 0 || /[\s\-_:.!]/.test(haystack[at - 1] || '')) score += 12;
      cursor = at; hit += 1;
    }
    return Math.min(320, score + hit) - Math.min(160, (haystack.length - cursor) / 4);
  }

  function searchMatches() {
    const query = state.query.trim().toLowerCase();
    const zone = state.searchZone || 'all';
    const installed = installedSet();
    const universe = [
      ...gamesUniverse(),
      ...state.installed.filter((g) => !gamesUniverse().some((u) => u.id === g.id))
    ];
    const scored = [];
    for (const game of universe) {
      if (!searchZoneOk(game, zone, installed)) continue;
      const nameScore = fuzzyScore(query, game.name || game.title || '');
      const tagScore = fuzzyScore(query, game.category || '');
      const zoneScore = fuzzyScore(query, game.zone || '');
      const extra = query && `${(game.tags || []).join(' ')}`.toLowerCase().includes(query) ? 120 : 0;
      const best = Math.max(nameScore, tagScore * 0.6, zoneScore * 0.5, extra);
      if (best <= 0) continue;
      scored.push({ game, score: best + (installed.has(game.id) ? 45 : 0) });
    }
    scored.sort((a, b) => b.score - a.score || (a.game.name || '').localeCompare(b.game.name || '', undefined, { numeric: true }));
    return scored.slice(0, 48).map((entry) => entry.game);
  }

  window.addEventListener('resize', sizeSocialClearance, { passive: true });

  function renderSearchResults() {
    const target = $('#searchResults'); if (!target) return;
    const chips = $('#searchChips');
    if (chips) {
      chips.innerHTML = SEARCH_ZONES.map((z) => `<button class="search-chip ${((state.searchZone || 'all') === z.id) ? 'active' : ''}" data-search-zone="${z.id}">${esc(z.label)}</button>`).join('');
      $$('[data-search-zone]', chips).forEach((b) => b.addEventListener('click', () => { state.searchZone = b.dataset.searchZone; state.searchIndex = 0; renderSearchResults(); }));
    }
    const results = searchMatches();
    if (!results.length) { target.innerHTML = emptyState('No matches', state.query ? `Nothing matched “${esc(state.query)}”.` : 'Load more games from the collection first.', 'search-x'); refreshIcons(target); return; }
    state.searchIndex = Math.min(state.searchIndex, results.length - 1);
    const installed = installedSet();
    const top = state.query ? `<div class="search-group">Best match</div>` : `<div class="search-group">Start typing — results drop in instantly</div>`;
    target.innerHTML = top + results.map((game, index) => `<button class="search-result ${index === state.searchIndex ? 'active' : ''}" data-search-game="${esc(game.id)}"><img loading="lazy" src="${esc(gameCover(game))}" alt="" onerror="this.onerror=null;this.src='./offline/logo.png'"><span><strong>${esc(game.name)}</strong><small>${esc(game.category || game.zone || 'HTML Game')}${installed.has(game.id) ? ' · installed' : ''}</small></span>${geneIcon(game.zone)}${icon('arrow-up-right')}</button>`).join('');
    refreshIcons(target);
  }

  function geneIcon(zone) { return `<span class="search-zone">${icon(zone === 'LUMIN' ? 'wifi' : zone === 'EAGLECRAFT' ? 'blocks' : 'gamepad-2')}</span>`; }

  function openSearch() { const backdrop = $('#searchBackdrop'); if (!backdrop) return; backdrop.hidden = false; state.searchZone = state.searchZone || 'all'; if ($('#searchInput')) $('#searchInput').value = state.query; state.searchIndex = 0; renderSearchResults(); $('#searchInput')?.focus(); }
  async function loadInstalled() { state.installed = await FlashGamesStore.getAllCachedGames(); state.favourites = FlashGamesStore.getFavourites(); }

  function openPlayer(url, game) {
    const frame = $('#gameFrame');
    const overlay = $('#playerOverlay');
    if (!frame || !overlay || !url) return;
    try { window.FlashBridge?.reset?.(); } catch {}
    // Same-origin free playback, minus any way out of the app: no popups,
    // no top-level navigation. Games keep scripts, storage, forms, modals.
    frame.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms allow-modals allow-downloads allow-pointer-lock');
    frame.removeAttribute('srcdoc');
    if (state.objectUrl) URL.revokeObjectURL(state.objectUrl);
    state.objectUrl = url.startsWith('blob:') ? url : null;
    const recent = (() => {
      try { return JSON.parse(localStorage.getItem('flashgames.recent') || '[]'); }
      catch { return []; }
    })();
    if (game?.id) {
      localStorage.setItem('flashgames.recent', JSON.stringify([
        game.id,
        ...recent.filter((id) => id !== game.id)
      ].slice(0, 12)));
    }
    state.playerGame = game || null;
    state.playerUrl = url;
    ghBeginGame(game, url);
    frame.src = url;
    frame.setAttribute('data-last-src', url);
    ghEnsure();
    ghSync();
    overlay.hidden = false;
    document.body.classList.add('player-open');
    watchLiveAccess(state.user);
    checkLiveAccess();
    state.stats.played += 1;
    state.gameStartedAt = Date.now();
    saveStats();
    refreshIcons(overlay);
  }

  // Online (Lumin) games are NEVER streamed directly. They are downloaded
  // through the install pipeline, cached locally, and played from the
  // cached copy. If caching fails, the player sees an error — no fallback
  // to remote playback, no offline-catalogue substitution.
  async function playOnlineGame(game) {
    if (!game) return;
    toast('Preparing online game', `Caching ${game.name} for local playback…`);
    try {
      await ensureOnlineGames();
      const cached = await FlashGamesStore.getCachedGame(game.id)
        .catch(() => null)
        || await FlashGamesStore.getCachedGame(`online-${game.luminId}`).catch(() => null);
      if (cached?.html) {
        openPlayer(await FlashGamesStore.launch(cached), game);
        return;
      }
      const value = await window.Lumin.getGameUrl(game.luminId);
      const remote = typeof value === 'string' ? value : value?.url;
      if (!remote) throw new Error('The provider did not return a playable file.');
      await trackDownload(game, (progress) => FlashGamesStore.install({ ...game, url: remote, rawUrl: remote }, progress));
      state.stats.installs += 1;
      saveStats();
      await loadInstalled();
      const stored = await FlashGamesStore.getCachedGame(game.id).catch(() => null)
        || await FlashGamesStore.getCachedGame(`online-${game.luminId}`).catch(() => null)
        || { ...game, rawUrl: remote, url: remote };
      openPlayer(await FlashGamesStore.launch(stored), game);
    } catch (error) {
      toast('Could not play online game', error.message || 'The game could not be cached for local playback.', 'error');
    }
  }

  async function playGame(game) {
    if (game?.zone === 'LUMIN') return playOnlineGame(game);
    if (!game) return;
    try {
      let installed = await FlashGamesStore.getCachedGame(game.id);
      if (!installed) {
        toast('Preparing game', `Downloading ${game.name} for local playback…`);
        await trackDownload(game, (progress) => FlashGamesStore.install(game, progress));
        installed = await FlashGamesStore.getCachedGame(game.id);
        state.stats.installs += 1;
        saveStats();
        await loadInstalled();
      }
      const url = await FlashGamesStore.launch(installed || game);
      openPlayer(url, game);
    } catch (error) {
      toast('Could not open game', error.message || 'The game could not be downloaded.', 'error');
    }
  }

  function closePlayer() { const overlay = $('#playerOverlay'), frame = $('#gameFrame'); if (state.gameStartedAt) { state.stats.time += Math.max(0, Date.now() - state.gameStartedAt); state.gameStartedAt = 0; saveStats(); } if (frame) { frame.removeAttribute('sandbox'); frame.removeAttribute('srcdoc'); frame.src = 'about:blank'; } try { window.FlashBridge?.reset?.(); } catch {} if (overlay) overlay.hidden = true; document.body.classList.remove('player-open');
  const conferWin = document.getElementById('conferWindow'); if (conferWin) conferWin.remove();
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); if (state.objectUrl) { URL.revokeObjectURL(state.objectUrl); state.objectUrl = null; }
  stopLiveAccessWatch();
  ghEndGame(); state.playerGame = null; state.playerUrl = ''; ghSync(); }

  /* ---------- Ultra Game DevTools ---------- */
  function isUltraUser() { return state.profile?.ultra === true; }
  function ghStore(scope) { try { return scope === 'session' ? sessionStorage : localStorage; } catch { return null; } }
  function ghPanel() { return document.getElementById('gameHacksPanel'); }
  const GH_OWNERS_KEY = 'flashgames.devtools.owners.v1';
  const GH_INSPECT_LIMIT = 250000;
  const GH_APP_KEY = /^flashgames\./i;

  function ghGameKey() { return String(state.ghGameId || ''); }
  function ghExpandedSet() { if (!(state.ghExpanded instanceof Set)) state.ghExpanded = new Set(); return state.ghExpanded; }
  function ghOwners() {
    try {
      const value = JSON.parse(localStorage.getItem(GH_OWNERS_KEY) || 'null') || {};
      const map = (side) => side && typeof side === 'object' && !Array.isArray(side) ? side : {};
      return { version: 1, local: map(value.local), session: map(value.session) };
    } catch {
      return { version: 1, local: {}, session: {} };
    }
  }
  function ghSaveOwners(owners) { try { localStorage.setItem(GH_OWNERS_KEY, JSON.stringify(owners)); } catch {} }
  function ghOwnKey(scope, key, gameId = state.ghGameId) {
    if (!key || !gameId || GH_APP_KEY.test(key)) return;
    const side = scope === 'session' ? 'session' : 'local';
    const owners = ghOwners();
    if (owners[side][key] === gameId) return;
    owners[side][key] = gameId;
    ghSaveOwners(owners);
  }
  function ghUnownKey(scope, key) {
    const side = scope === 'session' ? 'session' : 'local';
    const owners = ghOwners();
    if (!owners[side][key]) return;
    delete owners[side][key];
    ghSaveOwners(owners);
  }
  function ghOwnedKeys(scope) {
    const store = ghStore(scope), gameId = ghGameKey();
    if (!store || !gameId) return [];
    const owners = ghOwners()[scope === 'session' ? 'session' : 'local'] || {};
    const keys = [];
    for (let i = 0; i < store.length; i++) {
      const key = store.key(i);
      if (!key || GH_APP_KEY.test(key) || owners[key] !== gameId) continue;
      keys.push(key);
    }
    return keys.sort((a, b) => a.localeCompare(b));
  }
  function ghSnapshot(store) {
    const map = new Map();
    if (!store) return map;
    for (let i = 0; i < store.length; i++) {
      const key = store.key(i);
      if (!key) continue;
      map.set(key, String(store.getItem(key) ?? ''));
    }
    return map;
  }
  function ghNameMatches(key) {
    const game = state.playerGame;
    if (!game) return false;
    const clean = (value) => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const k = clean(key), id = clean(game.id), name = clean(game.name);
    return (id.length >= 4 && k.includes(id)) || (name.length >= 5 && k.includes(name));
  }
  function ghAttribute() {
    const gameId = state.ghGameId;
    if (!gameId) return;
    const owners = ghOwners();
    let dirty = false;
    for (const scope of ['local', 'session']) {
      const store = ghStore(scope), baseline = state.ghBaseline?.[scope];
      if (!store) continue;
      for (let i = 0; i < store.length; i++) {
        const key = store.key(i);
        if (!key || GH_APP_KEY.test(key)) continue;
        const value = String(store.getItem(key) ?? '');
        const changed = baseline ? (!baseline.has(key) || baseline.get(key) !== value) : false;
        if ((changed || ghNameMatches(key)) && owners[scope][key] !== gameId) {
          owners[scope][key] = gameId;
          dirty = true;
        }
      }
    }
    if (dirty) ghSaveOwners(owners);
  }
  function ghBeginGame(game, url) {
    state.ghGameId = String(game?.id || game?.name || url || '');
    state.ghBaseline = { local: ghSnapshot(ghStore('local')), session: ghSnapshot(ghStore('session')) };
    state.ghExpanded = new Set();
    state.ghIdbCache = null;
    ghAutoIdbGame = '';
    ghAttribute();
    const panel = ghPanel();
    if (!panel) return;
    ghHideDetail(panel);
    panel.dataset.scope = 'local';
    panel.querySelectorAll('[data-gh-scope]').forEach((item) => item.classList.toggle('active', item.dataset.ghScope === 'local'));
    const search = panel.querySelector('#ghSearch');
    if (search) search.value = '';
    const add = panel.querySelector('#ghAdd');
    if (add) add.hidden = true;
    ghRender();
  }
  function ghEndGame() {
    ghAttribute();
    state.ghBaseline = null;
    state.ghGameId = '';
    state.ghExpanded = new Set();
    state.ghIdbCache = null;
    ghAutoIdbGame = '';
    const panel = ghPanel();
    if (panel) { ghHideDetail(panel); panel.hidden = true; }
  }
  function ghOnStorage(event) {
    if (!state.ghGameId || !event.key || GH_APP_KEY.test(event.key)) return;
    let scope = 'local';
    try { if (event.storageArea === sessionStorage) scope = 'session'; } catch {}
    ghOwnKey(scope, event.key);
    const panel = ghPanel();
    if (panel && !panel.hidden && panel.dataset.scope === scope && !panel.querySelector('.gh-row.open')) ghRender();
  }

  /* ---------- value inspection ---------- */
  function ghBytesFromBinary(binary) {
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i) & 255;
    return bytes;
  }
  function ghUtf8(bytes) {
    try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { return ''; }
  }
  function ghPrintable(text) {
    if (!text) return 0;
    let good = 0, total = 0;
    for (const char of text) {
      const code = char.codePointAt(0);
      total += 1;
      if (code === 9 || code === 10 || code === 13 || (code >= 32 && code !== 127)) good += 1;
    }
    return total ? good / total : 0;
  }
  function ghHexPreview(bytes) {
    return Array.from(bytes.slice(0, 160)).map((byte) => byte.toString(16).padStart(2, '0')).join(' ');
  }
  function ghB64Bytes(text) {
    const clean = String(text).replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/');
    const padded = clean + '='.repeat((4 - clean.length % 4) % 4);
    return ghBytesFromBinary(atob(padded));
  }
  function ghHexBytes(text) {
    const clean = text.replace(/^0x/i, '');
    const bytes = new Uint8Array(clean.length / 2);
    for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
    return bytes;
  }
  function ghJwt(text) {
    const match = /^([A-Za-z0-9_-]{8,})\.([A-Za-z0-9_-]{8,})\.([A-Za-z0-9_-]*)$/.exec(text);
    if (!match) return null;
    try {
      const decode = (part) => JSON.parse(ghUtf8(ghB64Bytes(part)));
      const header = decode(match[1]), payload = decode(match[2]);
      return {
        kind: 'JWT', chain: ['JWT', 'JSON'],
        preview: `Header\n${JSON.stringify(header, null, 2)}\n\nPayload\n${JSON.stringify(payload, null, 2)}`,
        note: 'JWT header and payload decoded. The signature is not verified.'
      };
    } catch { return null; }
  }
  function ghHex(text) {
    const match = /^(?:0x)?([0-9a-f]{8,})$/i.exec(text);
    if (!match || match[1].length % 2) return null;
    const bytes = ghHexBytes(match[1]);
    const decoded = ghUtf8(bytes);
    if (decoded && ghPrintable(decoded) > .85) {
      return { kind: 'Hex', chain: ['Hex'], preview: decoded, note: 'Decoded hexadecimal bytes to text.' };
    }
    return { kind: 'Hex', chain: ['Hex', 'Binary'], preview: ghHexPreview(bytes), note: 'Hexadecimal bytes; no readable text encoding.' };
  }
  function ghBase64(text, depth) {
    if (text.length < 8 || text.length % 4 === 1 || /[^A-Za-z0-9+/=_-]/.test(text)) return null;
    if (/^[0-9a-f]+$/i.test(text)) return null;
    if (text.length < 16 && !text.includes('=')) return null;
    let bytes;
    try { bytes = ghB64Bytes(text); } catch { return null; }
    if (!bytes.length) return null;
    const decoded = ghUtf8(bytes);
    if (decoded && ghPrintable(decoded) > .85) {
      const inner = ghInspect(decoded, depth + 1);
      const nested = inner.kind !== 'Text' && inner.kind !== 'Empty' && inner.kind !== 'Opaque';
      return {
        kind: 'Base64',
        chain: ['Base64', ...(nested ? inner.chain : [])],
        preview: nested ? inner.preview : decoded,
        note: `Decoded Base64 to UTF-8.${nested ? ` Nested format: ${inner.chain.join(' → ')}.` : ''}`
      };
    }
    const hasRange = /[A-Z]/.test(text) && /[a-z]/.test(text) && /\d/.test(text);
    if (text.includes('=') || hasRange) {
      return {
        kind: 'Base64', chain: ['Base64', 'Binary'], preview: ghHexPreview(bytes),
        note: 'Base64 decoded to binary data. It may be compressed or encrypted; no decryption key is available here.'
      };
    }
    return null;
  }
  function ghInspect(raw, depth = 0) {
    const text = String(raw ?? '');
    if (!text) return { kind: 'Empty', chain: ['Empty'], preview: '(empty value)', note: '' };
    if (text.length > GH_INSPECT_LIMIT) {
      return { kind: 'Large', chain: ['Large'], preview: text.slice(0, 12000), note: `Value is ${text.length.toLocaleString()} characters; auto-decoding is paused for very large values.` };
    }
    const trimmed = text.trim();
    if (!trimmed) return { kind: 'Text', chain: ['Text'], preview: text, note: '' };
    if (depth > 2) return { kind: 'Text', chain: ['Text'], preview: text, note: '' };

    if (/^[\[{]/.test(trimmed)) {
      try {
        const parsed = JSON.parse(trimmed);
        return { kind: 'JSON', chain: ['JSON'], preview: JSON.stringify(parsed, null, 2), note: 'Valid JSON, pretty-printed.' };
      } catch {}
    }
    if (/^"/.test(trimmed)) {
      try {
        const parsed = JSON.parse(trimmed);
        if (typeof parsed === 'string' && parsed !== trimmed) {
          const inner = ghInspect(parsed, depth + 1);
          if (inner.kind !== 'Text' && inner.kind !== 'Empty') {
            return { kind: inner.kind, chain: ['JSON string', ...inner.chain], preview: inner.preview, note: inner.note };
          }
        }
      } catch {}
    }

    const jwt = ghJwt(trimmed);
    if (jwt) return jwt;

    if (/%[0-9a-f]{2}/i.test(trimmed)) {
      try {
        const decoded = decodeURIComponent(trimmed.replace(/\+/g, ' '));
        if (decoded && decoded !== trimmed) {
          const inner = ghInspect(decoded, depth + 1);
          const nested = inner.kind !== 'Text' && inner.kind !== 'Empty' && inner.kind !== 'Opaque';
          return {
            kind: 'URL', chain: ['URL', ...(nested ? inner.chain : [])],
            preview: nested ? inner.preview : decoded,
            note: `Decoded URL encoding.${nested ? ` Nested format: ${inner.chain.join(' → ')}.` : ''}`
          };
        }
      } catch {}
    }

    if (/&(?:#\d+|#x[0-9a-f]+|[a-z][a-z0-9]+);/i.test(trimmed)) {
      const area = document.createElement('textarea');
      area.innerHTML = trimmed;
      if (area.value !== trimmed) return { kind: 'HTML', chain: ['HTML entities'], preview: area.value, note: 'Decoded HTML entities.' };
    }

    const hex = ghHex(trimmed);
    if (hex) return hex;

    const base64 = ghBase64(trimmed, depth);
    if (base64) return base64;

    if (text.length >= 32 && !/\s/.test(text) && /^[A-Za-z0-9+/=_-]+$/.test(text)) {
      return { kind: 'Opaque', chain: ['Opaque'], preview: text, note: 'No supported encoding detected; this looks high-entropy. It may be encrypted or a random token.' };
    }
    return { kind: 'Text', chain: ['Text'], preview: text, note: '' };
  }
  function ghBadgeClass(label) {
    const value = String(label).toLowerCase();
    if (value.includes('json')) return 'json';
    if (value.includes('base64')) return 'base64';
    if (value.includes('jwt')) return 'jwt';
    if (value.includes('url')) return 'url';
    if (value.includes('html')) return 'html';
    if (value.includes('hex') || value.includes('binary')) return 'hex';
    if (value.includes('opaque')) return 'opaque';
    return 'text';
  }
  function ghBadges(info) {
    return info.chain.map((label) => `<span class="gh-badge gh-${ghBadgeClass(label)}">${esc(label)}</span>`).join('');
  }
  function ghCopy(text, label) {
    const done = () => toast('Copied', label, 'success');
    const fallback = () => {
      const area = document.createElement('textarea');
      area.value = text;
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      try { document.execCommand('copy'); done(); } catch {}
      area.remove();
    };
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(done).catch(fallback);
    else fallback();
  }

  function ghKeys() {
    const panel = ghPanel();
    if (!panel) return [];
    const scope = panel.dataset.scope === 'session' ? 'session' : 'local';
    const store = ghStore(scope);
    if (!store) return [];
    const needle = String(panel.querySelector('#ghSearch')?.value || '').toLowerCase();
    return ghOwnedKeys(scope).filter((key) => {
      if (!needle) return true;
      if (key.toLowerCase().includes(needle)) return true;
      const value = String(store.getItem(key) ?? '');
      return value.toLowerCase().includes(needle) || ghInspect(value).preview.toLowerCase().includes(needle);
    });
  }
  const GH_IDB_SKIP = /^(firebaseLocalStorageDb|flashgames-library|UnityCache)$/i;
  const GH_IDB_MAX_ROWS = 120;
  let ghIdbLoading = false;
  let ghAutoIdbGame = '';

  function ghIdbOpen(name) {
    return new Promise((resolve, reject) => {
      let req;
      try { req = indexedDB.open(name); } catch (error) { reject(error); return; }
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error('Could not open this database.'));
      req.onblocked = () => reject(new Error('This database is blocked by another tab.'));
    });
  }
  function ghIdbKey(key) { try { return typeof key === 'string' ? key : JSON.stringify(key); } catch { return String(key); } }
  function ghIdbBytes(value) {
    if (value instanceof ArrayBuffer) return new Uint8Array(value);
    if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    return null;
  }
  function ghIdbStrings(bytes) {
    const out = [];
    let run = '';
    const push = () => { if (run.length >= 4) out.push(run); run = ''; };
    for (const byte of bytes) {
      if (byte === 9 || byte === 10 || byte === 13 || (byte >= 32 && byte < 127)) run += String.fromCharCode(byte);
      else push();
      if (out.length >= 80) break;
    }
    push();
    return out;
  }
  function ghIdbBinaryInfo(bytes) {
    if (bytes.length > 2000000) {
      return { kind: 'Binary', chain: ['Binary'], preview: `Binary value · ${bytes.length.toLocaleString()} bytes\nPreview skipped to keep DevTools responsive.`, note: 'Large binary value.' };
    }
    const utf = ghUtf8(bytes);
    const clean = utf && ghPrintable(utf) > .9 ? utf : '';
    const runs = clean ? [] : ghIdbStrings(bytes);
    const preview = clean || (runs.length ? `Readable strings\n${runs.join('\n')}\n\nHex preview\n${ghHexPreview(bytes)}` : `Hex preview\n${ghHexPreview(bytes)}`);
    return {
      kind: clean ? 'Text' : 'Binary', chain: clean ? ['Text'] : ['Binary'],
      preview: preview.slice(0, 14000),
      note: clean ? `Decoded UTF-8 · ${bytes.length.toLocaleString()} bytes` : `${bytes.length.toLocaleString()} bytes · readable strings and hex preview`
    };
  }
  async function ghIdbInfo(value) {
    if (typeof Blob !== 'undefined' && value instanceof Blob) {
      if (value.size > 2000000) return { kind: 'Blob', chain: ['Binary'], preview: `Blob · ${value.size.toLocaleString()} bytes\nPreview skipped to keep DevTools responsive.`, note: 'Large binary value.' };
      return ghIdbBinaryInfo(new Uint8Array(await value.arrayBuffer()));
    }
    const bytes = ghIdbBytes(value);
    if (bytes) return ghIdbBinaryInfo(bytes);
    let text;
    if (typeof value === 'string') text = value;
    else if (value == null || ['number', 'boolean', 'bigint'].includes(typeof value)) text = String(value);
    else { try { text = JSON.stringify(value, null, 2); } catch { text = String(value); } }
    if (text.length > 200000) text = text.slice(0, 200000);
    const info = ghInspect(text);
    return info.preview.length > 14000 ? { ...info, preview: `${info.preview.slice(0, 14000)}\n…` } : info;
  }
  function ghIdbCursor(store) {
    return new Promise((resolve, reject) => {
      const rows = [];
      let req;
      try { req = store.openCursor(); } catch (error) { reject(error); return; }
      req.onerror = () => reject(req.error || new Error('Could not read records.'));
      req.onsuccess = () => {
        const cursor = req.result;
        if (!cursor || rows.length >= 50) { resolve(rows); return; }
        rows.push({ key: cursor.key, value: cursor.value });
        try { cursor.continue(); } catch { resolve(rows); }
      };
    });
  }
  async function ghIdbScan() {
    let names = [];
    try { names = await indexedDB.databases(); } catch {}
    names = names.map((db) => db?.name).filter((name) => name && !GH_IDB_SKIP.test(name));
    if (!names.length && !indexedDB.databases) names = ['/idbfs'];
    const dbs = [];
    let remaining = GH_IDB_MAX_ROWS;
    for (const name of names) {
      if (remaining <= 0) break;
      let db;
      try {
        db = await ghIdbOpen(name);
        const stores = [];
        for (const storeName of [...db.objectStoreNames]) {
          if (remaining <= 0) break;
          let tx;
          try { tx = db.transaction(storeName, 'readonly'); } catch { continue; }
          const rows = await ghIdbCursor(tx.objectStore(storeName)).catch(() => []);
          const records = [];
          for (const row of rows) {
            records.push({ key: ghIdbKey(row.key), rawKey: row.key, value: row.value, info: await ghIdbInfo(row.value) });
            remaining -= 1;
            if (remaining <= 0) break;
          }
          stores.push({ name: storeName, records, keyPath: tx.objectStore(storeName).keyPath || '' });
        }
        if (stores.length) dbs.push({ name, stores });
      } catch { /* blocked or private databases are skipped */ }
      finally { try { db?.close(); } catch {} }
    }
    return dbs;
  }
  function ghHideDetail(panel = ghPanel()) {
    const detail = panel?.querySelector('#ghDetail');
    if (detail) detail.hidden = true;
  }
  function ghOpenDetail(panel, title, meta, info) {
    const detail = panel?.querySelector('#ghDetail');
    if (!detail) return null;
    detail.hidden = false;
    const titleNode = detail.querySelector('#ghDetailTitle');
    if (titleNode) titleNode.textContent = title;
    const metaNode = detail.querySelector('#ghDetailMeta');
    if (metaNode) metaNode.textContent = meta;
    const badges = detail.querySelector('#ghDetailBadges');
    if (badges) badges.innerHTML = ghBadges(info);
    return detail;
  }
  function ghShowLocalDetail(panel, key) {
    const scope = panel.dataset.scope === 'session' ? 'session' : 'local';
    const store = ghStore(scope);
    if (!store || !key) return;
    const value = String(store.getItem(key) ?? '');
    const info = ghInspect(value);
    const detail = ghOpenDetail(panel, key, `${scope === 'session' ? 'Session storage' : 'Local storage'} · ${value.length.toLocaleString()} characters`, info);
    if (!detail) return;
    const body = detail.querySelector('#ghDetailBody');
    body.innerHTML =
      `<div class="gh-detail-card"><div class="gh-detail-card-head"><div><span class="eyebrow">DECODED VALUE</span><strong>${esc(info.kind)}</strong><small>${esc(info.note || 'Raw value')}</small></div><button class="btn gh-mini" type="button" data-gh-copy>${icon('copy')} Copy decoded</button></div><pre>${esc(info.preview)}</pre></div>` +
      `<div class="gh-detail-card"><div class="gh-detail-card-head"><div><strong>Edit raw value</strong><small>Saved directly to ${scope}Storage for this origin.</small></div><span class="gh-size">${value.length.toLocaleString()} chars</span></div><textarea class="gh-input gh-detail-input" spellcheck="false" data-gh-value>${esc(value)}</textarea><div class="gh-detail-actions"><button class="btn primary" type="button" data-gh-save>${icon('save')} Save changes</button><button class="btn gh-danger" type="button" data-gh-del>${icon('trash-2')} Delete key</button><span class="gh-detail-msg" data-gh-msg></span></div></div>`;
    refreshIcons(body);
    body.querySelector('[data-gh-copy]').onclick = () => ghCopy(info.preview, key);
    body.querySelector('[data-gh-save]').onclick = () => {
      try {
        store.setItem(key, body.querySelector('[data-gh-value]').value);
        ghOwnKey(scope, key);
        ghRender();
        ghShowLocalDetail(panel, key);
        toast('Saved', key, 'success');
      } catch (error) {
        const message = body.querySelector('[data-gh-msg]');
        if (message) message.textContent = error.message || 'Storage rejected the write.';
      }
    };
    let armed = false;
    body.querySelector('[data-gh-del]').onclick = (event) => {
      const button = event.currentTarget;
      if (!armed) {
        armed = true;
        button.textContent = 'Click again to delete';
        setTimeout(() => { if (armed) { armed = false; button.innerHTML = `${icon('trash-2')} Delete key`; refreshIcons(button); } }, 3500);
        return;
      }
      try {
        store.removeItem(key);
        ghUnownKey(scope, key);
        ghHideDetail(panel);
        ghRender();
        toast('Deleted', key, 'success');
      } catch (error) {
        const message = body.querySelector('[data-gh-msg]');
        if (message) message.textContent = error.message || 'Storage rejected the change.';
      }
    };
  }
  function ghIdbEditable(value) {
    if (typeof value === 'string') return { kind: 'String', text: value, parse: (text) => text };
    if (typeof value === 'number') return { kind: 'Number', text: String(value), parse: (text) => { const number = Number(text); if (!Number.isFinite(number)) throw new Error('Enter a finite number.'); return number; } };
    if (typeof value === 'boolean') return { kind: 'Boolean', text: String(value), parse: (text) => { if (text !== 'true' && text !== 'false') throw new Error('Use true or false.'); return text === 'true'; } };
    try {
      if (Array.isArray(value)) return { kind: 'JSON array', text: JSON.stringify(value, null, 2), parse: (text) => { const parsed = JSON.parse(text); if (!Array.isArray(parsed)) throw new Error('Use a JSON array.'); return parsed; } };
      if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) return { kind: 'JSON object', text: JSON.stringify(value, null, 2), parse: (text) => JSON.parse(text) };
    } catch {}
    return null;
  }
  function ghIdbWrite(name, storeName, rawKey, value, remove = false) {
    return new Promise((resolve, reject) => {
      let request;
      try { request = indexedDB.open(name); } catch (error) { reject(error); return; }
      request.onerror = () => reject(request.error || new Error('Could not open this database.'));
      request.onblocked = () => reject(new Error('This database is blocked by another tab.'));
      request.onsuccess = () => {
        const db = request.result;
        let tx;
        try {
          tx = db.transaction(storeName, 'readwrite');
          const store = tx.objectStore(storeName);
          const op = remove ? store.delete(rawKey) : (store.keyPath ? store.put(value) : store.put(value, rawKey));
          op.onerror = () => reject(op.error || new Error('The record could not be written.'));
          tx.oncomplete = () => { try { db.close(); } catch {} resolve(); };
          tx.onerror = () => { try { db.close(); } catch {} reject(tx.error || new Error('The transaction failed.')); };
          tx.onabort = () => { try { db.close(); } catch {} reject(tx.error || new Error('The transaction was aborted.')); };
        } catch (error) { try { db.close(); } catch {} reject(error); }
      };
    });
  }
  async function ghShowIdbDetail(panel, row) {
    const cache = state.ghIdbCache;
    const db = cache?.dbs[Number(row.dataset.ghDb)];
    const store = db?.stores[Number(row.dataset.ghStore)];
    const record = store?.records[Number(row.dataset.ghRow)];
    if (!db || !store || !record) return;
    const editable = store.keyPath ? null : ghIdbEditable(record.value);
    const info = record.info;
    const detail = ghOpenDetail(panel, record.key, `${db.name} / ${store.name} · ${info.kind}${store.keyPath ? ' · inline-key store' : ''}`, info);
    if (!detail) return;
    const body = detail.querySelector('#ghDetailBody');
    body.innerHTML =
      `<div class="gh-detail-card"><div class="gh-detail-card-head"><div><span class="eyebrow">DECODED VALUE</span><strong>${esc(info.kind)}</strong><small>${esc(info.note || 'IndexedDB value')}</small></div><button class="btn gh-mini" type="button" data-gh-copy>${icon('copy')} Copy decoded</button></div><pre>${esc(info.preview)}</pre></div>` +
      (editable
        ? `<div class="gh-detail-card"><div class="gh-detail-card-head"><div><strong>Edit ${esc(editable.kind)} record</strong><small>The value type is preserved when saved.</small></div></div><textarea class="gh-input gh-detail-input" spellcheck="false" data-gh-value>${esc(editable.text)}</textarea><div class="gh-detail-actions"><button class="btn primary" type="button" data-gh-save>${icon('save')} Save record</button><button class="btn gh-danger" type="button" data-gh-del>${icon('trash-2')} Delete record</button><span class="gh-detail-msg" data-gh-msg></span></div></div>`
        : `<div class="gh-detail-card"><div class="gh-detail-card-head"><div><strong>Read-only record</strong><small>Binary, inline-key and complex records are shown for inspection only. Local and session values can still be edited directly.</small></div></div></div>`);
    refreshIcons(body);
    body.querySelector('[data-gh-copy]').onclick = () => ghCopy(info.preview, record.key);
    if (!editable) return;
    body.querySelector('[data-gh-save]').onclick = async () => {
      const message = body.querySelector('[data-gh-msg]');
      let next;
      try { next = editable.parse(body.querySelector('[data-gh-value]').value); }
      catch (error) { if (message) message.textContent = error.message || 'That value is not valid.'; return; }
      try {
        await ghIdbWrite(db.name, store.name, record.rawKey, next);
        record.value = next;
        record.info = await ghIdbInfo(next);
        ghRenderIdb(panel);
        await ghShowIdbDetail(panel, row);
        toast('Saved record', record.key, 'success');
      } catch (error) { if (message) message.textContent = error.message || 'The record could not be saved.'; }
    };
    let armed = false;
    body.querySelector('[data-gh-del]').onclick = async (event) => {
      const button = event.currentTarget;
      if (!armed) {
        armed = true;
        button.textContent = 'Click again to delete';
        setTimeout(() => { if (armed) { armed = false; button.innerHTML = `${icon('trash-2')} Delete record`; refreshIcons(button); } }, 3500);
        return;
      }
      try {
        await ghIdbWrite(db.name, store.name, record.rawKey, null, true);
        state.ghIdbCache = null;
        ghHideDetail(panel);
        ghRenderIdb(panel);
        toast('Deleted record', record.key, 'success');
      } catch (error) {
        const message = body.querySelector('[data-gh-msg]');
        if (message) message.textContent = error.message || 'The record could not be deleted.';
      }
    };
  }
  async function ghRenderIdb(panel) {
    const list = panel.querySelector('#ghList');
    if (!list) return;
    panel.querySelectorAll('[data-gh-storage-only]').forEach((node) => { node.hidden = true; });
    const add = panel.querySelector('#ghAdd'); if (add) add.hidden = true;
    const note = panel.querySelector('[data-gh-note]');
    if (note) note.textContent = 'IndexedDB is shared on this origin. Game save files, including Unity PlayerPrefs, appear here.';
    const gameName = state.playerGame?.name || 'this game';
    const title = panel.querySelector('#ghTitle'); if (title) title.textContent = gameName;
    const gameNameNode = panel.querySelector('#ghGameName'); if (gameNameNode) gameNameNode.textContent = gameName;
    if (!state.ghIdbCache || state.ghIdbCache.gameId !== state.ghGameId) {
      if (ghIdbLoading) return;
      ghIdbLoading = true;
      list.innerHTML = `<div class="gh-empty">${icon('loader-circle')}Reading IndexedDB…</div>`;
      refreshIcons(list);
      try { state.ghIdbCache = { gameId: state.ghGameId, dbs: await ghIdbScan() }; }
      catch { state.ghIdbCache = { gameId: state.ghGameId, dbs: [] }; }
      finally { ghIdbLoading = false; }
      if (panel.dataset.scope !== 'indexeddb' || panel.hidden) return;
    }
    const needle = String(panel.querySelector('#ghSearch')?.value || '').toLowerCase();
    const dbs = state.ghIdbCache.dbs;
    let total = 0, shown = 0;
    const sections = dbs.map((db, dbIndex) => {
      const stores = db.stores.map((store, storeIndex) => {
        const rows = store.records.map((row, rowIndex) => ({ row, rowIndex })).filter(({ row }) => !needle || `${row.key} ${row.info.preview} ${row.info.kind}`.toLowerCase().includes(needle));
        total += store.records.length;
        shown += rows.length;
        if (!rows.length) return '';
        return `<div class="gh-idb-group"><strong>${esc(store.name)}</strong><span>${rows.length}${store.records.length >= 50 ? '+' : ''} record${rows.length === 1 ? '' : 's'}</span></div>` +
          rows.map(({ row, rowIndex }) => {
            const info = row.info;
            return `<article class="gh-row gh-idb-row" data-gh-db="${dbIndex}" data-gh-store="${storeIndex}" data-gh-row="${rowIndex}"><button class="gh-row-head" type="button" data-gh-open><span class="gh-caret">${icon('chevron-right')}</span><code>${esc(row.key)}</code><span class="gh-badges">${ghBadges(info)}</span><span class="gh-size">${info.preview.length.toLocaleString()} ch</span></button></article>`;
          }).join('');
      }).join('');
      if (!stores) return '';
      return `<div class="gh-idb-group gh-idb-db"><strong>${esc(db.name)}</strong><span>database</span></div>${stores}`;
    }).filter(Boolean).join('');
    const count = panel.querySelector('#ghCount');
    if (count) count.textContent = needle ? `${shown} of ${total} record${total === 1 ? '' : 's'}` : `${total} record${total === 1 ? '' : 's'}`;
    list.innerHTML = sections || `<div class="gh-empty">No IndexedDB save data found${needle ? ` for <strong>${esc(needle)}</strong>` : ''}.<br>Storage written outside this game may live in localStorage or another origin.</div>`;
    refreshIcons(list);
  }
  async function ghAutoOpenIdb(panel) {
    if (!panel || panel.hidden || panel.dataset.scope !== 'local') return;
    if (!state.ghGameId || ghAutoIdbGame === state.ghGameId) return;
    if (ghOwnedKeys('local').length || ghOwnedKeys('session').length) return;
    const gameId = state.ghGameId;
    ghAutoIdbGame = gameId;
    const dbs = await ghIdbScan();
    if (!dbs.some((db) => db.name === '/idbfs' || db.name === 'idbfs')) return;
    if (panel.hidden || state.ghGameId !== gameId || panel.dataset.scope !== 'local') return;
    state.ghIdbCache = { gameId, dbs };
    panel.dataset.scope = 'indexeddb';
    panel.querySelectorAll('[data-gh-scope]').forEach((item) => item.classList.toggle('active', item.dataset.ghScope === 'indexeddb'));
    ghRenderIdb(panel);
  }

  function ghRender() {
    const panel = ghPanel();
    if (!panel || panel.hidden) return;
    if (panel.dataset.scope === 'indexeddb') { ghRenderIdb(panel); return; }
    panel.querySelectorAll('[data-gh-storage-only]').forEach((node) => { node.hidden = false; });
    const note = panel.querySelector('[data-gh-note]');
    if (note) note.textContent = 'Only storage owned by this game is shown. Edits write straight to this origin.';
    ghAttribute();
    const list = panel.querySelector('#ghList'), store = ghStore(panel.dataset.scope);
    if (!list || !store) return;
    const gameName = state.playerGame?.name || 'this game';
    const title = panel.querySelector('#ghTitle');
    if (title) title.textContent = gameName;
    const gameNameNode = panel.querySelector('#ghGameName');
    if (gameNameNode) gameNameNode.textContent = gameName;
    const keys = ghKeys();
    const owned = ghOwnedKeys(panel.dataset.scope);
    const needle = String(panel.querySelector('#ghSearch')?.value || '').trim();
    const count = panel.querySelector('#ghCount');
    if (count) count.textContent = needle ? `${keys.length} of ${owned.length} key${owned.length === 1 ? '' : 's'}` : `${keys.length} key${keys.length === 1 ? '' : 's'}`;
    if (!keys.length) {
      const message = !state.ghGameId
        ? 'Open a game to inspect its storage.'
        : needle
          ? `No keys match <strong>${esc(needle)}</strong>.`
          : `No saved data here for <strong>${esc(gameName)}</strong> yet.<br>Unity/WebGL games usually save in the <strong>IndexedDB</strong> tab. Play a little, then hit Refresh.`;
      list.innerHTML = `<div class="gh-empty">${message}</div>`;
      refreshIcons(list);
      return;
    }
    list.innerHTML = keys.map((key) => {
      const value = String(store.getItem(key) ?? '');
      const info = ghInspect(value);
      return `<article class="gh-row" data-gh-key="${esc(key)}"><button class="gh-row-head" type="button" data-gh-open aria-haspopup="dialog"><span class="gh-caret">${icon('chevron-right')}</span><code>${esc(key)}</code><span class="gh-badges">${ghBadges(info)}</span><span class="gh-size">${value.length.toLocaleString()} ch</span></button></article>`;
    }).join('');
    refreshIcons(list);
  }
  function ghRefresh() { state.ghIdbCache = null; ghHideDetail(); ghAttribute(); ghRender(); }
  function ghReload() {
    const frame = document.getElementById('gameFrame');
    const src = frame?.getAttribute('data-last-src') || frame?.src;
    if (!frame || !src) return;
    toast('Reloading game', 'Applying your storage changes…');
    try {
      frame.src = 'about:blank';
      setTimeout(() => { try { frame.src = src; setTimeout(ghRefresh, 450); } catch {} }, 60);
    } catch {}
  }
  function ghOpen(show = true) {
    if (!isUltraUser()) { toast('Ultra only', 'Game DevTools is reserved for Ultra accounts.', 'warn'); return; }
    const panel = ghEnsure();
    if (!panel) return;
    panel.hidden = !show;
    if (show) { ghHideDetail(panel); ghRender(); ghAutoOpenIdb(panel); }
    else if (document.fullscreenElement === panel) document.exitFullscreen().catch(() => {});
  }
  function ghEnsure() {
    const shell = document.querySelector('.player-shell');
    if (!shell) return null;
    const existing = ghPanel();
    if (existing) return existing;
    const panel = document.createElement('div');
    panel.id = 'gameHacksPanel';
    panel.className = 'confer-window gh-window';
    panel.hidden = true;
    panel.dataset.scope = 'local';
    const resizers = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'].map((dir) => `<div class="resizer" data-dir="${dir}"></div>`).join('');
    panel.innerHTML =
      resizers +
      `<div class="confer-window-bar" data-drag-handle>` +
      `<span class="confer-window-title">${icon('wrench')}<span>Game DevTools</span><em id="ghTitle">Current game</em></span>` +
      `<div class="confer-window-actions">` +
      `<button class="confer-window-btn" type="button" data-win-action="refresh" data-gh-refresh aria-label="Refresh keys" title="Refresh keys">${icon('refresh-cw')}</button>` +
      `<button class="confer-window-btn" type="button" data-win-action="full" aria-label="Fullscreen">${icon('maximize-2')}</button>` +
      `<button class="confer-window-btn" type="button" data-win-action="close" aria-label="Close devtools">${icon('x')}</button></div></div>` +
      `<div class="confer-window-body gh-body"><div class="gh-shell">` +
      `<div class="gh-toolbar"><div class="segmented gh-seg"><button type="button" class="active" data-gh-scope="local">Local</button><button type="button" data-gh-scope="session">Session</button><button type="button" data-gh-scope="indexeddb">IndexedDB</button></div><input id="ghSearch" class="gh-input gh-search" placeholder="Filter this game's keys and values…" autocomplete="off" spellcheck="false"><button class="btn gh-mini" type="button" data-gh-refresh>${icon('refresh-cw')} Refresh</button><button class="btn gh-mini" type="button" data-gh-addtoggle data-gh-storage-only>${icon('plus')} Add key</button></div>` +
      `<div class="gh-summary"><span id="ghCount">0 keys</span><span>Scoped to <strong id="ghGameName">this game</strong></span></div>` +
      `<div class="gh-add" id="ghAdd" hidden><input id="ghNewKey" class="gh-input" placeholder="New key" autocomplete="off" spellcheck="false"><textarea id="ghNewValue" class="gh-input" rows="2" placeholder="Value (plain text, JSON, Base64…)" spellcheck="false"></textarea><button class="btn primary gh-wide" type="button" data-gh-add>${icon('plus')} Add / overwrite for this game</button></div>` +
      `<div class="gh-list" id="ghList"></div>` +
      `<div class="gh-foot"><div class="gh-foot-actions"><button class="btn" type="button" data-gh-reload>${icon('rotate-cw')} Reload game</button><button class="btn gh-danger" type="button" data-gh-wipe data-gh-storage-only>${icon('trash-2')} Wipe this game</button></div><small data-gh-note>Only storage owned by this game is shown. Edits write straight to this origin.</small></div>` +
      `</div><section class="gh-detail" id="ghDetail" hidden><div class="gh-detail-head"><button class="gh-back" type="button" data-gh-back>${icon('arrow-left')} Back</button><div class="gh-detail-id"><span class="eyebrow">STORAGE RECORD</span><strong id="ghDetailTitle"></strong><small id="ghDetailMeta"></small></div><span class="gh-badges" id="ghDetailBadges"></span></div><div class="gh-detail-body" id="ghDetailBody"></div></section></div><span class="confer-window-grip" aria-hidden="true">${icon('grip-horizontal')}</span>`;
    document.body.appendChild(panel);
    refreshIcons(panel);
    window.FlashFloatWindow?.wire(panel, {
      width: 820, height: 740, minWidth: 340, minHeight: 320, top: 52, viewportHeight: 0.88,
      onClose: () => { if (document.fullscreenElement === panel) document.exitFullscreen().catch(() => {}); panel.hidden = true; }
    });

    let btn = document.getElementById('gameHacksBtn');
    if (!btn) {
      btn = document.createElement('button');
      btn.id = 'gameHacksBtn';
      btn.type = 'button';
      btn.title = 'Game DevTools — Ultra';
      btn.innerHTML = `${icon('wrench')}<span>DevTools</span>`;
      btn.addEventListener('click', () => { const current = ghPanel(); ghOpen(!current || current.hidden); });
    }
    btn.className = 'player-control';
    btn.hidden = true;
    const controls = shell.querySelector('.player-controls');
    if (controls) controls.insertBefore(btn, controls.querySelector('[data-player-action="close"]'));
    else shell.appendChild(btn);

    panel.querySelectorAll('[data-gh-scope]').forEach((scope) => scope.addEventListener('click', () => {
      ghHideDetail(panel);
      panel.dataset.scope = ['session', 'indexeddb'].includes(scope.dataset.ghScope) ? scope.dataset.ghScope : 'local';
      if (panel.dataset.scope === 'indexeddb') state.ghIdbCache = null;
      panel.querySelectorAll('[data-gh-scope]').forEach((item) => item.classList.toggle('active', item === scope));
      ghRender();
    }));
    panel.querySelector('#ghSearch').addEventListener('input', ghRender);
    panel.querySelectorAll('[data-gh-refresh]').forEach((button) => button.addEventListener('click', ghRefresh));
    const addBox = panel.querySelector('#ghAdd');
    panel.querySelector('[data-gh-addtoggle]').addEventListener('click', () => {
      addBox.hidden = !addBox.hidden;
      if (!addBox.hidden) panel.querySelector('#ghNewKey').focus();
    });
    panel.querySelector('[data-gh-add]').addEventListener('click', () => {
      const key = String(panel.querySelector('#ghNewKey').value || '').trim();
      const value = panel.querySelector('#ghNewValue').value;
      const scope = panel.dataset.scope === 'session' ? 'session' : 'local';
      const store = ghStore(scope);
      if (!key) { toast('Key required', 'Enter a storage key first.', 'warn'); return; }
      if (GH_APP_KEY.test(key)) { toast('Reserved key', 'Keys beginning with flashgames. belong to the app.', 'warn'); return; }
      try {
        store.setItem(key, value);
        ghOwnKey(scope, key);
        panel.querySelector('#ghNewKey').value = '';
        panel.querySelector('#ghNewValue').value = '';
        ghRender();
        toast('Saved', key, 'success');
      } catch (error) { toast('Could not save', error.message || 'Storage rejected the write.', 'error'); }
    });
    const list = panel.querySelector('#ghList');
    list.addEventListener('click', (event) => {
      const row = event.target.closest('.gh-row');
      if (!row || !event.target.closest('[data-gh-open]')) return;
      if (panel.dataset.scope === 'indexeddb') { void ghShowIdbDetail(panel, row); return; }
      ghShowLocalDetail(panel, row.dataset.ghKey);
    });
    panel.querySelector('[data-gh-back]').addEventListener('click', () => ghHideDetail(panel));
    panel.querySelector('[data-gh-reload]').addEventListener('click', ghReload);
    panel.querySelector('[data-gh-wipe]').addEventListener('click', () => {
      const scope = panel.dataset.scope === 'session' ? 'session' : 'local';
      const store = ghStore(scope);
      if (!store) return;
      const keys = ghOwnedKeys(scope);
      if (!keys.length) { toast('Nothing to wipe', 'This game has no saved keys here.', 'info'); return; }
      const gameName = state.playerGame?.name || 'this game';
      confirmDialog('Wipe this game\'s data?', `Delete ${keys.length} ${scope === 'session' ? 'session' : 'local'} key${keys.length === 1 ? '' : 's'} saved by ${gameName}? This cannot be undone.`, () => {
        keys.forEach((key) => { try { store.removeItem(key); } catch {} ghUnownKey(scope, key); });
        ghRender();
        toast('Wiped', `${keys.length} keys removed.`, 'success');
      }, true);
    });
    return panel;
  }
  function ghSync() {
    const btn = document.getElementById('gameHacksBtn');
    const panel = ghPanel();
    const controls = document.querySelector('.player-controls');
    if (btn && controls && btn.parentElement !== controls) controls.insertBefore(btn, controls.querySelector('[data-player-action="close"]'));
    const available = isUltraUser() && /^blob:/i.test(String(state.playerUrl || ''));
    if (btn) btn.hidden = !available;
    if (!available && panel) {
      panel.hidden = true;
      if (document.fullscreenElement === panel) document.exitFullscreen().catch(() => {});
    }
  }
  window.addEventListener('storage', ghOnStorage);
  function rerenderRoute() { if (state.route === 'games') paintView(renderGames); else if (state.route === 'home') paintView(renderHome); }
  async function installGame(game) {
    try {
      await trackDownload(game, (progress) => FlashGamesStore.install(game, progress));
      state.stats.installs += 1; saveStats(); await loadInstalled();
      toast('Installed', `${game.name} is now in your Library.`, 'success');
      rerenderRoute(); refreshPackDetail();
    } catch (error) {
      if (error?.message !== 'busy') toast('Install failed', error.message || 'The game could not be cached.', 'error');
    }
  }
  async function removeGame(game) { confirmDialog('Remove game?', `${game.name} will be removed from your local library.`, async () => { await FlashGamesStore.deleteCachedGame(game.id); await loadInstalled(); toast('Removed', `${game.name} was removed from your library.`, 'success'); rerenderRoute(); refreshPackDetail(); }, true); }
  function toggleFavourite(game) { const enabled = !state.favourites.has(game.id); FlashGamesStore.setFavourite(game.id, enabled); state.favourites = FlashGamesStore.getFavourites(); toast(enabled ? 'Added to favorites' : 'Removed from favorites', game.name, 'success'); rerenderRoute(); }

  async function loadUserProfile(user) {
    state.user = user || null; state.profile = {}; const db = window.__flashFirebase?.db;
    if (user && db) { try { const snapshot = await db.collection('users').doc(user.uid).get(); if (snapshot.exists) state.profile = snapshot.data() || {}; } catch { /* profile document is optional */ } }
    renderProfile(); updateAdminVisibility(); ghSync(); state.notifications = user ? await FlashData.loadNotifications(user.uid) : []; renderNotifications(); if (state.route === 'admin') await renderAdmin();
    const blocked = await enforceExclusions();
    if (blocked) stopLiveAccessWatch();
    else await enforceMaintenance();
    watchLiveAccess(user);
  }
  function updateAdminVisibility() { const allowed = window.FlashAdmin?.isAdmin(state.user, state.profile) === true; $('#adminNav')?.classList.toggle('hidden', !allowed); if (!allowed && state.route === 'admin') setRoute('home'); }
  function renderNotifications() { const list = $('#notificationList'); if (list) { list.innerHTML = state.notifications.length ? state.notifications.map((n) => `<article class="notification-item"><div class="notification-icon">${icon('bell')}</div><div><strong>${esc(n.title || 'Notification')}</strong><p>${esc(n.message || n.body || '')}</p></div></article>`).join('') : emptyState('All caught up', 'You have no new notifications.', 'bell-off'); refreshIcons(list); } updateNotifBadge(); }

  function toggleNotifDrop(force) {
    const drop = $('#notifDrop'); if (!drop) return;
    const show = force !== undefined ? force : drop.hidden;
    if (show) { renderNotifications(); paintDownloads(); drop.hidden = false; }
    else drop.hidden = true;
  }

  /* ---------- member exclusions: ban / suspension / kick (5.4.3 ops deck) ---------- */
  function paintExclusion(kind, title, blurb, note) {
    const main = $('#app'); if (!main) return;
    document.body.classList.remove('player-open'); // close any live game layer behind the screen
    const overlay = $('#playerOverlay'); if (overlay) overlay.hidden = true;
    main.innerHTML = `<section class="maintenance glass exclusion exclusion-${kind}"><div class="exclusion-lamp" aria-hidden="true"></div><span class="eyebrow">FLASH GAMES · ACCESS CONTROL</span><h1>${title}</h1><p>${blurb}</p>${note ? `<p class="exclusion-note">${note}</p>` : ''}<button class="btn" id="exclusionRefresh">${icon('refresh-cw')} Re-check status</button></section>`;
    $('#exclusionRefresh')?.addEventListener('click', () => location.reload());
    refreshIcons(main);
  }
  async function enforceExclusions() {
    if (!state.user || window.FlashAdmin?.isAdmin(state.user, state.profile)) return false;
    const p = state.profile || {};
    let kickSeen = 0;
    try { kickSeen = Number(localStorage.getItem('flashgames.kick.seen') || 0); } catch {}
    const kickAt = Number(p.kickAt || 0);
    if (kickAt > kickSeen) {
      try { localStorage.setItem('flashgames.kick.seen', String(kickAt)); } catch {}
      try { await window.__flashFirebase?.auth?.signOut?.(); } catch {}
      state.user = null; state.profile = {};
      renderProfile(); updateAdminVisibility(); // runs before painting so nav refresh never repaints the screen
      paintExclusion('kick', 'You were kicked.', 'A moderator removed your session from Flash Games.', p.kickReason ? `Reason: ${esc(p.kickReason)}` : '');
      return true;
    }
    if (p.banned || p.disabled) {
      paintExclusion('ban', 'Account banned.', 'This account is blocked from Flash Games.', p.banReason ? `Reason: ${esc(p.banReason)}` : '');
      return true;
    }
    const susp = Number(p.suspendedUntil || 0);
    if (susp > Date.now()) {
      paintExclusion('susp', 'Account suspended.', `You are suspended until ${new Date(susp).toLocaleString()}.`, p.suspendReason ? `Reason: ${esc(p.suspendReason)}` : '');
      return true;
    }
    return false;
  }
  /* Live access check: one small profile read every 10s, only while a game is
   * actually open and visible. The timer is started/stopped with the player,
   * so it costs nothing while browsing or sitting in a menu. */
  const LIVE_ACCESS_MS = 10000;
  let liveAccessTimer = 0;
  let liveAccessUid = '';
  let liveAccessBusy = false;
  function stopLiveAccessWatch() {
    if (liveAccessTimer) clearInterval(liveAccessTimer);
    liveAccessTimer = 0;
    liveAccessUid = '';
    liveAccessBusy = false;
  }
  function watchLiveAccess(user) {
    const uid = String(user?.uid || '');
    const db = window.__flashFirebase?.db;
    if (!uid || !db || !document.body.classList.contains('player-open')) { stopLiveAccessWatch(); return; }
    if (liveAccessTimer && liveAccessUid === uid) return;
    stopLiveAccessWatch();
    liveAccessUid = uid;
    liveAccessTimer = setInterval(checkLiveAccess, LIVE_ACCESS_MS);
  }
  async function checkLiveAccess() {
    if (liveAccessBusy || !liveAccessUid) return;
    if (document.hidden || navigator.onLine === false) return;
    if (!document.body.classList.contains('player-open')) return;
    const auth = window.__flashFirebase?.auth;
    const db = window.__flashFirebase?.db;
    const user = auth?.currentUser;
    if (!user || String(user.uid) !== liveAccessUid || !db) return;
    liveAccessBusy = true;
    try {
      const snapshot = await db.collection('users').doc(user.uid).get();
      if (!snapshot?.exists) return;
      const current = window.__flashFirebase?.auth?.currentUser;
      if (!current || String(current.uid) !== liveAccessUid) return;
      state.profile = { ...(state.profile || {}), ...(snapshot.data() || {}) };
      if (await enforceExclusions()) stopLiveAccessWatch();
    } catch { /* a dropped poll is harmless; the next tick retries */ }
    finally { liveAccessBusy = false; }
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden) checkLiveAccess(); });

  async function enforceMaintenance() {
    if (!state.user || window.FlashAdmin?.isAdmin(state.user, state.profile)) return;
    const maintenance = await window.FlashAdmin?.readMaintenance(); if (!maintenance?.enabled) return; const main = $('#app'); if (!main) return;
    const shutdown = String(maintenance.mode || 'maintenance') === 'shutdown';
    main.innerHTML = shutdown
      ? `<section class="maintenance glass shutdown"><div class="maintenance-icon">${icon('power')}</div><span class="eyebrow">SERVICE SUSPENDED</span><h1>Flash Games has been shut down.</h1><p>${esc(maintenance.message || 'The service is temporarily offline. Check back later.')}</p><button class="btn" id="maintenanceRefresh">${icon('power')} Try to power on</button></section>`
      : `<section class="maintenance glass"><div class="maintenance-icon">${icon('wrench')}</div><span class="eyebrow">TEMPORARILY UNAVAILABLE</span><h1>Flash Games is updating.</h1><p>${esc(maintenance.message || 'Please check back soon.')}</p><button class="btn" id="maintenanceRefresh">${icon('refresh-cw')} Check again</button></section>`;
    $('#maintenanceRefresh')?.addEventListener('click', () => location.reload()); refreshIcons(main);
  }

  function handleClick(event) {
    const notifDrop = $('#notifDrop');
    if (notifDrop && !notifDrop.hidden && !event.target.closest('#notifDrop') && !event.target.closest('#openNotifications')) { notifDrop.hidden = true; }
    if (event.target.closest('#notifClose')) { notifDrop.hidden = true; return; }
    if (event.target.closest('#openNotifications')) { toggleNotifDrop(); return; }
    const sectionButton = event.target.closest('[data-games-section]');
    if (sectionButton) {
      state.gamesSection = sectionButton.dataset.gamesSection;
      localStorage.setItem('flashgames.section', state.gamesSection);
      if (state.route !== 'games') setRoute('games');
      else paintView(renderGames);
      return;
    }
    const routeButton = event.target.closest('[data-route]'); if (routeButton) { event.preventDefault(); setRoute(routeButton.dataset.route); return; }
    const close = event.target.closest('[data-close]'); if (close) { closePanel(close.dataset.close); return; }
    if (event.target.closest('#openSearch')) { openSearch(); return; }
    if (event.target.closest('#openProfile') || event.target.closest('#mobileProfile')) { openPanel('profilePanel'); return; }
    if (event.target.closest('#openSettings')) { closePanel('profilePanel'); openPanel('settingsPanel'); return; }
    if (event.target.closest('#openSupport, .open-support, [data-open-support]')) { openSupport(); return; }
    if (event.target.closest('.open-legal, [data-open-legal]')) { openLegal(); return; }
    if (event.target.closest('.open-diagnostics, #openDiagnostics')) { window.FlashExtras?.openDiagnostics?.(); return; }
    if (event.target.closest('#openStats')) { renderStats(); return; }
    if (event.target.closest('#closePlayer')) { closePlayer(); return; }
    const category = event.target.closest('[data-category]'); if (category) { state.category = category.dataset.category; renderStore(); return; }
    const packAction = event.target.closest('[data-pack-action]'); if (packAction) { const packCard = packAction.closest('[data-pack-id]'); if (packCard && packCard.dataset.packId) { if (packAction.dataset.packAction === 'view') openPackDetail(packCard.dataset.packId); else installPackFlow(packCard.dataset.packId); } return; }
    const searchGame = event.target.closest('[data-search-game]'); if (searchGame) { const game = gamesUniverse().find((item) => item.id === searchGame.dataset.searchGame); if (game) { closePanel('searchBackdrop'); playGame(game); } return; }
    const action = event.target.closest('[data-game-action]'); if (!action) return;
    const card = action.closest('[data-game-id]'); const id = action.dataset.gameId || card?.dataset.gameId; const game = gamesUniverse().find((item) => item.id === id) || state.installed.find((item) => item.id === id); if (!game) return;
    if (action.dataset.gameAction === 'play') playGame(game); if (action.dataset.gameAction === 'install' && game.zone === 'LUMIN') { playGame(game); return; } if (action.dataset.gameAction === 'install') installGame(game); if (action.dataset.gameAction === 'remove') removeGame(game); if (action.dataset.gameAction === 'favorite') toggleFavourite(game);
    if (action.dataset.gameAction === 'boost') { state.performance = !state.performance; localStorage.setItem('flashgames.performance', state.performance ? '1' : '0'); applyPreferences(); toast(state.performance ? 'Performance mode on' : 'Performance mode off', 'Only interface effects are reduced.', 'success'); }
  }

  function handleSettings() {
    $$('.ui-choices button').forEach((button) => button.addEventListener('click', () => setUi(button.dataset.ui)));
    $$('.theme-choices button').forEach((button) => button.addEventListener('click', () => setTheme(button.dataset.theme)));
    $$('.accent-picker').forEach((picker) => picker.addEventListener('input', (event) => { state.accent = event.target.value; localStorage.setItem('flashgames.accent', state.accent); applyPreferences(); }));
    $$('.opacity-range').forEach((range) => range.addEventListener('input', (event) => { state.opacity = Number(event.target.value); localStorage.setItem('flashgames.opacity', String(state.opacity)); applyPreferences(); }));
    $$('.blur-range').forEach((range) => range.addEventListener('input', (event) => { state.blur = Number(event.target.value); localStorage.setItem('flashgames.blur', String(state.blur)); applyPreferences(); }));
    $$('.toggle-motion').forEach((row) => row.addEventListener('click', () => { state.motion = !state.motion; localStorage.setItem('flashgames.motion', state.motion ? '1' : '0'); applyPreferences(); }));
    $$('.toggle-performance').forEach((row) => row.addEventListener('click', () => { state.performance = !state.performance; localStorage.setItem('flashgames.performance', state.performance ? '1' : '0'); applyPreferences(); }));
    $$('.toggle-cloak-auto').forEach((row) => row.addEventListener('click', () => { state.cloakAuto = !state.cloakAuto; localStorage.setItem('flashgames.cloak.auto', state.cloakAuto ? '1' : '0'); applyPreferences(); }));
    $$('.cloak-launch').forEach((row) => row.addEventListener('click', () => { try { localStorage.setItem('flashgames.cloak.mode', 'app'); } catch {} window.FlashCloak?.launch?.('app'); }));
    $$('.cloak-launch-tab').forEach((row) => row.addEventListener('click', () => { try { localStorage.setItem('flashgames.cloak.mode', 'tab'); } catch {} window.FlashCloak?.launch?.('tab'); }));
    $$('.optimizer-open').forEach((row) => row.addEventListener('click', () => openOptimizer()));
    $$('.clear-library').forEach((row) => row.addEventListener('click', () => confirmDialog('Clear library?', 'All locally installed game files will be removed.', async () => { await FlashGamesStore.clearGameCache(); await loadInstalled(); renderProfile(); toast('Library cleared', 'Your installed games were removed.', 'success'); setRoute('games'); }, true)));
  }

  function handleSearch() {
    const input = $('#searchInput'); if (!input) return;
    input.addEventListener('input', () => { state.query = input.value; state.searchIndex = 0; clearTimeout(state.searchTimer); state.searchTimer = setTimeout(renderSearchResults, 60); });
    input.addEventListener('keydown', (event) => {
      const results = searchMatches();
      if (event.key === 'ArrowDown') { event.preventDefault(); state.searchIndex = Math.min(state.searchIndex + 1, Math.max(0, results.length - 1)); renderSearchResults(); $('#searchResults .search-result.active')?.scrollIntoView({ block: 'nearest' }); }
      if (event.key === 'ArrowUp') { event.preventDefault(); state.searchIndex = Math.max(0, state.searchIndex - 1); renderSearchResults(); $('#searchResults .search-result.active')?.scrollIntoView({ block: 'nearest' }); }
      if (event.key === 'Enter' && results[state.searchIndex]) {
        const query = state.query.trim();
        state.query = '';
        closePanel('searchBackdrop');
        playGame(results[state.searchIndex]);
        if (query) {
          try {
            const recents = JSON.parse(localStorage.getItem('flashgames.searches') || '[]').filter((q) => q !== query);
            recents.unshift(query);
            localStorage.setItem('flashgames.searches', JSON.stringify(recents.slice(0, 6)));
          } catch {}
        }
      }
      if (event.key === 'Escape') closePanel('searchBackdrop');
    });
  }

  function handleGlobalKeys(event) { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); openSearch(); } if (event.key === 'Escape') { document.getElementById('packDetailBackdrop')?.remove(); document.getElementById('diagBackdrop')?.remove(); document.getElementById('flashStatsBackdrop')?.remove(); document.getElementById('customInstallBackdrop')?.remove(); closePanel('supportBackdrop'); const notifDrop = $('#notifDrop'); if (notifDrop) notifDrop.hidden = true; closePanel('searchBackdrop'); closePanel('profilePanel'); closePanel('settingsPanel'); closePanel('userManagementBackdrop'); closePlayer(); } }

  const ozSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  function optimizerBenchmark(withLoad, ms = 1400) {
    return new Promise((resolve) => {
      const cv = document.createElement('canvas');
      cv.width = 240; cv.height = 140;
      cv.style.cssText = 'position:fixed;left:-9999px;top:0;width:240px;height:140px;z-index:-1';
      document.body.appendChild(cv);
      const ctx = cv.getContext('2d');
      let frames = 0;
      const t0 = performance.now();
      const tick = () => {
        frames++;
        if (withLoad) {
          const t = performance.now();
          ctx.fillStyle = '#0b0d12'; ctx.fillRect(0, 0, 240, 140);
          ctx.fillStyle = '#ff5c35';
          for (let i = 0; i < 220; i++) {
            const x = (Math.sin(t / 300 + i) * 110 + 120) | 0;
            const y = (Math.cos(t / 430 + i * 1.7) * 60 + 70) | 0;
            ctx.fillRect(x, y, 3, 3);
          }
        }
        const dt = performance.now() - t0;
        if (dt >= ms) { cv.remove(); resolve(frames / (dt / 1000)); return; }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  }

  function optimizerStorageSpeed() {
    try {
      const blob = 'x'.repeat(256 * 1024);
      const probe = 'flashgames.oz-probe';
      const t0 = performance.now();
      for (let i = 0; i < 16; i++) localStorage.setItem(probe, blob + String(i % 10));
      for (let i = 0; i < 16; i++) localStorage.getItem(probe);
      const dt = performance.now() - t0;
      localStorage.removeItem(probe);
      return 5.24 / (dt / 1000);
    } catch { return 0; }
  }

  function openOptimizer() {
    document.getElementById('optimizerBackdrop')?.remove();
    const oz = {
      target: Number(localStorage.getItem('flashgames.optimizer.target')) || 60,
      feel: localStorage.getItem('flashgames.optimizer.feel') || 'balanced',
      session: localStorage.getItem('flashgames.optimizer.session') || 'long'
    };
    const backdrop = document.createElement('div');
    backdrop.id = 'optimizerBackdrop'; backdrop.className = 'modal-backdrop';
    backdrop.innerHTML =
      `<section class="modal-card optimizer-card" role="dialog" aria-modal="true">` +
      `<div class="panel-head"><div><span class="eyebrow">SETUP OPTIMIZER</span><h2>Get your target FPS</h2></div><button class="icon-btn" data-optimizer-close aria-label="Close"><i data-lucide="x"></i></button></div>` +
      `<div id="optimizerBody"></div>` +
      `<p class="panel-note" id="optimizerStatus"></p></section>`;
    document.body.appendChild(backdrop);
    refreshIcons(backdrop);
    const body = () => backdrop.querySelector('#optimizerBody');
    const status = () => backdrop.querySelector('#optimizerStatus');
    const close = () => backdrop.remove();
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop || e.target.closest('[data-optimizer-close]')) close(); });

    const seg = (cls, items, cur, fmt) => `<div class="segmented ${cls}">${items.map(([key, label]) => `<button data-${fmt(1)}="${key}" class="${cur === key ? 'active' : ''}">${label}</button>`).join('')}</div>`;

    function mark(t, st) {
      const li = backdrop.querySelector(`.optimizer-steps [data-t="${t}"]`);
      if (li) { li.dataset.state = st; li.querySelector('.oz-dot')?.classList.add(st); }
    }

    function stepIntro() {
      body().innerHTML =
        `<p class="panel-note">This walkthrough measures your device, asks a few questions, and tunes Flash Games itself so gameplay and interface hit your target FPS — or better where the hardware allows.</p>` +
        `<div class="dialog-actions"><button class="btn primary" id="optimizerBegin">Run tests</button></div>`;
      body().querySelector('#optimizerBegin')?.addEventListener('click', stepQuestions);
    }

    function stepQuestions() {
      body().innerHTML =
        `<div class="optimizer-q"><strong>Target FPS</strong>${seg('optimizer-target', [['30','30'],['60','60'],['120','120']], String(oz.target), () => 'target')}<small class="oz-hint">What smoothness should feel like. 60 is the sane default; 120 for high-refresh screens.</small></div>` +
        `<div class="optimizer-q"><strong>Interface feel</strong>${seg('optimizer-feel', [['fast','Max speed'],['balanced','Balanced'],['full','Full effects']], oz.feel, () => 'feel')}<small class="oz-hint">Full effects stay enabled only if your device clearly has headroom.</small></div>` +
        `<div class="optimizer-q"><strong>Session style</strong>${seg('optimizer-session', [['short','Shorter bursts'],['long','Long sessions']], oz.session, () => 'session')}<small class="oz-hint">Long sessions get extra in-game relief (Performance+).</small></div>` +
        `<div class="dialog-actions"><button class="btn primary" id="optimizerRun">Start tests</button></div>`;
      const wire = (cls, key, cast) => body().querySelectorAll(`.${cls} button`).forEach((b) => b.addEventListener('click', () => {
        oz[key] = cast ? Number(b.dataset[key]) : b.dataset[key];
        b.parentElement.querySelectorAll('button').forEach((x) => x.classList.toggle('active', x === b));
      }));
      wire('optimizer-target', 'target', true);
      wire('optimizer-feel', 'feel', false);
      wire('optimizer-session', 'session', false);
      body().querySelector('#optimizerRun')?.addEventListener('click', stepTests);
    }

    async function stepTests() {
      body().innerHTML =
        `<ul class="optimizer-steps">` +
        `<li data-t="device"><span class="oz-dot"></span><span>Device profile (cores · memory · network)</span></li>` +
        `<li data-t="storage"><span class="oz-dot"></span><span>Storage speed</span></li>` +
        `<li data-t="fps"><span class="oz-dot"></span><span>Idle FPS (interface baseline)</span></li>` +
        `<li data-t="load"><span class="oz-dot"></span><span>Loaded FPS (render stress)</span></li></ul>` +
        `<div class="dialog-actions"><span class="panel-note">Measuring…</span></div>`;
      status().textContent = '';
      try {
        mark('device', 'run');
        const mem = Number(navigator.deviceMemory || 0), cores = Number(navigator.hardwareConcurrency || 0);
        const conn = navigator.connection || {};
        oz.hw = { memory: mem, cores, net: conn.effectiveType ? conn.effectiveType + (conn.downlink ? ' · ~' + conn.downlink + ' Mbps' : '') : '—' };
        await ozSleep(180); mark('device', 'done');
        mark('storage', 'run');
        oz.storageMps = optimizerStorageSpeed();
        await ozSleep(120); mark('storage', 'done');
        mark('fps', 'run');
        oz.fpsIdle = await optimizerBenchmark(false, 1400);
        mark('fps', 'done');
        mark('load', 'run');
        oz.fpsLoad = await optimizerBenchmark(true, 1400);
        mark('load', 'done');
        await ozSleep(220);
        stepResults();
      } catch { status().textContent = 'A test failed — try again.'; }
    }

    function stepResults() {
      const need = oz.fpsLoad < oz.target - 3;
      const headroom = oz.fpsIdle / Math.max(1, oz.target);
      const plan = [
        { checked: need || (oz.hw.memory > 0 && oz.hw.memory <= 4), label: 'Performance mode', why: 'Solid surfaces — no glass compositing while rendering' },
        { checked: (need || oz.feel !== 'full') && headroom < 1.35, label: 'Motion off', why: 'Reclaims the animation frame budget' },
        { checked: oz.target >= 90 || need, label: 'Minimal glass', why: 'Blur 14px · opacity 52%' },
        { checked: oz.session !== 'short' && (need || oz.target >= 60), label: 'Player Performance+', why: 'HUD effects off during games' }
      ];
      const net = oz.hw.cores ? `${oz.hw.cores} cores · ${oz.hw.memory ? oz.hw.memory + ' GB' : 'mem n/a'} · ${oz.hw.net}` : '—';
      body().innerHTML =
        `<div class="optimizer-facts">${net} · storage ~${oz.storageMps.toFixed(1)} MB/s · idle ${Math.round(oz.fpsIdle)} fps · loaded ${Math.round(oz.fpsLoad)} fps</div>` +
        `<div class="optimizer-plan">${plan.map((p, i) => `<label><input type="checkbox" data-oz-item="${i}" ${p.checked ? 'checked' : ''}><span><strong>${p.label}</strong><small>${p.why}</small></span></label>`).join('')}</div>` +
        `<div class="dialog-actions"><button class="btn primary" id="optimizerApply">Apply optimizations</button></div>`;
      body().querySelector('#optimizerApply')?.addEventListener('click', () => {
        body().querySelectorAll('[data-oz-item]').forEach((cb) => { plan[Number(cb.dataset.ozItem)].checked = cb.checked; });
        applyPlan(plan);
        stepDone();
      });
    }

    function applyPlan(plan) {
      plan.forEach((p) => {
        if (p.label === 'Performance mode') localStorage.setItem('flashgames.performance', p.checked ? '1' : '0');
        if (p.label === 'Motion off') localStorage.setItem('flashgames.motion', p.checked ? '0' : '1');
        if (p.label === 'Minimal glass') { localStorage.setItem('flashgames.opacity', '52'); localStorage.setItem('flashgames.blur', '14'); }
        if (p.label === 'Player Performance+') localStorage.setItem('flashgames.perfplus', p.checked ? '1' : '0');
      });
      localStorage.setItem('flashgames.optimizer.done', '1');
      localStorage.setItem('flashgames.optimizer.target', String(oz.target));
      localStorage.setItem('flashgames.optimizer.feel', oz.feel);
      localStorage.setItem('flashgames.optimizer.session', oz.session);
      state.performance = localStorage.getItem('flashgames.performance') === '1';
      state.motion = localStorage.getItem('flashgames.motion') !== '0';
      state.opacity = Number(localStorage.getItem('flashgames.opacity')) || state.opacity;
      state.blur = Number(localStorage.getItem('flashgames.blur')) || state.blur;
      applyPreferences(); rerenderRoute();
      toast('Optimized', `Target ${oz.target} FPS profile applied.`, 'success');
    }

    async function stepDone() {
      body().innerHTML = `<p class="panel-note">Applied. Quick re-check…</p>`;
      status().textContent = '';
      const after = await optimizerBenchmark(false, 1000);
      body().innerHTML =
        `<h3>Done</h3>` +
        `<p class="panel-note">Idle ~${Math.round(after)} fps (was ~${Math.round(oz.fpsIdle)}). The ${oz.target} FPS profile is saved — re-run anytime from Settings ⇢ Setup Optimizer.</p>` +
        `<div class="dialog-actions"><button class="btn primary" data-optimizer-close>Finish</button></div>`;
    }

    stepIntro();
  }

  function noticeOptimizer() {
    try {
      if (window.__CLOAKED__) return; if (window.__OZN_SEEN__) return;
      if ([...document.querySelectorAll('.modal-backdrop')].some((node) => !node.hidden)) { setTimeout(noticeOptimizer, 1800); return; }
      window.__OZN_SEEN__ = true;
      if (localStorage.getItem('flashgames.optimizer.done') === '1' || localStorage.getItem('flashgames.optimizer.notice') === '0') return;
      const backdrop = document.createElement('div');
      backdrop.id = 'optimizerNotice'; backdrop.className = 'modal-backdrop';
      backdrop.innerHTML =
        `<section class="modal-card" role="dialog" aria-modal="true">` +
        `<div class="panel-head"><div><span class="eyebrow">NEW IN 5.4.3</span><h2>Setup Optimizer</h2></div><button class="icon-btn" data-ozn-close aria-label="Close"><i data-lucide="x"></i></button></div>` +
        `<p class="panel-note">A guided walkthrough: quick device tests, you set a target FPS, and Flash Games tunes itself to reach it — or better.</p>` +
        `<label class="cloak-ask-toggle"><input type="checkbox" id="optimizerDontNotice"><span><strong>Don't show again</strong><small>Dismisses this startup prompt for good.</small></span></label>` +
        `<div class="dialog-actions"><button class="btn" id="optimizerLater">Not now</button><button class="btn primary" id="optimizerGo"><i data-lucide="sliders-horizontal"></i> Open it</button></div></section>`;
      document.body.appendChild(backdrop);
      refreshIcons(backdrop);
      const close = () => backdrop.remove();
      const stay = () => { if (backdrop.querySelector('#optimizerDontNotice')?.checked) localStorage.setItem('flashgames.optimizer.notice', '0'); };
      backdrop.addEventListener('click', (e) => { if (e.target === backdrop || e.target.closest('[data-ozn-close]')) { stay(); close(); } });
      backdrop.querySelector('#optimizerLater')?.addEventListener('click', () => { stay(); close(); });
      backdrop.querySelector('#optimizerGo')?.addEventListener('click', () => { close(); openOptimizer(); });
    } catch {}
  }

  /* ---------- Game Mode: custom in-game HUD (widgets + shortcut + editor) ---------- */
  const GM_TYPES = {
    fps:       { label: 'FPS counter',      icon: 'activity',            group: 'Performance' },
    frame:     { label: 'Frame time',       icon: 'gauge',               group: 'Performance' },
    memory:    { label: 'Memory',           icon: 'memory-stick',        group: 'Performance' },
    net:       { label: 'Connection',       icon: 'wifi',                group: 'Performance' },
    keys:      { label: 'Keystrokes',       icon: 'keyboard',            group: 'Input' },
    stats:     { label: 'Input stats',      icon: 'mouse-pointer-click', group: 'Input' },
    gamepad:   { label: 'Controller',       icon: 'gamepad-2',           group: 'Input' },
    clock:     { label: 'Clock',            icon: 'clock',               group: 'Time' },
    date:      { label: 'Date',             icon: 'calendar-days',       group: 'Time' },
    timer:     { label: 'Session timer',    icon: 'hourglass',           group: 'Time' },
    stopwatch: { label: 'Stopwatch',        icon: 'timer',               group: 'Time' },
    battery:   { label: 'Battery',          icon: 'battery-medium',      group: 'Device' },
    media:     { label: 'Now playing',      icon: 'music',               group: 'Device' },
    confer:    { label: 'Confer',           icon: 'users',               group: 'Social' },
    note:      { label: 'Note',             icon: 'sticky-note',         group: 'Custom', custom: 1, hint: 'Pin a short message over the game.' },
    counter:   { label: 'Counter',          icon: 'hash',                group: 'Custom', custom: 1, hint: 'Tap to count deaths, wins or attempts.' },
    link:      { label: 'Link',             icon: 'link',                group: 'Custom', custom: 1, hint: 'A one-tap shortcut to any page.' }
  };
  const GM_ORDER = Object.keys(GM_TYPES);
  const GM_GROUPS = ['Performance', 'Input', 'Time', 'Device', 'Social', 'Custom'];
  const GM_STYLES = [['solid', 'Solid'], ['outline', 'Outline'], ['ghost', 'Ghost'], ['accent', 'Accent'], ['light', 'Light']];
  const GM_SIZE_MIN = 0.7, GM_SIZE_MAX = 2;
  const gmUid = () => 'w' + Math.random().toString(36).slice(2, 9);
  const gmClamp = (v, lo = 0, hi = 100) => Math.min(hi, Math.max(lo, Number.isFinite(Number(v)) ? Number(v) : 50));
  const gmNum = (v, d, lo, hi) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
  const gmLS = (k) => 'flashgames.gamemode.' + k;
  const gmGet = (k, d) => { try { return localStorage.getItem(gmLS(k)) ?? d; } catch { return d; } };
  const gmSet = (k, v) => { try { localStorage.setItem(gmLS(k), v); } catch {} };
  const gmHost = (url) => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return 'Link'; } };

  function gmBaseSize() { return gmNum(gmGet('scale', '1'), 1, GM_SIZE_MIN, GM_SIZE_MAX); }
  function gmBaseOpacity() { return gmNum(gmGet('opacity', '78'), 78, 10, 100); }

  function gmNormalize(w) {
    const type = GM_TYPES[w && w.type] ? w.type : 'note';
    const base = gmBaseSize();
    return {
      id: (w && typeof w.id === 'string' && w.id) ? w.id : gmUid(),
      type,
      x: gmClamp(w && w.x, 0, 100),
      y: gmClamp(w && w.y, 0, 100),
      on: w && w.on === 0 ? 0 : 1,
      label: w && typeof w.label === 'string' ? w.label.slice(0, 24) : '',
      icon: w && typeof w.icon === 'string' ? w.icon.slice(0, 32) : '',
      style: (w && GM_STYLES.some(([s]) => s === w.style)) ? w.style : 'solid',
      size: gmNum(w && w.size, base, GM_SIZE_MIN, GM_SIZE_MAX),
      opacity: gmNum(w && w.opacity, gmBaseOpacity(), 10, 100),
      radius: gmNum(w && w.radius, 12, 0, 28),
      accent: (w && typeof w.accent === 'string' && /^#[0-9a-f]{6}$/i.test(w.accent)) ? w.accent : '',
      text: w && typeof w.text === 'string' ? w.text.slice(0, 180) : '',
      url: w && typeof w.url === 'string' ? w.url.slice(0, 300) : '',
      count: w && Number.isFinite(Number(w.count)) ? Math.round(Number(w.count)) : 0
    };
  }

  function gmDefaultLayout() {
    return [
      { id: gmUid(), type: 'fps',    x: 3,  y: 5,  on: 1, style: 'solid' },
      { id: gmUid(), type: 'keys',   x: 3,  y: 69, on: 1, style: 'solid' },
      { id: gmUid(), type: 'clock',  x: 86, y: 5,  on: 1, style: 'solid' },
      { id: gmUid(), type: 'timer',  x: 86, y: 19, on: 1, style: 'solid' },
      { id: gmUid(), type: 'confer', x: 45, y: 88, on: 1, style: 'ghost' }
    ].map(gmNormalize);
  }
  function gmLoadLayout() {
    try {
      const raw = JSON.parse(localStorage.getItem(gmLS('layout')) || 'null');
      if (Array.isArray(raw)) {
        const clean = raw.filter((w) => w && GM_TYPES[w.type]).map(gmNormalize);
        if (clean.length) return clean;
      }
    } catch {}
    return gmDefaultLayout();
  }
  const gmLayout = gmLoadLayout();
  let gmHot = String(gmGet('hotkey', 'Ctrl+Shift+G'));

  /* --- shortcut labels (letters, digits, punctuation, function keys) --- */
  const GM_CODE_LABELS = {
    Space: 'Space', Enter: 'Enter', Tab: 'Tab', Backspace: 'Backspace', Delete: 'Delete',
    Escape: 'Esc', Insert: 'Insert', Home: 'Home', End: 'End', PageUp: 'PgUp', PageDown: 'PgDn',
    ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right',
    Backquote: '`', Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']',
    Backslash: '\\', Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/',
    CapsLock: 'Caps', ContextMenu: 'Menu', NumpadAdd: 'Num +', NumpadSubtract: 'Num -',
    NumpadMultiply: 'Num *', NumpadDivide: 'Num /', NumpadDecimal: 'Num .', NumpadEnter: 'Num Enter'
  };
  function gmKeyLabel(code) {
    const c = String(code || '');
    if (/^Key[A-Z]$/.test(c)) return c.slice(3);
    if (/^Digit[0-9]$/.test(c)) return c.slice(5);
    if (/^Numpad[0-9]$/.test(c)) return 'Num ' + c.slice(6);
    if (/^F([1-9]|1[0-9]|2[0-4])$/.test(c)) return c;
    return GM_CODE_LABELS[c] || c.replace(/^Intl/, '');
  }
  function gmReadHot(hk) { return String(hk || '').split('+').filter(Boolean).map(gmKeyLabel).join(' + ') || 'Not set'; }
  const GM_MODS = ['Ctrl', 'Meta', 'Alt', 'Shift'];
  function gmComboOf(e) {
    const parts = [];
    if (e.ctrlKey) parts.push('Ctrl');
    if (e.metaKey) parts.push('Meta');
    if (e.altKey) parts.push('Alt');
    if (e.shiftKey) parts.push('Shift');
    const key = gmKeyLabel(e.code || '');
    // A bare modifier is not a shortcut; the recorder keeps listening.
    if (!key || GM_MODS.includes(key)) return '';
    parts.push(key);
    return parts.join('+');
  }

  /* --- widget rendering --- */
  function gmKeysHTML() {
    return '<div class="gm-keys">' +
      '<div class="gm-krow"><span class="gm-key" data-gm-code="KeyW">W</span></div>' +
      '<div class="gm-krow"><span class="gm-key" data-gm-code="KeyA">A</span><span class="gm-key" data-gm-code="KeyS">S</span><span class="gm-key" data-gm-code="KeyD">D</span></div>' +
      '<div class="gm-krow"><span class="gm-key gm-wide" data-gm-code="Space">Space</span></div>' +
      '<div class="gm-krow"><span class="gm-mbtn"><b data-gm-cps="0">0</b><small>lmb</small></span><span class="gm-mbtn"><b data-gm-cps="2">0</b><small>rmb</small></span></div>' +
      '</div>';
  }

  function gmBodyHTML(w) {
    const label = w.label || GM_TYPES[w.type].label;
    switch (w.type) {
      case 'fps':       return `<span class="gm-dot" data-gm-dot></span><b class="gm-big" data-gm-live="fps">--</b><span class="gm-sub">${esc(label === 'FPS counter' ? 'fps' : label)}</span>`;
      case 'frame':     return `<b class="gm-big" data-gm-live="frame">--</b><span class="gm-sub">${esc(w.label || 'ms')}</span>`;
      case 'memory':    return `<b class="gm-big" data-gm-live="mem">--</b><span class="gm-sub">${esc(label === 'Memory' ? 'ram' : label)}</span>`;
      case 'net':       return `<span class="gm-dot" data-gm-dot></span><b class="gm-big" data-gm-live="net">--</b><span class="gm-sub">${esc(label === 'Connection' ? 'net' : label)}</span>`;
      case 'keys':      return gmKeysHTML() + (w.label ? `<span class="gm-sub">${esc(w.label)}</span>` : '');
      case 'stats':     return `<span class="gm-pair"><b data-gm-live="kps">0</b><small>keys</small></span><span class="gm-pair"><b data-gm-live="cps">0</b><small>clicks</small></span>`;
      case 'gamepad':   return `${icon('gamepad-2')}<b class="gm-big" data-gm-live="pad">0</b><span class="gm-sub">${esc(label === 'Controller' ? 'pads' : label)}</span>`;
      case 'clock':     return `<b class="gm-big" data-gm-live="clock">--:--</b>` + (w.label ? `<span class="gm-sub">${esc(w.label)}</span>` : '');
      case 'date':      return `<b class="gm-big" data-gm-live="date">—</b>` + (w.label ? `<span class="gm-sub">${esc(w.label)}</span>` : '');
      case 'timer':     return `<b class="gm-big" data-gm-live="timer">0:00</b><span class="gm-sub">${esc(label === 'Session timer' ? 'session' : label)}</span>`;
      case 'stopwatch': return `<b class="gm-big" data-gm-live="stopwatch">0:00.0</b><span class="gm-sub gm-act" data-gm-act="stopwatch">${gmStopwatch.on ? 'pause' : 'start'}</span>` + (w.label ? `<span class="gm-sub">${esc(w.label)}</span>` : '');
      case 'battery':   return `<b class="gm-big" data-gm-live="batt">--%</b><span class="gm-sub" data-gm-live="battsub">batt</span>`;
      case 'media':     return `<span class="gm-media">${icon('music')}<span data-gm-live="media">Nothing playing</span></span>`;
      case 'confer':    return `<button class="gm-chip" data-gm-act="confer" type="button">${icon(GM_TYPES.confer.icon)}<span>${esc(label === 'Confer' ? 'Confer' : label)}</span></button>`;
      case 'note':      return `<span class="gm-note">${esc(w.text || label)}</span>`;
      case 'counter':   return `<button class="gm-counter" data-gm-act="counter" type="button"><b data-gm-live="count">${Number(w.count) || 0}</b><span>${esc(label === 'Counter' ? 'count' : label)}</span></button>`;
      case 'link':      return `<button class="gm-link" data-gm-act="link" type="button">${icon('external-link')}<span>${esc(w.label || gmHost(w.url))}</span></button>`;
      default:          return '';
    }
  }
  const GM_ACTS = { counter: 1, link: 1, confer: 1, stopwatch: 1 };

  function gmStyleVars(el, w) {
    el.style.setProperty('--gw-scale', String(w.size));
    el.style.setProperty('--gw-op', String(w.opacity));
    el.style.setProperty('--gw-radius', `${w.radius}px`);
    if (w.accent) el.style.setProperty('--gw-accent', w.accent);
    else el.style.removeProperty('--gw-accent');
  }
  function gmPlaceWidget(el, w) {
    const host = el?.parentElement;
    if (!host || !w) return;
    const maxX = Math.max(0, host.clientWidth - el.offsetWidth);
    const maxY = Math.max(0, host.clientHeight - el.offsetHeight);
    const x = Math.min(100, Math.max(0, Number(w.x) || 0));
    const y = Math.min(100, Math.max(0, Number(w.y) || 0));
    el.style.left = `${(x / 100) * maxX}px`;
    el.style.top = `${(y / 100) * maxY}px`;
  }
  function gmPlaceAll(root = gmLayer()) {
    root.querySelectorAll('.gm-widget').forEach((el) => {
      const w = gmLayout.find((item) => item.id === el.dataset.gmId);
      if (w) gmPlaceWidget(el, w);
    });
  }
  function gmWidgetEl(w) {
    const el = document.createElement('div');
    const interactive = !!GM_ACTS[w.type];
    el.className = `gm-widget gm-widget-${w.type} gm-style-${w.style}` + (interactive ? ' gm-clickable' : '');
    el.dataset.gmId = w.id;
    if (!w.on) el.classList.add('gm-off');
    if (w.accent) el.style.setProperty('--gw-accent', w.accent);
    gmStyleVars(el, w);
    const glyph = w.icon && !['keys', 'confer', 'gamepad', 'media', 'link'].includes(w.type) ? `<i data-lucide="${esc(w.icon)}"></i>` : '';
    el.innerHTML = glyph + gmBodyHTML(w);
    return el;
  }

  const gmPlaying = () => document.body.classList.contains('player-open');
  document.getElementById('gameFrame')?.addEventListener('load', () => gmAttachRelay()); // blob/srcdoc loads swap the window object

  function gmLayer() {
    let l = document.getElementById('gmLayer');
    if (!l) {
      l = document.createElement('div');
      l.id = 'gmLayer';
      (document.querySelector('.player-shell') || document.body).appendChild(l);
    }
    return l;
  }

  /* --- live widget loops (all stopped the instant the HUD hides) --- */
  let gmLive = false;
  let gmRaf = 0;
  let gmTickTimer = 0;
  let gmFrames = 0;
  let gmFpsT0 = 0;
  let gmFrameMs = 0;
  let gmSessionStart = 0;
  let gmBattery = null;
  let gmBatteryAsked = false;
  const gmClicks = [[], []];
  const gmKeysDown = new Set();
  const gmKeyTimes = [];
  const gmStopwatch = { on: false, acc: 0, t0: 0 };

  const gmPad2 = (n) => String(n).padStart(2, '0');
  function gmFmtClock() { return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }
  function gmFmtDate() { return new Date().toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' }); }
  function gmFmtTimer() {
    const s = gmSessionStart ? Math.max(0, Math.floor((Date.now() - gmSessionStart) / 1000)) : 0;
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    return h ? `${h}:${gmPad2(m)}:${gmPad2(sec)}` : `${m}:${gmPad2(sec)}`;
  }
  function gmFmtStop() {
    const ms = gmStopwatch.acc + (gmStopwatch.on ? Date.now() - gmStopwatch.t0 : 0);
    const tenths = Math.floor((ms % 1000) / 100);
    const s = Math.floor(ms / 1000);
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    return (h ? `${h}:${gmPad2(m)}` : String(m)) + `:${gmPad2(sec)}.${tenths}`;
  }
  function gmWatchBattery() {
    if (gmBattery || gmBatteryAsked || typeof navigator.getBattery !== 'function') return;
    gmBatteryAsked = true;
    navigator.getBattery().then((b) => { gmBattery = b; }).catch(() => {});
  }
  function gmMediaNow() {
    const meta = navigator.mediaSession?.metadata;
    const title = meta?.title || '';
    if (!title) return 'Nothing playing';
    const artist = meta?.artist || '';
    return (artist ? `${artist} — ` : '') + title;
  }
  function gmNetLabel() {
    if (!navigator.onLine) return 'offline';
    const c = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    return String(c?.effectiveType || 'online').toUpperCase();
  }

  function gmSetLiveText(root, key, value) {
    const el = root.querySelector(`[data-gm-live="${key}"]`);
    if (el && el.textContent !== String(value)) el.textContent = String(value);
  }
  function gmFillLive() {
    const l = gmLayer();
    gmSetLiveText(l, 'clock', gmFmtClock());
    gmSetLiveText(l, 'date', gmFmtDate());
    gmSetLiveText(l, 'timer', gmFmtTimer());
    gmSetLiveText(l, 'stopwatch', gmFmtStop());
    gmSetLiveText(l, 'net', gmNetLabel());
    gmSetLiveText(l, 'media', gmMediaNow());
    gmSetLiveText(l, 'pad', (navigator.getGamepads?.() || []).filter(Boolean).length);
    const pm = performance.memory;
    gmSetLiveText(l, 'mem', pm ? `${Math.round(pm.usedJSHeapSize / 1048576)}` : (navigator.deviceMemory ? `${navigator.deviceMemory}` : '—'));
    if (gmBattery) {
      gmSetLiveText(l, 'batt', `${Math.round(gmBattery.level * 100)}%`);
      gmSetLiveText(l, 'battsub', gmBattery.charging ? 'charging' : 'batt');
    }
    const now = Date.now();
    gmClicks.forEach((arr, i) => { gmClicks[i] = arr.filter((t) => now - t < 1000); const el = l.querySelector(`[data-gm-cps="${i}"]`); if (el) el.textContent = String(gmClicks[i].length); });
    while (gmKeyTimes.length && now - gmKeyTimes[0] > 1000) gmKeyTimes.shift();
    gmSetLiveText(l, 'kps', gmKeyTimes.length);
    gmSetLiveText(l, 'cps', gmClicks[0].length + gmClicks[1].length);
    const netDot = l.querySelector('.gm-widget-net [data-gm-dot]');
    if (netDot) netDot.classList.toggle('gm-bad', !navigator.onLine);
  }
  function gmFpsLoop() {
    gmRaf = requestAnimationFrame(gmFpsLoop);
    gmFrames++;
    const now = performance.now();
    const dt = now - (gmFpsT0 || now);
    gmFrameMs = gmFrameMs ? gmFrameMs * 0.82 + dt * 0.18 : dt;
    if (now - gmFpsT0 < 500) return;
    const v = Math.round((gmFrames * 1000) / (now - gmFpsT0));
    gmFrames = 0; gmFpsT0 = now;
    const l = gmLayer();
    gmSetLiveText(l, 'fps', Math.min(999, v));
    gmSetLiveText(l, 'frame', gmFrameMs.toFixed(1));
    const dot = l.querySelector('[data-gm-live="fps"]')?.parentElement?.querySelector('[data-gm-dot]');
    if (dot) dot.className = 'gm-dot' + (v >= 50 ? '' : v >= 28 ? ' gm-mid' : ' gm-bad');
  }
  function gmStopLoops() {
    if (gmRaf) cancelAnimationFrame(gmRaf);
    gmRaf = 0;
    if (gmTickTimer) clearInterval(gmTickTimer);
    gmTickTimer = 0;
  }
  function gmStartLoops() {
    gmStopLoops();
    if (!gmLive) return;
    const l = gmLayer();
    if (l.querySelector('[data-gm-live="fps"]') || l.querySelector('[data-gm-live="frame"]')) { gmFrames = 0; gmFpsT0 = performance.now(); gmRaf = requestAnimationFrame(gmFpsLoop); }
    gmWatchBattery();
    gmTickTimer = setInterval(() => { if (gmPlaying()) gmAttachRelay(); gmFillLive(); }, 400);
    gmFillLive();
  }
  function gmRenderLive() {
    const l = gmLayer();
    l.innerHTML = '';
    gmLayout.filter((w) => w.on).forEach((w) => l.appendChild(gmWidgetEl(w)));
    requestAnimationFrame(() => gmPlaceAll(l));
    setTimeout(() => { if (gmLive) gmPlaceAll(l); }, 90);
    l.onclick = (e) => {
      const btn = e.target.closest('[data-gm-act]');
      if (!btn) return;
      const host = btn.closest('.gm-widget');
      const w = gmLayout.find((x) => x.id === host?.dataset.gmId);
      if (!w) return;
      e.preventDefault();
      e.stopPropagation();
      if (w.type === 'confer') { try { window.FlashConfer?.open?.(); } catch {} return; }
      if (w.type === 'stopwatch') {
        if (gmStopwatch.on) { gmStopwatch.acc += Date.now() - gmStopwatch.t0; gmStopwatch.on = false; }
        else { gmStopwatch.t0 = Date.now(); gmStopwatch.on = true; }
        btn.textContent = gmStopwatch.on ? 'pause' : 'start';
        gmFillLive();
        return;
      }
      if (w.type === 'counter') {
        w.count = Math.max(-9999, (Number(w.count) || 0) + (e.shiftKey || e.button === 2 ? -1 : 1));
        gmSet('layout', JSON.stringify(gmLayout));
        gmSetLiveText(host, 'count', w.count);
        return;
      }
      if (w.type === 'link') {
        if (!w.url) { toast('No link set', 'Open Game Mode and add a URL to this widget.', 'warn'); return; }
        const win = window.FlashBridge?.openWindow?.(w.url);
        if (!win) { try { navigator.clipboard?.writeText(w.url); } catch {} toast('Link copied', w.url, 'success'); }
      }
    };
    l.oncontextmenu = (e) => {
      const host = e.target.closest('.gm-widget-counter');
      if (!host) return;
      e.preventDefault();
      const w = gmLayout.find((x) => x.id === host.dataset.gmId);
      if (!w) return;
      w.count = Math.max(-9999, (Number(w.count) || 0) - 1);
      gmSet('layout', JSON.stringify(gmLayout));
      gmSetLiveText(host, 'count', w.count);
    };
    try { window.lucide?.createIcons?.({ root: l, attrs: { 'stroke-width': 1.5 } }); } catch {}
    gmStartLoops();
  }

  /* --- input: parent listeners + same-origin game-frame relay --- */
  function gmNoteKey(code, down) {
    if (down) gmKeysDown.add(code); else gmKeysDown.delete(code);
    if (!gmLive) return;
    const k = gmLayer().querySelector(`[data-gm-code="${code}"]`);
    if (k) k.classList.toggle('on', !!down);
  }
  function gmNoteClick(btn) { if (btn >= 0 && btn <= 1) gmClicks[btn].push(Date.now()); }
  function gmIsHot(e) { const combo = gmComboOf(e); return !!combo && !!gmHot && combo === gmHot; }
  window.addEventListener('keydown', (e) => {
    if (!e.repeat && gmIsHot(e) && gmPlaying()) { e.preventDefault(); e.stopPropagation(); gmToggle(); return; }
    if (!e.repeat) { gmKeyTimes.push(Date.now()); if (gmKeyTimes.length > 40) gmKeyTimes.shift(); }
    gmNoteKey(e.code, true);
  }, true);
  window.addEventListener('keyup', (e) => gmNoteKey(e.code, false), true);
  window.addEventListener('mousedown', (e) => { if (e.button === 0 || e.button === 2) gmNoteClick(e.button); }, true);

  const gmKd = (e) => { try { if (!e.repeat && gmIsHot(e)) gmToggle(); gmNoteKey(e.code, true); } catch {} };
  const gmKu = (e) => { try { gmNoteKey(e.code, false); } catch {} };
  const gmMd = (e) => { try { if (e.button === 0 || e.button === 2) gmNoteClick(e.button); } catch {} };
  /* Idempotent attach: stable handler refs + same target = never duplicated,
     so the tick can re-run this blindly. Frames swap documents (blob/srcdoc/
     Ruffle reloads) constantly — each 400ms tick re-binds whatever doc and
     window are current, healing every swap. Window capture is enough: it sees
     every event aimed at that window's documents, and binding the doc as well
     would double-fire each key (hotkey would toggle on→off→on, reading as
     dead). Cross-origin frames refuse contentWindow access (caught); the
     HUD button always works there. */
  function gmAttachRelay() {
    const fr = document.getElementById('gameFrame');
    if (!fr || !gmPlaying()) return;
    const bind = (w) => {
      if (!w) return;
      try {
        w.addEventListener('keydown', gmKd, true);
        w.addEventListener('keyup', gmKu, true);
        w.addEventListener('mousedown', gmMd, true);
        for (let i = 0; i < w.frames.length; i++) bind(w.frames[i]); // games that embed their own frames (emulators, cloud streams)
      } catch {} // cross-origin subframes refuse access; the HUD button always works
    };
    bind(fr.contentWindow);
  }
  new MutationObserver(() => {
    if (gmPlaying()) {
      if (!gmSessionStart) { gmSessionStart = Date.now(); gmAttachRelay(); }
    } else {
      gmSessionStart = 0;
      if (gmLive) gmSetLive(false);
    }
  }).observe(document.body, { attributes: true, attributeFilter: ['class'] });

  function gmSetLive(on) {
    if (on === gmLive) return;
    gmLive = on;
    gmLayer().classList.toggle('gm-on', on);
    const btn = document.querySelector('[data-player-action="gm"]');
    if (btn) btn.classList.toggle('active', on);
    if (on) gmRenderLive(); else gmStopLoops();
    gmApplyMods();
    toast(on ? 'Game mode on' : 'Game mode off', on ? `Press ${gmReadHot(gmHot)} to hide.` : '', on ? 'success' : 'info');
  }
  function gmToggle() { if (!gmPlaying()) return false; gmSetLive(!gmLive); return gmLive; }

  function gmApplyVars() {
    document.documentElement.style.setProperty('--gm-scale', gmGet('scale', '1'));
    document.documentElement.style.setProperty('--gm-op', gmGet('opacity', '78'));
  }
  gmApplyVars();

  let gmBrightness = gmNum(gmGet('brightness', '100'), 100, 50, 150);
  let gmBrightnessOn = gmGet('brightnessOn', '0') === '1';
  function gmApplyMods() {
    const frame = document.getElementById('gameFrame');
    if (!frame) return;
    const value = gmLive && gmBrightnessOn ? gmBrightness / 100 : 1;
    frame.style.filter = Math.abs(value - 1) > .005 ? `brightness(${value})` : '';
  }
  window.addEventListener('resize', () => { if (gmLive) gmPlaceAll(); });
  document.addEventListener('fullscreenchange', () => { if (gmLive) gmPlaceAll(); });

  /* --- settings editor: add, place, style, save --- */
  function gmOpenEditor() {
    document.getElementById('gmEditor')?.remove();
    let draft = gmLayout.map(gmNormalize);
    let selected = draft[0]?.id || '';
    let draftHot = gmHot;
    let tab = 'add';
    let recording = false;
    let draftBrightness = gmBrightness;
    let draftBrightnessOn = gmBrightnessOn;

    const bd = document.createElement('div');
    bd.id = 'gmEditor';
    bd.className = 'modal-backdrop';
    bd.innerHTML =
      `<section class="modal-card gm-editor-card" role="dialog" aria-modal="true">` +
      `<div class="panel-head"><div><span class="eyebrow">GAME MODE</span><h2>Build your game HUD</h2></div><button class="icon-btn" data-gm-close aria-label="Close"><i data-lucide="x"></i></button></div>` +
      `<div class="gm-editor-grid">` +
      `<div class="gm-stage">` +
      `<div class="gm-preview" data-gm-preview><div class="gm-sky"></div><div class="gm-sun"></div><div class="gm-floor"></div><div class="gm-grid"></div><div class="gm-horizon"></div><span class="gm-empty" data-gm-empty hidden>Nothing here yet — add a widget from the right.</span></div>` +
      `<p class="gm-stage-note">Drag to place · preview matches the live player area · double-click to centre</p></div>` +
      `<aside class="gm-side">` +
      `<div class="gm-tabs"><button type="button" data-gm-tab="add">Widgets</button><button type="button" data-gm-tab="look">Style</button><button type="button" data-gm-tab="mods">Mods</button></div>` +
      `<div class="gm-pane" data-gm-pane="add"></div>` +
      `<div class="gm-pane" data-gm-pane="look" hidden></div>` +
      `<div class="gm-pane" data-gm-pane="mods" hidden></div>` +
      `</aside></div>` +
      `<div class="gm-foot">` +
      `<button class="gm-hotkey-btn" data-gm-hotkey type="button"><kbd data-gm-hotkey-kbd>${esc(gmReadHot(draftHot))}</kbd><span data-gm-hotkey-lbl>Open shortcut</span></button>` +
      `<span class="gm-foot-spacer"></span>` +
      `<button class="btn" data-gm-reset type="button">Reset layout</button>` +
      `<button class="btn primary" data-gm-save type="button"><i data-lucide="check"></i>Save HUD</button>` +
      `</div>` +
      `<p class="panel-note" data-gm-note></p></section>`;
    document.body.appendChild(bd);
    refreshIcons(bd);

    const preview = bd.querySelector('[data-gm-preview]');
    preview.style.aspectRatio = gmStageAspect();
    const paneAdd = bd.querySelector('[data-gm-pane="add"]');
    const paneLook = bd.querySelector('[data-gm-pane="look"]');
    const paneMods = bd.querySelector('[data-gm-pane="mods"]');
    const noteEl = () => bd.querySelector('[data-gm-note]');
    const say = (msg) => { const n = noteEl(); if (n) n.textContent = msg || ''; };
    const sel = () => draft.find((x) => x.id === selected);
    function gmStageAspect() {
      const shell = document.querySelector('.player-shell');
      const width = shell?.clientWidth > 0 ? shell.clientWidth : Math.max(320, Math.min(1120, window.innerWidth - 56));
      const height = shell?.clientHeight > 0 ? shell.clientHeight : Math.max(220, Math.min(780, window.innerHeight * .84));
      return `${Math.max(1, width)} / ${Math.max(1, height)}`;
    }
    function placePreview() {
      preview.querySelectorAll('.gm-widget').forEach((el) => {
        const w = draft.find((item) => item.id === el.dataset.gmId);
        if (w) gmPlaceWidget(el, w);
      });
    }
    const onStageResize = () => { preview.style.aspectRatio = gmStageAspect(); placePreview(); };
    window.addEventListener('resize', onStageResize);

    function renderAdd() {
      const groups = GM_GROUPS.map((g) => {
        const list = GM_ORDER.filter((t) => GM_TYPES[t].group === g);
        if (!list.length) return '';
        return `<h3>${g}</h3><div class="gm-chips">` + list.map((t) =>
          `<button class="gm-add" data-gm-add="${t}" type="button">${icon(GM_TYPES[t].icon)}<span>${esc(GM_TYPES[t].label)}</span></button>`).join('') + `</div>`;
      }).join('');
      paneAdd.innerHTML = groups +
        `<h3>Make your own</h3>` +
        `<div class="gm-custom">` +
        `<input class="gm-input" data-gm-cname placeholder="Name it (e.g. Deaths)" maxlength="24">` +
        `<div class="segmented gm-kind">` +
        `<button type="button" data-gm-ckind="note" class="active">${icon('sticky-note')}Note</button>` +
        `<button type="button" data-gm-ckind="counter">${icon('hash')}Counter</button>` +
        `<button type="button" data-gm-ckind="link">${icon('link')}Link</button>` +
        `</div>` +
        `<input class="gm-input" data-gm-cval placeholder="Message, start value, or URL" maxlength="180">` +
        `<button class="btn primary gm-create" data-gm-create type="button">${icon('plus')}Create widget</button>` +
        `<p class="gm-hintline">Notes pin a message, counters count your taps, links jump to a page.</p>` +
        `</div>`;
      refreshIcons(paneAdd);
    }

    function rangeRow(key, label, min, max, step, value, suffix) {
      return `<label class="gm-field gm-range-field"><span>${label}<output data-gm-out="${key}">${value}${suffix || ''}</output></span>` +
        `<input class="gm-range" type="range" data-gm-f="${key}" min="${min}" max="${max}" step="${step}" value="${value}"></label>`;
    }

    function renderLook() {
      const w = sel();
      if (!w) {
        paneLook.innerHTML = `<div class="gm-empty-inspect">${icon('mouse-pointer-click')}<strong>Nothing selected</strong><span>Pick a widget on the left to change how it looks, what it says and where it sits.</span></div>`;
        refreshIcons(paneLook);
        return;
      }
      const t = GM_TYPES[w.type];
      const typeFields =
        w.type === 'note'
          ? `<label class="gm-field gm-wide-field"><span>Message</span><textarea class="gm-input" data-gm-f="text" rows="3" maxlength="180" placeholder="Type the note shown over the game">${esc(w.text)}</textarea></label>`
          : w.type === 'link'
            ? `<label class="gm-field gm-wide-field"><span>URL</span><input class="gm-input" data-gm-f="url" maxlength="300" placeholder="https://example.com" value="${esc(w.url)}"></label>`
            : w.type === 'counter'
              ? `<label class="gm-field"><span>Start value</span><input class="gm-input" type="number" data-gm-f="count" value="${Number(w.count) || 0}"></label>`
              : '';
      paneLook.innerHTML =
        `<div class="gm-inspect-head">` +
        `<span class="gm-inspect-badge">${icon(w.icon || t.icon)}</span>` +
        `<div><strong>${esc(w.label || t.label)}</strong><small>${esc(t.label)}</small></div>` +
        `<button class="icon-btn gm-inspect-del" data-gm-del type="button" aria-label="Delete widget">${icon('trash-2')}</button>` +
        `</div>` +
        `<label class="gm-field"><span>Label</span><input class="gm-input" data-gm-f="label" maxlength="24" placeholder="${esc(t.label)}" value="${esc(w.label)}"></label>` +
        `<label class="gm-field"><span>Icon <small>lucide name</small></span><input class="gm-input" data-gm-f="icon" maxlength="32" placeholder="${esc(t.icon)}" value="${esc(w.icon)}"></label>` +
        `<div class="gm-field gm-wide-field"><span>Look</span><div class="gm-swatches">` +
        GM_STYLES.map(([s, l]) => `<button type="button" class="gm-swatch gm-swatch-${s} ${w.style === s ? 'active' : ''}" data-gm-style="${s}">${l}</button>`).join('') +
        `</div></div>` +
        rangeRow('size', 'Size', GM_SIZE_MIN, GM_SIZE_MAX, 0.05, w.size, '×') +
        rangeRow('opacity', 'Opacity', 10, 100, 1, w.opacity, '%') +
        rangeRow('radius', 'Corners', 0, 28, 1, w.radius, 'px') +
        `<div class="gm-field gm-wide-field"><span>Accent <small>blank matches your theme</small></span><div class="gm-accent-row">` +
        `<input type="color" class="gm-color" data-gm-f="accent" value="${esc(w.accent || '#ff5c35')}">` +
        `<button class="btn tiny" type="button" data-gm-accent-clear>Use theme</button></div></div>` +
        typeFields +
        `<div class="gm-inspect-actions">` +
        `<button class="btn tiny" type="button" data-gm-dupe>${icon('copy')}Duplicate</button>` +
        `<button class="btn tiny" type="button" data-gm-toggle>${icon(w.on ? 'eye' : 'eye-off')}${w.on ? 'Hide' : 'Show'}</button>` +
        `</div>`;
      refreshIcons(paneLook);
    }

    function renderMods() {
      const pct = Math.round(draftBrightness);
      paneMods.innerHTML =
        `<div class="gm-mod-card">` +
        `<div class="gm-mod-head"><div><strong>Brightness</strong><small>Dim or lift the game without touching the HUD.</small></div><button type="button" class="gm-mod-toggle${draftBrightnessOn ? ' on' : ''}" data-gm-bright-toggle aria-pressed="${draftBrightnessOn}" aria-label="Toggle brightness mod"><span></span></button></div>` +
        `<label class="gm-field gm-range-field"><span>Game brightness<output data-gm-bright-out>${pct}%</output></span><input class="gm-range" type="range" data-gm-brightness min="50" max="150" step="1" value="${pct}"></label>` +
        `<div class="gm-mod-actions"><button class="btn tiny" type="button" data-gm-bright-reset>Reset 100%</button><span class="gm-hintline">Saved with the HUD</span></div>` +
        `</div>` +
        `<p class="gm-hintline">Brightness filters the game frame only while Game Mode is active. The widgets stay at full brightness.</p>`;
      const range = paneMods.querySelector('[data-gm-brightness]');
      const out = paneMods.querySelector('[data-gm-bright-out]');
      const toggle = paneMods.querySelector('[data-gm-bright-toggle]');
      range.oninput = () => { draftBrightness = Number(range.value); if (out) out.textContent = `${draftBrightness}%`; };
      toggle.onclick = () => {
        draftBrightnessOn = !draftBrightnessOn;
        toggle.classList.toggle('on', draftBrightnessOn);
        toggle.setAttribute('aria-pressed', String(draftBrightnessOn));
      };
      paneMods.querySelector('[data-gm-bright-reset]').onclick = () => { draftBrightness = 100; draftBrightnessOn = false; renderMods(); };
      refreshIcons(paneMods);
    }

    function drawPreview() {
      preview.querySelectorAll('.gm-widget').forEach((n) => n.remove());
      draft.forEach((w) => {
        const el = gmWidgetEl(w);
        if (w.id === selected) el.classList.add('gm-selected');
        el.insertAdjacentHTML('beforeend', `<span class="gm-tools"><button data-gm-del type="button" aria-label="Remove">${icon('trash-2')}</button></span>`);
        preview.appendChild(el);
      });
      bd.querySelector('[data-gm-empty]').hidden = draft.length > 0;
      requestAnimationFrame(placePreview);
      setTimeout(placePreview, 90);
      // Never rebuild the inspector here — it holds the field being typed in.
      refreshIcons(preview);
    }

    function paintLook() { if (tab === 'look') renderLook(); }
    function setTab(next) {
      tab = next;
      bd.querySelectorAll('[data-gm-tab]').forEach((b) => b.classList.toggle('active', b.dataset.gmTab === next));
      paneAdd.hidden = next !== 'add';
      paneLook.hidden = next !== 'look';
      paneMods.hidden = next !== 'mods';
      if (next === 'look') renderLook();
      else if (next === 'mods') renderMods();
      else renderAdd();
    }
    function selectWidget(id) {
      selected = id;
      setTab('look');
      drawPreview();
    }

    /* --- preview interactions --- */
    let drag = null;
    preview.addEventListener('pointerdown', (e) => {
      if (e.target.closest('.gm-tools')) return;
      const el = e.target.closest('.gm-widget');
      if (!el) return;
      e.preventDefault();
      const w = draft.find((x) => x.id === el.dataset.gmId);
      if (!w) return;
      if (selected !== w.id) { selected = w.id; setTab('look'); }
      preview.querySelectorAll('.gm-widget').forEach((n) => n.classList.toggle('gm-selected', n === el));
      const box = preview.getBoundingClientRect();
      drag = { el, w, box, grabX: e.clientX - box.left - el.offsetLeft, grabY: e.clientY - box.top - el.offsetTop, maxX: Math.max(0, preview.clientWidth - el.offsetWidth), maxY: Math.max(0, preview.clientHeight - el.offsetHeight) };
      el.classList.add('dragging');
      try { el.setPointerCapture(e.pointerId); } catch {}
    });
    preview.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const left = Math.max(0, Math.min(drag.maxX, e.clientX - drag.box.left - drag.grabX));
      const top = Math.max(0, Math.min(drag.maxY, e.clientY - drag.box.top - drag.grabY));
      drag.w.x = drag.maxX ? Math.round((left / drag.maxX) * 100) : 0;
      drag.w.y = drag.maxY ? Math.round((top / drag.maxY) * 100) : 0;
      drag.el.style.left = `${left}px`;
      drag.el.style.top = `${top}px`;
    });
    const endDrag = () => { if (drag) { drag.el.classList.remove('dragging'); drag = null; } };
    preview.addEventListener('pointerup', endDrag);
    preview.addEventListener('pointercancel', endDrag);
    preview.addEventListener('dblclick', (e) => {
      const el = e.target.closest('.gm-widget');
      if (!el) return;
      const w = draft.find((x) => x.id === el.dataset.gmId);
      if (!w) return;
      w.x = 50; w.y = 45;
      drawPreview();
    });
    preview.addEventListener('click', (e) => {
      const el = e.target.closest('.gm-widget');
      if (!el) return;
      if (e.target.closest('[data-gm-del]')) {
        draft = draft.filter((x) => x.id !== el.dataset.gmId);
        if (selected === el.dataset.gmId) selected = draft[0]?.id || '';
        drawPreview();
        renderLook();
        return;
      }
      selectWidget(el.dataset.gmId);
    });

    /* --- add pane --- */
    paneAdd.addEventListener('click', (e) => {
      const add = e.target.closest('[data-gm-add]');
      if (add) {
        const type = add.dataset.gmAdd;
        const w = gmNormalize({ id: gmUid(), type, x: 30 + (draft.length % 5) * 8, y: 28 + (draft.length % 4) * 11, on: 1 });
        draft.push(w);
        selected = w.id;
        drawPreview();
        setTab('look');
        say(`${GM_TYPES[type].label} added — drag it into place.`);
        return;
      }
      const kind = e.target.closest('[data-gm-ckind]');
      if (kind) {
        paneAdd.querySelectorAll('[data-gm-ckind]').forEach((b) => b.classList.toggle('active', b === kind));
        const val = paneAdd.querySelector('[data-gm-cval]');
        if (val) val.placeholder = kind.dataset.gmCkind === 'note' ? 'Message shown over the game' : kind.dataset.gmCkind === 'link' ? 'https://example.com' : 'Start value (0)';
        return;
      }
      if (e.target.closest('[data-gm-create]')) {
        const nameInput = paneAdd.querySelector('[data-gm-cname]');
        const valInput = paneAdd.querySelector('[data-gm-cval]');
        const kindBtn = paneAdd.querySelector('[data-gm-ckind].active');
        const type = kindBtn?.dataset.gmCkind || 'note';
        const raw = String(valInput?.value || '').trim();
        const w = gmNormalize({ id: gmUid(), type, x: 34 + (draft.length % 4) * 8, y: 34, on: 1, label: String(nameInput?.value || '').trim().slice(0, 24) });
        if (type === 'note') w.text = raw.slice(0, 180);
        if (type === 'link') w.url = /^https?:\/\//i.test(raw) ? raw : (raw ? `https://${raw}` : '');
        if (type === 'counter') w.count = Number.isFinite(Number(raw)) ? Math.round(Number(raw)) : 0;
        draft.push(w);
        selected = w.id;
        if (nameInput) nameInput.value = '';
        if (valInput) valInput.value = '';
        drawPreview();
        setTab('look');
        say(`${GM_TYPES[type].label} widget created.`);
      }
    });

    /* --- style pane --- */
    paneLook.addEventListener('click', (e) => {
      const w = sel();
      const styleBtn = e.target.closest('[data-gm-style]');
      if (styleBtn && w) {
        w.style = styleBtn.dataset.gmStyle;
        drawPreview();
        renderLook();
        return;
      }
      if (!w) return;
      if (e.target.closest('[data-gm-del]')) {
        draft = draft.filter((x) => x.id !== w.id);
        selected = draft[0]?.id || '';
        drawPreview();
        renderLook();
        return;
      }
      if (e.target.closest('[data-gm-accent-clear]')) { w.accent = ''; drawPreview(); renderLook(); return; }
      if (e.target.closest('[data-gm-dupe]')) {
        const copy = gmNormalize({ ...w, id: gmUid(), x: Math.min(96, w.x + 4), y: Math.min(96, w.y + 4) });
        draft.push(copy);
        selected = copy.id;
        drawPreview();
        renderLook();
        return;
      }
      if (e.target.closest('[data-gm-toggle]')) { w.on = w.on ? 0 : 1; drawPreview(); renderLook(); return; }
      if (e.target.closest('[data-gm-close]')) { closeEd(); return; }
    });
    paneLook.addEventListener('input', (e) => {
      const w = sel();
      const field = e.target.closest('[data-gm-f]');
      if (!w || !field) return;
      const key = field.dataset.gmF;
      if (key === 'size' || key === 'opacity' || key === 'radius') {
        w[key] = Number(field.value);
        const out = paneLook.querySelector(`[data-gm-out="${key}"]`);
        if (out) out.textContent = `${field.value}${key === 'size' ? '×' : key === 'opacity' ? '%' : 'px'}`;
      } else if (key === 'count') {
        w.count = Number(field.value) || 0;
      } else {
        w[key] = field.value;
      }
      drawPreview();
      if (key === 'label' || key === 'icon') {
        const head = paneLook.querySelector('.gm-inspect-head');
        if (head) {
          const strong = head.querySelector('strong');
          if (strong) strong.textContent = w.label || GM_TYPES[w.type].label;
        }
      }
    });

    /* --- shortcut recorder --- */
    const hotBtn = bd.querySelector('[data-gm-hotkey]');
    const kbdEl = bd.querySelector('[data-gm-hotkey-kbd]');
    const hotLbl = bd.querySelector('[data-gm-hotkey-lbl]');
    const onRecKey = (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.code === 'Escape' && !e.ctrlKey && !e.metaKey) { stopRec('Shortcut unchanged.'); return; }
      if (e.repeat) return;
      const combo = gmComboOf(e);
      if (!combo) return;
      draftHot = combo;
      stopRec('');
    };
    function stopRec(message) {
      document.removeEventListener('keydown', onRecKey, true);
      recording = false;
      hotBtn?.classList.remove('recording');
      if (kbdEl) kbdEl.textContent = gmReadHot(draftHot);
      if (hotLbl) hotLbl.textContent = 'Open shortcut';
      const reserved = ['Ctrl+T', 'Ctrl+W', 'Ctrl+N', 'Ctrl+Q', 'Meta+T', 'Meta+W', 'Meta+N', 'Ctrl+Shift+T'].includes(draftHot);
      say(message || (reserved ? 'Browsers reserve that combo — it may never fire. Try adding Shift.' : ''));
    }
    hotBtn?.addEventListener('click', () => {
      recording = !recording;
      hotBtn.classList.toggle('recording', recording);
      if (recording) {
        if (kbdEl) kbdEl.textContent = 'Press keys…';
        if (hotLbl) hotLbl.textContent = 'Esc cancels';
        say('');
        document.addEventListener('keydown', onRecKey, true);
      } else stopRec('');
    });

    /* --- footer --- */
    bd.querySelector('[data-gm-reset]')?.addEventListener('click', () => {
      draft = gmDefaultLayout();
      selected = draft[0]?.id || '';
      drawPreview();
      renderLook();
      say('Layout reset to the defaults — save to keep it.');
    });
    const closeEd = () => {
      document.removeEventListener('keydown', onRecKey, true);
      document.removeEventListener('keydown', onEdKeys, true);
      window.removeEventListener('resize', onStageResize);
      bd.remove();
    };
    const onEdKeys = (e) => {
      if (e.key === 'Escape' && !recording) { closeEd(); return; }
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName || '');
      if (!typing && selected && (e.key === 'Delete' || e.key === 'Backspace')) {
        e.preventDefault();
        draft = draft.filter((x) => x.id !== selected);
        selected = draft[0]?.id || '';
        drawPreview();
        renderLook();
      }
    };
    document.addEventListener('keydown', onEdKeys, true);
    bd.querySelector('[data-gm-save]')?.addEventListener('click', () => {
      gmLayout.length = 0;
      draft.forEach((w) => gmLayout.push(gmNormalize(w)));
      gmHot = draftHot || gmHot;
      gmSet('layout', JSON.stringify(gmLayout));
      gmSet('hotkey', gmHot);
      gmSet('brightness', String(draftBrightness));
      gmSet('brightnessOn', draftBrightnessOn ? '1' : '0');
      gmSet('setup', '1');
      gmBrightness = draftBrightness;
      gmBrightnessOn = draftBrightnessOn;
      gmApplyVars();
      gmApplyMods();
      if (gmLive) gmRenderLive();
      toast('Game mode saved', gmLive ? 'Live HUD and mods updated.' : `Press ${gmReadHot(gmHot)} in a game to open it.`, 'success');
      closeEd();
    });
    bd.addEventListener('click', (e) => { if (e.target === bd || e.target.closest('[data-gm-close]')) closeEd(); });

    bd.querySelectorAll('[data-gm-tab]').forEach((b) => b.addEventListener('click', () => setTab(b.dataset.gmTab)));
    setTab('add');
    drawPreview();
  }
  document.addEventListener('click', (e) => { if (e.target.closest('.gamemode-open')) { e.preventDefault(); gmOpenEditor(); } });

  function gmOpenSettingsHighlight() {
    try {
      setRoute('settings');
      setTimeout(() => {
        const row = document.querySelector('.gamemode-open');
        if (!row) return;
        row.scrollIntoView({ block: 'center', behavior: 'auto' });
        row.classList.add('gm-highlight');
        setTimeout(() => row.classList.remove('gm-highlight'), 4200);
      }, 260);
    } catch {}
  }

  /* --- startup notice (same pattern as Setup Optimizer) --- */
  function noticeGameMode() {
    if (window.__CLOAKED__ || document.getElementById('gmNotice')) return;
    if ([...document.querySelectorAll('.modal-backdrop')].some((node) => node.id !== 'gmNotice' && !node.hidden)) {
      setTimeout(noticeGameMode, 1800);
      return;
    }
    if (gmGet('setup', '') === '1' || gmGet('notice', '') === '0') return;
    const bd = document.createElement('div');
    bd.id = 'gmNotice';
    bd.className = 'modal-backdrop';
    bd.innerHTML =
      `<section class="modal-card" role="dialog" aria-modal="true">` +
      `<div class="panel-head"><div><span class="eyebrow">NEW IN 5.4.4</span><h2>Game Mode</h2></div><button class="icon-btn" data-gmn-close aria-label="Close"><i data-lucide="x"></i></button></div>` +
      `<p class="panel-note">Build your own in-game HUD: 17 widget types — FPS, frame time, keystrokes, input stats, controller, clock, date, session timer, stopwatch, connection, battery, memory, now playing and Confer — plus your own notes, counters and links. Style each one, drag it anywhere, and use the Mods tab for brightness.</p>` +
      `<label class="cloak-ask-toggle"><input type="checkbox" id="gmDontNotice"><span><strong>Don't show again</strong><small>Dismisses this startup prompt for good.</small></span></label>` +
      `<div class="dialog-actions"><button class="btn" data-gmn-later type="button">Not now</button><button class="btn primary" data-gmn-go type="button"><i data-lucide="gamepad-2"></i> Set it up in Settings</button></div></section>`;
    document.body.appendChild(bd);
    refreshIcons(bd);
    const closeN = () => bd.remove();
    const stay = () => { if (bd.querySelector('#gmDontNotice')?.checked) gmSet('notice', '0'); };
    bd.addEventListener('click', (e) => { if (e.target === bd || e.target.closest('[data-gmn-close]')) { stay(); closeN(); } });
    bd.querySelector('[data-gmn-later]')?.addEventListener('click', () => { stay(); closeN(); });
    bd.querySelector('[data-gmn-go]')?.addEventListener('click', () => { stay(); closeN(); gmOpenSettingsHighlight(); });
  }
  setTimeout(noticeGameMode, 3400);

  window.GameMode = {
    toggle: gmToggle,
    isActive: () => gmLive,
    editor: gmOpenEditor,
    setup: gmOpenSettingsHighlight,
    types: () => GM_ORDER.slice()
  };

  function askCloakOnBoot() {
    try {
      if (window.__CLOAKED__) return;
      const choice = localStorage.getItem('flashgames.cloak.auto');
      if (choice === '0') return;                       // never
      if (choice === '1' && window.FlashCloak) { window.FlashCloak.launch(); return; } // always
      if ([...document.querySelectorAll('.modal-backdrop')].some((node) => !node.hidden)) { setTimeout(askCloakOnBoot, 1800); return; }
      const backdrop = document.createElement('div');
      backdrop.id = 'cloakAskBackdrop'; backdrop.className = 'modal-backdrop';
      backdrop.innerHTML =
        `<section class="modal-card" role="dialog" aria-modal="true" aria-labelledby="cloakAskTitle">` +
        `<div class="panel-head"><div><span class="eyebrow">CLOAK</span><h2 id="cloakAskTitle">Browse under about:blank?</h2></div><button class="icon-btn" data-cloak-later aria-label="Close"><i data-lucide="x"></i></button></div>` +
        `<p class="panel-note">Flash Games runs natively inside about:blank — every script, game and save loads directly into it. An app-style window hides the address bar completely. Your current window stays untouched.</p>` +
        `<label class="cloak-ask-toggle"><input type="checkbox" id="cloakDontAsk"><span><strong>Don't show this again</strong><small>Apply this answer at every startup.</small></span></label>` +
        `<div class="dialog-actions"><button class="btn" id="cloakLater">Not now</button><button class="btn primary" id="cloakYes"><i data-lucide="ghost"></i> Open app window</button></div></section>`;
      document.body.appendChild(backdrop);
      const close = () => backdrop.remove();
      backdrop.addEventListener('click', (e) => { if (e.target === backdrop || e.target.closest('[data-cloak-later]')) close(); });
      const decide = (value, launch, mode) => {
        const dont = backdrop.querySelector('#cloakDontAsk')?.checked;
        if (dont) localStorage.setItem('flashgames.cloak.auto', value); // '0' never / '1' always
        try { if (mode) localStorage.setItem('flashgames.cloak.mode', mode); } catch {}
        close();
        if (launch) window.FlashCloak?.launch?.(mode);
      };
      backdrop.querySelector('#cloakLater')?.addEventListener('click', () => decide('0', false, null));
      backdrop.querySelector('#cloakYes')?.addEventListener('click', () => decide('1', true, 'app'));
      window.lucide?.createIcons?.({ root: backdrop, attrs: { 'stroke-width': 1.5 } });
    } catch {}
  }

  function checkStartupNotifications() {
    try {
      const lastSeenUpdate = localStorage.getItem('flashgames.lastSeenUpdate') || '0.0.0';
      const lastSeenArticle = localStorage.getItem('flashgames.lastSeenArticle') || '';
      const currentVersion = state.updates?.version || '0.0.0';
      const latestArticle = state.articles?.[0]?.id || '';

      if (currentVersion !== lastSeenUpdate) {
        localStorage.setItem('flashgames.lastSeenUpdate', currentVersion);
        setTimeout(() => {
          confirmDialog('New Update!', `Version ${esc(currentVersion)} is now available.`, () => {
            setRoute('updates');
            state.updatesView = 'whatsnew';
            renderUpdates();
          }, false, 'View Update');
        }, 800);
      }

      if (latestArticle && latestArticle !== lastSeenArticle) {
        localStorage.setItem('flashgames.lastSeenArticle', latestArticle);
        setTimeout(() => {
          confirmDialog('New Article!', `New article: "${esc(state.articles[0].title)}"`, () => {
            setRoute('updates');
            state.updatesView = 'articles';
            renderUpdates();
            setTimeout(() => openArticle(latestArticle), 100);
          }, false, 'Read Article');
        }, 1200);
      }
    } catch {}
  }

  function autoLightMode() {
    try {
      if (localStorage.getItem('flashgames.performance')) return; // user's own choice
      const mem = Number(navigator.deviceMemory || 0);
      const cores = Number(navigator.hardwareConcurrency || 0);
      const lite = (mem > 0 && mem <= 4) || (cores > 0 && cores <= 4);
      if (lite) { localStorage.setItem('flashgames.performance', '1'); state.performance = true; toast('Lite graphics on', 'This device is modest — interface effects were disabled for 60fps.', 'info'); }
    } catch {}
  }

  async function init() {
    initLegal();
    autoLightMode();
    // Popup shield: nothing in Flash Games is ever meant to open in a new
    // tab — main window or framed client, the API is dead on arrival.
    // Popup shield: games never spawn tabs. The one exception is the user-
    // initiated Cloak, which captures native window.open BEFORE the shield.
    try {
      const nativeOpen = window.open.bind(window);
      window.open = function() { return null; };
      window.FlashCloak = Object.freeze({
        EXIT_PAGE(msg) {
          const note = String(msg || 'You can close this tab.');
          return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>about:blank</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0b0d12;color:#e8eaf2;font-family:system-ui,sans-serif}p{opacity:.85;font-size:15px;max-width:70%;text-align:center}</style></head><body><p>${esc(note)}</p></body></html>`;
        },
        async launch(mode) {
          if (window.__CLOAKED__) { toast('Already cloaked', 'This tab is already an about:blank session.'); return; }
          let useMode = mode || 'app';
          try { useMode = mode || localStorage.getItem('flashgames.cloak.mode') || 'app'; } catch {}
          const appLike = useMode !== 'tab';
          const availW = Math.max(480, Number(screen?.availWidth) || 1280);
          const availH = Math.max(360, Number(screen?.availHeight) || 800);
          // Leave a margin around the popup. A full-work-area popup at 0,0 is
          // what Chrome treats as "reuse the current window" — it opens a tab
          // or hides the window behind the browser. A smaller centered one is
          // a real popup.
          const W = Math.min(availW, 1360, Math.max(720, Math.round(availW * 0.92)));
          const H = Math.min(availH, 900, Math.max(540, Math.round(availH * 0.92)));
          const winLeft = Math.max(0, Math.round((availW - W) / 2));
          const winTop = Math.max(0, Math.round((availH - H) / 2));
          // Chrome on macOS opens scripted windows as tabs while the browser is
          // in full screen (⌃⌘F). Say so instead of silently handing over a tab.
          const chromeFullScreen = (() => {
            try {
              return /Chrome\//.test(navigator.userAgent) && Number(screen?.height) > 0 &&
                window.outerHeight >= Number(screen.height) - 2 &&
                (window.outerHeight - window.innerHeight) < 48;
            } catch { return false; }
          })();
          if (appLike && chromeFullScreen) {
            confirmDialog('Chrome is in full screen', 'Chrome opens scripted windows as tabs while it is in full screen. Press ⌃⌘F (or click the green window button) to leave full screen, then launch again for a real window. You can also continue and open it as a tab now.', () => { try { window.FlashCloak.launch('tab'); } catch {} });
            return;
          }
          // Open FIRST (sync, inside the click gesture) — any await before
          // window.open drops the activation and browsers block the popup.
          // A FRESH name every launch is what makes this a real new window:
          // reusing one name retargets the tab that already owns it, which is
          // exactly why this used to open as a tab. The popup feature string
          // (popup=1 + size) is what asks for a window instead of a tab.
          const winName = 'fgcloak_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
          const features = appLike
            ? `popup=1,width=${W},height=${H},left=${winLeft},top=${winTop},menubar=no,toolbar=no,location=no,status=no,scrollbars=no,resizable=yes`
            : '';
          let win = null;
          try { win = features ? nativeOpen('about:blank', winName, features) : nativeOpen('about:blank', winName); } catch {}
          let effectiveApp = appLike && !!win;
          if (!win) { try { win = nativeOpen('about:blank', 'fgcloak_fb_' + Date.now().toString(36)); } catch {} effectiveApp = false; }
          if (!win) {
            confirmDialog('Pop-ups are blocked', 'Chrome blocked the blank window. Click the blocked-pop-up icon in the address bar, choose "Always allow", then click Continue to try again. You can also use the about:blank tab option.', () => { try { window.FlashCloak.launch('app'); } catch {} });
            return;
          }
          try { win.document.write('<!DOCTYPE html><title>Flash Games</title><p style="display:grid;place-items:center;min-height:90vh;margin:0;color:#9aa1b2">Loading cloaked session…</p>'); } catch {}
          const fallback = (note) => { try { win.document.open(); win.document.write(window.FlashCloak.EXIT_PAGE(note)); win.document.close(); } catch {} };

          // Everything ships INTO the blank document: markup, styles and all
          // five scripts are inlined, so nothing is framed and nothing has to
          // be re-fetched by the new window. <base> keeps every runtime fetch
          // (game packs, clients.json, wasm, assets) pointing at this origin.
          const readAsset = async (path) => {
            try {
              const res = await fetch(path, { cache: 'force-cache' });
              return res.ok ? await res.text() : '';
            } catch { return ''; }
          };
          const [html, css, quickqCss, coreJs, adminJs, authJs, extrasJs, quickqJs, appJs] = await Promise.all([
            readAsset('./index.html'), readAsset('./styles.css'), readAsset('./quickq.css'),
            readAsset('./core.js'), readAsset('./admin.js'), readAsset('./auth.js'),
            readAsset('./extras.js'), readAsset('./quickq.js'), readAsset('./app.js')
          ]);
          if (!html || !/<html/i.test(html)) { fallback('The app shell could not be read, so this blank window was left empty.'); toast('Cloak unavailable', "The app shell couldn't be read from this location.", 'error'); return; }
          if (!coreJs || !quickqJs || !appJs) { fallback('The app scripts could not be read, so this blank window was left empty.'); toast('Cloak unavailable', 'The app scripts could not be read from this location.', 'error'); return; }

          const safeJs = (code) => String(code).replace(/<\/script/gi, '<\\/script');
          const baseHref = String(location.href).replace(/[?#].*$/, '').replace(/[^/]*$/, '').replace(/"/g, '%22');

          let shell = html;
          // Local stylesheets → inline styles.
          shell = shell.replace(/<link[^>]*href=["']\.?\/?styles\.css["'][^>]*>/i, `<style>\n${css}\n</style>`);
          shell = shell.replace(/<link[^>]*href=["']\.?\/?quickq\.css["'][^>]*>/i, `<style>\n${quickqCss}\n</style>`);
          // Local app scripts → inline scripts (external CDNs stay as-is).
          const scriptMap = {
            './core.js': coreJs, './admin.js': adminJs, './auth.js': authJs,
            './extras.js': extrasJs, './quickq.js': quickqJs, './app.js': appJs
          };
          shell = shell.replace(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>\s*<\/script>/gi, (tag, src) => {
            const key = String(src).replace(/^\.\//, './');
            const code = scriptMap[key] || scriptMap[key.toLowerCase()];
            return code ? `<script>\n${safeJs(code)}\n</script>` : tag;
          });

          const exitScript = '<script>(function(){var ex=function(){try{document.open();document.write(' + JSON.stringify(window.FlashCloak.EXIT_PAGE()) + ');document.close();}catch(e){window.close();}};window.__flashCloakExit=ex;document.addEventListener("keydown",function(e){if(e.shiftKey&&(e.key==="End"||e.code==="End")){e.preventDefault();ex();}});})()<\/script>';
          const headInject = `<base href="${baseHref}">\n<script>window.__CLOAKED__ = true;</script>`;
          shell = shell.replace(/<head(\s[^>]*)?>/i, (m) => `${m}\n${headInject}`);
          // Use the LAST </body>: app.js itself embeds "</body>" in its EXIT_PAGE
          // string, and the first match would inject the exit <script> inside
          // the inlined app.js block, closing it early and dumping source text.
          const bodyEnd = shell.toLowerCase().lastIndexOf('</body>');
          if (bodyEnd !== -1) shell = shell.slice(0, bodyEnd) + exitScript + '\n' + shell.slice(bodyEnd);

          try {
            if (appLike) { try { win.resizeTo(W, H); win.moveTo(winLeft, winTop); } catch {} }
            const doc = win.document;
            doc.open(); doc.write(shell); doc.close();
            if (appLike) { try { win.focus(); } catch {} }
            toast('Cloaked', effectiveApp ? 'Flash Games is running natively in a blank app window. Press Shift+End to blank it.' : 'Flash Games is running in a blank window. Press Shift+End to blank it.', 'success');
          } catch (error) { fallback('This window could not be written, so it was left empty.'); try { win.close(); } catch {} toast('Cloak failed', error.message || 'The window could not be written.', 'error'); }
        }
      });
    } catch {}

    const dlDock = document.createElement('div');
    dlDock.id = 'dlDock'; dlDock.className = 'dl-dock'; dlDock.hidden = true;
    document.body.appendChild(dlDock);
    document.addEventListener('click', handleClick); document.addEventListener('keydown', handleGlobalKeys); window.addEventListener('hashchange', () => setRoute(location.hash.replace('#', '') || 'home')); window.addEventListener('scroll', syncNavCondense, { passive: true }); window.addEventListener('resize', () => { requestAnimationFrame(syncNavCondense); requestAnimationFrame(refreshNavIndicator); }, { passive: true }); window.addEventListener('flashgames:library-changed', async () => { await loadInstalled(); rerenderRoute(); renderProfile(); });
    // Initialize mermaid early so it's ready when articles render
    if (window.mermaid) {
      mermaid.initialize({ startOnLoad: false, theme: 'dark', themeVariables: { primaryColor: '#ff5c35', primaryTextColor: '#fff', primaryBorderColor: '#ff5c35', lineColor: '#9aa1b2', secondaryColor: '#1a1a2e', tertiaryColor: '#2a2a3e' }, suppressErrors: true, logLevel: 'error' });
    }
    // Background refreshes replay into the UI without a reload: the newest
    // listing simply repaints whatever view is open.
    window.addEventListener('flashgames:catalogue-updated', (event) => {
      const games = Array.isArray(event.detail?.games) ? event.detail.games : null;
      if (!games || !games.length || games.length === state.games.length) return;
      state.games = games;
      if (state.route === 'games') paintView(renderGames); else rerenderRoute();
    });
    // Cloud titles open inside the player, so they are plays like any other.
    window.addEventListener('flashgames:cloud-open', () => {
      state.stats.played += 1;
      state.stats.cloud = Number(state.stats.cloud || 0) + 1;
      if (!state.gameStartedAt) state.gameStartedAt = Date.now();
      saveStats();
    });
    handleSettings(); handleSearch(); applyPreferences(); refreshIcons();
    renderMermaid();
    setTimeout(askCloakOnBoot, 1400);
    setTimeout(noticeOptimizer, 2400);
    ensureEaglerClients().catch(() => {});
    try {
      await loadInstalled(); state.favourites = FlashGamesStore.getFavourites();
      const [catalogue, updates] = await Promise.all([FlashData.loadGames(), FlashData.loadUpdates()]); state.games = catalogue.games || []; state.updates = updates; state.articles = updates.articles || [];
      renderProfile(); renderNotifications(); updateAdminVisibility(); setRoute(state.route);
      checkStartupNotifications();
      const auth = window.__flashFirebase?.auth; if (auth) auth.onAuthStateChanged((user) => loadUserProfile(user));
      if (state.games.length === 0) toast('Game catalogue unavailable', 'GitHub could not be reached. Existing installed games are still available.', 'error');
      if (state.games.length >= 300) toast('Catalogue ready', `${state.games.length.toLocaleString()} games are available.`, 'success');
    } catch (error) { console.error('Flash Games initialization failed:', error); toast('Startup error', error.message || 'Flash Games could not finish loading.', 'error'); renderHome(); }
  }

  document.addEventListener('DOMContentLoaded', init, { once: true });
})();
