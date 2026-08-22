(() => {
  'use strict';

  let gate;
  let resolved = false;

  function toast(title, message, type = 'info') { window.FlashUI?.toast?.(title, message, type); }

  function ensureGate() {
    if (gate) return gate;
    gate = document.createElement('section');
    gate.className = 'flash-login-gate';
    gate.innerHTML = `<div class="flash-login-card glass"><span class="brand-mark"><img src="./offline/logo.png" alt=""></span><span class="eyebrow">FLASH GAMES</span><h1>Sign in to continue</h1><p>Sign in with your Firebase account before accessing your games, library, store, social area, and account tools.</p><form id="flashGateForm"><div class="login-fields"><input id="flashGateEmail" type="email" autocomplete="email" placeholder="Email" required><input id="flashGatePassword" type="password" autocomplete="current-password" placeholder="Password" required></div><p class="login-error" id="flashGateError" aria-live="polite"></p><button class="btn primary" type="submit"><i data-lucide="log-in"></i><span>Sign in</span></button></form></div>`;
    document.body.appendChild(gate);
    window.lucide?.createIcons?.({ root: gate, attrs: { 'stroke-width': 1.5 } });
    gate.querySelector('#flashGateForm').addEventListener('submit', async (event) => {
      event.preventDefault();
      const auth = window.__flashFirebase?.auth;
      const errorNode = gate.querySelector('#flashGateError');
      const button = gate.querySelector('button');
      if (!auth) { errorNode.textContent = 'Firebase is unavailable. Check your connection and reload.'; return; }
      button.disabled = true;
      errorNode.textContent = '';
      try {
        await auth.signInWithEmailAndPassword(gate.querySelector('#flashGateEmail').value.trim(), gate.querySelector('#flashGatePassword').value);
        gate.querySelector('#flashGatePassword').value = '';
        toast('Signed in', 'Welcome back to Flash Games.', 'success');
      } catch (error) {
        errorNode.textContent = error.message || 'Sign in failed.';
        toast('Sign in failed', error.message || 'Firebase rejected the login.', 'error');
      } finally { button.disabled = false; }
    });
    return gate;
  }

  function setBlocked(message) {
    const root = ensureGate();
    const card = root.querySelector('.flash-login-card');
    card.innerHTML = `<span class="brand-mark"><img src="./offline/logo.png" alt=""></span><span class="eyebrow">ACCOUNT RESTRICTED</span><h1>Access unavailable</h1><p>${String(message).replace(/[&<>\"]/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;' }[c]))}</p><button class="btn primary" id="flashRestrictedSignOut"><i data-lucide="log-out"></i><span>Sign out</span></button>`;
    root.querySelector('#flashRestrictedSignOut').onclick = () => window.__flashFirebase?.auth?.signOut();
    window.lucide?.createIcons?.({ root, attrs: { 'stroke-width': 1.5 } });
    root.hidden = false;
    document.body.classList.add('flash-auth-locked');
  }

  function setAccess(user, profile = {}) {
    const root = ensureGate();
    const restricted = profile.banned === true || profile.disabled === true || profile.deleted === true;
    const until = Number(profile.suspendedUntil || 0);
    if (user && !restricted && (!until || until <= Date.now())) {
      resolved = true;
      root.hidden = true;
      document.body.classList.remove('flash-auth-locked');
      return;
    }
    if (user && restricted) { setBlocked(profile.banned ? 'This account has been banned.' : profile.deleted ? 'This account has been removed.' : 'App access has been disabled for this account.'); return; }
    if (user && until > Date.now()) { setBlocked(`This account is suspended until ${new Date(until).toLocaleString()}.`); return; }
    root.hidden = false;
    document.body.classList.add('flash-auth-locked');
  }

  function init() {
    const auth = window.__flashFirebase?.auth;
    ensureGate();
    if (!auth) { setAccess(null); return; }
    auth.onAuthStateChanged(async (user) => {
      if (!user) { setAccess(null); return; }
      let profile = {};
      try {
        const db = window.__flashFirebase?.db;
        const snap = db ? await db.collection('users').doc(user.uid).get() : null;
        if (snap?.exists) profile = snap.data() || {};
      } catch { /* app auth remains usable if the optional profile lookup fails */ }
      setAccess(user, profile);
    });
  }

  window.addEventListener('DOMContentLoaded', init, { once: true });
})();
