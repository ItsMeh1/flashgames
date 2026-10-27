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
    theme: localStorage.getItem('flashgames.theme') || 'dark', accent: localStorage.getItem('flashgames.accent') || '#8b5cf6',
    opacity: Number(localStorage.getItem('flashgames.opacity') || 66), blur: Number(localStorage.getItem('flashgames.blur') || 20),
    motion: localStorage.getItem('flashgames.motion') !== '0', performance: localStorage.getItem('flashgames.performance') === '1', cloakAuto: localStorage.getItem('flashgames.cloak.auto') === '1',
    updatesView: 'whatsnew', socialView: 'confer',
    objectUrl: null, gameStartedAt: 0, searchTimer: null
  };

  function loadStats() {
    try { const v = JSON.parse(localStorage.getItem('flashgames.stats') || '{}'); return { played: Number(v.played || 0), time: Number(v.time || 0), installs: Number(v.installs || 0) }; }
    catch { return { played: 0, time: 0, installs: 0 }; }
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

  function applyPreferences() {
    document.documentElement.style.setProperty('--accent', state.accent);
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
    let top = 68, bottom = 0;
    try {
      const tb = document.getElementById('topbar');
      if (tb) { const r = tb.getBoundingClientRect(); if (r.height > 0) top = Math.round(r.bottom) + 8; }
      const dock = document.querySelector('.bottom-dock');
      if (dock && dock.getBoundingClientRect().height > 0) bottom = Math.round(window.innerHeight - dock.getBoundingClientRect().top) + 8;
    } catch {}
    fill.style.setProperty('--social-top', `${top}px`);
    fill.style.setProperty('--social-bottom', `${bottom}px`);
  }

  function renderSocial() {
    const target = $('#socialView'); if (!target) return;
    if (!target.dataset.shell) {
      target.dataset.shell = '1';
      target.innerHTML = `<div class="social-fill">
        <iframe id="conferFrame" src="./confer.html" title="Confer" allow="camera; microphone; display-capture; fullscreen" class="social-frame-active"></iframe>
        <iframe id="discordFrame" src="about:blank" title="Discord" allow="fullscreen" class="social-frame-hidden"></iframe>
        <div class="social-pill" role="tablist" aria-label="Social">
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
    const pillBtns = $$('#socialView .social-pill-btn');
    if (!conferFrame || !discordFrame) return;
    if (state.socialView === 'confer') {
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
      `<div class="setting"><div><strong>Theme</strong><small>Choose your interface.</small></div><div class="segmented theme-choices"><button data-theme="dark">Dark</button><button data-theme="light">Light</button><button data-theme="system">Auto</button></div></div>`,
      `<div class="setting"><div><strong>Accent</strong><small>Interface color.</small></div><input class="color-picker accent-picker" type="color" value="${esc(state.accent)}"></div>`,
      `<div class="setting"><div class="range-wrap"><div><strong>Glass opacity</strong><small>How solid windows look.</small></div><output class="opacity-value">${state.opacity}%</output><input class="range opacity-range" type="range" min="35" max="85" value="${state.opacity}"></div></div>`,
      `<div class="setting"><div class="range-wrap"><div><strong>Blur</strong><small>Background softness.</small></div><output class="blur-value">${state.blur}px</output><input class="range blur-range" type="range" min="8" max="36" value="${state.blur}"></div></div>`
    ], 'Applies instantly — saved on this device.');
    const behavior = settingsGroup('Motion & Performance', 'INTERFACE', [
      settingsToggleRow('toggle-motion', 'sparkles', 'Motion', 'Enable interface animations.'),
      settingsToggleRow('toggle-performance', 'gauge', 'Performance mode', 'Reduce interface effects while playing.')
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
      `<div class="setting"><div><strong>How to leave</strong><small>The bottom-left Leave button — or Shift+End — swaps the tab for a plain about:blank.</small></div>${icon('ghost')}</div>`
    ], 'User-initiated. Nothing opens tabs on its own.');
    const help = settingsGroup('Help', 'SUPPORT', [
      account,
      settingsLinkRow('open-diagnostics', 'stethoscope', 'Diagnostics', 'System health and connectivity checks.'),
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

  async function renderEagler() {
    const target = $('#eaglerView'); if (!target) return;
    const clients = await ensureEaglerClients();
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
    const connBadge='<span class="conn-status" title="'+esc(link.engineError || 'Static fetch engine · titles load here when possible')+'"><span class="conn-dot'+(link.mode==='live'?' on':'')+'"></span>Connection: '+esc(link.mode==='live'?('live · '+link.endpointUrl):link.mode)+'</span>';
    if(!state.user&&!dev){target.innerHTML='<div class="page-head"><div><span class="eyebrow">CLOUD GAMING</span><h1>Restricted</h1><p>Sign in, or unlock with a developer code.</p></div>'+connBadge+'</div>'+emptyState('Sign in to use Cloud Gaming','Cloud gaming is available to verified accounts and developer codes.','cloud');refreshIcons(target);return;}
    if(!canUseCloud()){target.innerHTML='<div class="page-head"><div><span class="eyebrow">CLOUD GAMING</span><h1>Verification required</h1><p>Cloud gaming is reserved for verified accounts and developer codes.</p></div>'+connBadge+'</div><div class="empty glass">'+icon('badge-check')+'<h3>Get verified</h3><p>Your account is signed in, but verification has not been granted yet.</p></div>';refreshIcons(target);return;}
    const cloudGames=Array.isArray(window.FlashCloudGames)?window.FlashCloudGames:[];
    const region=link.region||'auto';
    const headBadges='<div class="cloud-badges">'+connBadge+'<span class="conn-status" title="Regional host used for nowgg.fun titles">Region: '+esc(region)+'</span><span class="conn-status">'+esc(String(cloudGames.length))+' titles</span></div>';
    const cards=cloudGames.length?'<div class="game-grid cloud-grid">'+cloudGames.map((game,idx)=>{let host='';try{host=new URL(game.url||'').hostname.replace(/^www\./,'');}catch{}return '<article class="game-card cloud-game-card"><div class="cover"><img loading="lazy" src="'+esc(game.cover||'./offline/logo.png')+'" alt="'+esc(game.name||'Cloud Game')+'" onerror="this.onerror=null;this.src=\'./offline/logo.png\'"><span class="badge">'+esc(host||'cloud')+'</span><span class="cloud-index">'+String(idx+1).padStart(2,'0')+'</span></div><div class="game-card-body"><h3>'+esc(game.name||'Cloud Game')+'</h3><p>'+esc(game.description||'Play in the cloud.')+'</p><div class="cloud-meta"><span class="tag">Cloud</span><span class="tag">'+esc(dev?'Developer':'Verified')+'</span></div><button class="play-btn" data-cloud-url="'+esc(game.url||'')+'">Play in Cloud</button></div></article>';}).join('')+'</div>':'<div class="empty glass">'+icon('cloud-lightning')+'<h3>No cloud games yet</h3><p>Cloud titles will appear here.</p></div>';
    target.innerHTML='<div class="page-head"><div><span class="eyebrow">CLOUD GAMING</span><h1>Cloud arcade</h1><p>'+(dev?'Developer access active.':'Verified access active.')+' Titles verify through the engine, then play here when possible.</p></div>'+headBadges+'</div>'+cards;
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
  function setRoute(route) {
    const legacy = { library: 'games', store: 'games' };
    if (legacy[route]) {
      state.gamesSection = route === 'library' ? 'mine' : 'store';
      route = legacy[route];
    }
    const valid = ['home', 'eagler', 'games', 'social', 'cloud', 'updates', 'admin', 'settings']; state.route = valid.includes(route) ? route : 'home';
    if (location.hash !== `#${state.route}`) history.replaceState(null, '', `#${state.route}`);
    $$('.view').forEach((view) => view.classList.toggle('active', view.dataset.view === state.route)); $$('.nav-item, .dock-item').forEach((button) => button.classList.toggle('active', button.dataset.route === state.route));
    if (state.route === 'home') paintView(renderHome); if (state.route === 'eagler') paintView(renderEagler); if (state.route === 'games') paintView(renderGames); if (state.route === 'social') paintView(renderSocial); if (state.route === 'cloud') paintView(renderCloud); if (state.route === 'updates') paintView(renderUpdates); if (state.route === 'admin') paintView(renderAdmin); if (state.route === 'settings') paintView(renderSettingsPage);
    requestAnimationFrame(refreshNavIndicator);
    requestAnimationFrame(() => renderMermaid());
  }
  function refreshNavIndicator() { const nav = $('.desktop-nav'), active = $('.desktop-nav .nav-item.active'), indicator = $('.nav-indicator'); if (!nav || !active || !indicator) return; const a = active.getBoundingClientRect(), n = nav.getBoundingClientRect(); indicator.style.transform = `translate3d(${a.left - n.left}px,0,0)`; indicator.style.width = `${a.width}px`; }
  function openPanel(id) { const panel = document.getElementById(id); if (panel) panel.hidden = false; if (id === 'profilePanel') { renderProfile(); renderStats(); } if (id === 'settingsPanel') renderSettings(); refreshIcons(panel || document); }
  function closePanel(id) { const panel = document.getElementById(id); if (panel) panel.hidden = true; }

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
    frame.src = url;
    frame.setAttribute('data-last-src', url);
    overlay.hidden = false;
    document.body.classList.add('player-open');
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
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); if (state.objectUrl) { URL.revokeObjectURL(state.objectUrl); state.objectUrl = null; } }
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
    renderProfile(); updateAdminVisibility(); state.notifications = user ? await FlashData.loadNotifications(user.uid) : []; renderNotifications(); if (state.route === 'admin') await renderAdmin(); await enforceMaintenance();
  }
  function updateAdminVisibility() { const allowed = window.FlashAdmin?.isAdmin(state.user, state.profile) === true; $('#adminNav')?.classList.toggle('hidden', !allowed); if (!allowed && state.route === 'admin') setRoute('home'); }
  function renderNotifications() { const list = $('#notificationList'); if (list) { list.innerHTML = state.notifications.length ? state.notifications.map((n) => `<article class="notification-item"><div class="notification-icon">${icon('bell')}</div><div><strong>${esc(n.title || 'Notification')}</strong><p>${esc(n.message || n.body || '')}</p></div></article>`).join('') : emptyState('All caught up', 'You have no new notifications.', 'bell-off'); refreshIcons(list); } updateNotifBadge(); }

  function toggleNotifDrop(force) {
    const drop = $('#notifDrop'); if (!drop) return;
    const show = force !== undefined ? force : drop.hidden;
    if (show) { renderNotifications(); paintDownloads(); drop.hidden = false; }
    else drop.hidden = true;
  }

  async function enforceMaintenance() {
    if (!state.user || window.FlashAdmin?.isAdmin(state.user, state.profile)) return;
    const maintenance = await window.FlashAdmin?.readMaintenance(); if (!maintenance?.enabled) return; const main = $('#app'); if (!main) return;
    main.innerHTML = `<section class="maintenance glass"><div class="maintenance-icon">${icon('wrench')}</div><span class="eyebrow">TEMPORARILY UNAVAILABLE</span><h1>Flash Games is updating.</h1><p>${esc(maintenance.message || 'Please check back soon.')}</p><button class="btn" id="maintenanceRefresh">${icon('refresh-cw')} Check again</button></section>`;
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
    $$('.theme-choices button').forEach((button) => button.addEventListener('click', () => setTheme(button.dataset.theme)));
    $$('.accent-picker').forEach((picker) => picker.addEventListener('input', (event) => { state.accent = event.target.value; localStorage.setItem('flashgames.accent', state.accent); applyPreferences(); }));
    $$('.opacity-range').forEach((range) => range.addEventListener('input', (event) => { state.opacity = Number(event.target.value); localStorage.setItem('flashgames.opacity', String(state.opacity)); applyPreferences(); }));
    $$('.blur-range').forEach((range) => range.addEventListener('input', (event) => { state.blur = Number(event.target.value); localStorage.setItem('flashgames.blur', String(state.blur)); applyPreferences(); }));
    $$('.toggle-motion').forEach((row) => row.addEventListener('click', () => { state.motion = !state.motion; localStorage.setItem('flashgames.motion', state.motion ? '1' : '0'); applyPreferences(); }));
    $$('.toggle-performance').forEach((row) => row.addEventListener('click', () => { state.performance = !state.performance; localStorage.setItem('flashgames.performance', state.performance ? '1' : '0'); applyPreferences(); }));
    $$('.toggle-cloak-auto').forEach((row) => row.addEventListener('click', () => { state.cloakAuto = !state.cloakAuto; localStorage.setItem('flashgames.cloak.auto', state.cloakAuto ? '1' : '0'); applyPreferences(); }));
    $$('.cloak-launch').forEach((row) => row.addEventListener('click', () => { try { localStorage.setItem('flashgames.cloak.mode', 'app'); } catch {} window.FlashCloak?.launch?.('app'); }));
    $$('.cloak-launch-tab').forEach((row) => row.addEventListener('click', () => { try { localStorage.setItem('flashgames.cloak.mode', 'tab'); } catch {} window.FlashCloak?.launch?.('tab'); }));
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

  function handleGlobalKeys(event) { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); openSearch(); } if (event.key === 'Escape') { document.getElementById('packDetailBackdrop')?.remove(); document.getElementById('diagBackdrop')?.remove(); document.getElementById('flashStatsBackdrop')?.remove(); document.getElementById('customInstallBackdrop')?.remove(); const notifDrop = $('#notifDrop'); if (notifDrop) notifDrop.hidden = true; closePanel('searchBackdrop'); closePanel('profilePanel'); closePanel('settingsPanel'); closePanel('userManagementBackdrop'); closePlayer(); } }

  function askCloakOnBoot() {
    try {
      if (window.__CLOAKED__) return;
      const choice = localStorage.getItem('flashgames.cloak.auto');
      if (choice === '0') return;                       // never
      if (choice === '1' && window.FlashCloak) { window.FlashCloak.launch(); return; } // always
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
          // Open FIRST (sync, inside the click gesture). Any await before
          // window.open drops the activation and browsers block the popup.
          // 'app' = maximized popup window: no address bar, no tabs, at a real
          // about:blank URL. 'tab' = an ordinary browser tab.
          const appLike = useMode !== 'tab';
          const W = Math.min(Number(screen?.availWidth) || 1280, 16000);
          const H = Math.min(Number(screen?.availHeight) || 800, 16000);
          const win = appLike
            ? nativeOpen('about:blank', 'fgcloak', `popup=1,left=0,top=0,width=${W},height=${H}`)
            : nativeOpen('about:blank');
          if (!win) { toast('Popup blocked', 'Cloak needs one popup for this launch — allow it and try again.', 'error'); return; }
          try { win.document.write('<!DOCTYPE html><title>Flash Games</title><p style="display:grid;place-items:center;min-height:90vh;margin:0;color:#9aa1b2">Loading cloaked session…</p>'); } catch {}
          const fallback = () => { try { win.document.open(); win.document.write(window.FlashCloak.EXIT_PAGE()); win.document.close(); } catch {} };
          let html = '';
          try { html = await fetch('./index.html', { cache: 'force-cache' }).then((r) => r.ok ? r.text() : ''); } catch { html = ''; }
          if (!html || !/<html/i.test(html)) { fallback(); toast('Cloak unavailable', "The app shell couldn't be read from this location.", 'error'); return; }
          const baseHref = String(location.href).replace(/[?#].*$/, '').replace(/[^/]*$/, '').replace(/"/g, '%22');
          const exitScript = '<script>(function(){var ex=function(){try{document.open();document.write(' + JSON.stringify(window.FlashCloak.EXIT_PAGE()) + ');document.close();}catch(e){window.close();}};window.__flashCloakExit=ex;var b=document.getElementById("cloakExit");if(b)b.onclick=ex;document.addEventListener("keydown",function(e){if(e.shiftKey&&(e.key==="End"||e.code==="End")){e.preventDefault();ex();}});})()<\/script>';
          const exitButton = '<button id="cloakExit" style="position:fixed;bottom:14px;left:14px;z-index:2147483647;opacity:.4;background:#141824;color:#e8eaf2;border:1px solid rgba(255,255,255,.14);border-radius:10px;padding:8px 14px;font:600 12.5px system-ui,sans-serif;cursor:pointer">Leave</button>';
          let shell = html;
          const headInject = `<base href="${baseHref}">
<script>window.__CLOAKED__ = true;<\/script>`;
          shell = /<base\s/i.test(shell) ? shell.replace(/<head(\s[^>]*)?>/i, (m) => `${m}\n${headInject}`) : shell.replace(/<head(\s[^>]*)?>/i, (m) => `${m}\n${headInject}`);
          shell = shell.replace(/<\/body>/i, (m) => `${exitButton}\n${exitScript}\n${m}`);
          try {
            const doc = win.document;
            doc.open(); doc.write(shell); doc.close();
            if (appLike) { try { win.focus(); } catch {} }
            toast('Cloaked', appLike ? 'Flash Games is running natively in a blank app window. Press Leave to blank it.' : 'Flash Games is running natively in an about:blank tab. Press Leave to blank it.', 'success');
          } catch (error) { fallback(); win.close(); toast('Cloak failed', error.message || 'The tab could not be written.', 'error'); }
        }
      });
    } catch {}

    const dlDock = document.createElement('div');
    dlDock.id = 'dlDock'; dlDock.className = 'dl-dock'; dlDock.hidden = true;
    document.body.appendChild(dlDock);
    document.addEventListener('click', handleClick); document.addEventListener('keydown', handleGlobalKeys); window.addEventListener('hashchange', () => setRoute(location.hash.replace('#', '') || 'home')); window.addEventListener('resize', () => requestAnimationFrame(refreshNavIndicator), { passive: true }); window.addEventListener('flashgames:library-changed', async () => { await loadInstalled(); rerenderRoute(); renderProfile(); });
    // Initialize mermaid early so it's ready when articles render
    if (window.mermaid) {
      mermaid.initialize({ startOnLoad: false, theme: 'dark', themeVariables: { primaryColor: '#8b5cf6', primaryTextColor: '#fff', primaryBorderColor: '#8b5cf6', lineColor: '#9aa1b2', secondaryColor: '#1a1a2e', tertiaryColor: '#2a2a3e' }, suppressErrors: true, logLevel: 'error' });
    }
    // Background refreshes replay into the UI without a reload: the newest
    // listing simply repaints whatever view is open.
    window.addEventListener('flashgames:catalogue-updated', (event) => {
      const games = Array.isArray(event.detail?.games) ? event.detail.games : null;
      if (!games || !games.length || games.length === state.games.length) return;
      state.games = games;
      if (state.route === 'games') paintView(renderGames); else rerenderRoute();
    });
    handleSettings(); handleSearch(); applyPreferences(); refreshIcons();
    renderMermaid();
    setTimeout(() => { if (navigator.onLine) { try { window.FlashBridge?.ensure?.().catch?.(() => {}); } catch {} } }, 1500);
    setTimeout(askCloakOnBoot, 1400);
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
