(() => {
  'use strict';

  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];
  const icon = (name) => `<i data-lucide="${name}"></i>`;
  const esc = (value) => FlashData.esc(value);

  const FIREBASE_CONFIG = {
    apiKey: 'AIzaSyBprG8pYZ1WQNh2wt0kih3P7Z3nIxhnU5k',
    authDomain: 'mobify-5b3c9.firebaseapp.com',
    projectId: 'mobify-5b3c9',
    storageBucket: 'mobify-5b3c9.firebasestorage.app',
    messagingSenderId: '454093361079',
    appId: '1:454093361079:web:ab1e1093a91a705be3a232'
  };

  const ADMIN_ROLES = new Set(['admin', 'administrator', 'moderator', 'mod', 'owner']);
  const VIEWS = new Set(['home', 'library', 'store', 'social', 'updates', 'admin']);
  let iconQueued = false;
  let searchTimer = 0;
  let dbPromise = null;
  let playerUrl = null;
  let sessionStarted = 0;
  let dialogResolve = null;

  const state = {
    view: VIEWS.has(location.hash.slice(1)) ? location.hash.slice(1) : 'home',
    games: [],
    installed: new Set(),
    favorites: new Set(),
    query: '',
    category: 'All',
    user: null,
    profile: null,
    role: '',
    db: null,
    auth: null,
    maintenance: false,
    updates: [],
    stats: readStats()
  };

  function readStats() {
    try {
      return { played: 0, time: 0, ...JSON.parse(localStorage.getItem('flashgames.stats') || '{}') };
    } catch {
      return { played: 0, time: 0 };
    }
  }

  function saveStats() {
    localStorage.setItem('flashgames.stats', JSON.stringify(state.stats));
  }

  function loadLocal() {
    try { state.installed = new Set(JSON.parse(localStorage.getItem('flashgames.installed') || '[]')); } catch { state.installed = new Set(); }
    try { state.favorites = new Set(JSON.parse(localStorage.getItem('flashgames.favorites') || '[]')); } catch { state.favorites = new Set(); }
  }

  function saveLocal() {
    localStorage.setItem('flashgames.installed', JSON.stringify([...state.installed]));
    localStorage.setItem('flashgames.favorites', JSON.stringify([...state.favorites]));
  }

  function memberTier() {
    if (state.stats.played >= 100 || state.stats.time >= 86400000) return 'Elite Member';
    if (state.stats.played >= 25 || state.stats.time >= 21600000) return 'Core Member';
    if (state.stats.played >= 5) return 'Explorer';
    return 'New Member';
  }

  function imageSource(value) {
    const source = String(value || '').trim();
    if (!source) return './offline/logo.png';
    if (/^(https?:|data:image\/|blob:)/i.test(source)) return source;

    const base64 = source.replace(/\s/g, '');
    if (!/^[A-Za-z0-9+/]+=*$/.test(base64)) return './offline/logo.png';
    if (base64.startsWith('iVBORw0KGgo')) return `data:image/png;base64,${base64}`;
    if (base64.startsWith('/9j/')) return `data:image/jpeg;base64,${base64}`;
    if (base64.startsWith('R0lGOD')) return `data:image/gif;base64,${base64}`;
    if (base64.startsWith('UklGR')) return `data:image/webp;base64,${base64}`;
    return './offline/logo.png';
  }

  function refreshIcons() {
    if (iconQueued || !window.lucide) return;
    iconQueued = true;
    requestAnimationFrame(() => {
      iconQueued = false;
      window.lucide.createIcons({ attrs: { 'stroke-width': 1.5 } });
    });
  }

  function toast(title, message = '') {
    const stack = $('#toastStack');
    if (!stack) return;
    const node = document.createElement('div');
    node.className = 'toast';
    node.innerHTML = `${icon('info')}<div><strong>${esc(title)}</strong><p>${esc(message)}</p></div>`;
    stack.appendChild(node);
    refreshIcons();
    requestAnimationFrame(() => node.classList.add('show'));
    setTimeout(() => {
      node.classList.remove('show');
      setTimeout(() => node.remove(), 250);
    }, 3400);
  }

  function ask(title, message, action = 'Continue', danger = false) {
    return new Promise((resolve) => {
      dialogResolve = resolve;
      $('#dialogTitle').textContent = title;
      $('#dialogText').textContent = message;
      $('#dialogConfirm').textContent = action;
      $('#dialogConfirm').classList.toggle('danger', danger);
      $('#dialogIcon').innerHTML = icon(danger ? 'triangle-alert' : 'circle-help');
      $('#dialogBackdrop').hidden = false;
      refreshIcons();
    });
  }

  function finishDialog(value) {
    $('#dialogBackdrop').hidden = true;
    const resolve = dialogResolve;
    dialogResolve = null;
    resolve?.(value);
  }

  function applyPreferences() {
    let theme = localStorage.getItem('flashgames.theme') || 'dark';
    if (theme === 'system') theme = matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.setProperty('--accent', localStorage.getItem('flashgames.accent') || '#8b5cf6');
    document.documentElement.style.setProperty('--opacity', Number(localStorage.getItem('flashgames.opacity') || 66) / 100);
    document.documentElement.style.setProperty('--blur', `${Number(localStorage.getItem('flashgames.blur') || 20)}px`);
    document.documentElement.classList.toggle('reduce-motion', localStorage.getItem('flashgames.motion') === '0');
    document.documentElement.classList.toggle('performance-boost', localStorage.getItem('flashgames.performance') === '1');
  }

  function game(id) {
    return state.games.find((item) => item.id === id);
  }

  function openGameDB() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open('flashgames-installed-v2', 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains('games')) request.result.createObjectStore('games', { keyPath: 'id' });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    return dbPromise;
  }

  async function getCached(id) {
    try {
      const db = await openGameDB();
      return await new Promise((resolve) => {
        const request = db.transaction('games').objectStore('games').get(id);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => resolve(null);
      });
    } catch { return null; }
  }

  async function putCached(item, html) {
    const db = await openGameDB();
    await new Promise((resolve, reject) => {
      const transaction = db.transaction('games', 'readwrite');
      transaction.objectStore('games').put({ id: item.id, url: item.url, name: item.name, html, installedAt: Date.now() });
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
    });
  }

  async function deleteCached(id) {
    try {
      const db = await openGameDB();
      await new Promise((resolve, reject) => {
        const transaction = db.transaction('games', 'readwrite');
        transaction.objectStore('games').delete(id);
        transaction.oncomplete = resolve;
        transaction.onerror = () => reject(transaction.error);
      });
    } catch { /* local state still gets updated */ }
  }

  async function install(id) {
    const item = game(id);
    if (!item) return;
    toast('Installing', item.name);

    try {
      const response = await fetch(item.url, { cache: 'force-cache' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      await putCached(item, await response.text());
      state.installed.add(id);
      saveLocal();
      renderCurrent();
      updateProfile();
      toast('Installed', `${item.name} is cached and ready.`);
    } catch (error) {
      toast('Install failed', error?.message || 'The game could not be cached.');
    }
  }

  async function play(id) {
    const item = game(id);
    if (!item) return;
    let cached = await getCached(id);
    if (!cached) {
      await install(id);
      cached = await getCached(id);
    }
    if (!cached) return toast('Game unavailable', 'Install the game before playing it.');

    const frame = $('#gameFrame');
    const overlay = $('#playerOverlay');
    if (!frame || !overlay) return;

    if (playerUrl) URL.revokeObjectURL(playerUrl);
    playerUrl = URL.createObjectURL(new Blob([cached.html], { type: 'text/html' }));
    frame.src = playerUrl;
    overlay.hidden = false;
    document.body.classList.add('player-open');
    state.stats.played += 1;
    sessionStarted = Date.now();
    saveStats();
  }

  function closePlayer() {
    if (sessionStarted) {
      state.stats.time += Date.now() - sessionStarted;
      sessionStarted = 0;
      saveStats();
    }
    if (playerUrl) URL.revokeObjectURL(playerUrl);
    playerUrl = null;
    $('#gameFrame').src = 'about:blank';
    $('#playerOverlay').hidden = true;
    document.body.classList.remove('player-open');
  }

  function card(item) {
    const installed = state.installed.has(item.id);
    const favorite = state.favorites.has(item.id);
    return `<article class="game-card reveal">
      <div class="cover">
        <img loading="lazy" src="${esc(imageSource(item.cover))}" alt="${esc(item.name)}" onerror="this.onerror=null;this.src='./offline/logo.png';">
        <span class="badge">${esc(item.zone || 'GAME')}</span>
        <div class="card-overlay">
          <button class="expand-action play" data-action="play" data-id="${esc(item.id)}">${icon('play')}<span>Play</span></button>
          <button class="expand-action" data-action="performance">${icon('zap')}<span>Boost</span></button>
          <button class="expand-action" data-action="favorite" data-id="${esc(item.id)}">${icon(favorite ? 'heart-off' : 'heart')}<span>${favorite ? 'Unfavorite' : 'Favorite'}</span></button>
          ${installed ? `<button class="expand-action close" data-action="remove" data-id="${esc(item.id)}">${icon('x')}<span>Remove</span></button>` : ''}
        </div>
      </div>
      <div class="card-body">
        <div class="card-title"><h3>${esc(item.name)}</h3>${item.rating ? `<span class="rating">${icon('star')} ${esc(item.rating)}</span>` : ''}</div>
        <div class="meta"><span class="tag">${esc(item.category || 'Games')}</span>${(item.tags || []).slice(0, 2).map((tag) => `<span class="tag">${esc(tag)}</span>`).join('')}</div>
        <p class="card-desc">${esc(item.description || 'Play it in Flash Games.')}</p>
        <button class="btn ${installed ? 'primary' : ''} full" data-action="${installed ? 'play' : 'install'}" data-id="${esc(item.id)}">${icon(installed ? 'play' : 'download')} ${installed ? 'Play' : 'Install'}</button>
      </div>
    </article>`;
  }

  function empty(title, message) {
    return `<div class="empty glass">${icon('library')}<h3>${esc(title)}</h3><p>${esc(message)}</p></div>`;
  }

  function renderHome() {
    const root = $('#homeView');
    const featured = state.games[0];
    if (!featured) {
      root.innerHTML = `${empty('No games loaded', 'The real catalogue could not be loaded.')}
        <button class="btn primary" data-action="reload-games">${icon('rotate-cw')} Retry</button>`;
      return;
    }

    const recent = state.games.filter((item) => state.installed.has(item.id)).slice(0, 4);
    root.innerHTML = `<section class="hero glass">
      <div><span class="eyebrow">FLASH GAMES · FEATURED</span><h1>Play something<br><em>worth your time.</em></h1>
      <p>Install real games, cache their HTML locally, and play them directly in your browser.</p>
      <div class="hero-actions"><button class="btn primary" data-action="play" data-id="${esc(featured.id)}">${icon('play')} Play now</button><button class="btn" data-action="route" data-route-target="store">${icon('store')} Browse store</button></div></div>
      <div class="hero-art"><img src="${esc(imageSource(featured.cover))}" alt="${esc(featured.name)}" loading="eager"><span class="live-pill"><i></i><span>${esc(featured.name)}</span></span></div>
    </section><section class="section"><div class="section-head"><div><span class="eyebrow">YOUR COLLECTION</span><h2>${recent.length ? 'Jump back in' : 'Build your library'}</h2></div><button class="link-btn" data-action="route" data-route-target="library">View library ${icon('arrow-right')}</button></div>
    <div class="game-grid">${recent.map(card).join('') || empty('Your library is empty', 'Install games from the Store and they will appear here.')}</div></section>`;
  }

  function renderStore() {
    const root = $('#storeView');
    const query = state.query.toLowerCase();
    const categories = ['All', ...new Set(state.games.map((item) => item.category).filter(Boolean))];
    const list = state.games.filter((item) => {
      const text = [item.name, item.description, item.category, ...(item.tags || [])].join(' ').toLowerCase();
      return (state.category === 'All' || item.category === state.category) && (!query || text.includes(query));
    });

    root.innerHTML = `<div class="page-head"><div><span class="eyebrow">DISCOVER</span><h1>Game Store</h1><p>${state.games.length.toLocaleString()} real games available.</p></div>
      <label class="search-bar">${icon('search')}<input id="storeSearch" value="${esc(state.query)}" placeholder="Search games…" autocomplete="off"></label></div>
      <div class="filter-row">${categories.map((category) => `<button class="filter ${state.category === category ? 'active' : ''}" data-action="category" data-category="${esc(category)}">${esc(category)}</button>`).join('')}</div>
      <div class="game-grid">${list.map(card).join('') || empty('No games found', 'Try a different search or category.')}</div>`;

    $('#storeSearch').oninput = (event) => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => { state.query = event.target.value; renderStore(); refreshIcons(); }, 120);
    };
  }

  function renderLibrary() {
    const root = $('#libraryView');
    const list = state.games.filter((item) => state.installed.has(item.id));
    root.innerHTML = `<div class="page-head"><div><span class="eyebrow">YOUR COLLECTION</span><h1>Library</h1><p>${list.length} installed game${list.length === 1 ? '' : 's'}.</p></div><button class="btn" data-action="route" data-route-target="store">${icon('plus')} Add games</button></div>
      <div class="game-grid">${list.map(card).join('') || empty('Nothing installed yet', 'Games are downloaded from their real GitHub HTML and cached locally.')}</div>`;
  }

  function renderSocial() {
    $('#socialView').innerHTML = `<div class="page-head"><div><span class="eyebrow">SOCIAL</span><h1>Social</h1><p>Connect through Confer.</p></div></div><section class="social-frame glass"><iframe src="https://itsmeh1.github.io/confer/confer.html?.amplify.com" title="Confer" allow="camera; microphone; display-capture; fullscreen; autoplay"></iframe></section>`;
  }

  function renderUpdates() {
    const root = $('#updatesView');
    if (!state.updates.length) { root.innerHTML = empty('No changelog available', 'No published release notes were found.'); return; }
    root.innerHTML = `<div class="page-head"><div><span class="eyebrow">CHANGELOG</span><h1>What's new</h1><p>Real Flash Games release information.</p></div></div><div class="timeline">${state.updates.map((release) => `<article class="release glass"><div class="release-head"><div><strong>v${esc(release.version || '')}</strong><span>${esc(release.date || '')}</span></div>${icon('sparkles')}</div><p>${esc(release.desc || '')}</p>${(release.items || []).map((item) => { const type = item[0] === 'add' ? 'log-add' : item[0] === 'remove' ? 'log-remove' : 'log-edit'; const change = item[0] === 'add' ? 'plus' : item[0] === 'remove' ? 'x' : 'hammer'; return `<div class="log-item"><span class="change-icon ${type}">${icon(change)}</span><span>${esc(item[1])}</span></div>`; }).join('')}</article>`).join('')}</div>`;
  }

  function renderAdmin() {
    const root = $('#adminView');
    if (!ADMIN_ROLES.has(state.role)) { root.innerHTML = ''; return; }
    root.innerHTML = `<div class="admin-shell glass"><div class="admin-head"><div><span class="eyebrow">CONTROL CENTER</span><h1>Admin</h1><p>Manage Flash Games safely.</p></div><span class="admin-role">${esc(state.role)}</span></div>
      <div class="admin-panel"><h2>Release control</h2><p>Lock the public app while you prepare an update.</p><div class="maintenance-card ${state.maintenance ? 'locked' : ''}"><div><strong>${state.maintenance ? 'Maintenance is ON' : 'Site is live'}</strong><small>Authorized staff can bypass the lock.</small></div><button class="btn ${state.maintenance ? 'danger' : ''}" data-action="maintenance">${icon(state.maintenance ? 'lock-open' : 'lock')} ${state.maintenance ? 'Unlock site' : 'Lock site'}</button></div></div>
      <div class="admin-panel"><h2>Catalogue</h2><p>${state.games.length.toLocaleString()} real games loaded.</p><div class="admin-actions"><button class="btn" data-action="reload-games">${icon('refresh-cw')} Refresh catalogue</button><button class="btn" data-action="route" data-route-target="updates">${icon('history')} Changelog</button></div></div></div>`;
  }

  function renderCurrent() {
    $$('.view').forEach((view) => view.classList.toggle('active', view.dataset.view === state.view));
    if (state.view === 'home') renderHome();
    if (state.view === 'library') renderLibrary();
    if (state.view === 'store') renderStore();
    if (state.view === 'social') renderSocial();
    if (state.view === 'updates') renderUpdates();
    if (state.view === 'admin') renderAdmin();
    $$('[data-route]').forEach((item) => item.classList.toggle('active', item.dataset.route === state.view));
    refreshIcons();
  }

  function route(view, writeHash = true) {
    const next = VIEWS.has(view) ? view : 'home';
    if (next === 'admin' && !ADMIN_ROLES.has(state.role)) { toast('Admin only', 'You do not have permission to open this section.'); return; }
    state.view = next;
    if (writeHash) history.pushState(null, '', `#${next}`);
    renderCurrent();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function updateProfile() {
    const profile = state.profile || {};
    const user = state.user || {};
    const name = profile.username || profile.displayName || profile.name || user.displayName || user.email?.split('@')[0] || 'Sign in';
    const image = imageSource(profile.profilePicture || profile.profilePic || profile.avatar || profile.photoURL || user.photoURL);
    $('#headerName').textContent = name;
    $('#headerAvatar').innerHTML = `<span></span><img src="${esc(image)}" alt="">`;
    $('#profileName').textContent = name;
    $('#profileEmail').textContent = user.email || 'Sign in to load your Firebase profile.';
    $('#profileAvatar').innerHTML = `<span></span><img src="${esc(image)}" alt="">`;
    $('#profileGames').textContent = state.installed.size;
    $('#profileTotal').textContent = state.games.length;
    $('#signInBtn').hidden = Boolean(user);
    $('#signOutBtn').hidden = !user;

    let stats = $('#profileStatsExtra');
    if (!stats) {
      stats = document.createElement('div');
      stats.id = 'profileStatsExtra';
      stats.className = 'stats-grid';
      $('#profilePanel').insertBefore(stats, $('#profilePanel .auth-box'));
    }
    stats.innerHTML = `<div><strong>${state.stats.played}</strong><span>Played</span></div><div><strong>${Math.floor(state.stats.time / 60000)}</strong><span>Minutes</span></div><div><strong>${state.favorites.size}</strong><span>Favorites</span></div><div><strong>${esc(memberTier())}</strong><span>Member</span></div>`;
    refreshIcons();
  }

  function initThemes() {
    const panel = $('#settingsPanel .settings-list');
    if (!panel || $('#themeGrid')) return;
    const colors = { dark: '#8b5cf6', aurora: '#22d3ee', ocean: '#38bdf8', rose: '#fb7185', graphite: '#a3a3a3', light: '#f59e0b' };
    const grid = document.createElement('div');
    grid.id = 'themeGrid';
    grid.className = 'theme-preview';
    grid.innerHTML = Object.entries(colors).map(([name, color]) => `<button class="theme-choice" data-action="theme" data-theme="${name}"><span class="theme-dot" style="--theme-color:${color}"></span>${name[0].toUpperCase() + name.slice(1)}</button>`).join('');
    panel.prepend(grid);
  }

  async function loadNotifications() {
    state.notifications = await FlashData.loadNotifications(state.user?.uid);
    const list = $('#notificationList');
    const badge = $('#notificationBadge');
    badge.hidden = state.notifications.length === 0;
    list.innerHTML = state.notifications.length ? state.notifications.map((item) => `<div class="notification-item"><span>${icon(item.type === 'update' ? 'sparkles' : 'bell')}</span><div><strong>${esc(item.title || 'Notification')}</strong><p>${esc(item.message || item.body || '')}</p></div></div>`).join('') : empty('No notifications', 'You are all caught up.');
    refreshIcons();
  }

  async function loadMaintenance() {
    if (!state.db) return;
    try {
      const snapshot = await state.db.collection('settings').doc('app').get();
      state.maintenance = Boolean(snapshot.exists && snapshot.data()?.maintenance);
      document.body.dataset.maintenance = state.maintenance && !ADMIN_ROLES.has(state.role) ? 'true' : 'false';
    } catch { state.maintenance = false; }
  }

  async function toggleMaintenance() {
    if (!state.db) return toast('Firebase unavailable', 'Could not change maintenance mode.');
    const next = !state.maintenance;
    if (!await ask(next ? 'Lock Flash Games?' : 'Unlock Flash Games?', next ? 'Normal users will see the maintenance screen.' : 'The public site will become available again.', next ? 'Lock site' : 'Unlock site', next)) return;
    try {
      await state.db.collection('settings').doc('app').set({ maintenance: next, updatedAt: Date.now() }, { merge: true });
      state.maintenance = next;
      renderAdmin();
      toast(next ? 'Site locked' : 'Site unlocked', 'The setting was saved.');
    } catch (error) { toast('Could not save', error?.message || 'Firebase rejected the change.'); }
  }

  async function reloadGames() {
    toast('Refreshing catalogue', 'Checking the real game sources.');
    try {
      const result = await FlashData.loadGames(true);
      state.games = result.games || [];
      renderCurrent();
      updateProfile();
      toast('Catalogue refreshed', `${state.games.length.toLocaleString()} games loaded.`);
    } catch (error) { toast('Catalogue failed', error?.message || 'Could not load the catalogue.'); }
  }

  async function action(target) {
    const actionName = target.dataset.action;
    const id = target.dataset.id;
    if (actionName === 'route') return route(target.dataset.routeTarget);
    if (actionName === 'install') return install(id);
    if (actionName === 'play') return play(id);
    if (actionName === 'reload-games') return reloadGames();
    if (actionName === 'maintenance') return toggleMaintenance();
    if (actionName === 'category') { state.category = target.dataset.category; renderStore(); refreshIcons(); return; }
    if (actionName === 'theme') { localStorage.setItem('flashgames.theme', target.dataset.theme); applyPreferences(); toast('Theme applied', target.dataset.theme); return; }
    if (actionName === 'performance') {
      const enabled = document.documentElement.classList.toggle('performance-boost');
      localStorage.setItem('flashgames.performance', enabled ? '1' : '0');
      toast(enabled ? 'Performance boost enabled' : 'Full visuals restored', enabled ? 'Visual effects were reduced.' : 'Full glass effects restored.');
      return;
    }
    if (actionName === 'favorite') {
      state.favorites.has(id) ? state.favorites.delete(id) : state.favorites.add(id);
      saveLocal(); renderCurrent(); updateProfile();
      return;
    }
    if (actionName === 'remove') {
      const item = game(id);
      if (!item || !await ask('Remove this game?', `${item.name} will be removed from this browser.`, 'Remove', true)) return;
      await deleteCached(id); state.installed.delete(id); saveLocal(); renderCurrent(); updateProfile(); toast('Removed', item.name);
    }
  }

  function initEvents() {
    document.addEventListener('click', async (event) => {
      const target = event.target.closest('[data-action]');
      if (target) { event.preventDefault(); await action(target); return; }
      const close = event.target.closest('[data-close]');
      if (close) { const element = $(close.dataset.close); if (element) element.hidden = true; }
    });

    addEventListener('hashchange', () => route(location.hash.slice(1), false));
    $('#openProfile').onclick = () => { $('#profilePanel').hidden = false; updateProfile(); };
    $('#mobileProfile').onclick = () => { $('#profilePanel').hidden = false; updateProfile(); };
    $('#openSettings').onclick = () => { $('#profilePanel').hidden = true; $('#settingsPanel').hidden = false; initThemes(); };
    $('#openNotifications').onclick = async () => { $('#notificationsBackdrop').hidden = false; await loadNotifications(); };
    $('#openSearch').onclick = () => { $('#searchBackdrop').hidden = false; $('#searchInput').value = ''; $('#searchInput').focus(); renderSearch(''); };
    $('#searchInput').oninput = (event) => renderSearch(event.target.value);
    $('#searchResults').onclick = async (event) => { const item = event.target.closest('[data-search-id]'); if (!item) return; $('#searchBackdrop').hidden = true; await play(item.dataset.searchId); };
    $('#dialogCancel').onclick = () => finishDialog(false);
    $('#dialogConfirm').onclick = () => finishDialog(true);
    $('#closePlayer').onclick = closePlayer;

    $('#signInBtn').onclick = async () => {
      if (!state.auth) return toast('Firebase unavailable');
      try { await state.auth.signInWithEmailAndPassword($('#authEmail').value.trim(), $('#authPassword').value); toast('Signed in', 'Your Firebase profile is loaded.'); }
      catch (error) { toast('Sign in failed', error?.message || 'Check your credentials.'); }
    };
    $('#signOutBtn').onclick = async () => { await state.auth?.signOut(); toast('Signed out'); };

    $('#clearLibrary').onclick = async () => {
      if (!await ask('Clear your library?', 'Every installed game will be removed from this browser.', 'Clear library', true)) return;
      for (const id of state.installed) await deleteCached(id);
      state.installed.clear(); saveLocal(); renderCurrent(); updateProfile(); toast('Library cleared');
    };

    $('#toggleMotion').onclick = () => {
      const reduced = localStorage.getItem('flashgames.motion') === '0';
      localStorage.setItem('flashgames.motion', reduced ? '1' : '0'); applyPreferences();
      $('#toggleMotion .switch')?.classList.toggle('on', reduced);
    };
    $('#accentPicker').oninput = (event) => { localStorage.setItem('flashgames.accent', event.target.value); applyPreferences(); };
    $('#opacityRange').oninput = (event) => { localStorage.setItem('flashgames.opacity', event.target.value); $('#opacityValue').textContent = `${event.target.value}%`; applyPreferences(); };
    $('#blurRange').oninput = (event) => { localStorage.setItem('flashgames.blur', event.target.value); $('#blurValue').textContent = `${event.target.value}px`; applyPreferences(); };

    document.addEventListener('keydown', (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); $('#openSearch').click(); }
      if (event.key === 'Escape') { closePlayer(); $$('.modal-backdrop').forEach((element) => { element.hidden = true; }); $('#profilePanel').hidden = true; $('#settingsPanel').hidden = true; }
    });
  }

  function renderSearch(value) {
    const query = value.trim().toLowerCase();
    const matches = state.games.filter((item) => [item.name, item.category, item.description, ...(item.tags || [])].join(' ').toLowerCase().includes(query)).slice(0, 12);
    $('#searchResults').innerHTML = matches.length ? matches.map((item) => `<button class="search-result" data-search-id="${esc(item.id)}">${icon('play')}<div><strong>${esc(item.name)}</strong><small>${esc(item.category || 'Games')}</small></div></button>`).join('') : empty('No games found', 'Try a different search.');
    refreshIcons();
  }

  function initFirebase() {
    if (!window.firebase) return;
    try {
      if (!firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);
      state.auth = firebase.auth();
      state.db = firebase.firestore();
      window.__flashFirebase = { firebase, app: firebase.app(), auth: state.auth, db: state.db };
      state.auth.onAuthStateChanged(async (user) => {
        state.user = user;
        state.profile = null;
        state.role = '';
        if (user) {
          try {
            const snapshot = await state.db.collection('users').doc(user.uid).get();
            state.profile = snapshot.exists ? snapshot.data() : null;
            state.role = String(state.profile?.role || '').toLowerCase();
          } catch { /* Auth still works without profile data. */ }
        }
        await loadMaintenance();
        updateProfile();
        if (state.view === 'admin') renderAdmin();
      });
    } catch (error) { toast('Firebase unavailable', error?.message || 'Local features still work.'); }
  }

  async function boot() {
    loadLocal();
    applyPreferences();
    initEvents();
    initFirebase();
    initThemes();

    try {
      const [catalogue, updates] = await Promise.all([FlashData.loadGames(false), FlashData.loadUpdates()]);
      state.games = catalogue.games || [];
      state.updates = updates.releases || [];
    } catch (error) { toast('Startup issue', error?.message || 'Some data could not be loaded.'); }

    renderCurrent();
    updateProfile();
  }

  document.addEventListener('DOMContentLoaded', boot, { once: true });
})();
