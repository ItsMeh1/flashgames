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
        `<button class="player-control" data-player-action="popout">${icon('external-link')}<span>New tab</span></button>` +
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
        if (btn.dataset.playerAction === 'popout') {
          const src = frame.src;
          if (src && !src.startsWith('about:')) window.open(src, '_blank', 'noopener,noreferrer');
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
        if (mode === 'playing') toast('Opening', `${label} is loading in the player.`, 'success');
      }).catch((e) => {
        const msg = (e && e.message) || 'Unavailable.';
        const code = /(\d{3})/.exec(msg)?.[1];
        toast('Could not load', code ? `${label} refused the request (${code}). Opened directly instead.` : `${msg} Opened directly instead.`, 'info');
      }).finally(() => {
        btn.disabled = false;
        btn.innerHTML = original;
        icons(btn);
      });
      return;
    }
    window.open(url, '_blank', 'noopener,noreferrer');
  }, true);

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
      try {
        toast('Installing', 'Downloading your custom game…');
        const game = await window.FlashGamesStore.installCustom({ url, name, description, cover });
        toast('Installed', `${game.name} is now in your Library.`, 'success');
        window.dispatchEvent(new CustomEvent('flashgames:library-changed'));
        closeCustom();
      } catch (err) { toast('Install failed', err.message || 'The game could not be cached.', 'error'); }
    });
  }

  function ensureCustomTrigger() {
    const head = document.querySelector('#storeView .page-head');
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
    const head = document.querySelector('#storeView .page-head');
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
    ensureCustomTrigger();
    ensureSyncTrigger();
    updateCondensed();
    window.addEventListener('scroll', onScroll, { passive: true });
    document.getElementById('openStats')?.addEventListener('click', openStats);
    setInterval(() => { ensurePlayer(); ensureCustomTrigger(); ensureSyncTrigger(); ensureModerationTools(); }, 1500);
  }
  window.FlashExtras = { openCustom, openStats };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
