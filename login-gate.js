(() => {
  'use strict';
  let gate;
  let authUnsubscribe;
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  function toast(title, message, type = 'info') { window.FlashUI?.toast?.(title, message, type); }
  function ensureGate() {
    if (gate) return gate;
    gate = document.createElement('section');
    gate.className = 'flash-login-gate';
    gate.setAttribute('aria-live', 'polite');
    document.body.appendChild(gate);
    return gate;
  }
  function lockBody() {
    document.body.classList.add('flash-auth-locked');
    document.querySelectorAll('#app, #topbar, .bottom-dock, .side-panel, .modal-backdrop, .player-overlay').forEach((node) => {
      if (node !== gate) node.setAttribute('aria-hidden', 'true');
    });
  }
  function unlockBody() {
    document.body.classList.remove('flash-auth-locked');
    document.querySelectorAll('#app, #topbar, .bottom-dock, .side-panel, .modal-backdrop, .player-overlay').forEach((node) => node.removeAttribute('aria-hidden'));
  }
  function renderLogin(error = '') {
    const root = ensureGate();
    root.innerHTML = `<div class="flash-login-card glass"><span class="brand-mark"><img src="./offline/logo.png" alt=""></span><span class="eyebrow">FLASH GAMES</span><h1>Sign in to continue</h1><p>Sign in with your Firebase account before accessing Flash Games.</p><form id="flashGateForm"><div class="login-fields"><input id="flashGateEmail" type="email" autocomplete="email" placeholder="Email" required><input id="flashGatePassword" type="password" autocomplete="current-password" placeholder="Password" required></div><p class="login-error" id="flashGateError">${esc(error)}</p><button class="btn primary" type="submit"><i data-lucide="log-in"></i><span>Sign in</span></button></form></div>`;
    root.hidden = false; lockBody(); window.lucide?.createIcons?.({ root, attrs:{'stroke-width':1.5} });
    root.querySelector('#flashGateForm').onsubmit = async (event) => {
      event.preventDefault(); const auth = window.__flashFirebase?.auth; const errorNode = root.querySelector('#flashGateError'); const button = root.querySelector('button');
      if (!auth) { errorNode.textContent = 'Firebase is unavailable.'; return; }
      button.disabled = true; errorNode.textContent = '';
      try { await auth.signInWithEmailAndPassword(root.querySelector('#flashGateEmail').value.trim(), root.querySelector('#flashGatePassword').value); root.querySelector('#flashGatePassword').value=''; toast('Signed in','Checking account access…','success'); }
      catch (error) { errorNode.textContent = error.message || 'Sign in failed.'; }
      finally { button.disabled = false; }
    };
  }
  function setBlocked(kind, message) {
    const root = ensureGate();
    const title = kind === 'unverified' ? 'Verification required' : kind === 'suspended' ? 'Account suspended' : kind === 'ip' ? 'Network restricted' : 'Account restricted';
    root.innerHTML = `<div class="flash-login-card glass"><span class="brand-mark"><img src="./offline/logo.png" alt=""></span><span class="eyebrow">FLASH GAMES</span><h1>${esc(title)}</h1><p>${esc(message)}</p><p class="panel-note">If you believe this is a mistake, contact a Flash Games administrator.</p></div>`;
    root.hidden = false; lockBody(); window.lucide?.createIcons?.({ root, attrs:{'stroke-width':1.5} });
  }
  async function evaluate(user) {
    if (!user) { renderLogin(); return; }
    const db = window.__flashFirebase?.db;
    let profile = {};
    try { const snap = db ? await db.collection('users').doc(user.uid).get() : null; if (snap?.exists) profile = snap.data() || {}; }
    catch { setBlocked('restricted','Your account could not be verified right now.'); return; }
    if (profile.banned || profile.disabled || profile.deleted) { setBlocked('banned','This account is not permitted to access Flash Games.'); return; }
    const until = Number(profile.suspendedUntil || 0);
    if (until > Date.now()) { setBlocked('suspended',`This account is suspended until ${new Date(until).toLocaleString()}.`); return; }
    try {
      const global = await db.collection('settings').doc('unverifiedAccess').get();
      if (profile.verified === false && global.exists && global.data()?.suspended === true) { setBlocked('unverified','Unverified accounts are temporarily restricted while verification is in progress.'); return; }
    } catch {}
    ensureGate().hidden = true; unlockBody();
  }
  function init() {
    const auth = window.__flashFirebase?.auth;
    if (!auth) { renderLogin('Firebase is unavailable.'); return; }
    if (authUnsubscribe) authUnsubscribe();
    authUnsubscribe = auth.onAuthStateChanged(evaluate);
  }
  window.addEventListener('DOMContentLoaded', init, { once:true });
})();
