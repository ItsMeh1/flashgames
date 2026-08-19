/* Flash Games v2 store: lightweight in-app catalogue. */
(() => {
  const esc = value => String(value).replace(/[&<>\"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '\"':'&quot;' }[c]));
  const state = { games: [], query: '', category: 'All', source: '' };
  const shell = document.getElementById('storeRoot');
  if (!shell) return;

  shell.innerHTML = `<div class="store-head"><div><span class="eyebrow">FLASH LIBRARY</span><h1>Find something to play.</h1><p id="storeStatus">Loading the library…</p></div><input id="storeSearch" aria-label="Search games" placeholder="Search games…" autocomplete="off"></div><div id="storeFilters" class="store-filters"></div><div id="storeGrid" class="store-grid"></div>`;
  const search = shell.querySelector('#storeSearch');
  const filters = shell.querySelector('#storeFilters');
  const grid = shell.querySelector('#storeGrid');
  const status = shell.querySelector('#storeStatus');

  function render() {
    const q = state.query.toLowerCase().trim();
    const visible = state.games.filter(g => (!q || `${g.name} ${g.category} ${g.description} ${g.tags.join(' ')}`.toLowerCase().includes(q)) && (state.category === 'All' || g.category === state.category));
    filters.innerHTML = ['All', ...new Set(state.games.map(g => g.category))].map(c => `<button class="store-filter ${c === state.category ? 'active' : ''}" data-category="${esc(c)}">${esc(c)}</button>`).join('');
    grid.innerHTML = visible.length ? visible.map(g => `<article class="game-card"><div class="game-cover">${g.cover ? `<img loading="lazy" src="${esc(g.cover)}" alt="" onerror="this.remove()">` : '<span>FLASH</span>'}</div><div class="game-body"><div class="game-meta"><span>${esc(g.category)}</span><span>${esc(g.zone)}</span></div><h2>${esc(g.name)}</h2>${g.description ? `<p>${esc(g.description)}</p>` : ''}<button class="play-btn" data-url="${esc(g.url)}">Play</button></div></article>`).join('') : '<div class="store-empty"><strong>No games found.</strong><span>Try a different search or category.</span></div>';
    status.textContent = `${visible.length} game${visible.length === 1 ? '' : 's'} · ${state.source}`;
  }

  search.addEventListener('input', e => { state.query = e.target.value; render(); });
  filters.addEventListener('click', e => { const b = e.target.closest('[data-category]'); if (!b) return; state.category = b.dataset.category; render(); });
  grid.addEventListener('click', e => { const b = e.target.closest('.play-btn'); if (!b) return; window.dispatchEvent(new CustomEvent('flash:play', { detail: { url: b.dataset.url } })); });

  window.addEventListener('flash:data-ready', e => { state.games = e.detail.games || []; state.source = e.detail.source || 'library'; render(); });
  render();
})();
