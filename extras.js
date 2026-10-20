/* Flash Games extras — player controls, custom install, stats, cloud links,
 * sync button, moderation helpers. Merged from player-fixes.js +
 * custom-install.js + profile-fixes.js + cloud-playback.js + sync.js +
 * moderation-fixes.js (terminal / commit-history / IP-gate bloat removed). */
(() => {
  'use strict';

  const icon = (n) => `<i data-lucide="${n}"></i>`;
  const toast = (t, m, type = 'info') => window.FlashUI?.toast?.(t, m, type);
  const icons = (root = document) => { try { window.lucide?.createIcons?.({ root, attrs: { 'stroke-width': 1.5 } }); } catch {} };

  /* ---------- player: loader + controls ---------- */

  let hideTimer = 0;

  function ensurePlayer() {
    const overlay = document.getElementById('playerOverlay');
    const shell = overlay?.querySelector('.player-shell');
    const frame = document.getElementById('gameFrame');
    if (!overlay || !shell || !frame) return false;

    if (!overlay.querySelector('[data-game-loader]')) {
      const loader = document.createElement('div');
      loader.dataset.gameLoader = '1';
      loader.className = 'game-loader';
      loader.innerHTML = '<div class="game-spinner" aria-hidden="true"></div><strong>Loading game…</strong><span>Preparing local playback.</span>';
      shell.appendChild(loader);
      frame.addEventListener('load', () => { loader.hidden = true; });
      document.addEventListener('click', (e) => {
        if (e.target.closest('[data-game-action="play"]')) {
          loader.hidden = false;
          setTimeout(() => { loader.hidden = true; }, 15000);
        }
      });
    }

    if (!shell.querySelector('.player-controls')) {
      const oldClose = document.getElementById('closePlayer');
      if (oldClose) oldClose.hidden = true;
      const notch = document.createElement('button');
      notch.className = 'player-notch';
      notch.type = 'button';
      notch.setAttribute('aria-label', 'Show game controls');
      shell.appendChild(notch);
      const controls = document.createElement('div');
      controls.className = 'player-controls';
      controls.innerHTML =
        `<button class="player-control" data-player-action="fullscreen">${icon('maximize')}<span>Fullscreen</span></button>` +
        `<button class="player-control close" data-player-action="close">${icon('x')}<span>Close game</span></button>`;
      shell.appendChild(controls);
      const show = () => {
        shell.classList.add('player-controls-visible');
        clearTimeout(hideTimer);
        hideTimer = window.setTimeout(() => shell.classList.remove('player-controls-visible'), 2000);
      };
      notch.addEventListener('click', show);
      notch.addEventListener('mouseenter', show);
      controls.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-player-action]');
        if (!btn) return;
        if (btn.dataset.playerAction === 'fullscreen') {
          if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
          else (shell.requestFullscreen || frame.requestFullscreen)?.call(shell).catch?.(() => frame.requestFullscreen?.().catch(() => {}));
        }
        if (btn.dataset.playerAction === 'close') {
          frame.src = 'about:blank';
          overlay.hidden = true;
          document.body.classList.remove('player-open');
          if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
        }
      });
    }
    return true;
  }

  /* ---------- cloud links always open in a new tab ---------- */

  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-cloud-url]');
    if (!btn) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    const url = btn.dataset.cloudUrl;
    if (!url) return;
    if (window.FlashBridge?.open) {
      const label = btn.closest('.cloud-game-card')?.querySelector('h3')?.textContent || 'Cloud Game';
      const original = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = `${icon('loader-circle')}<span>Opening…</span>`;
      icons(btn);
      toast('Loading title', `Fetching ${label} from nowgg.fun…`);
      window.FlashBridge.open(url, label).then((mode) => {
        if (mode === 'framing') toast('Opening', `${label} is loading in the player.`, 'success');
        if (mode === 'tab-unreachable') {
          let host = '';
          try {
            const dest = (window.FlashBridge?.lastUrl?.() || url);
            host = new URL(dest).hostname;
          } catch {}
          toast('Heads up', host ? `This device can't reach ${host}. Check your connection or filter.` : `${label} may not load on this network.`, 'warn');
        }
      }).catch((e) => {
        const msg = (e && e.message) || 'Unavailable.';
        toast('Could not load', msg, 'error');
      }).finally(() => {
        btn.disabled = false;
        btn.innerHTML = original;
        icons(btn);
      });
      return;
    }
    toast('Cloud unavailable', 'The cloud engine could not be loaded on this device.', 'warn');
  }, true);

  /* ---------- diagnostics (settings → Diagnostics) ---------- */

  const bootedAt = Date.now();
  const fmtBytes = (n) => !Number.isFinite(n) ? '—' : n >= 1e9 ? `${(n / 1e9).toFixed(2)} GB` : n >= 1e6 ? `${(n / 1e6).toFixed(1)} MB` : n >= 1e3 ? `${Math.round(n / 1e3)} KB` : `${n} B`;
  const fmtAgo = (t) => {
    const n = Number(t || 0);
    if (!n) return 'never';
    const mins = Math.max(0, Math.round((Date.now() - n) / 60000));
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins} min ago`;
    if (mins < 1440) return `${Math.floor(mins / 60)} h ago`;
    return `${Math.floor(mins / 1440)} d ago`;
  };
  const drow = (label, value, level = '') =>
    `<div class="diag-row"><span>${esc(label)}</span><strong class="${level}">${esc(value)}</strong></div>`;
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function lsBytes() {
    try {
      let total = 0;
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        total += (k.length + String(localStorage.getItem(k) || '').length) * 2;
      }
      return { total, keys: localStorage.length, ok: true };
    } catch { return { total: 0, keys: 0, ok: false }; }
  }

  async function cacheSizes() {
    if (!('caches' in window)) return [];
    try {
      return (await Promise.all((await caches.keys()).map(async (name) => {
        const keys = await (await caches.open(name)).keys().catch(() => []);
        return { name, count: keys.length };
      })));
    } catch { return []; }
  }

  async function diagnose() {
    const bridge = window.FlashBridge?.status?.() || {};
    const sync = window.FlashData?.getSyncMeta?.() || {};
    const gameKeys = 'caches' in window ? await Promise.race([
      caches.open(window.FlashGamesStore?.cacheName || 'flash-games-cache').then((c) => c.keys()),
      new Promise((r) => setTimeout(() => r([]), 3000))
    ]).catch(() => []) : [];
    const sw = navigator.serviceWorker?.getRegistration ? (await navigator.serviceWorker.getRegistration().catch(() => null)) : null;
    const estimate = navigator.storage?.estimate ? await navigator.storage.estimate().catch(() => null) : null;
    const ls = lsBytes();
    const device = [
      drow('Online', navigator.onLine ? 'Yes' : 'No', navigator.onLine ? 'ok' : 'warn'),
      drow('Browser UA', navigator.userAgent || '—'),
      drow('Screen', `${screen.width}×${screen.height} · ${window.devicePixelRatio || 1}x`),
      drow('Hardware', [navigator.hardwareConcurrency ? `${navigator.hardwareConcurrency} cores` : '', navigator.deviceMemory ? `${navigator.deviceMemory} GB RAM` : ''].filter(Boolean).join(' · ') || '—'),
      drow('Time zone', Intl.DateTimeFormat().resolvedOptions().timeZone || '—'),
      drow('Session', `${Math.max(1, Math.round((Date.now() - bootedAt) / 1000))}s`)
    ];
    const app = [
      drow('Catalogue games', String(Number(window.FlashData?.getCachedCatalogue?.().games?.length ?? 0).toLocaleString?.() ?? (window.FlashData?.getCachedCatalogue?.().games?.length ?? '—'))),
      drow('Last catalogue sync', sync.at ? `${fmtAgo(sync.at)} · ${sync.source || 'network'}` : 'not yet'),
      drow('Installed games', String(gameKeys.length)),
      drow('Theme', document.documentElement.dataset.theme || 'dark')
    ];
    const storage = [
      drow('localStorage', ls.ok ? `${fmtBytes(ls.total)} · ${ls.keys} keys` : 'Unavailable', ls.ok ? '' : 'bad'),
      drow('Cache stores', 'caches' in window ? String((await cacheSizes()).length) : 'Unavailable'),
      estimate ? drow('Quota used', `${fmtBytes(estimate.usage)} / ${fmtBytes(estimate.quota)}`) : ''
    ].filter(Boolean);
    const connect = [
      drow('Service worker', sw ? (sw.active ? 'Active' : 'Installing…') : 'None', sw ? (sw.active ? 'ok' : 'warn') : 'bad'),
      drow('Firebase', window.__flashFirebase?.auth ? 'Ready' : 'Offline / blocked', window.__flashFirebase?.auth ? 'ok' : 'warn'),
      drow('Fetch engine', bridge.engine ? 'WASM loaded' : (bridge.engineError ? `Error: ${bridge.engineError}` : 'Idle until needed'), bridge.engine ? 'ok' : ''),
      drow('Engine endpoint', bridge.endpointUrl || bridge.mode || '—'),
      drow('Cloud region', bridge.region || 'auto'),
      drow('Lumin SDK', window.Lumin ? 'Loaded' : 'Not loaded')
    ];
    const checks = [
      { label: 'offline.json reachable', run: async () => { const t0 = performance.now(); const r = await fetch(`./offline.json?v=${Date.now()}`, { cache: 'no-store' }); const list = await r.json(); if (!r.ok || !Array.isArray(list)) throw new Error(`HTTP ${r.status}`); return { level: 'ok', value: `${list.length} entries · ${Math.round(performance.now() - t0)} ms` }; } },
      { label: 'Game listing (mirror ladder)', run: async () => { const t0 = performance.now(); const r = await fetch('https://ungh.cc/repos/CoolDude2349/Offline-HTML-Games-Pack/files/master', { cache: 'no-store' }); if (!r.ok) throw new Error(`HTTP ${r.status}`); const data = await r.json(); const n = Array.isArray(data?.files) ? data.files.filter((f) => /^offline\/.*\.html$/i.test(f.path)).length : 0; if (!n) throw new Error('No game files listed.'); return { level: 'ok', value: `${n} games · ${Math.round(performance.now() - t0)} ms` }; } },
      { label: 'GitHub raw reachable', run: async () => { const r = await fetch('https://raw.githubusercontent.com/CoolDude2349/Offline-HTML-Games-Pack/master/README.md', { cache: 'no-store' }); if (!r.ok) throw new Error(`HTTP ${r.status}`); return { level: 'ok', value: `OK · ${r.status}` }; } },
      { label: 'Eaglercraft manifest', run: async () => { const r = await fetch(`./eagler/clients.json?v=${Date.now()}`, { cache: 'no-store' }); const data = await r.json(); const n = Array.isArray(data?.clients) ? data.clients.length : 0; if (!n) throw new Error('Manifest has no clients.'); return { level: 'ok', value: `${n} clients` }; } },
      { label: 'localStorage writable', run: async () => { try { localStorage.setItem('flashgames.diag.probe', '1'); localStorage.removeItem('flashgames.diag.probe'); return { level: 'ok', value: 'OK' }; } catch (e) { throw new Error('Read-only or blocked'); } } },
      { label: 'Cache Storage usable', run: async () => { const c = await caches.open('diag-probe'); await c.put('diag://probe', new Response('1')); const hit = await c.match('diag://probe'); await caches.delete('diag-probe'); if (!hit) throw new Error('Write/read failed'); return { level: 'ok', value: 'OK' }; } },
      { label: 'Firebase ready', run: async () => { const auth = window.__flashFirebase?.auth; if (!auth) throw new Error('Not loaded'); return { level: 'ok', value: auth.currentUser ? 'Signed in' : 'Ready (signed out)' }; } },
      { label: 'Fetch engine', run: async () => { const s = window.FlashBridge?.status?.(); if (s?.engine) return { level: 'ok', value: 'WASM loaded' }; return { level: 'warn', value: 'Not warmed (loads on first cloud game)' }; } }
    ];
    return { device, app, storage, connect, checks };
  }

  function reportTextRows(report) {
    const strip = (rows) => (rows || []).map((r) => {
      const m = /<span>([^<]+)<\/span><strong[^>]*>([^<]+)<\/strong>/.exec(r || '');
      return m ? `  ${m[1]}: ${m[2]}` : '';
    }).filter(Boolean);
    return [
      ...strip(report.device), ...strip(report.app), ...strip(report.storage), ...strip(report.connect),
      '  Self-check:',
      ...(report.checks || []).map((c) => `    ${c.label}: ${c.level || 'ok'} — ${c.value || 'OK'}`)
    ];
  }

  function fillDiagRows(id, rows) {
    const box = document.getElementById(id);
    if (box) box.innerHTML = rows.join('');
  }

  async function runDiagChecks(checks, list, report) {
    if (!list) return;
    list.innerHTML = '';
    report.checks = [];
    for (const check of checks) {
      const node = document.createElement('div');
      node.className = 'diag-check pending';
      node.innerHTML = `<span class="diag-check-icon"><i data-lucide="loader-circle"></i></span><span>${esc(check.label)}</span><span class="diag-badge">Running</span>`;
      list.appendChild(node);
      icons(node);
      try {
        const out = await Promise.race([
          check.run(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Timed out')), 9000))
        ]);
        node.className = `diag-check ${out?.level === 'warn' ? 'warn' : 'ok'}`;
        node.querySelector('.diag-check-icon').innerHTML = `<i data-lucide="${out?.level === 'warn' ? 'triangle-alert' : 'circle-check'}"></i>`;
        node.querySelector('.diag-badge').outerHTML = `<span class="diag-badge ${out?.level === 'warn' ? 'warn' : 'ok'}">${esc(out?.value || 'OK')}</span>`;
        report.checks.push({ label: check.label, level: out?.level === 'warn' ? 'warn' : 'ok', value: out?.value || 'OK' });
      } catch (e) {
        const msg = e?.message || 'Failed';
        const level = /Timed out|Not warmed|Installing/i.test(msg) ? 'warn' : 'bad';
        node.className = `diag-check ${level}`;
        node.querySelector('.diag-check-icon').innerHTML = `<i data-lucide="${level === 'warn' ? 'triangle-alert' : 'circle-x'}"></i>`;
        node.querySelector('.diag-badge').outerHTML = `<span class="diag-badge ${level}">${esc(msg)}</span>`;
        report.checks.push({ label: check.label, level, value: msg });
      }
      icons(node);
    }
    const bad = report.checks.filter((c) => c.level === 'bad').length;
    const warn = report.checks.filter((c) => c.level === 'warn').length;
    const summary = document.getElementById('diagSummary');
    if (summary) {
      summary.textContent = bad
        ? `${bad} check${bad === 1 ? '' : 's'} failed — details below.`
        : warn ? `${warn} warning${warn === 1 ? '' : 's'} — all critical paths OK.` : 'All checks passed.';
    }
  }

  function openDiagnostics() {
    document.getElementById('diagBackdrop')?.remove();
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.id = 'diagBackdrop';
    backdrop.innerHTML =
      `<section class="modal-card diag-modal" role="dialog" aria-modal="true"><div class="panel-head"><div><span class="eyebrow">SYSTEM HEALTH</span><h2>Diagnostics</h2><p class="panel-note" id="diagSummary">Collecting device and network info…</p></div>` +
      `<button class="icon-btn" id="closeDiag" aria-label="Close">${icon('x')}</button></div>` +
      `<div class="diag-grid">` +
      `<div class="diag-card"><h4>${icon('laptop')}Device</h4><div class="diag-rows" id="diagDevice"></div></div>` +
      `<div class="diag-card"><h4>${icon('gamepad-2')}App</h4><div class="diag-rows" id="diagApp"></div></div>` +
      `<div class="diag-card"><h4>${icon('database')}Storage</h4><div class="diag-rows" id="diagStorage"></div></div>` +
      `<div class="diag-card"><h4>${icon('wifi')}Connectivity</h4><div class="diag-rows" id="diagConnect"></div></div></div>` +
      `<h4 class="diag-subhead">${icon('clipboard-check')}Self-check</h4>` +
      `<div class="diag-check-list" id="diagCheckList"></div>` +
      `<div class="dialog-actions"><button class="btn" id="diagCopy">${icon('copy')} Copy report</button><button class="btn primary" id="diagRerun">${icon('activity')} Run checks</button></div></section>`;
    document.body.appendChild(backdrop);
    icons(backdrop);
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop || e.target.closest('#closeDiag')) backdrop.remove(); });

    const report = {};
    const refresh = (data) => {
      Object.assign(report, data);
      fillDiagRows('diagDevice', data.device);
      fillDiagRows('diagApp', data.app);
      fillDiagRows('diagStorage', data.storage);
      fillDiagRows('diagConnect', data.connect);
      return runDiagChecks(data.checks, document.getElementById('diagCheckList'), report);
    };
    diagnose().then(refresh).catch(() => {
      const summary = document.getElementById('diagSummary');
      if (summary) summary.textContent = 'Diagnostics could not be collected on this device.';
    });
    document.getElementById('diagRerun').onclick = () => {
      const summary = document.getElementById('diagSummary');
      if (summary) summary.textContent = 'Re-running checks…';
      diagnose().then(refresh);
    };
    document.getElementById('diagCopy').onclick = async () => {
      try {
        const text = [
          'Flash Games diagnostics',
          `Generated: ${new Date().toISOString()}`,
          ...reportTextRows(report)
        ].join('\n');
        await navigator.clipboard.writeText(text);
        toast('Copied', 'Diagnostics report is on your clipboard.', 'success');
      } catch {
        toast('Copy failed', 'Your browser blocked clipboard access.', 'error');
      }
    };
  }

  /* ---------- condensing navbar on scroll (rAF-throttled) ---------- */

  let condensedTick = false;
  function updateCondensed() {
    condensedTick = false;
    const y = window.scrollY || document.documentElement.scrollTop || 0;
    document.body.classList.toggle('nav-condensed', y > 140);
  }
  function onScroll() {
    if (condensedTick) return;
    condensedTick = true;
    requestAnimationFrame(updateCondensed);
  }

  /* ---------- custom install from URL ---------- */

  function closeCustom() { document.getElementById('customInstallBackdrop')?.remove(); }

  function openCustom() {
    closeCustom();
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.id = 'customInstallBackdrop';
    backdrop.innerHTML =
      `<section class="modal-card" role="dialog" aria-modal="true" aria-labelledby="customInstallTitle">` +
      `<div class="panel-head"><div><span class="eyebrow">CUSTOM GAME</span><h2 id="customInstallTitle">Install from URL</h2></div>` +
      `<button class="icon-btn" data-custom-close aria-label="Close">${icon('x')}</button></div>` +
      `<div class="form-grid"><label>Game URL<input id="customGameUrl" type="url" placeholder="https://…/game.html" autocomplete="url"></label>` +
      `<label>Name<input id="customGameName" type="text" placeholder="My Game"></label>` +
      `<label>Description<input id="customGameDescription" type="text" placeholder="A game I added myself"></label>` +
      `<label>Cover URL<input id="customGameCover" type="text" placeholder="https://…/icon.png"></label>` +
      `<p class="panel-note">Only single-file HTML games can be cached for offline play.</p></div>` +
      `<div class="dialog-actions"><button class="btn" data-custom-close>Cancel</button>` +
      `<button class="btn primary" id="customInstallSubmit">${icon('download')} Install</button></div></section>`;
    document.body.appendChild(backdrop);
    icons(backdrop);
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop || e.target.closest('[data-custom-close]')) closeCustom();
    });
    backdrop.querySelector('#customInstallSubmit').addEventListener('click', async () => {
      const url = backdrop.querySelector('#customGameUrl').value;
      const name = backdrop.querySelector('#customGameName').value;
      const description = backdrop.querySelector('#customGameDescription').value;
      const cover = backdrop.querySelector('#customGameCover').value;
      const submit = backdrop.querySelector('#customInstallSubmit');
      try {
        const showPct = (p) => {
          if (!submit) return;
          const label = p && p.pct != null ? `${p.pct}%` : 'Downloading…';
          if (submit.dataset.text === label) return;
          submit.dataset.text = label;
          submit.innerHTML = `${icon('loader-circle')}<span>${label}</span>`;
          icons(submit);
        };
        if (submit) { submit.disabled = true; showPct({}); }
        const game = await window.FlashGamesStore.installCustom({ url, name, description, cover }, { onProgress: showPct });
        toast('Installed', `${game.name} is now in your Library.`, 'success');
        window.dispatchEvent(new CustomEvent('flashgames:library-changed'));
        closeCustom();
      } catch (err) { toast('Install failed', err.message || 'The game could not be cached.', 'error'); }
      finally { if (submit) { submit.disabled = false; submit.innerHTML = `${icon('download')}<span>Install</span>`; icons(submit); } }
    });
  }

  function ensureCustomTrigger() {
    const head = document.querySelector('#gamesView .page-head');
    if (!head || head.querySelector('.custom-install-trigger')) return;
    const btn = document.createElement('button');
    btn.className = 'btn custom-install-trigger';
    btn.type = 'button';
    btn.innerHTML = `${icon('plus')}<span>From URL</span>`;
    btn.addEventListener('click', openCustom);
    head.appendChild(btn);
    icons(btn);
  }

  /* ---------- stats modal ---------- */

  function openStats() {
    document.getElementById('flashStatsBackdrop')?.remove();
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.id = 'flashStatsBackdrop';
    backdrop.innerHTML =
      `<section class="modal-card" role="dialog" aria-modal="true"><div class="panel-head"><div><span class="eyebrow">ACTIVITY</span><h2>Your stats</h2></div>` +
      `<button class="icon-btn" id="closeFlashStats" aria-label="Close">${icon('x')}</button></div>` +
      `<div class="stats-grid"><div><strong id="flashStatPlayed">0</strong><span>Games played</span></div>` +
      `<div><strong id="flashStatInstalls">0</strong><span>Installed</span></div>` +
      `<div><strong id="flashStatTime">0m</strong><span>Time played</span></div>` +
      `<div><strong id="flashStatMember">New Member</strong><span>Member level</span></div></div></section>`;
    document.body.appendChild(backdrop);
    try {
      const s = JSON.parse(localStorage.getItem('flashgames.stats') || '{}');
      const played = Number(s.played || 0), installs = Number(s.installs || 0);
      const mins = Math.floor(Number(s.time || 0) / 60000);
      backdrop.querySelector('#flashStatPlayed').textContent = String(played);
      backdrop.querySelector('#flashStatInstalls').textContent = String(installs);
      backdrop.querySelector('#flashStatTime').textContent = `${mins}m`;
      backdrop.querySelector('#flashStatMember').textContent =
        played >= 100 || mins >= 600 ? 'Elite Member'
        : played >= 30 || mins >= 120 || installs >= 30 ? 'Dedicated Member'
        : played >= 5 || installs >= 5 ? 'Active Member' : 'New Member';
    } catch {}
    icons(backdrop);
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop || e.target.closest('#closeFlashStats')) backdrop.remove();
    });
  }

  /* ---------- store sync button (actually refreshes the view) ---------- */

  let syncing = false;
  function ensureSyncTrigger() {
    const head = document.querySelector('#gamesView .page-head');
    if (!head || head.querySelector('.sync-button')) return;
    const btn = document.createElement('button');
    btn.className = 'btn sync-button';
    btn.type = 'button';
    btn.innerHTML = `${icon('refresh-cw')}<span>Sync games</span>`;
    btn.addEventListener('click', async () => {
      if (syncing) return;
      syncing = true;
      btn.disabled = true;
      try {
        const result = await window.FlashData.syncGames();
        toast('Catalogue synced', `${result.games.length.toLocaleString()} games are up to date.`, 'success');
        setTimeout(() => location.reload(), 800);
      } catch (err) { toast('Sync failed', err.message || 'The catalogue could not be refreshed.', 'error'); }
      finally { syncing = false; btn.disabled = false; }
    });
    head.appendChild(btn);
    icons(btn);
  }

  /* ---------- moderation helpers for the admin editor ---------- */

  async function saveProfile(uid, changes) {
    const db = window.__flashFirebase?.db, me = window.__flashFirebase?.auth?.currentUser;
    if (!db || !me) throw new Error('Firebase is not available.');
    await db.collection('users').doc(uid).set({ ...changes, updatedAt: Date.now(), updatedBy: me.uid }, { merge: true });
  }
  function confirmAction(title, text, action, danger = false) {
    const b = document.getElementById('dialogBackdrop');
    if (!b) return;
    document.getElementById('dialogTitle').textContent = title;
    document.getElementById('dialogText').textContent = text;
    document.getElementById('dialogIcon').innerHTML = icon(danger ? 'triangle-alert' : 'circle-help');
    const ok = document.getElementById('dialogConfirm');
    const cancel = document.getElementById('dialogCancel');
    ok.className = `btn ${danger ? 'danger' : 'primary'}`;
    b.hidden = false;
    icons(b);
    const close = () => { b.hidden = true; ok.onclick = null; cancel.onclick = null; };
    cancel.onclick = close;
    ok.onclick = async () => { try { await action(); } catch (e) { toast('Moderation failed', e.message || 'The change could not be saved.', 'error'); } finally { close(); } };
  }
  function ensureModerationTools() {
    const editor = document.getElementById('adminUserEditor');
    const uid = editor?.dataset?.uid;
    if (!editor || editor.hidden || !uid || editor.querySelector('.moderation-tools')) return;
    const name = editor.querySelector('.admin-editor-head h3')?.textContent || 'this member';
    const section = document.createElement('section');
    section.className = 'moderation-tools';
    section.innerHTML =
      `<h4>Moderation</h4><div class="row"><button type="button" class="btn danger" id="modBan">${icon('ban')} Ban</button>` +
      `<button type="button" class="btn" id="modUnban">${icon('circle-check')} Unban</button></div>` +
      `<label>Suspension end<input id="modSuspension" type="datetime-local"></label>` +
      `<div class="row"><button type="button" class="btn" id="modSuspend">${icon('clock')} Suspend</button></div>`;
    editor.appendChild(section);
    icons(section);
    section.querySelector('#modBan').onclick = () => confirmAction('Ban member?', `${name} will be banned.`, () => saveProfile(uid, { banned: true }), true);
    section.querySelector('#modUnban').onclick = () => confirmAction('Unban member?', `${name} will be restored.`, () => saveProfile(uid, { banned: false, suspendedUntil: 0 }));
    section.querySelector('#modSuspend').onclick = () => {
      const until = new Date(section.querySelector('#modSuspension').value).getTime();
      if (!Number.isFinite(until)) { toast('Missing date', 'Pick a suspension end date.', 'error'); return; }
      confirmAction('Suspend member?', `${name} will be suspended.`, () => saveProfile(uid, { suspendedUntil: until }));
    };
  }

  /* ---------- boot ---------- */

  function boot() {
    ensurePlayer();
    /* From URL + Sync live in the unified options bar now (app.js). */
    updateCondensed();
    window.addEventListener('scroll', onScroll, { passive: true });
    document.getElementById('openStats')?.addEventListener('click', openStats);
    setInterval(() => { ensurePlayer(); ensureModerationTools(); }, 1500);
  }
  window.FlashExtras = { openCustom, openStats, openDiagnostics };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
