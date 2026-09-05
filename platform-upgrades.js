(() => {
  'use strict';

  const CACHE_STATE_KEY = 'flashgames.v2.cache-state';
  const IP_COLLECTION = 'ipBans';
  const LUMIN_SRC = 'https://cdn.jsdelivr.net/gh/luminsdk/script@latest/lumin.min.js';

  const $ = (selector, root = document) => root.querySelector(selector);
  const esc = (value) => String(value ?? '').replace(/[&<>\"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[char]));

  function toast(title, message, type = 'info') {
    window.FlashUI?.toast?.(title, message, type);
  }

  function sha256(value) {
    return crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)).then((buffer) =>
      [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
    );
  }

  async function getPublicIp() {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    try {
      const response = await fetch('https://api64.ipify.org?format=json', {
        cache: 'no-store',
        signal: controller.signal
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      return String(data.ip || '').trim();
    } finally {
      clearTimeout(timer);
    }
  }

  async function checkIpRestriction() {
    const db = window.__flashFirebase?.db;
    if (!db) return;

    try {
      const ip = await getPublicIp();
      if (!ip) return;
      const id = await sha256(ip);
      const snap = await db.collection(IP_COLLECTION).doc(id).get();
      if (!snap.exists) return;

      const restriction = snap.data() || {};
      if (restriction.active === false) return;

      const expiry = restriction.expiresAt?.toDate?.()?.getTime() || 0;
      if (expiry && expiry <= Date.now()) {
        await snap.ref.set({ active: false, expiredAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true }).catch(() => {});
        return;
      }

      const message = restriction.type === 'suspension'
        ? 'Your IP address is temporarily suspended from Flash Games.'
        : 'Your IP address is banned from Flash Games.';
      const until = expiry ? ` It expires ${new Date(expiry).toLocaleString()}.` : '';
      showSecurityBlock(`${message}${until}`, restriction.reason);
    } catch (error) {
      console.warn('[Flash Games] IP restriction check unavailable:', error);
    }
  }

  function showSecurityBlock(message, reason = '') {
    if ($('#flashSecurityBlock')) return;
    const overlay = document.createElement('div');
    overlay.id = 'flashSecurityBlock';
    overlay.className = 'platform-security-block';
    overlay.innerHTML = `
      <section class="platform-security-card glass" role="alertdialog" aria-modal="true">
        <span class="eyebrow">FLASH GAMES SECURITY</span>
        <h2>Access restricted</h2>
        <p>${esc(message)}</p>
        ${reason ? `<div class="platform-security-reason"><strong>Reason</strong><span>${esc(reason)}</span></div>` : ''}
        <button class="btn primary" id="securityRetry">Retry</button>
      </section>
    `;
    document.body.appendChild(overlay);
    $('#securityRetry', overlay)?.addEventListener('click', () => location.reload());
  }

  async function cacheSync() {
    if (!('serviceWorker' in navigator)) return;
    try {
      const response = await fetch(`./cache-manifest.json?v=${Date.now()}`, { cache: 'no-store' });
      if (!response.ok) return;
      const manifest = await response.json();
      const version = String(manifest.version || '0');
      const saved = JSON.parse(localStorage.getItem(CACHE_STATE_KEY) || 'null');
      const registration = await navigator.serviceWorker.ready;

      registration.active?.postMessage({
        type: 'FLASHGAMES_CACHE_SYNC',
        version,
        assets: Array.isArray(manifest.assets) ? manifest.assets : []
      });

      if (!saved || saved.version !== version) {
        localStorage.setItem(CACHE_STATE_KEY, JSON.stringify({ version, checkedAt: Date.now() }));
        registration.update().catch(() => {});
      }
    } catch (error) {
      console.warn('[Flash Games] Cache manifest check failed:', error);
    }
  }

  function setupIpAdmin() {
    const observer = new MutationObserver(() => {
      const admin = $('#adminView');
      if (!admin || admin.dataset.ipControlsReady === '1') return;
      const isAdmin = window.FlashAdmin?.isAdmin?.(firebase?.auth?.().currentUser, window.__flashAdminProfile || {}) || false;
      if (!isAdmin) return;

      admin.dataset.ipControlsReady = '1';
      const panel = document.createElement('section');
      panel.className = 'admin-panel compact ip-admin-panel';
      panel.innerHTML = `
        <div class="admin-section-head">
          <div><span class="eyebrow">NETWORK ACCESS</span><h2>IP bans & suspensions</h2><p>Permanent bans and timed suspensions are stored separately from account moderation.</p></div>
          <button class="btn primary" id="openIpControls">Manage IPs</button>
        </div>
      `;
      admin.appendChild(panel);
      $('#openIpControls', panel)?.addEventListener('click', openIpControls);
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  function openIpControls() {
    let modal = $('#flashIpControls');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'flashIpControls';
      modal.className = 'modal-backdrop';
      modal.innerHTML = `
        <section class="ip-controls-modal glass" role="dialog" aria-modal="true">
          <div class="panel-head">
            <div><span class="eyebrow">NETWORK ACCESS</span><h2>IP controls</h2><p>Enter the IP address to restrict.</p></div>
            <button class="icon-btn" id="closeIpControls" aria-label="Close">×</button>
          </div>
          <div class="ip-control-form">
            <input id="ipAddressInput" class="admin-input" placeholder="IP address">
            <select id="ipTypeInput" class="admin-input"><option value="ban">Permanent ban</option><option value="suspension">Temporary suspension</option></select>
            <input id="ipExpiryInput" class="admin-input" type="datetime-local">
            <input id="ipReasonInput" class="admin-input" placeholder="Reason">
            <button class="btn primary" id="saveIpRestriction">Apply restriction</button>
          </div>
          <div class="ip-controls-list" id="ipRestrictionList"></div>
        </section>
      `;
      document.body.appendChild(modal);
      $('#closeIpControls', modal).onclick = () => { modal.hidden = true; };
      $('#saveIpRestriction', modal).onclick = saveIpRestriction;
      $('#ipTypeInput', modal).onchange = () => {
        $('#ipExpiryInput', modal).disabled = $('#ipTypeInput', modal).value !== 'suspension';
      };
      $('#ipTypeInput', modal).dispatchEvent(new Event('change'));
      loadIpRestrictions();
    }
    modal.hidden = false;
    loadIpRestrictions();
  }

  async function saveIpRestriction() {
    const db = window.__flashFirebase?.db;
    if (!db) return toast('IP controls unavailable', 'Firebase is not ready.', 'error');
    const modal = $('#flashIpControls');
    const ip = $('#ipAddressInput', modal)?.value.trim();
    const type = $('#ipTypeInput', modal)?.value || 'ban';
    const reason = $('#ipReasonInput', modal)?.value.trim() || 'Administrator restriction';
    const expiryValue = $('#ipExpiryInput', modal)?.value;
    if (!ip) return toast('Missing IP', 'Enter an IP address first.', 'error');

    try {
      const id = await sha256(ip);
      const expiresAt = type === 'suspension' && expiryValue
        ? firebase.firestore.Timestamp.fromDate(new Date(expiryValue))
        : null;
      await db.collection(IP_COLLECTION).doc(id).set({
        active: true,
        type,
        reason,
        ipSuffix: ip.slice(-8),
        expiresAt,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
      toast(type === 'suspension' ? 'IP suspended' : 'IP banned', 'The restriction was saved.', 'success');
      $('#ipAddressInput', modal).value = '';
      $('#ipReasonInput', modal).value = '';
      await loadIpRestrictions();
    } catch (error) {
      toast('Could not save IP restriction', error.message || 'Firestore rejected the write.', 'error');
    }
  }

  async function loadIpRestrictions() {
    const db = window.__flashFirebase?.db;
    const container = $('#ipRestrictionList');
    if (!db || !container) return;
    container.innerHTML = '<div class="panel-note">Loading restrictions…</div>';
    try {
      const snap = await db.collection(IP_COLLECTION).where('active', '==', true).get();
      if (!snap.docs.length) {
        container.innerHTML = '<div class="panel-note">No active IP restrictions.</div>';
        return;
      }
      container.innerHTML = snap.docs.map((doc) => {
        const value = doc.data() || {};
        const expires = value.expiresAt?.toDate?.()?.toLocaleString?.() || 'Never';
        return `<article class="ip-restriction-row"><div><strong>••••${esc(value.ipSuffix || 'unknown')}</strong><span>${esc(value.type || 'ban')} · ${esc(value.reason || 'No reason')}</span><small>Expires: ${esc(expires)}</small></div><button class="btn" data-ip-revoke="${esc(doc.id)}">Revoke</button></article>`;
      }).join('');
      container.querySelectorAll('[data-ip-revoke]').forEach((button) => {
        button.addEventListener('click', async () => {
          try {
            await db.collection(IP_COLLECTION).doc(button.dataset.ipRevoke).set({ active: false, revokedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
            toast('Restriction revoked', 'The IP is no longer blocked.', 'success');
            loadIpRestrictions();
          } catch (error) {
            toast('Could not revoke restriction', error.message || 'Firestore rejected the change.', 'error');
          }
        });
      });
    } catch (error) {
      container.innerHTML = '<div class="panel-note">Unable to load IP restrictions. Check your Firestore rules.</div>';
    }
  }

  function observeRoutes() { /* Lumin is initialized only by app.js in headless mode. */ }

  function injectStyles() {
    if ($('#platform-upgrades-style')) return;
    const style = document.createElement('style');
    style.id = 'platform-upgrades-style';
    style.textContent = `
      html, body { min-width: 0; width: 100%; overflow-x: clip; }
      *, *::before, *::after { box-sizing: border-box; }
      img, iframe, video, canvas { max-width: 100%; }
      button, input, textarea, select { min-width: 0; }
      main, .view, .section, .page-head, .game-grid, .admin-shell { min-width: 0; }
      .online-arcade-section { margin-top: 1.25rem; overflow: hidden; }
      .online-arcade-head { display:flex; align-items:flex-end; justify-content:space-between; gap:1.25rem; padding:1.5rem; border-bottom:1px solid rgba(255,255,255,.08); }
      .online-arcade-head h2 { margin:.35rem 0 .25rem; }
      .online-arcade-head p { max-width:760px; color:rgba(255,255,255,.58); }
      .online-arcade-shell { position:relative; min-height:560px; padding:1rem; overflow:hidden; }
      #flashLuminGames { width:100%; min-width:0; }
      .online-arcade-loading { min-height:420px; display:grid; place-items:center; color:rgba(255,255,255,.5); }
      .platform-security-block { position:fixed; inset:0; z-index:100000; display:grid; place-items:center; padding:1.25rem; background:rgba(3,4,8,.82); backdrop-filter:blur(22px); }
      .platform-security-card { width:min(560px,100%); padding:2rem; border:1px solid rgba(255,255,255,.1); border-radius:1.75rem; }
      .platform-security-card h2 { margin:.45rem 0 .65rem; font-size:2rem; }
      .platform-security-card p { color:rgba(255,255,255,.65); line-height:1.7; }
      .platform-security-reason { display:grid; gap:.3rem; margin:1rem 0 1.25rem; padding:1rem; border-radius:1rem; background:rgba(0,0,0,.2); }
      .ip-controls-modal { width:min(900px,100%); max-height:min(88vh,900px); overflow:auto; margin:auto; padding:1.5rem; border:1px solid rgba(255,255,255,.1); border-radius:1.5rem; }
      .ip-control-form { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:.75rem; margin:1rem 0 1.25rem; }
      .ip-controls-list { display:grid; gap:.6rem; }
      .ip-restriction-row { display:flex; align-items:center; justify-content:space-between; gap:1rem; padding:.9rem 1rem; border:1px solid rgba(255,255,255,.08); border-radius:1rem; background:rgba(255,255,255,.03); }
      .ip-restriction-row > div { display:grid; gap:.2rem; min-width:0; }
      .ip-restriction-row span, .ip-restriction-row small { color:rgba(255,255,255,.5); }
      .ip-restriction-row strong { color:#fff; }
      @media (max-width: 760px) { .online-arcade-head { align-items:flex-start; flex-direction:column; } .online-arcade-shell { padding:.5rem; min-height:480px; } .ip-control-form { grid-template-columns:1fr; } .ip-restriction-row { align-items:flex-start; flex-direction:column; } }
    `;
    document.head.appendChild(style);
  }

  function boot() {
    injectStyles();
    observeRoutes();
    setupIpAdmin();
    cacheSync();
    checkIpRestriction();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
