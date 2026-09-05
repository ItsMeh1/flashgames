(() => {
  'use strict';

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const esc = (value) => window.FlashData.esc(value);
  const icon = (name) => `<i data-lucide="${name}"></i>`;

  const state = {
    route: location.hash.replace('#', '') || 'home', games: [], installed: [], favourites: new Set(), onlineGames: [], flashExclusiveGames: Array.isArray(window.FlashExclusiveGames) ? window.FlashExclusiveGames : [], gameSection: 'all', gamesQuery: '',
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
  function refreshIcons(root = document) { if (window.lucide?.createIcons) requestAnimationFrame(() => window.lucide.createIcons({ root, attrs: { 'stroke-width': 1.5 } })); }

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
    return `<article class="game-card" data-game-id="${esc(game.id)}"><div class="cover"><img loading="lazy" src="${esc(gameCover(game))}" alt="${esc(game.name)}" onerror="this.onerror=null;this.src='./offline/logo.png'"><span class="badge">${installed ? 'Installed' : esc(game.category || 'HTML Game')}</span><div class="card-overlay"><button class="expand-action play" data-game-action="play" aria-label="Play ${esc(game.name)}">${icon('play')}<span>Play</span></button>${installed ? '' : `<button class="expand-action" data-game-action="install" aria-label="Install ${esc(game.name)}">${icon('download')}<span>Install</span></button>`}<button class="expand-action" data-game-action="favorite" aria-label="${favourite ? 'Remove favorite' : 'Favorite'} ${esc(game.name)}">${icon(favourite ? 'heart-off' : 'heart')}<span>${favourite ? 'Unfavorite' : 'Favorite'}</span></button><button class="expand-action" data-game-action="boost" aria-label="Performance boost">${icon('gauge')}<span>Boost</span></button>${installed ? `<button class="expand-action close" data-game-action="remove" aria-label="Remove ${esc(game.name)}">${icon('trash-2')}<span>Remove</span></button>` : ''}</div></div><div class="card-body"><div class="card-title"><h3>${esc(game.name)}</h3><span class="rating">${icon('star')} ${game.rating ? esc(game.rating) : 'HTML'}</span></div><div class="meta"><span class="tag">${esc(game.zone || 'STORE')}</span></div><p class="card-desc">${esc(game.description || 'Single-file HTML game.')}</p></div></article>`;
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
        rating: g.rating || ''
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
    return [...state.games, ...state.onlineGames, ...flashExclusiveGames()];
  }

  function matchesGamesSection(game) {
    if (state.gameSection === 'all') return true;
    if (state.gameSection === 'offline') return game.zone !== 'LUMIN' && game.source !== 'Flash Exclusive';
    if (state.gameSection === 'lumin') return game.zone === 'LUMIN';
    if (state.gameSection === 'exclusive') return game.source === 'Flash Exclusive' || game.zone === 'FLASH EXCLUSIVE';
    return true;
  }

  function gamesCard(game, installed) {
    const online = game.zone === 'LUMIN';
    const exclusive = game.source === 'Flash Exclusive' || game.zone === 'FLASH EXCLUSIVE';
    const badge = exclusive ? 'Flash Exclusive' : online ? 'Online' : installed ? 'Downloaded' : 'Not downloaded';
    return `<article class="game-card" data-game-id="${esc(game.id)}"><div class="cover"><img loading="lazy" src="${esc(gameCover(game))}" alt="${esc(game.name)}" onerror="this.onerror=null;this.src='./offline/logo.png'"><span class="badge">${badge}</span><div class="card-overlay"><button class="expand-action play" data-game-action="play" aria-label="Play ${esc(game.name)}">${icon('play')}<span>Play</span></button>${online || exclusive || installed ? '' : `<button class="expand-action" data-game-action="install" aria-label="Download ${esc(game.name)}">${icon('download')}<span>Download</span></button>`}</div></div><div class="card-body"><div class="card-title"><h3>${esc(game.name)}</h3><span class="rating">${icon(online ? 'wifi' : exclusive ? 'zap' : installed ? 'check' : 'hard-drive-download')} </span></div><div class="meta"><span class="tag">${esc(online ? 'Lumin' : exclusive ? 'Flash Exclusive' : game.category || 'Offline+')}</span></div></div></article>`;
  }

  async function renderGames() {
    const target = $('#gamesView'); if (!target) return;
    target.innerHTML = `<div class="page-head"><div><span class="eyebrow">GAMES</span><h1>Find your next game</h1><p>Offline downloads, instant online games, and Flash exclusives in one place.</p></div><div class="store-tools"><label class="search-bar">${icon('search')}<input id="gamesSearch" value="${esc(state.gamesQuery)}" placeholder="Search all games…"></label><label class="sort-control"><span>Section</span><select id="gamesSection"><option value="all">All</option><option value="offline">Offline+</option><option value="lumin">Lumin</option><option value="exclusive">Flash Exclusive</option></select></label></div></div><div id="gamesGrid" class="game-grid">${emptyState('Loading games','Building your full game collection…','loader-circle')}</div>`;
    $('#gamesSection').value = state.gameSection;
    if (state.gameSection === 'all' || state.gameSection === 'lumin') { try { await ensureOnlineGames(); } catch (e) { console.warn('Online games unavailable', e); } }
    const installed = installedSet();
    const query = state.gamesQuery.trim().toLowerCase();
    const visible = sortGames(gamesUniverse().filter((g) => matchesGamesSection(g) && (!query || `${g.name} ${g.category} ${g.description} ${g.zone}`.toLowerCase().includes(query))));
    const grid = $('#gamesGrid');
    grid.innerHTML = visible.length ? visible.map((g) => gamesCard(g, installed.has(g.id))).join('') : emptyState('No games found','Try another search or section.','search-x');
    $('#gamesSearch').oninput = (event) => { state.gamesQuery = event.target.value; clearTimeout(state.searchTimer); state.searchTimer = setTimeout(() => renderGames(), 180); };
    $('#gamesSection').onchange = (event) => { state.gameSection = event.target.value; renderGames(); };
    refreshIcons(target);
  }

  function recentGames() { try { const ids = JSON.parse(localStorage.getItem('flashgames.recent') || '[]'); return ids.map((id) => state.games.find((game) => game.id === id)).filter(Boolean).slice(0, 8); } catch { return []; } }

  function renderHome() {
    const target = $('#homeView'); if (!target) return; const featured = filteredGames(state.games)[0]; const recent = recentGames();
    target.innerHTML = featured ? `<section class="hero glass"><div><span class="eyebrow">FLASH GAMES</span><h1>Play <em>anything.</em></h1><p>Explore the real Offline HTML Games Pack, install games when you want them, and play them from your local browser cache.</p><div class="hero-actions"><button class="btn primary" data-game-action="play" data-game-id="${esc(featured.id)}">${icon('play')} Play Now</button><button class="btn" data-route="store">${icon('store')} Browse Store</button></div></div><div class="hero-art"><img loading="eager" src="${esc(gameCover(featured))}" alt="${esc(featured.name)}" onerror="this.onerror=null;this.src='./offline/logo.png'"><div class="live-pill"><i></i>${state.games.length.toLocaleString()} games available</div></div></section><section class="section"><div class="section-head"><div><span class="eyebrow">RECENTLY PLAYED</span><h2>Jump back in</h2><p>Your recent games, right where they belong.</p></div><button class="link-btn" data-route="library">Open Library ${icon('arrow-right')}</button></div><div class="game-grid">${recent.map((game) => gameCard(game, installedSet().has(game.id))).join('') || emptyState('No recent games yet', 'Play a game and it will appear here.', 'history')}</div></section>` : emptyState('Loading games', 'Fetching the real catalogue from GitHub.', 'loader-circle');
    refreshIcons(target);
  }

  function renderLibrary() {
    const target = $('#libraryView'); if (!target) return;
    target.innerHTML = `<div class="page-head"><div><span class="eyebrow">LIBRARY</span><h1>Your games</h1><p>Installed HTML files are cached locally and launched from Blob URLs.</p></div><button class="btn" data-route="store">${icon('plus')} Install games</button></div><div class="game-grid">${sortGames(state.installed).map((game) => gameCard(game, true)).join('') || emptyState('Your library is empty', 'Install a game from the Store to keep it available locally.', 'library')}</div>`;
    refreshIcons(target);
  }

  function renderStore() {
    const target = $('#storeView'); if (!target) return;
    const categories = ['All', ...new Set(state.games.map((game) => game.category).filter(Boolean))]; const visible = filteredGames(); const installed = installedSet();
    target.innerHTML = `<div class="page-head"><div><span class="eyebrow">STORE</span><h1>Game collection</h1><p>${state.games.length.toLocaleString()} real games available.</p></div><div class="store-tools"><label class="search-bar">${icon('search')}<input id="storeSearch" value="${esc(state.query)}" placeholder="Search games…"></label><label class="sort-control"><span>Sort</span><select id="storeSort"><option value="featured" ${state.sort === 'featured' ? 'selected' : ''}>Featured</option><option value="az" ${state.sort === 'az' ? 'selected' : ''}>A–Z</option><option value="za" ${state.sort === 'za' ? 'selected' : ''}>Z–A</option><option value="rating" ${state.sort === 'rating' ? 'selected' : ''}>Rating</option></select></label></div></div><div class="filter-row">${categories.map((category) => `<button class="filter ${category === state.category ? 'active' : ''}" data-category="${esc(category)}">${esc(category)}</button>`).join('')}</div><div class="game-grid">${visible.map((game) => gameCard(game, installed.has(game.id))).join('') || emptyState('No games found', 'Try a different search.', 'search-x')}</div>`;
    const search = $('#storeSearch');
    if (search) search.oninput = () => {
      state.query = search.value;
      clearTimeout(state.searchTimer);
      state.searchTimer = setTimeout(() => {
        renderStore();
        const next = $('#storeSearch');
        if (next) { next.focus(); next.setSelectionRange(next.value.length, next.value.length); }
      }, 90);
    };
    $('#storeSort')?.addEventListener('change', (event) => { state.sort = event.target.value; localStorage.setItem('flashgames.sort', state.sort); renderStore(); });
    refreshIcons(target);
  }

  function renderSocial() {
    const target = $('#socialView'); if (!target) return;
    target.innerHTML = `<div class="page-head"><div><span class="eyebrow">SOCIAL</span><h1>Connect</h1><p>Confer is built into Flash Games.</p></div></div><div class="social-frame glass"><iframe src="https://itsmeh1.github.io/confer/confer.html?.amplify.com" title="Confer" allow="camera; microphone; display-capture; fullscreen"></iframe></div>`;
  }

  function changeIcon(type) { if (type === 'add') return `<span class="change-icon log-add">${icon('plus')}</span>`; if (type === 'remove') return `<span class="change-icon log-remove">${icon('x')}</span>`; return `<span class="change-icon log-edit">${icon('hammer')}</span>`; }
  function renderUpdates() {
    const target = $('#updatesView'); if (!target) return;
    target.innerHTML = `<div class="page-head"><div><span class="eyebrow">CHANGELOG</span><h1>What's new</h1><p>Current version ${esc(state.updates.version)}.</p></div></div><div class="timeline">${(state.updates.releases || []).map((release) => `<article class="release glass"><div class="release-head"><div><strong>${esc(release.version || 'Update')}</strong><span>${esc(release.date || release.published || '')}</span></div>${icon('sparkles')}</div><p>${esc(release.description || release.summary || '')}</p>${Array.isArray(release.changes) ? release.changes.map((change) => `<div class="log-item">${changeIcon(change.type || change.kind)}<span>${esc(change.text || change.description || change.title || change)}</span></div>`).join('') : ''}</article>`).join('') || emptyState('No changelog entries', 'Published releases will appear here.', 'history')}</div>`;
    refreshIcons(target);
  }

  function memberLevel() { const minutes = Math.floor(state.stats.time / 60000); if (state.stats.played >= 100 || minutes >= 600) return 'Elite Member'; if (state.stats.played >= 30 || minutes >= 120 || state.stats.installs >= 30) return 'Dedicated Member'; if (state.stats.played >= 5 || state.stats.installs >= 5) return 'Active Member'; return 'New Member'; }

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
    const valid = ['home', 'games', 'library', 'store', 'social', 'updates', 'admin']; state.route = valid.includes(route) ? route : 'home';
    if (location.hash !== `#${state.route}`) history.replaceState(null, '', `#${state.route}`);
    $$('.view').forEach((view) => view.classList.toggle('active', view.dataset.view === state.route)); $$('.nav-item, .dock-item').forEach((button) => button.classList.toggle('active', button.dataset.route === state.route));
    if (state.route === 'home') renderHome(); if (state.route === 'games') renderGames(); if (state.route === 'library') renderLibrary(); if (state.route === 'store') renderStore(); if (state.route === 'social') renderSocial(); if (state.route === 'updates') renderUpdates(); if (state.route === 'admin') renderAdmin();
    requestAnimationFrame(refreshNavIndicator);
  }
  function refreshNavIndicator() { const nav = $('.desktop-nav'), active = $('.desktop-nav .nav-item.active'), indicator = $('.nav-indicator'); if (!nav || !active || !indicator) return; const a = active.getBoundingClientRect(), n = nav.getBoundingClientRect(); indicator.style.transform = `translate3d(${a.left - n.left}px,0,0)`; indicator.style.width = `${a.width}px`; }
  function openPanel(id) { const panel = document.getElementById(id); if (panel) panel.hidden = false; if (id === 'profilePanel') { renderProfile(); renderStats(); } if (id === 'settingsPanel') renderSettings(); refreshIcons(panel || document); }
  function closePanel(id) { const panel = document.getElementById(id); if (panel) panel.hidden = true; }

  function renderSearchResults() {
    const target = $('#searchResults'); if (!target) return; const query = state.query.trim().toLowerCase(); const results = query ? sortGames(state.games.filter((game) => `${game.name} ${game.category} ${(game.tags || []).join(' ')}`.toLowerCase().includes(query))).slice(0, 12) : sortGames(state.games).slice(0, 12);
    if (!results.length) { target.innerHTML = emptyState('No games found', 'Try another search.', 'search-x'); refreshIcons(target); return; }
    state.searchIndex = Math.min(state.searchIndex, results.length - 1); target.innerHTML = results.map((game, index) => `<button class="search-result ${index === state.searchIndex ? 'active' : ''}" data-search-game="${esc(game.id)}"><img loading="lazy" src="${esc(gameCover(game))}" alt=""><span><strong>${esc(game.name)}</strong><small>${esc(game.category || 'HTML Game')}</small></span>${icon('arrow-up-right')}</button>`).join(''); refreshIcons(target);
  }
  function openSearch() { const backdrop = $('#searchBackdrop'); if (!backdrop) return; backdrop.hidden = false; state.searchIndex = 0; renderSearchResults(); $('#searchInput')?.focus(); }
  async function loadInstalled() { state.installed = await FlashGamesStore.getAllCachedGames(); state.favourites = FlashGamesStore.getFavourites(); }

  async function playOnlineGame(game) {
    try {
      await ensureOnlineGames();
      const value = await window.Lumin.getGameUrl(game.luminId);
      const url = typeof value === 'string' ? value : value?.url;
      if (!url) throw new Error('Online game URL unavailable.');
      const frame = $('#gameFrame');
      const overlay = $('#playerOverlay');
      if (!frame || !overlay) return;
      frame.src = url;
      overlay.hidden = false;
      document.body.classList.add('player-open');
      refreshIcons(overlay);
    } catch (error) {
      toast('Could not open online game', error.message || 'The game could not be opened.', 'error');
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
      const frame = $('#gameFrame');
      const overlay = $('#playerOverlay');
      if (!frame || !overlay || !url) return;
      if (state.objectUrl) URL.revokeObjectURL(state.objectUrl);
      state.objectUrl = url.startsWith('blob:') ? url : null;
      const recent = (() => {
        try { return JSON.parse(localStorage.getItem('flashgames.recent') || '[]'); }
        catch { return []; }
      })();
      localStorage.setItem('flashgames.recent', JSON.stringify([
        game.id,
        ...recent.filter((id) => id !== game.id)
      ].slice(0, 12)));
      frame.src = url;
      overlay.hidden = false;
      document.body.classList.add('player-open');
      state.stats.played += 1;
      state.gameStartedAt = Date.now();
      saveStats();
      refreshIcons(overlay);
    } catch (error) {
      toast('Could not open game', error.message || 'The game could not be downloaded.', 'error');
    }
  }

  function closePlayer() { const overlay = $('#playerOverlay'), frame = $('#gameFrame'); if (state.gameStartedAt) { state.stats.time += Math.max(0, Date.now() - state.gameStartedAt); state.gameStartedAt = 0; saveStats(); } if (frame) frame.src = 'about:blank'; if (overlay) overlay.hidden = true; document.body.classList.remove('player-open'); if (state.objectUrl) { URL.revokeObjectURL(state.objectUrl); state.objectUrl = null; } }
  async function installGame(game) { try { toast('Installing', `Caching ${game.name} locally…`); await FlashGamesStore.install(game); state.stats.installs += 1; saveStats(); await loadInstalled(); toast('Installed', `${game.name} is now in your Library.`, 'success'); if (state.route === 'store') renderStore(); else renderLibrary(); } catch (error) { toast('Install failed', error.message || 'The game could not be cached.', 'error'); } }
  async function removeGame(game) { confirmDialog('Remove game?', `${game.name} will be removed from your local library.`, async () => { await FlashGamesStore.deleteCachedGame(game.id); await loadInstalled(); toast('Removed', `${game.name} was removed from your library.`, 'success'); if (state.route === 'library') renderLibrary(); if (state.route === 'home') renderHome(); if (state.route === 'store') renderStore(); }, true); }
  function toggleFavourite(game) { const enabled = !state.favourites.has(game.id); FlashGamesStore.setFavourite(game.id, enabled); state.favourites = FlashGamesStore.getFavourites(); toast(enabled ? 'Added to favorites' : 'Removed from favorites', game.name, 'success'); if (state.route === 'store') renderStore(); if (state.route === 'library') renderLibrary(); }

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
    const searchGame = event.target.closest('[data-search-game]'); if (searchGame) { const game = state.games.find((item) => item.id === searchGame.dataset.searchGame); if (game) { closePanel('searchBackdrop'); playGame(game); } return; }
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
      const results = sortGames(state.games.filter((game) => `${game.name} ${game.category} ${(game.tags || []).join(' ')}`.toLowerCase().includes(state.query.toLowerCase()))).slice(0, 12);
      if (event.key === 'ArrowDown') { event.preventDefault(); state.searchIndex = Math.min(state.searchIndex + 1, Math.max(0, results.length - 1)); renderSearchResults(); }
      if (event.key === 'ArrowUp') { event.preventDefault(); state.searchIndex = Math.max(0, state.searchIndex - 1); renderSearchResults(); }
      if (event.key === 'Enter' && results[state.searchIndex]) { closePanel('searchBackdrop'); playGame(results[state.searchIndex]); }
      if (event.key === 'Escape') closePanel('searchBackdrop');
    });
  }

  function handleGlobalKeys(event) { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); openSearch(); } if (event.key === 'Escape') { closePanel('searchBackdrop'); closePanel('notificationsBackdrop'); closePanel('profilePanel'); closePanel('settingsPanel'); closePanel('userManagementBackdrop'); closePlayer(); } }

  async function init() {
    document.addEventListener('click', handleClick); document.addEventListener('keydown', handleGlobalKeys); window.addEventListener('hashchange', () => setRoute(location.hash.replace('#', '') || 'home')); window.addEventListener('resize', () => requestAnimationFrame(refreshNavIndicator), { passive: true });
    handleSettings(); handleSearch(); applyPreferences(); refreshIcons();
    try {
      state.favourites = FlashGamesStore.getFavourites(); await loadInstalled();
      const [catalogue, updates] = await Promise.all([FlashData.loadGames(), FlashData.loadUpdates()]); state.games = catalogue.games || []; state.updates = updates;
      renderProfile(); renderNotifications(); updateAdminVisibility(); setRoute(state.route);
      const auth = window.__flashFirebase?.auth; if (auth) auth.onAuthStateChanged((user) => loadUserProfile(user));
      if (state.games.length === 0) toast('Game catalogue unavailable', 'GitHub could not be reached. Existing installed games are still available.', 'error');
      if (state.games.length >= 300) toast('Catalogue ready', `${state.games.length.toLocaleString()} games are available.`, 'success');
    } catch (error) { console.error('Flash Games initialization failed:', error); toast('Startup error', error.message || 'Flash Games could not finish loading.', 'error'); renderHome(); }
  }

  document.addEventListener('DOMContentLoaded', init, { once: true });
})();
