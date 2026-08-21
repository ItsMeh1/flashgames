(() => {
  'use strict';

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const esc = (value) => FlashData.esc(value);
  const icon = (name) => `<i data-lucide="${name}"></i>`;

  const state = {
    route: location.hash.slice(1) || 'home',
    games: [],
    installed: [],
    favourites: FlashGamesStore.getFavourites(),
    query: '',
    category: 'All',
    user: null,
    updates: { version: '0.0.0', releases: [] },
    notifications: [],
    stats: JSON.parse(localStorage.getItem('flashgames.stats') || '{"played":0,"time":0,"installs":0}'),
    performance: localStorage.getItem('flashgames.performance') === '1',
    motion: localStorage.getItem('flashgames.motion') !== '0',
    theme: localStorage.getItem('flashgames.theme') || 'dark',
    settingsOpen: false,
    gameUrl: null,
    gameTimer: 0
  };

  function refreshIcons(root = document) {
    if (!window.lucide?.createIcons) return;
    window.requestAnimationFrame(() => window.lucide.createIcons({ root, attrs: { 'stroke-width': 1.5 } }));
  }

  function saveStats() {
    localStorage.setItem('flashgames.stats', JSON.stringify(state.stats));
  }

  function toast(title, message, type = 'info') {
    const stack = $('#toastStack');
    if (!stack) return;
    const node = document.createElement('article');
    node.className = 'toast';
    node.innerHTML = `${icon(type === 'error' ? 'circle-alert' : type === 'success' ? 'circle-check' : 'info')}<div><strong>${esc(title)}</strong><p>${esc(message)}</p></div>`;
    stack.appendChild(node);
    requestAnimationFrame(() => node.classList.add('show'));
    setTimeout(() => {
      node.classList.remove('show');
      setTimeout(() => node.remove(), 260);
    }, 4200);
  }

  function confirmDialog(title, text, action, danger = false) {
    const backdrop = $('#dialogBackdrop');
    if (!backdrop) return;
    $('#dialogTitle').textContent = title;
    $('#dialogText').textContent = text;
    $('#dialogIcon').innerHTML = icon(danger ? 'triangle-alert' : 'circle-help');
    const confirm = $('#dialogConfirm');
    confirm.className = `btn ${danger ? 'danger' : 'primary'}`;
    backdrop.hidden = false;
    const finish = () => {
      backdrop.hidden = true;
      confirm.removeEventListener('click', run);
      $('#dialogCancel')?.removeEventListener('click', finish);
    };
    const run = async () => {
      try { await action(); } finally { finish(); }
    };
    confirm.addEventListener('click', run);
    $('#dialogCancel')?.addEventListener('click', finish, { once: true });
    refreshIcons(backdrop);
  }

  function setTheme(theme) {
    state.theme = theme;
    localStorage.setItem('flashgames.theme', theme);
    document.documentElement.dataset.theme = theme === 'system'
      ? (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark')
      : theme;
    $$('#themeChoices button').forEach((button) => button.classList.toggle('active', button.dataset.theme === theme));
  }

  function updateAvatar(element, value) {
    if (!element) return;
    const img = $('img', element);
    const fallback = './offline/logo.png';
    let source = String(value || '').trim();
    if (source && !/^data:image\//i.test(source) && !/^https?:\/\//i.test(source)) {
      if (/^[A-Za-z0-9+/]+=*$/.test(source) && source.length > 80) source = `data:image/png;base64,${source}`;
      else source = `data:image/png;base64,${source}`;
    }
    img.onerror = () => { img.onerror = null; img.src = fallback; };
    img.src = source || fallback;
  }

  function gameCover(game) {
    return game.cover || `https://dummyimage.com/800x500/11131a/ffffff&text=${encodeURIComponent(game.name.slice(0, 22))}`;
  }

  function filteredGames(list = state.games) {
    const query = state.query.toLowerCase().trim();
    return list.filter((game) => {
      const matchesQuery = !query || `${game.name} ${game.category} ${game.description} ${(game.tags || []).join(' ')}`.toLowerCase().includes(query);
      const matchesCategory = state.category === 'All' || game.category === state.category;
      return matchesQuery && matchesCategory;
    });
  }

  function gameCard(game, installed = false) {
    const favourite = state.favourites.has(game.id);
    return `<article class="game-card" data-game-id="${esc(game.id)}">
      <div class="cover">
        <img loading="lazy" src="${esc(gameCover(game))}" alt="${esc(game.name)} cover" data-fallback="${esc(game.name.slice(0, 2).toUpperCase())}">
        <span class="badge">${installed ? 'Installed' : esc(game.category || 'HTML Game')}</span>
        <div class="card-overlay">
          <button class="expand-action play" data-game-action="play" aria-label="Play ${esc(game.name)}">${icon('play')}<span>Play</span></button>
          ${!installed ? `<button class="expand-action" data-game-action="install" aria-label="Install ${esc(game.name)}">${icon('download')}<span>Install</span></button>` : ''}
          <button class="expand-action" data-game-action="favorite" aria-label="${favourite ? 'Unfavorite' : 'Favorite'} ${esc(game.name)}">${icon(favourite ? 'heart-off' : 'heart')}<span>${favourite ? 'Unfavorite' : 'Favorite'}</span></button>
          <button class="expand-action" data-game-action="boost" aria-label="Performance boost">${icon('gauge')}<span>Boost</span></button>
          ${installed ? `<button class="expand-action close" data-game-action="remove" aria-label="Remove ${esc(game.name)}">${icon('trash-2')}<span>Remove</span></button>` : ''}
        </div>
      </div>
      <div class="card-body"><div class="card-title"><h3>${esc(game.name)}</h3><span class="rating">${icon('star')} ${game.rating ? esc(game.rating) : 'HTML'}</span></div><div class="meta"><span class="tag">${esc(game.zone || 'STORE')}</span></div><p class="card-desc">${esc(game.description || 'Single-file HTML game.')}</p></div>
    </article>`;
  }

  function emptyState(title, text, glyph = 'gamepad-2') {
    return `<div class="empty glass">${icon(glyph)}<h3>${esc(title)}</h3><p>${esc(text)}</p></div>`;
  }

  function renderHome() {
    const target = $('#homeView');
    if (!target) return;
    const featured = state.games[0];
    const installedCount = state.installed.length;
    target.innerHTML = featured ? `<section class="hero glass">
      <div><span class="eyebrow">FLASH GAMES</span><h1>Play <em>anything.</em></h1><p>Browse the real Offline HTML Games Pack catalogue, install games locally, and launch them from your private browser library.</p><div class="hero-actions"><button class="btn primary" data-game-action="play" data-game-id="${esc(featured.id)}">${icon('play')} Play Now</button><button class="btn" data-route="store">${icon('store')} Browse Store</button></div></div>
      <div class="hero-art"><img loading="eager" src="${esc(gameCover(featured))}" alt=""><div class="live-pill"><i></i>${state.games.length.toLocaleString()} games available</div></div>
    </section><section class="section"><div class="section-head"><div><span class="eyebrow">YOUR LIBRARY</span><h2>Jump back in</h2><p>${installedCount} installed game${installedCount === 1 ? '' : 's'}.</p></div><button class="link-btn" data-route="library">Open Library ${icon('arrow-right')}</button></div><div class="game-grid">${state.installed.slice(0, 4).map((game) => gameCard(game, true)).join('') || emptyState('Nothing installed yet', 'Pick a game from the Store and install it here.', 'download')}</div></section>` : emptyState('Loading games', 'Fetching the real game catalogue from GitHub.', 'loader-circle');
    wireImages(target);
  }

  function renderLibrary() {
    const target = $('#libraryView');
    if (!target) return;
    target.innerHTML = `<div class="page-head"><div><span class="eyebrow">LIBRARY</span><h1>Your games</h1><p>Installed games are stored locally and played from cached HTML blobs.</p></div><button class="btn" data-route="store">${icon('plus')} Install games</button></div><div class="game-grid">${state.installed.map((game) => gameCard(game, true)).join('') || emptyState('Your library is empty', 'Install a game from the Store to keep it available offline.', 'library')}</div>`;
    wireImages(target);
  }

  function renderStore() {
    const target = $('#storeView');
    if (!target) return;
    const categories = ['All', ...new Set(state.games.map((game) => game.category).filter(Boolean))];
    target.innerHTML = `<div class="page-head"><div><span class="eyebrow">STORE</span><h1>Game collection</h1><p>${state.games.length.toLocaleString()} real games from the Offline HTML Games Pack.</p></div><label class="search-bar">${icon('search')}<input id="storeSearch" value="${esc(state.query)}" placeholder="Search games…"></label></div><div class="filter-row">${categories.slice(0, 14).map((category) => `<button class="filter ${category === state.category ? 'active' : ''}" data-category="${esc(category)}">${esc(category)}</button>`).join('')}</div><div class="game-grid">${filteredGames().map((game) => gameCard(game, state.installed.some((item) => item.id === game.id))).join('') || emptyState('No games found', 'Try a different search.', 'search-x')}</div>`;
    wireImages(target);
    const input = $('#storeSearch');
    input?.addEventListener('input', debounce((event) => { state.query = event.target.value; renderStore(); }, 120));
  }

  function renderSocial() {
    const target = $('#socialView');
    if (!target) return;
    target.innerHTML = `<div class="page-head"><div><span class="eyebrow">SOCIAL</span><h1>Connect</h1><p>Confer is embedded directly inside Flash Games.</p></div></div><div class="social-frame glass"><iframe src="https://itsmeh1.github.io/confer/confer.html?.amplify.com" title="Confer" allow="camera; microphone; display-capture; fullscreen"></iframe></div>`;
  }

  function updateIconForChange(type) {
    if (type === 'add') return `<span class="change-icon log-add">${icon('plus')}</span>`;
    if (type === 'remove') return `<span class="change-icon log-remove">${icon('x')}</span>`;
    return `<span class="change-icon log-edit">${icon('hammer')}</span>`;
  }

  function renderUpdates() {
    const target = $('#updatesView');
    if (!target) return;
    const releases = state.updates.releases || [];
    target.innerHTML = `<div class="page-head"><div><span class="eyebrow">CHANGELOG</span><h1>What's new</h1><p>Current version ${esc(state.updates.version || '—')}.</p></div></div><div class="timeline">${releases.map((release) => `<article class="release glass"><div class="release-head"><div><strong>${esc(release.version || 'Update')}</strong><span>${esc(release.date || release.published || '')}</span></div>${icon('sparkles')}</div><p>${esc(release.description || release.summary || '')}</p>${Array.isArray(release.changes) ? release.changes.map((change) => `<div class="log-item">${updateIconForChange(change.type || change.kind)}<span>${esc(change.text || change.description || change.title || change)}</span></div>`).join('') : ''}</article>`).join('') || emptyState('No changelog entries', 'Updates will appear here when published.', 'history')}</div>`;
  }

  function renderProfile() {
    const profile = $('#profilePanel');
    if (!profile) return;
    const user = state.user;
    $('#profileName') && ($('#profileName').textContent = user?.displayName || user?.email?.split('@')[0] || 'Sign in');
    $('#profileEmail') && ($('#profileEmail').textContent = user?.email || 'Your Firebase profile will appear here.');
    updateAvatar($('#profileAvatar'), user?.photoURL || user?.photo || user?.avatar || user?.pfp);
    updateAvatar($('#headerAvatar'), user?.photoURL || user?.photo || user?.avatar || user?.pfp);
    $('#headerName') && ($('#headerName').textContent = user?.displayName || user?.email?.split('@')[0] || 'Sign in');
    $('#profileGames') && ($('#profileGames').textContent = state.installed.length);
    $('#profileTotal') && ($('#profileTotal').textContent = state.games.length);
    $('#signInBtn') && ($('#signInBtn').hidden = !!user);
    $('#signOutBtn') && ($('#signOutBtn').hidden = !user);
  }

  function memberLevel() {
    const played = Number(state.stats.played || 0);
    const installs = Number(state.stats.installs || 0);
    const minutes = Math.floor(Number(state.stats.time || 0) / 60000);
    if (played >= 100 || minutes >= 600) return 'Elite Member';
    if (played >= 30 || minutes >= 120 || installs >= 30) return 'Dedicated Member';
    if (played >= 5 || installs >= 5) return 'Active Member';
    return 'New Member';
  }

  function renderStats() {
    const target = $('#profilePanel');
    if (!target) return;
    let block = $('.stats-card', target);
    if (!block) {
      block = document.createElement('div');
      block.className = 'stats-card';
      block.innerHTML = `<div class="panel-head"><div><span class="eyebrow">ACTIVITY</span><h2>Stats</h2></div></div><div class="stats-grid"><div><strong id="statPlayed">0</strong><span>Games played</span></div><div><strong id="statInstalls">0</strong><span>Installed</span></div><div><strong id="statTime">0m</strong><span>Time played</span></div><div><strong id="statMember">New Member</strong><span>Member level</span></div></div>`;
      $('.profile-stats', target)?.after(block);
    }
    $('#statPlayed').textContent = state.stats.played || 0;
    $('#statInstalls').textContent = state.stats.installs || 0;
    $('#statTime').textContent = `${Math.floor((state.stats.time || 0) / 60000)}m`;
    $('#statMember').textContent = memberLevel();
  }

  function renderSettings() {
    const panel = $('#settingsPanel');
    if (!panel) return;
    const motionSwitch = $('#toggleMotion .switch');
    motionSwitch?.classList.toggle('on', state.motion);
    const boost = document.body.classList.contains('performance-boost');
    if (boost !== state.performance) document.body.classList.toggle('performance-boost', state.performance);
    $$('#themeChoices button').forEach((button) => button.classList.toggle('active', button.dataset.theme === state.theme));
  }

  function renderAdmin() {
    const target = $('#adminView');
    if (!target || !state.user) return;
    const email = state.user.email || '';
    const allowed = /admin|owner|itsmeh1/i.test(email);
    $('#adminNav')?.classList.toggle('hidden', !allowed);
    if (!allowed) {
      target.innerHTML = emptyState('Admin access required', 'Your Firebase account is not authorized for this workspace.', 'shield-off');
      return;
    }
    target.innerHTML = `<div class="admin-shell glass"><div class="admin-head"><div><span class="eyebrow">CONTROL CENTER</span><h1>Flash Admin</h1><p>Manage users, games, releases and site access.</p></div><span class="admin-role">${esc(email)}</span></div><section class="admin-panel"><h2>Dashboard</h2><p>${state.games.length.toLocaleString()} games available · ${state.installed.length} locally installed · ${state.notifications.length} notifications.</p></section><section class="admin-panel"><h2>Game catalogue</h2><p>The catalogue is sourced directly from the Offline HTML Games Pack and refreshed from GitHub.</p><div class="admin-actions"><button class="btn" data-admin-action="refresh-games">${icon('refresh-cw')} Refresh catalogue</button><button class="btn" data-admin-action="clear-cache">${icon('database-zap')} Clear local cache</button></div></section><section class="admin-panel"><h2>Updates & maintenance</h2><p>Lock the public app while an update is being prepared. The flag is stored in Firestore when available.</p><div class="maintenance-card"><div><strong>Public maintenance mode</strong><small id="maintenanceStatus">Checking status…</small></div><button class="btn danger" data-admin-action="maintenance">${icon('lock')} Toggle maintenance</button></div></section><section class="admin-panel"><h2>Release tools</h2><p>Publish changelog data through update.json, then let the service worker update the app shell.</p><div class="admin-actions"><button class="btn" data-route="updates">${icon('history')} View changelog</button><button class="btn" data-admin-action="hard-refresh">${icon('refresh-cw')} Refresh app</button></div></section></div>`;
    refreshIcons(target);
  }

  function renderAll() {
    renderHome();
    renderLibrary();
    renderStore();
    renderSocial();
    renderUpdates();
    renderProfile();
    renderStats();
    renderSettings();
    renderAdmin();
    setRoute(state.route, false);
    refreshIcons(document);
  }

  function setRoute(route, updateHash = true) {
    const valid = ['home', 'library', 'store', 'social', 'updates', 'admin'];
    state.route = valid.includes(route) ? route : 'home';
    if (updateHash) history.replaceState(null, '', `#${state.route}`);
    $$('.view').forEach((view) => view.classList.toggle('active', view.dataset.view === state.route));
    $$('.nav-item, .dock-item').forEach((button) => button.classList.toggle('active', button.dataset.route === state.route));
  }

  function wireImages(root) {
    $$('img[data-fallback]', root).forEach((img) => {
      img.addEventListener('error', () => {
        const parent = img.parentElement;
        if (!parent || img.dataset.failed) return;
        img.dataset.failed = '1';
        const fallback = document.createElement('div');
        fallback.className = 'cover-fallback';
        fallback.textContent = img.dataset.fallback;
        img.replaceWith(fallback);
      }, { once: true });
    });
  }

  function debounce(fn, wait) {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), wait);
    };
  }

  async function installGame(game) {
    toast('Installing', `Downloading ${game.name}…`);
    try {
      await FlashGamesStore.install(game);
      state.stats.installs += 1;
      saveStats();
      await loadInstalled();
      renderAll();
      toast('Installed', `${game.name} is ready to play.`, 'success');
    } catch (error) {
      toast('Install failed', error.message || 'The game could not be downloaded.', 'error');
    }
  }

  async function playGame(game) {
    const overlay = $('#playerOverlay');
    const frame = $('#gameFrame');
    if (!overlay || !frame) return;
    try {
      const source = await FlashGamesStore.launch(game);
      if (state.gameUrl) URL.revokeObjectURL(state.gameUrl);
      state.gameUrl = source.startsWith('blob:') ? source : null;
      frame.src = source;
      overlay.hidden = false;
      document.body.classList.add('player-open');
      state.stats.played += 1;
      state.gameTimer = Date.now();
      saveStats();
    } catch (error) {
      toast('Could not launch game', error.message || 'The game could not be opened.', 'error');
    }
  }

  function closePlayer() {
    const overlay = $('#playerOverlay');
    const frame = $('#gameFrame');
    if (state.gameTimer) {
      state.stats.time += Date.now() - state.gameTimer;
      state.gameTimer = 0;
      saveStats();
    }
    if (frame) frame.src = 'about:blank';
    if (state.gameUrl) URL.revokeObjectURL(state.gameUrl);
    state.gameUrl = null;
    if (overlay) overlay.hidden = true;
    document.body.classList.remove('player-open');
  }

  async function loadInstalled() {
    state.installed = await FlashGamesStore.getAllCachedGames();
  }

  async function handleGameAction(button) {
    const card = button.closest('[data-game-id]');
    const id = button.dataset.gameId || card?.dataset.gameId;
    const game = state.games.find((item) => item.id === id) || state.installed.find((item) => item.id === id);
    if (!game) return;
    const action = button.dataset.gameAction;
    if (action === 'play') return playGame(game);
    if (action === 'install') return installGame(game);
    if (action === 'favorite') {
      const enabled = !state.favourites.has(game.id);
      FlashGamesStore.setFavourite(game.id, enabled);
      state.favourites = FlashGamesStore.getFavourites();
      renderAll();
      toast(enabled ? 'Added to favorites' : 'Removed from favorites', game.name, 'success');
      return;
    }
    if (action === 'boost') {
      state.performance = !state.performance;
      localStorage.setItem('flashgames.performance', state.performance ? '1' : '0');
      document.body.classList.toggle('performance-boost', state.performance);
      toast(state.performance ? 'Performance mode on' : 'Performance mode off', 'Reduced visual effects; game quality is unchanged.', 'success');
      return;
    }
    if (action === 'remove') {
      confirmDialog('Remove game?', `${game.name} will be removed from your local library.`, async () => {
        await FlashGamesStore.deleteCachedGame(game.id);
        await loadInstalled();
        renderAll();
        toast('Removed', `${game.name} was removed from your library.`, 'success');
      }, true);
    }
  }

  function openSearch() {
    const backdrop = $('#searchBackdrop');
    if (!backdrop) return;
    backdrop.hidden = false;
    const input = $('#searchInput');
    input.value = state.query;
    input.focus();
    renderSearchResults();
  }

  function renderSearchResults() {
    const target = $('#searchResults');
    if (!target) return;
    const games = filteredGames(state.games).slice(0, 30);
    target.innerHTML = games.map((game, index) => `<button class="search-result ${index === 0 ? 'active' : ''}" data-search-game="${esc(game.id)}">${icon('gamepad-2')}<div><strong>${esc(game.name)}</strong><small>${esc(game.category || 'HTML Game')}</small></div>${icon('arrow-up-right')}</button>`).join('') || emptyState('No results', 'Try another game name.');
    refreshIcons(target);
  }

  async function signIn() {
    const auth = window.__flashFirebase?.auth;
    if (!auth) return toast('Firebase unavailable', 'The account service could not be initialized.', 'error');
    const email = $('#authEmail')?.value.trim();
    const password = $('#authPassword')?.value;
    if (!email || !password) return toast('Missing credentials', 'Enter your email and password.', 'error');
    try {
      await auth.signInWithEmailAndPassword(email, password);
    } catch (error) {
      toast('Sign in failed', error.message || 'Unable to sign in.', 'error');
    }
  }

  async function signOut() {
    try { await window.__flashFirebase?.auth?.signOut(); } catch (error) { toast('Sign out failed', error.message || 'Unable to sign out.', 'error'); }
  }

  function initFirebase() {
    if (!window.firebase) return;
    const config = {
      apiKey: 'AIzaSyBprG8pYZ1WQNh2wt0kih3P7Z3nIxhnU5k',
      authDomain: 'mobify-5b3c9.firebaseapp.com',
      projectId: 'mobify-5b3c9',
      storageBucket: 'mobify-5b3c9.firebasestorage.app',
      messagingSenderId: '454093361079',
      appId: '1:454093361079:web:ab1e1093a91a705be3a232'
    };
    try {
      if (!firebase.apps.length) firebase.initializeApp(config);
      const auth = firebase.auth();
      const db = firebase.firestore();
      window.__flashFirebase = { firebase, app: firebase.app(), auth, db };
      auth.onAuthStateChanged(async (user) => {
        state.user = user;
        state.notifications = await FlashData.loadNotifications(user?.uid);
        renderProfile();
        renderStats();
        renderAdmin();
      });
    } catch (error) {
      toast('Firebase unavailable', error.message || 'Account data could not be loaded.', 'error');
    }
  }

  async function init() {
    setTheme(state.theme);
    document.body.classList.toggle('performance-boost', state.performance);
    document.documentElement.classList.toggle('reduce-motion', !state.motion);
    initFirebase();

    try {
      const result = await FlashGamesStore.loadCatalogue();
      state.games = result;
      await loadInstalled();
      state.updates = await FlashData.loadUpdates();
      renderAll();
      if (state.games.length < 300) toast('Catalogue warning', `Only ${state.games.length} games loaded. GitHub may be temporarily unavailable.`, 'error');
    } catch (error) {
      toast('Startup error', error.message || 'Some Flash Games data could not load.', 'error');
      renderAll();
    }
  }

  document.addEventListener('click', async (event) => {
    const routeButton = event.target.closest('[data-route]');
    if (routeButton) {
      event.preventDefault();
      setRoute(routeButton.dataset.route);
      return;
    }

    const actionButton = event.target.closest('[data-game-action]');
    if (actionButton) {
      await handleGameAction(actionButton);
      return;
    }

    const category = event.target.closest('[data-category]');
    if (category) {
      state.category = category.dataset.category;
      renderStore();
      return;
    }

    const close = event.target.closest('[data-close]');
    if (close) {
      const element = document.getElementById(close.dataset.close);
      if (element) element.hidden = true;
      return;
    }

    const searchGame = event.target.closest('[data-search-game]');
    if (searchGame) {
      const game = state.games.find((item) => item.id === searchGame.dataset.searchGame);
      if (game) {
        $('#searchBackdrop').hidden = true;
        await playGame(game);
      }
      return;
    }

    if (event.target.closest('#openSearch')) openSearch();
    if (event.target.closest('#openNotifications')) $('#notificationsBackdrop')?.removeAttribute('hidden');
    if (event.target.closest('#openProfile') || event.target.closest('#mobileProfile')) { $('#profilePanel')?.removeAttribute('hidden'); renderProfile(); renderStats(); }
    if (event.target.closest('#openSettings')) { $('#profilePanel').hidden = true; $('#settingsPanel').hidden = false; renderSettings(); }
    if (event.target.closest('#closePlayer')) closePlayer();
    if (event.target.closest('#signInBtn')) signIn();
    if (event.target.closest('#signOutBtn')) signOut();
    if (event.target.closest('#toggleMotion')) {
      state.motion = !state.motion;
      localStorage.setItem('flashgames.motion', state.motion ? '1' : '0');
      document.documentElement.classList.toggle('reduce-motion', !state.motion);
      renderSettings();
    }
    if (event.target.closest('#clearLibrary')) {
      confirmDialog('Clear library?', 'Every locally cached game will be removed from this browser.', async () => {
        await FlashGamesStore.clearGameCache();
        await loadInstalled();
        renderAll();
        toast('Library cleared', 'Local games were removed.', 'success');
      }, true);
    }
    const theme = event.target.closest('[data-theme]');
    if (theme) setTheme(theme.dataset.theme);
    const adminAction = event.target.closest('[data-admin-action]');
    if (adminAction) {
      if (adminAction.dataset.adminAction === 'refresh-games') {
        state.games = await FlashGamesStore.loadCatalogue(true);
        renderAll();
        toast('Catalogue refreshed', `${state.games.length.toLocaleString()} games are available.`, 'success');
      }
      if (adminAction.dataset.adminAction === 'clear-cache') {
        await FlashGamesStore.clearGameCache();
        await loadInstalled();
        renderAll();
        toast('Cache cleared', 'Installed game files were removed.', 'success');
      }
      if (adminAction.dataset.adminAction === 'hard-refresh') location.reload();
      if (adminAction.dataset.adminAction === 'maintenance') {
        const db = window.__flashFirebase?.db;
        if (!db) return toast('Firebase unavailable', 'Maintenance mode needs Firestore.', 'error');
        try {
          const ref = db.collection('settings').doc('site');
          const current = await ref.get();
          const enabled = !!current.data()?.maintenance;
          await ref.set({ maintenance: !enabled, updatedAt: Date.now() }, { merge: true });
          toast(!enabled ? 'Maintenance enabled' : 'Maintenance disabled', 'The public access flag was updated.', 'success');
        } catch (error) { toast('Maintenance update failed', error.message || 'Could not update site state.', 'error'); }
      }
    }
  });

  document.addEventListener('input', (event) => {
    if (event.target.id === 'searchInput') {
      state.query = event.target.value;
      renderSearchResults();
    }
    if (event.target.id === 'opacityRange') {
      document.documentElement.style.setProperty('--opacity', `${event.target.value}%`);
      $('#opacityValue').textContent = `${event.target.value}%`;
    }
    if (event.target.id === 'blurRange') {
      document.documentElement.style.setProperty('--blur', `${event.target.value}px`);
      $('#blurValue').textContent = `${event.target.value}px`;
    }
    if (event.target.id === 'accentPicker') document.documentElement.style.setProperty('--accent', event.target.value);
  });

  document.addEventListener('keydown', (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); openSearch(); }
    if (event.key === 'Escape') {
      if (!$('#searchBackdrop')?.hidden) $('#searchBackdrop').hidden = true;
      else if (!$('#playerOverlay')?.hidden) closePlayer();
      else if (!$('#settingsPanel')?.hidden) $('#settingsPanel').hidden = true;
      else if (!$('#profilePanel')?.hidden) $('#profilePanel').hidden = true;
    }
  });

  window.addEventListener('hashchange', () => setRoute(location.hash.slice(1) || 'home', false));
  window.addEventListener('beforeunload', closePlayer);

  init();
})();
