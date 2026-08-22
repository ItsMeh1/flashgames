(() => {
  'use strict';

  const esc = (value) => window.FlashData?.esc ? window.FlashData.esc(value) : String(value ?? '');
  const icon = (name) => `<i data-lucide="${name}"></i>`;

  let searchGames = [];
  let searchIndex = 0;
  let searchQuery = '';
  let searchTimer = null;
  let statsModal = null;

  function refreshIcons(root = document) {
    if (window.lucide?.createIcons) {
      requestAnimationFrame(() => window.lucide.createIcons({ root, attrs: { 'stroke-width': 1.5 } }));
    }
  }

  function toast(title, message, type = 'info') {
    window.FlashUI?.toast?.(title, message, type);
  }

  function loadStats() {
    try {
      const data = JSON.parse(localStorage.getItem('flashgames.stats') || '{}');
      return {
        played: Number(data.played || 0),
        time: Number(data.time || 0),
        installs: Number(data.installs || 0)
      };
    } catch {
      return { played: 0, time: 0, installs: 0 };
    }
  }

  function memberLevel(stats) {
    const minutes = Math.floor(stats.time / 60000);
    if (stats.played >= 100 || minutes >= 600) return 'Elite Member';
    if (stats.played >= 30 || minutes >= 120 || stats.installs >= 30) return 'Dedicated Member';
    if (stats.played >= 5 || stats.installs >= 5) return 'Active Member';
    return 'New Member';
  }

  function closeSearch() {
    const backdrop = document.getElementById('searchBackdrop');
    if (backdrop) backdrop.hidden = true;
  }

  function searchMatches() {
    const query = searchQuery.trim().toLowerCase();
    return searchGames
      .filter((game) => {
        const text = `${game.name || ''} ${game.category || ''} ${game.zone || ''} ${(game.tags || []).join(' ')}`.toLowerCase();
        return !query || text.includes(query);
      })
      .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), undefined, {
        numeric: true,
        sensitivity: 'base'
      }))
      .slice(0, 14);
  }

  function renderQuickFind() {
    const results = document.getElementById('searchResults');
    if (!results) return;

    const matches = searchMatches();
    if (!matches.length) {
      results.innerHTML = `
        <div class="quick-empty">
          ${icon('search-x')}
          <strong>No games found</strong>
          <span>Try a different game name or genre.</span>
        </div>`;
      refreshIcons(results);
      return;
    }

    searchIndex = Math.max(0, Math.min(searchIndex, matches.length - 1));
    results.innerHTML = matches.map((game, index) => `
      <button class="search-result ${index === searchIndex ? 'active' : ''}" data-ux-search-game="${esc(game.id)}">
        <img loading="lazy" src="${esc(game.cover || './offline/logo.png')}" alt="" onerror="this.onerror=null;this.src='./offline/logo.png'">
        <span>
          <strong>${esc(game.name)}</strong>
          <small>${esc(game.category || game.zone || 'HTML Game')}</small>
        </span>
        ${icon('arrow-up-right')}
      </button>`).join('');
    refreshIcons(results);
  }

  async function launchFromQuickFind(game) {
    try {
      let cached = await window.FlashGamesStore.getCachedGame(game.id);
      if (!cached) {
        toast('Preparing game', `Installing ${game.name} for local playback…`);
        cached = await window.FlashGamesStore.install(game);
      }
      const url = await window.FlashGamesStore.launch(cached || game);
      const frame = document.getElementById('gameFrame');
      const overlay = document.getElementById('playerOverlay');
      if (!frame || !overlay || !url) return;
      frame.src = url;
      overlay.hidden = false;
      document.body.classList.add('player-open');
      closeSearch();
      refreshIcons(overlay);
    } catch (error) {
      toast('Could not open game', error.message || 'The game could not be opened.', 'error');
    }
  }

  async function openQuickFind() {
    const backdrop = document.getElementById('searchBackdrop');
    if (!backdrop) return;
    backdrop.hidden = false;
    searchIndex = 0;
    const input = document.getElementById('searchInput');
    if (input) input.value = searchQuery;
    renderQuickFind();
    requestAnimationFrame(() => input?.focus());

    if (!searchGames.length) {
      try {
        const result = await window.FlashData.loadGames();
        searchGames = result.games || [];
        renderQuickFind();
      } catch {
        renderQuickFind();
      }
    }
  }

  function setupQuickFind() {
    document.addEventListener('click', (event) => {
      const open = event.target.closest('#openSearch');
      if (open) {
        event.preventDefault();
        event.stopImmediatePropagation();
        openQuickFind();
        return;
      }

      const result = event.target.closest('[data-ux-search-game]');
      if (result) {
        const game = searchGames.find((item) => item.id === result.dataset.uxSearchGame);
        if (game) launchFromQuickFind(game);
        return;
      }

      const backdrop = document.getElementById('searchBackdrop');
      if (event.target === backdrop) closeSearch();
    }, true);

    document.addEventListener('keydown', (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        event.stopImmediatePropagation();
        openQuickFind();
        return;
      }

      const backdrop = document.getElementById('searchBackdrop');
      if (!backdrop || backdrop.hidden) return;

      const input = document.getElementById('searchInput');
      if (document.activeElement === input) {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Enter' || event.key === 'Escape') {
          event.preventDefault();
        }
      }

      if (event.key === 'Escape') {
        closeSearch();
      } else if (event.key === 'ArrowDown') {
        searchIndex += 1;
        renderQuickFind();
        input?.focus();
      } else if (event.key === 'ArrowUp') {
        searchIndex -= 1;
        renderQuickFind();
        input?.focus();
      } else if (event.key === 'Enter') {
        const match = searchMatches()[searchIndex];
        if (match) launchFromQuickFind(match);
      }
    }, true);

    document.getElementById('searchInput')?.addEventListener('input', (event) => {
      searchQuery = event.target.value;
      searchIndex = 0;
      clearTimeout(searchTimer);
      searchTimer = setTimeout(renderQuickFind, 60);
    });
  }

  function showStatsModal() {
    if (!statsModal) {
      statsModal = document.createElement('div');
      statsModal.className = 'modal-backdrop ux-stats-backdrop';
      statsModal.innerHTML = `
        <section class="stats-modal glass" role="dialog" aria-modal="true" aria-labelledby="statsModalTitle">
          <div class="panel-head">
            <div>
              <span class="eyebrow">ACTIVITY</span>
              <h2 id="statsModalTitle">Your stats</h2>
            </div>
            <button class="icon-btn" type="button" data-ux-close-stats aria-label="Close stats">${icon('x')}</button>
          </div>
          <div class="stats-modal-grid" id="uxStatsGrid"></div>
        </section>`;
      document.body.appendChild(statsModal);
      statsModal.addEventListener('click', (event) => {
        if (event.target === statsModal || event.target.closest('[data-ux-close-stats]')) {
          statsModal.hidden = true;
        }
      });
      refreshIcons(statsModal);
    }

    const stats = loadStats();
    const minutes = Math.floor(stats.time / 60000);
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    const grid = document.getElementById('uxStatsGrid');
    if (grid) {
      grid.innerHTML = `
        <article><strong>${stats.played}</strong><span>Games played</span></article>
        <article><strong>${stats.installs}</strong><span>Games installed</span></article>
        <article><strong>${hours ? `${hours}h ${remainingMinutes}m` : `${minutes}m`}</strong><span>Time played</span></article>
        <article><strong>${esc(memberLevel(stats))}</strong><span>Member level</span></article>`;
    }
    statsModal.hidden = false;
    refreshIcons(statsModal);
  }

  function setupProfile() {
    document.addEventListener('click', (event) => {
      const statsButton = event.target.closest('#openStats');
      if (statsButton) {
        event.preventDefault();
        event.stopImmediatePropagation();
        showStatsModal();
      }
    }, true);

    const profile = document.getElementById('profilePanel');
    if (!profile) return;

    const tighten = () => {
      const auth = profile.querySelector('.auth-box');
      const signIn = profile.querySelector('#signInBtn');
      if (!auth || !signIn) return;
      auth.hidden = false;
      let toggle = profile.querySelector('.ux-auth-toggle');
      if (!toggle) {
        toggle = document.createElement('button');
        toggle.className = 'setting-action ux-auth-toggle';
        toggle.type = 'button';
        toggle.innerHTML = `<span>${icon('log-in')}<span><strong>Sign in</strong><small>Sync your profile with Firebase.</small></span></span>${icon('chevron-down')}`;
        profile.querySelector('.setting-action#openSettings')?.before(toggle);
        toggle.addEventListener('click', () => {
          auth.hidden = !auth.hidden;
          toggle.classList.toggle('open', !auth.hidden);
          if (!auth.hidden) refreshIcons(auth);
        });
      }
      if (signIn.hidden) {
        toggle.hidden = true;
        auth.hidden = false;
      } else if (!toggle.classList.contains('open')) {
        auth.hidden = true;
      }
    };

    const observer = new MutationObserver(() => tighten());
    observer.observe(profile, { attributes: true, childList: true, subtree: true });
    tighten();
  }

  function enhanceSocial() {
    const view = document.getElementById('socialView');
    const frame = view?.querySelector('.social-frame');
    if (!frame || frame.dataset.uxReady === '1') return;
    const iframe = frame.querySelector('iframe');
    if (!iframe) return;

    frame.dataset.uxReady = '1';
    const toolbar = document.createElement('div');
    toolbar.className = 'social-toolbar';
    toolbar.innerHTML = `
      <div><span class="eyebrow">CONFER</span><strong>Hang out with your friends.</strong></div>
      <div class="social-toolbar-actions">
        <button class="icon-btn" type="button" data-ux-open-confer aria-label="Open Confer in a new tab">${icon('external-link')}</button>
        <button class="icon-btn" type="button" data-ux-fullscreen-confer aria-label="Fullscreen Confer">${icon('maximize-2')}</button>
      </div>`;
    frame.prepend(toolbar);
    toolbar.querySelector('[data-ux-open-confer]').addEventListener('click', () => window.open(iframe.src, '_blank', 'noopener'));
    toolbar.querySelector('[data-ux-fullscreen-confer]').addEventListener('click', async () => {
      try {
        await frame.requestFullscreen();
      } catch {
        toast('Fullscreen unavailable', 'Your browser did not allow fullscreen for Confer.', 'error');
      }
    });
    refreshIcons(frame);
  }

  function enhanceStore() {
    const view = document.getElementById('storeView');
    const sort = view?.querySelector('#storeSort');
    const wrapper = sort?.closest('.sort-control');
    if (!sort || !wrapper || wrapper.dataset.uxReady === '1') return;
    wrapper.dataset.uxReady = '1';
    wrapper.innerHTML = `${icon('arrow-down-up')}<span>Sort</span><select id="storeSort">${[...sort.options].map((option) => `<option value="${esc(option.value)}" ${option.selected ? 'selected' : ''}>${esc(option.textContent)}</option>`).join('')}</select>`;
    wrapper.querySelector('select').addEventListener('change', (event) => {
      localStorage.setItem('flashgames.sort', event.target.value);
      location.reload();
    });
    refreshIcons(wrapper);
  }

  function afterRoute() {
    setTimeout(() => {
      enhanceSocial();
      enhanceStore();
      setupProfile();
    }, 0);
  }

  function init() {
    setupQuickFind();
    setupProfile();
    window.addEventListener('hashchange', afterRoute);
    document.addEventListener('click', (event) => {
      if (event.target.closest('[data-route="social"]')) setTimeout(enhanceSocial, 20);
      if (event.target.closest('[data-route="store"]')) setTimeout(enhanceStore, 20);
      if (event.target.closest('#openProfile, #mobileProfile')) setTimeout(setupProfile, 20);
    });
    afterRoute();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
