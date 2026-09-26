(() => {
  'use strict';

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const esc = (value) => window.FlashData.esc(value);
  const icon = (name) => `<i data-lucide="${name}"></i>`;

  const state = {
    route: location.hash.replace('#', '') || 'home', games: [], installed: [], favourites: new Set(), onlineGames: [], flashExclusiveGames: Array.isArray(window.FlashExclusiveGames) ? window.FlashExclusiveGames : [], storeSection: 'all', storeView: 'games',
    user: null, profile: {}, updates: { version: '0.0.0', releases: [] }, notifications: [],
    query: '', category: 'All', sort: localStorage.getItem('flashgames.sort') || 'featured', searchIndex: 0, stats: loadStats(),
    theme: localStorage.getItem('flashgames.theme') || 'dark', accent: localStorage.getItem('flashgames.accent') || '#8b5cf6',
    opacity: Number(localStorage.getItem('flashgames.opacity') || 66), blur: Number(localStorage.getItem('flashgames.blur') || 20),
    motion: localStorage.getItem('flashgames.motion') !== '0', performance: localStorage.getItem('flashgames.performance') === '1',
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
    $$('#themeChoices button').forEach((button) => button.classList.toggle('active', button.dataset.theme === theme));
  }

  function applyPreferences() {
    document.documentElement.style.setProperty('--accent', state.accent);
    document.documentElement.style.setProperty('--opacity', String(state.opacity / 100));
    document.documentElement.style.setProperty('--blur', `${state.blur}px`);
    document.body.classList.toggle('performance-boost', state.performance); document.body.classList.toggle('reduce-motion', !state.motion);
    if ($('#opacityRange')) $('#opacityRange').value = String(state.opacity); if ($('#blurRange')) $('#blurRange').value = String(state.blur);
    if ($('#opacityValue')) $('#opacityValue').textContent = `${state.opacity}%`; if ($('#blurValue')) $('#blurValue').textContent = `${state.blur}px`;
    if ($('#accentPicker')) $('#accentPicker').value = state.accent;
    $('#toggleMotion .switch')?.classList.toggle('on', state.motion); $('#togglePerformance .switch')?.classList.toggle('on', state.performance); setTheme(state.theme);
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
  async function hydrateLuminImages(root=document) {
    if(!window.Lumin?.getImageUrl) return;
    const cards=[...root.querySelectorAll('[data-lumin-id]')];
    await Promise.allSettled(cards.map(async card=>{
      const game=state.onlineGames.find(g=>String(g.id)===String(card.dataset.gameId));
      if(!game) return;
      const raw=game.__raw || game;
      const token=raw.image_token || raw.imageToken || game.image_token || game.imageToken || luminImageToken(game);
      const img=card.querySelector('img[data-lumin-image]');
      if(!img || !token) return;
      try {
        const url=await window.Lumin.getImageUrl(token);
        if(typeof url==='string' && url) {
          game.cover=url;
          img.src=url;
        }
      } catch(error) {
        console.warn('[Flash Games] Lumin thumbnail failed for', game.name, error);
      }
    }));
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
    return `<article class="game-card" data-game-id="${esc(game.id)}"${game.zone === 'LUMIN' ? ` data-lumin-id="${esc(game.luminId || game.id)}"` : ''}><div class="cover"><img loading="lazy" src="${esc(gameCover(game))}" alt="${esc(game.name)}"${game.zone === 'LUMIN' ? ' data-lumin-image' : ''} onerror="this.onerror=null;this.src='./offline/logo.png'"><span class="badge">${installed ? 'Installed' : esc(game.category || 'HTML Game')}</span><div class="card-overlay"><button class="expand-action play" data-game-action="play" aria-label="Play ${esc(game.name)}">${icon('play')}<span>Play</span></button>${installed ? '' : `<button class="expand-action" data-game-action="install" aria-label="Install ${esc(game.name)}">${icon('download')}<span>Install</span></button>`}<button class="expand-action" data-game-action="favorite" aria-label="${favourite ? 'Remove favorite' : 'Favorite'} ${esc(game.name)}">${icon(favourite ? 'heart-off' : 'heart')}<span>${favourite ? 'Unfavorite' : 'Favorite'}</span></button><button class="expand-action" data-game-action="boost" aria-label="Performance boost">${icon('gauge')}<span>Boost</span></button>${installed ? `<button class="expand-action close" data-game-action="remove" aria-label="Remove ${esc(game.name)}">${icon('trash-2')}<span>Remove</span></button>` : ''}</div></div><div class="card-body"><div class="card-title"><h3>${esc(game.name)}</h3><span class="rating">${icon('star')} ${game.rating ? esc(game.rating) : 'HTML'}</span></div><div class="meta"><span class="tag">${esc(game.zone || 'STORE')}</span></div><p class="card-desc">${esc(game.description || 'Single-file HTML game.')}</p></div></article>`;
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
      const response = await window.Lumin.getGames({ page: 1, limit: 100 });
      const games = Array.isArray(response?.games) ? response.games : Array.isArray(response) ? response : [];
      state.onlineGames = games.map((g) => ({
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
      }));
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
    const seen = new Set();
    const out = [];
    for (const g of [...state.games, ...state.onlineGames, ...flashExclusiveGames()]) {
      if (!g) continue;
      const key = String(g.rawUrl || g.url || '').trim() || String(g.id || '');
      if (key && seen.has(key)) continue;
      if (key) seen.add(key);
      out.push(g);
    }
    return out;
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

  function renderHome() {
    const target = $('#homeView'); if (!target) return; const featured = filteredGames(state.games)[0]; const recent = recentGames();
    target.innerHTML = featured ? `<section class="hero glass"><div><span class="eyebrow">FLASH GAMES</span><h1>Play <em>anything.</em></h1><p>Explore the real Offline HTML Games Pack, install games when you want them, and play them from your local browser cache.</p><div class="hero-actions"><button class="btn primary" data-game-action="play" data-game-id="${esc(featured.id)}">${icon('play')} Play Now</button><button class="btn" data-route="store">${icon('store')} Browse Store</button></div></div><div class="hero-art"><img loading="eager" src="${esc(gameCover(featured))}" alt="${esc(featured.name)}" onerror="this.onerror=null;this.src='./offline/logo.png'"><div class="live-pill"><i></i>${state.games.length.toLocaleString()} games available</div></div></section><section class="section"><div class="section-head"><div><span class="eyebrow">RECENTLY PLAYED</span><h2>Jump back in</h2><p>Your recent games, right where they belong.</p></div><button class="link-btn" data-route="library">Open Library ${icon('arrow-right')}</button></div><div class="game-grid">${recent.map((game) => gameCard(game, installedSet().has(game.id))).join('') || emptyState('No recent games yet', 'Play a game and it will appear here.', 'history')}</div></section>` : emptyState('Loading games', 'Fetching the real catalogue from GitHub.', 'loader-circle');
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

  function renderLibrary() {
    const target = $('#libraryView'); if (!target) return;
    target.innerHTML = `<div class="page-head"><div><span class="eyebrow">LIBRARY</span><h1>Your games</h1><p>Installed HTML files are cached locally and launched from Blob URLs.</p></div><button class="btn" data-route="store">${icon('plus')} Install games</button></div><div class="game-grid">${sortGames(state.installed).map((game) => libraryCard(game)).join('') || emptyState('Your library is empty', 'Install a game from the Store to keep it available locally.', 'library')}</div>`;
    refreshIcons(target);
  }

  function packCard(pack) {
    const games = gamesUniverse();
    const resolved = window.FlashPacks ? window.FlashPacks.resolve(pack.id, games) : [];
    const installed = installedSet();
    const have = resolved.filter((g) => installed.has(g.id)).length;
    const done = resolved.length > 0 && have === resolved.length;
    const installing = state.packInstalling && state.packInstalling[pack.id];
    const pct = installing ? Math.round((installing.done / Math.max(1, installing.total)) * 100) : Math.round((have / Math.max(1, resolved.length)) * 100);
    const covers = resolved.slice(0, 5).map((g) => `<img loading="lazy" src="${esc(gameCover(g))}" alt="" onerror="this.onerror=null;this.src='./offline/logo.png'">`).join('');
    const label = installing ? `Installing ${installing.done}/${installing.total}…` : done ? 'Installed' : `Install ${resolved.length} games`;
    return `<article class="pack-card" data-pack-id="${esc(pack.id)}"><div class="pack-top"><span class="pack-icon">${icon(pack.icon || 'package')}</span><div><h3>${esc(pack.name)}</h3><small>${resolved.length} games • ${have} installed</small></div></div><p>${esc(pack.description || '')}</p><div class="pack-covers">${covers}<span>+${Math.max(0, resolved.length - 5)} more</span></div><div class="pack-progress"${done && !installing ? ' hidden' : ''}><i style="width:${pct}%"></i></div><div class="pack-actions"><button class="btn" data-pack-action="view">${icon('layout-list')}<span>View all</span></button><button class="btn ${done && !installing ? '' : 'primary'}" data-pack-action="install" ${installing ? 'disabled' : ''}>${installing ? icon('loader-circle') : done && !installing ? icon('check') : icon('download')}<span>${label}</span></button></div></article>`;
  }

  function renderPacks() {
    const box = $('#packsGrid'); if (!box || !window.FlashPacks) return;
    box.innerHTML = window.FlashPacks.defs.map((p) => packCard(p)).join('');
    refreshIcons(box);
  }

  function paintPackProgress(packId) {
    const card = document.querySelector(`[data-pack-id="${packId}"]`);
    const prog = state.packInstalling && state.packInstalling[packId];
    if (!card || !prog) return;
    const bar = card.querySelector('.pack-progress > i');
    if (bar) bar.style.width = `${Math.round((prog.done / Math.max(1, prog.total)) * 100)}%`;
    const btn = card.querySelector('[data-pack-action]');
    if (btn) btn.innerHTML = `${icon('loader-circle')}<span>Installing ${prog.done}/${prog.total}…</span>`;
    refreshIcons(card);
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
      return `<div class="pack-detail-row" data-game-id="${esc(g.id)}"><img loading="lazy" src="${esc(gameCover(g))}" alt="" onerror="this.onerror=null;this.src='./offline/logo.png'"><span><strong>${esc(g.name)}</strong><small>${esc(g.category || 'Game')} • ${isIn ? 'Installed' : online ? 'Online' : exclusive ? 'Exclusive' : 'Not downloaded'}</small></span><span class="pack-detail-actions"><button class="expand-action play" data-game-action="play">${icon('play')}<span>Play</span></button>${canInstall ? `<button class="expand-action" data-game-action="install">${icon('download')}<span>Get</span></button>` : ''}</span></div>`;
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
    const target = $('#storeView'); if (!target) return;
    const categories = ['All', ...new Set(gamesUniverse().map((game) => game.category).filter(Boolean))];
    const key = `${categories.join('|')}#${state.storeSection}#${state.storeView}`;
    if (target.dataset.shell !== key) {
      target.dataset.shell = key;
      const tools = `<div class="store-tools"><label class="search-bar">${icon('search')}<input id="storeSearch" value="${esc(state.query)}" placeholder="Search games…"></label><label class="sort-control"><span>Collection</span><select id="storeSection"><option value="all">All</option><option value="offline">Offline+</option><option value="lumin">Lumin</option><option value="exclusive">Flash Exclusive</option></select></label><label class="sort-control"><span>Sort</span><select id="storeSort"><option value="featured">Featured</option><option value="az">A–Z</option><option value="za">Z–A</option><option value="rating">Rating</option></select></label><div class="segmented" id="storeViewToggle"><button data-store-view="games">Games</button><button data-store-view="packs">Packs</button></div></div>`;
      if (state.storeView === 'packs') {
        target.innerHTML = `<div class="page-head"><div><span class="eyebrow">STORE</span><h1>Game packs</h1><p>Bundles that install locally. Open one to see every game inside.</p></div>${tools}</div><section class="packs-section"><div class="pack-grid" id="packsGrid"></div></section>`;
      } else {
        target.innerHTML = `<div class="page-head"><div><span class="eyebrow">STORE</span><h1>Game collection</h1><p>${state.games.length.toLocaleString()} offline games, plus online and exclusives.</p></div>${tools}</div><div class="filter-row">${categories.map((category) => `<button class="filter" data-category="${esc(category)}">${esc(category)}</button>`).join('')}</div><div class="game-grid" id="storeGrid"></div><div id="storeSentinel" aria-hidden="true"></div>`;
      }
      $('#storeSearch').oninput = (event) => {
        state.query = event.target.value;
        clearTimeout(state.searchTimer);
        state.searchTimer = setTimeout(() => updateStoreGrid(true), 140);
      };
      $('#storeSort').addEventListener('change', (event) => { state.sort = event.target.value; localStorage.setItem('flashgames.sort', state.sort); updateStoreGrid(true); });
      $('#storeSection').addEventListener('change', async (event) => {
        state.storeSection = event.target.value;
        state.category = 'All';
        renderStore();
        if (state.storeSection === 'all' || state.storeSection === 'lumin') {
          try { await ensureOnlineGames(); } catch {}
          if (state.route === 'store') updateStoreGrid(true);
        }
      });
      $$('#storeViewToggle button').forEach((b) => b.addEventListener('click', () => { state.storeView = b.dataset.storeView; renderStore(); }));
      refreshIcons(target);
    }
    $('#storeSearch').value = state.query;
    $('#storeSort').value = state.sort;
    $('#storeSection').value = state.storeSection;
    $$('#storeViewToggle button').forEach((b) => b.classList.toggle('active', b.dataset.storeView === state.storeView));
    if ((state.storeSection === 'all' || state.storeSection === 'lumin') && !state.onlineGames.length) {
      ensureOnlineGames().then(() => { if (state.route === 'store') updateStoreGrid(true); }).catch(() => {});
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
      $$('#storeView .filter').forEach((b) => b.classList.toggle('active', b.dataset.category === state.category));
    }
    const next = st.items.slice(st.shown, st.shown + GRID_BATCH);
    st.shown += next.length;
    if (!st.shown) grid.innerHTML = emptyState('No games found', 'Try a different search or collection.', 'search-x');
    else if (next.length) grid.insertAdjacentHTML('beforeend', next.map((game) => gameCard(game, installed.has(game.id))).join(''));
    refreshIcons(grid);
    requestAnimationFrame(() => hydrateLuminImages(grid));
    observeSentinel('store', () => updateStoreGrid(false));
  }

  function renderSocial() {
    const target = $('#socialView'); if (!target) return;
    // Built once and never rebuilt: tearing the iframe down drops live calls.
    if (!target.dataset.shell) {
      target.dataset.shell = '1';
      target.innerHTML = `<div class="social-fill"><iframe id="conferFrame" src="https://itsmeh1.github.io/confer/confer.html?.amplify.com" title="Confer" allow="camera; microphone; display-capture; fullscreen"></iframe><button class="social-float" id="conferReload" aria-label="Reload Confer">${icon('refresh-cw')}<span>Reload</span></button></div>`;
      $('#conferReload').addEventListener('click', () => {
        const frame = $('#conferFrame');
        if (frame) frame.src = frame.src;
        toast('Reloading Confer', 'Reconnecting your session…');
      });
      refreshIcons(target);
    }
  }

  function changeIcon(type) { if (type === 'add') return `<span class="change-icon log-add">${icon('plus')}</span>`; if (type === 'remove') return `<span class="change-icon log-remove">${icon('x')}</span>`; return `<span class="change-icon log-edit">${icon('hammer')}</span>`; }
  function renderUpdates() {
    const target = $('#updatesView'); if (!target) return;
    target.innerHTML = `<div class="page-head"><div><span class="eyebrow">CHANGELOG</span><h1>What's new</h1><p>Current version ${esc(state.updates.version)}.</p></div></div><div class="timeline">${(state.updates.releases || []).map((release) => `<article class="release glass"><div class="release-head"><div><strong>${esc(release.version || 'Update')}</strong><span>${esc(release.date || release.published || '')}</span></div>${icon('sparkles')}</div><p>${esc(release.description || release.summary || '')}</p>${Array.isArray(release.changes) ? release.changes.map((change) => `<div class="log-item">${changeIcon(change.type || change.kind)}<span>${esc(change.text || change.description || change.title || change)}</span></div>`).join('') : ''}</article>`).join('') || emptyState('No changelog entries', 'Published releases will appear here.', 'history')}</div>`;
    refreshIcons(target);
  }

  function memberLevel() { const minutes = Math.floor(state.stats.time / 60000); if (state.stats.played >= 100 || minutes >= 600) return 'Elite Member'; if (state.stats.played >= 30 || minutes >= 120 || state.stats.installs >= 30) return 'Dedicated Member'; if (state.stats.played >= 5 || state.stats.installs >= 5) return 'Active Member'; return 'New Member'; }

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

  function setRoute(route) {
    const valid = ['home', 'library', 'store', 'social', 'cloud', 'updates', 'admin']; state.route = valid.includes(route) ? route : 'home';
    if (location.hash !== `#${state.route}`) history.replaceState(null, '', `#${state.route}`);
    $$('.view').forEach((view) => view.classList.toggle('active', view.dataset.view === state.route)); $$('.nav-item, .dock-item').forEach((button) => button.classList.toggle('active', button.dataset.route === state.route));
    if (state.route === 'home') renderHome(); if (state.route === 'library') renderLibrary(); if (state.route === 'store') renderStore(); if (state.route === 'social') renderSocial(); if (state.route === 'cloud') renderCloud(); if (state.route === 'updates') renderUpdates(); if (state.route === 'admin') renderAdmin();
    requestAnimationFrame(refreshNavIndicator);
  }
  function refreshNavIndicator() { const nav = $('.desktop-nav'), active = $('.desktop-nav .nav-item.active'), indicator = $('.nav-indicator'); if (!nav || !active || !indicator) return; const a = active.getBoundingClientRect(), n = nav.getBoundingClientRect(); indicator.style.transform = `translate3d(${a.left - n.left}px,0,0)`; indicator.style.width = `${a.width}px`; }
  function openPanel(id) { const panel = document.getElementById(id); if (panel) panel.hidden = false; if (id === 'profilePanel') { renderProfile(); renderStats(); } if (id === 'settingsPanel') renderSettings(); refreshIcons(panel || document); }
  function closePanel(id) { const panel = document.getElementById(id); if (panel) panel.hidden = true; }

  function renderSearchResults() {
    const target = $('#searchResults'); if (!target) return; const query = state.query.trim().toLowerCase(); const results = query ? sortGames(gamesUniverse().filter((game) => `${game.name} ${game.category} ${(game.tags || []).join(' ')}`.toLowerCase().includes(query))).slice(0, 12) : sortGames(gamesUniverse()).slice(0, 12);
    if (!results.length) { target.innerHTML = emptyState('No games found', 'Try another search.', 'search-x'); refreshIcons(target); return; }
    state.searchIndex = Math.min(state.searchIndex, results.length - 1); target.innerHTML = results.map((game, index) => `<button class="search-result ${index === state.searchIndex ? 'active' : ''}" data-search-game="${esc(game.id)}"><img loading="lazy" src="${esc(gameCover(game))}" alt=""><span><strong>${esc(game.name)}</strong><small>${esc(game.category || 'HTML Game')}</small></span>${icon('arrow-up-right')}</button>`).join(''); refreshIcons(target);
  }
  function openSearch() { const backdrop = $('#searchBackdrop'); if (!backdrop) return; backdrop.hidden = false; state.searchIndex = 0; renderSearchResults(); $('#searchInput')?.focus(); }
  async function loadInstalled() { state.installed = await FlashGamesStore.getAllCachedGames(); state.favourites = FlashGamesStore.getFavourites(); }

  function openPlayer(url, game) {
    const frame = $('#gameFrame');
    const overlay = $('#playerOverlay');
    if (!frame || !overlay || !url) return;
    // Normal playback is always un-sandboxed (loaded docs set their own).
    frame.removeAttribute('sandbox');
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
      const stored = await FlashGamesStore.install({ ...game, url: remote, rawUrl: remote });
      state.stats.installs += 1;
      saveStats();
      await loadInstalled();
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
        installed = await FlashGamesStore.install(game);
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

  function closePlayer() { const overlay = $('#playerOverlay'), frame = $('#gameFrame'); if (state.gameStartedAt) { state.stats.time += Math.max(0, Date.now() - state.gameStartedAt); state.gameStartedAt = 0; saveStats(); } if (frame) { frame.removeAttribute('sandbox'); frame.removeAttribute('srcdoc'); frame.src = 'about:blank'; } if (overlay) overlay.hidden = true; document.body.classList.remove('player-open'); if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); if (state.objectUrl) { URL.revokeObjectURL(state.objectUrl); state.objectUrl = null; } }
  function rerenderRoute() { if (state.route === 'store') renderStore(); else if (state.route === 'library') renderLibrary(); else if (state.route === 'home') renderHome(); }
  async function installGame(game) { try { toast('Installing', `Caching ${game.name} locally…`); await FlashGamesStore.install(game); state.stats.installs += 1; saveStats(); await loadInstalled(); toast('Installed', `${game.name} is now in your Library.`, 'success'); rerenderRoute(); refreshPackDetail(); } catch (error) { toast('Install failed', error.message || 'The game could not be cached.', 'error'); } }
  async function removeGame(game) { confirmDialog('Remove game?', `${game.name} will be removed from your local library.`, async () => { await FlashGamesStore.deleteCachedGame(game.id); await loadInstalled(); toast('Removed', `${game.name} was removed from your library.`, 'success'); rerenderRoute(); refreshPackDetail(); }, true); }
  function toggleFavourite(game) { const enabled = !state.favourites.has(game.id); FlashGamesStore.setFavourite(game.id, enabled); state.favourites = FlashGamesStore.getFavourites(); toast(enabled ? 'Added to favorites' : 'Removed from favorites', game.name, 'success'); rerenderRoute(); }

  async function loadUserProfile(user) {
    state.user = user || null; state.profile = {}; const db = window.__flashFirebase?.db;
    if (user && db) { try { const snapshot = await db.collection('users').doc(user.uid).get(); if (snapshot.exists) state.profile = snapshot.data() || {}; } catch { /* profile document is optional */ } }
    renderProfile(); updateAdminVisibility(); state.notifications = user ? await FlashData.loadNotifications(user.uid) : []; renderNotifications(); if (state.route === 'admin') await renderAdmin(); await enforceMaintenance();
  }
  function updateAdminVisibility() { const allowed = window.FlashAdmin?.isAdmin(state.user, state.profile) === true; $('#adminNav')?.classList.toggle('hidden', !allowed); if (!allowed && state.route === 'admin') setRoute('home'); }
  function renderNotifications() { const list = $('#notificationList'), badge = $('#notificationBadge'); if (!list || !badge) return; badge.hidden = state.notifications.length === 0; list.innerHTML = state.notifications.length ? state.notifications.map((n) => `<article class="notification-item"><div class="notification-icon">${icon('bell')}</div><div><strong>${esc(n.title || 'Notification')}</strong><p>${esc(n.message || n.body || '')}</p></div></article>`).join('') : emptyState('All caught up', 'You have no new notifications.', 'bell-off'); refreshIcons(list); }

  async function enforceMaintenance() {
    if (!state.user || window.FlashAdmin?.isAdmin(state.user, state.profile)) return;
    const maintenance = await window.FlashAdmin?.readMaintenance(); if (!maintenance?.enabled) return; const main = $('#app'); if (!main) return;
    main.innerHTML = `<section class="maintenance glass"><div class="maintenance-icon">${icon('wrench')}</div><span class="eyebrow">TEMPORARILY UNAVAILABLE</span><h1>Flash Games is updating.</h1><p>${esc(maintenance.message || 'Please check back soon.')}</p><button class="btn" id="maintenanceRefresh">${icon('refresh-cw')} Check again</button></section>`;
    $('#maintenanceRefresh')?.addEventListener('click', () => location.reload()); refreshIcons(main);
  }

  function handleClick(event) {
    const routeButton = event.target.closest('[data-route]'); if (routeButton) { event.preventDefault(); setRoute(routeButton.dataset.route); return; }
    const close = event.target.closest('[data-close]'); if (close) { closePanel(close.dataset.close); return; }
    if (event.target.closest('#openSearch')) { openSearch(); return; }
    if (event.target.closest('#openNotifications')) { const modal = $('#notificationsBackdrop'); if (modal) modal.hidden = false; refreshIcons(modal || document); return; }
    if (event.target.closest('#openProfile') || event.target.closest('#mobileProfile')) { openPanel('profilePanel'); return; }
    if (event.target.closest('#openSettings')) { closePanel('profilePanel'); openPanel('settingsPanel'); return; }
    if (event.target.closest('#openStats')) { renderStats(); return; }
    if (event.target.closest('#closePlayer')) { closePlayer(); return; }
    const category = event.target.closest('[data-category]'); if (category) { state.category = category.dataset.category; renderStore(); return; }
    const packAction = event.target.closest('[data-pack-action]'); if (packAction) { const packCard = packAction.closest('[data-pack-id]'); if (packCard && packCard.dataset.packId) { if (packAction.dataset.packAction === 'view') openPackDetail(packCard.dataset.packId); else installPackFlow(packCard.dataset.packId); } return; }
    const searchGame = event.target.closest('[data-search-game]'); if (searchGame) { const game = gamesUniverse().find((item) => item.id === searchGame.dataset.searchGame); if (game) { closePanel('searchBackdrop'); playGame(game); } return; }
    const action = event.target.closest('[data-game-action]'); if (!action) return;
    const card = action.closest('[data-game-id]'); const id = action.dataset.gameId || card?.dataset.gameId; const game = gamesUniverse().find((item) => item.id === id) || state.installed.find((item) => item.id === id); if (!game) return;
    if (action.dataset.gameAction === 'play') playGame(game); if (action.dataset.gameAction === 'install' && game.zone !== 'LUMIN') installGame(game); if (action.dataset.gameAction === 'remove') removeGame(game); if (action.dataset.gameAction === 'favorite') toggleFavourite(game);
    if (action.dataset.gameAction === 'boost') { state.performance = !state.performance; localStorage.setItem('flashgames.performance', state.performance ? '1' : '0'); applyPreferences(); toast(state.performance ? 'Performance mode on' : 'Performance mode off', 'Only interface effects are reduced.', 'success'); }
  }

  function handleSettings() {
    $$('#themeChoices button').forEach((button) => button.addEventListener('click', () => setTheme(button.dataset.theme)));
    $('#accentPicker')?.addEventListener('input', (event) => { state.accent = event.target.value; localStorage.setItem('flashgames.accent', state.accent); applyPreferences(); });
    $('#opacityRange')?.addEventListener('input', (event) => { state.opacity = Number(event.target.value); localStorage.setItem('flashgames.opacity', String(state.opacity)); applyPreferences(); });
    $('#blurRange')?.addEventListener('input', (event) => { state.blur = Number(event.target.value); localStorage.setItem('flashgames.blur', String(state.blur)); applyPreferences(); });
    $('#toggleMotion')?.addEventListener('click', () => { state.motion = !state.motion; localStorage.setItem('flashgames.motion', state.motion ? '1' : '0'); applyPreferences(); });
    $('#togglePerformance')?.addEventListener('click', () => { state.performance = !state.performance; localStorage.setItem('flashgames.performance', state.performance ? '1' : '0'); applyPreferences(); });
    $('#clearLibrary')?.addEventListener('click', () => confirmDialog('Clear library?', 'All locally installed game files will be removed.', async () => { await FlashGamesStore.clearGameCache(); await loadInstalled(); renderProfile(); toast('Library cleared', 'Your installed games were removed.', 'success'); setRoute('library'); }, true));
  }

  function handleSearch() {
    const input = $('#searchInput'); if (!input) return;
    input.addEventListener('input', () => { state.query = input.value; state.searchIndex = 0; clearTimeout(state.searchTimer); state.searchTimer = setTimeout(renderSearchResults, 80); });
    input.addEventListener('keydown', (event) => {
      const results = sortGames(gamesUniverse().filter((game) => `${game.name} ${game.category} ${(game.tags || []).join(' ')}`.toLowerCase().includes(state.query.toLowerCase()))).slice(0, 12);
      if (event.key === 'ArrowDown') { event.preventDefault(); state.searchIndex = Math.min(state.searchIndex + 1, Math.max(0, results.length - 1)); renderSearchResults(); }
      if (event.key === 'ArrowUp') { event.preventDefault(); state.searchIndex = Math.max(0, state.searchIndex - 1); renderSearchResults(); }
      if (event.key === 'Enter' && results[state.searchIndex]) { closePanel('searchBackdrop'); playGame(results[state.searchIndex]); }
      if (event.key === 'Escape') closePanel('searchBackdrop');
    });
  }

  function handleGlobalKeys(event) { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); openSearch(); } if (event.key === 'Escape') { document.getElementById('packDetailBackdrop')?.remove(); closePanel('searchBackdrop'); closePanel('notificationsBackdrop'); closePanel('profilePanel'); closePanel('settingsPanel'); closePanel('userManagementBackdrop'); closePlayer(); } }

  async function init() {
    document.addEventListener('click', handleClick); document.addEventListener('keydown', handleGlobalKeys); window.addEventListener('hashchange', () => setRoute(location.hash.replace('#', '') || 'home')); window.addEventListener('resize', () => requestAnimationFrame(refreshNavIndicator), { passive: true }); window.addEventListener('flashgames:library-changed', async () => { await loadInstalled(); rerenderRoute(); renderProfile(); });
    handleSettings(); handleSearch(); applyPreferences(); refreshIcons();
    try {
      await loadInstalled(); state.favourites = FlashGamesStore.getFavourites();
      const [catalogue, updates] = await Promise.all([FlashData.loadGames(), FlashData.loadUpdates()]); state.games = catalogue.games || []; state.updates = updates;
      renderProfile(); renderNotifications(); updateAdminVisibility(); setRoute(state.route);
      const auth = window.__flashFirebase?.auth; if (auth) auth.onAuthStateChanged((user) => loadUserProfile(user));
      if (state.games.length === 0) toast('Game catalogue unavailable', 'GitHub could not be reached. Existing installed games are still available.', 'error');
      if (state.games.length >= 300) toast('Catalogue ready', `${state.games.length.toLocaleString()} games are available.`, 'success');
    } catch (error) { console.error('Flash Games initialization failed:', error); toast('Startup error', error.message || 'Flash Games could not finish loading.', 'error'); renderHome(); }
  }

  document.addEventListener('DOMContentLoaded', init, { once: true });
})();
