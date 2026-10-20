/* Flash Games auth — sign in/out + account creation.
 * Merged from auth.js + auth-recovery.js (forced login gate removed:
 * auth is optional and lives in the profile panel). */
(() => {
  'use strict';

  const MAX_PFP_BYTES = 700 * 1024;
  const clean = (v) => String(v ?? '').trim();
  const icon = (n) => `<i data-lucide="${n}"></i>`;

  function notify(title, message, type = 'info') {
    if (window.FlashUI?.toast) { window.FlashUI.toast(title, message, type); return; }
    const stack = document.getElementById('toastStack');
    if (!stack) return;
    const node = document.createElement('article');
    node.className = 'toast show';
    node.innerHTML = `<div><strong>${title}</strong><p>${message}</p></div>`;
    stack.appendChild(node);
    setTimeout(() => node.remove(), 4200);
  }

  function setSignupMode(on) {
    const actions = document.querySelector('.auth-actions');
    const signIn = document.getElementById('signInBtn');
    const password = document.getElementById('authPassword');
    if (!actions) return;
    if (on) {
      if (!document.getElementById('authUsername')) {
        const w = document.createElement('label');
        w.className = 'auth-extra-field';
        w.innerHTML = '<span>Username</span><input id="authUsername" type="text" autocomplete="username" maxlength="32" placeholder="Choose a username">';
        actions.parentElement.insertBefore(w, actions);
      }
      if (!document.getElementById('authPfpFile')) {
        const w = document.createElement('label');
        w.className = 'auth-extra-field';
        w.innerHTML = '<span>Profile picture <small>(optional)</small></span><input id="authPfpFile" type="file" accept="image/*">';
        actions.parentElement.insertBefore(w, actions);
      }
      signIn?.setAttribute('hidden', '');
      document.getElementById('createAccountToggle')?.setAttribute('hidden', '');
      if (!document.getElementById('createAccountBtn')) {
        const b = document.createElement('button');
        b.className = 'btn primary';
        b.id = 'createAccountBtn';
        b.type = 'button';
        b.innerHTML = `${icon('user-plus')} Create account`;
        actions.prepend(b);
        b.onclick = createAccount;
      }
      if (!document.getElementById('backToSignInBtn')) {
        const b = document.createElement('button');
        b.className = 'btn';
        b.id = 'backToSignInBtn';
        b.type = 'button';
        b.innerHTML = `${icon('log-in')} Sign in instead`;
        actions.appendChild(b);
        b.onclick = () => setSignupMode(false);
      }
      if (password) password.autocomplete = 'new-password';
      const s = document.getElementById('authStatus');
      if (s) s.textContent = 'Create your Flash Games account with a username and email.';
    } else {
      document.querySelectorAll('.auth-extra-field').forEach((n) => n.remove());
      document.getElementById('createAccountBtn')?.remove();
      document.getElementById('backToSignInBtn')?.remove();
      signIn?.removeAttribute('hidden');
      document.getElementById('createAccountToggle')?.removeAttribute('hidden');
      if (password) password.autocomplete = 'current-password';
    }
    try { window.lucide?.createIcons?.({ root: actions.parentElement, attrs: { 'stroke-width': 1.5 } }); } catch {}
  }

  function readPfp(file) {
    return new Promise((resolve, reject) => {
      if (!file) return resolve('');
      if (file.size > MAX_PFP_BYTES) return reject(new Error('Profile picture must be under 700 KB.'));
      const r = new FileReader();
      r.onload = () => resolve(String(r.result || ''));
      r.onerror = () => reject(new Error('Could not read the picture.'));
      r.readAsDataURL(file);
    });
  }

  async function createAccount() {
    const auth = window.__flashFirebase?.auth;
    const db = window.__flashFirebase?.db;
    if (!auth) { notify('Unavailable', 'Firebase could not initialize. Check your connection.', 'error'); return; }
    const email = clean(document.getElementById('authEmail')?.value);
    const secret = document.getElementById('authPassword')?.value || '';
    const username = clean(document.getElementById('authUsername')?.value);
    if (!email || !secret || !username) { notify('Missing information', 'Enter a username, email and password.', 'error'); return; }
    try {
      const pfp = await readPfp(document.getElementById('authPfpFile')?.files?.[0]);
      const cred = await auth.createUserWithEmailAndPassword(email, secret);
      await cred.user.updateProfile({ displayName: username, photoURL: pfp || null }).catch(() => {});
      if (db) {
        await db.collection('users').doc(cred.user.uid).set({
          displayName: username, username, email, photoURL: pfp || '',
          role: 'member', verified: false, createdAt: Date.now()
        }, { merge: true }).catch(() => {});
      }
      notify('Account created', 'Welcome to Flash Games.', 'success');
      setSignupMode(false);
    } catch (err) {
      notify('Sign up failed', err.message || 'Firebase rejected the registration.', 'error');
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    const auth = window.__flashFirebase?.auth;
    const signIn = document.getElementById('signInBtn');
    const signOut = document.getElementById('signOutBtn');
    const email = document.getElementById('authEmail');
    const password = document.getElementById('authPassword');
    const status = document.getElementById('authStatus');

    if (!document.getElementById('createAccountToggle') && document.querySelector('.auth-actions')) {
      const t = document.createElement('button');
      t.className = 'btn';
      t.id = 'createAccountToggle';
      t.type = 'button';
      t.innerHTML = `${icon('user-plus')} Create account`;
      t.onclick = () => setSignupMode(true);
      document.querySelector('.auth-actions').appendChild(t);
    }

    if (!auth) {
      if (status) status.textContent = 'Firebase could not initialize. Games still work offline.';
      return;
    }

    signIn?.addEventListener('click', async () => {
      const address = email?.value.trim();
      const secret = password?.value || '';
      if (!address || !secret) { notify('Missing information', 'Enter your email and password.', 'error'); return; }
      signIn.disabled = true;
      try {
        await auth.signInWithEmailAndPassword(address, secret);
        if (password) password.value = '';
        notify('Signed in', 'Your Firebase profile has been loaded.', 'success');
      } catch (err) {
        notify(navigator.onLine ? 'Sign in failed' : 'Offline', authFailureMessage(err), navigator.onLine ? 'error' : 'warn');
      } finally { signIn.disabled = false; }
    });

    signOut?.addEventListener('click', async () => {
      try {
        await auth.signOut();
        window.FlashOfflineSession?.clear();
        notify('Signed out', 'Your Firebase session has ended.', 'success');
      } catch (err) {
        notify('Sign out failed', err.message || 'Firebase rejected the request.', 'error');
      }
    });
  }, { once: true });

  /* ---------- access gate: account OR developer code ---------- */

  const offlineMessage = () => !navigator.onLine || !window.__flashFirebase?.auth
    ? 'You are offline — no Firebase errors here. Games work fully without internet; sign in or use a developer code the next time you are online.'
    : '';

  function authFailureMessage(error) {
    if (!navigator.onLine || /network|offline|timeout|retrieved|get-token|internal-error/i.test(String(error?.code || error?.message || ''))) {
      return 'No connection to account servers right now. Your games, saves and profile still work offline — no sign-in needed.';
    }
    const code = String(error?.code || '');
    if (/invalid-email/.test(code)) return 'That email address looks incomplete.';
    if (/user-not-found|wrong-password|invalid-credential/.test(code)) return 'Email or password is incorrect.';
    if (/email-already-in-use/.test(code)) return 'An account with that email already exists — try signing in instead.';
    if (/weak-password/.test(code)) return 'Choose a password with at least 6 characters.';
    if (/too-many-requests/.test(code)) return 'Too many attempts. Wait a moment and try again.';
    return (error?.message || 'Account service unavailable. You can still play everything offline.').replace(/^Firebase:\s*/i, '').replace(/\s*\(auth.*\)\.?$/i, '.').trim();
  }

  const DEV_CODES = [
    'FLASH-DEV-OMAR-7K2Q-2026',
    'FLASH-CLOUD-ACCESS-01',
    'FLASH-OWNER-99X-ALPHA',
    'FLASH-TESTER-PILOT-7',
    'FLASH-RECOVERY-000-DEV'
  ];
  const DEV_FLAG = 'flashgames.dev.unlocked.v1';

  function devUnlocked() {
    try { return localStorage.getItem(DEV_FLAG) === '1'; } catch { return false; }
  }
  function unlockWithCode(raw) {
    const code = clean(raw).toUpperCase();
    if (!code) return false;
    if (DEV_CODES.includes(code)) {
      try { localStorage.setItem(DEV_FLAG, '1'); } catch {}
      return true;
    }
    return false;
  }
  window.FlashAccess = Object.freeze({
    codes: DEV_CODES.slice(),
    isDeveloper: devUnlocked,
    unlockWithCode,
    lock() { try { localStorage.removeItem(DEV_FLAG); } catch {} }
  });

  function gateUnlocked(user) {
    return !!user || devUnlocked();
  }

  function ensureGate() {
    let gate = document.getElementById('flashGate');
    if (gate) return gate;
    gate = document.createElement('div');
    gate.id = 'flashGate';
    gate.className = 'flash-gate';
    gate.innerHTML =
      `<div class="flash-gate-card" role="dialog" aria-modal="true" aria-labelledby="flashGateTitle">` +
      `<span class="brand-mark large"><img src="./offline/logo.png" alt=""></span>` +
      `<span class="eyebrow">FLASH GAMES</span><h1 id="flashGateTitle">Restricted area</h1>` +
      `<p class="panel-note">Sign in with your account, or enter a developer code to continue.</p>` +
      `<form id="flashGateAuth"><label>Email<input id="flashGateEmail" type="email" autocomplete="email" placeholder="you@example.com" required></label>` +
      `<label>Password<input id="flashGatePassword" type="password" autocomplete="current-password" placeholder="••••••••" required></label>` +
      `<p class="flash-gate-error" id="flashGateError" hidden></p>` +
      `<button class="btn primary" type="submit">${icon('log-in')}<span>Sign in</span></button>` +
      `<button class="link-btn flash-gate-link" type="button" id="flashGateNew">New here? <b>Create an account</b> ${icon('arrow-right')}</button></form>` +
      `<form id="flashGateSignup" hidden><label>Username<input id="flashGateUsername" type="text" autocomplete="username" maxlength="32" placeholder="Choose a username" required></label>` +
      `<label>Email<input id="flashGateSignupEmail" type="email" autocomplete="email" placeholder="you@example.com" required></label>` +
      `<label>Password<input id="flashGateSignupPassword" type="password" autocomplete="new-password" placeholder="At least 6 characters" minlength="6" required></label>` +
      `<p class="flash-gate-error" id="flashGateSignupError" hidden></p>` +
      `<button class="btn primary" type="submit">${icon('user-plus')}<span>Create account</span></button>` +
      `<button class="link-btn flash-gate-link" type="button" id="flashGateBack">${icon('arrow-left')} <b>I already have an account</b></button></form>` +
      `<div class="flash-gate-divider" id="flashGateDivider"><span>or</span></div>` +
      `<form id="flashGateDev"><label>Developer code<input id="flashGateCode" type="text" autocomplete="off" spellcheck="false" placeholder="FLASH-DEV-XXXX"></label>` +
      `<button class="btn" type="submit">${icon('key-round')}<span>Unlock with code</span></button></form>` +
      `</div>`;
    document.body.appendChild(gate);
    try { window.lucide?.createIcons?.({ root: gate, attrs: { 'stroke-width': 1.5 } }); } catch {}
    const auth = window.__flashFirebase?.auth;
    const db = window.__flashFirebase?.db;
    const errEl = (sel, at) => {
      const e = gate.querySelector(sel);
      if (e) { e.textContent = at; e.hidden = false; }
    };
    const switchMode = (signup) => {
      const signIn = gate.querySelector('#flashGateAuth');
      const up = gate.querySelector('#flashGateSignup');
      const divider = gate.querySelector('#flashGateDivider');
      const signinErr = gate.querySelector('#flashGateError');
      const signupErr = gate.querySelector('#flashGateSignupError');
      if (!signIn || !up) return;
      signIn.hidden = signup; up.hidden = !signup;
      divider && (divider.hidden = signup);
      signinErr && (signinErr.hidden = true);
      signupErr && (signupErr.hidden = true);
      if (signup) gate.querySelector('#flashGateUsername')?.focus();
      else gate.querySelector('#flashGateEmail')?.focus();
    };
    gate.querySelector('#flashGateNew')?.addEventListener('click', () => switchMode(true));
    gate.querySelector('#flashGateBack')?.addEventListener('click', () => switchMode(false));
    gate.querySelector('#flashGateAuth').addEventListener('submit', async (e) => {
      e.preventDefault();
      const offlineMsg = offlineMessage();
      if (offlineMsg) { errEl('#flashGateError', offlineMsg); return; }
      const email = gate.querySelector('#flashGateEmail').value.trim();
      const secret = gate.querySelector('#flashGatePassword').value;
      try {
        await auth.signInWithEmailAndPassword(email, secret);
      } catch (ex) { errEl('#flashGateError', authFailureMessage(ex)); }
    });
    gate.querySelector('#flashGateSignup').addEventListener('submit', async (e) => {
      e.preventDefault();
      const offlineMsg = offlineMessage();
      if (offlineMsg) { errEl('#flashGateSignupError', offlineMsg); return; }
      const username = gate.querySelector('#flashGateUsername').value.trim();
      const email = gate.querySelector('#flashGateSignupEmail').value.trim();
      const secret = gate.querySelector('#flashGateSignupPassword').value;
      if (!username || !email || secret.length < 6) {
        errEl('#flashGateSignupError', 'Pick a username, enter your email and use a password of at least 6 characters.');
        return;
      }
      const submit = gate.querySelector('#flashGateSignup button[type="submit"]');
      if (submit) { submit.disabled = true; submit.innerHTML = `${icon('loader-circle')}<span>Creating account…</span>`; try { window.lucide?.createIcons?.({ root: submit, attrs: { 'stroke-width': 1.5 } }); } catch {} }
      try {
        const cred = await auth.createUserWithEmailAndPassword(email, secret);
        await cred.user.updateProfile({ displayName: username }).catch(() => {});
        if (db) {
          await db.collection('users').doc(cred.user.uid).set({
            displayName: username, username, email, photoURL: '',
            role: 'member', verified: false, createdAt: Date.now()
          }, { merge: true }).catch(() => {});
        }
        notify('Account created', `Welcome to Flash Games, ${username}.`, 'success');
      } catch (ex) {
        errEl('#flashGateSignupError', authFailureMessage(ex));
      } finally {
        if (submit) { submit.disabled = false; submit.innerHTML = `${icon('user-plus')}<span>Create account</span>`; }
      }
    });
    gate.querySelector('#flashGateDev').addEventListener('submit', (e) => {
      e.preventDefault();
      const ok = unlockWithCode(gate.querySelector('#flashGateCode').value);
      if (ok) { hideGate(); notify('Developer access granted', 'Cloud gaming is unlocked.', 'success'); }
      else errEl('#flashGateError', 'That code is not valid.');
    });
    return gate;
  }

  function showGate() {
    ensureGate().hidden = false;
    document.body.classList.add('gated');
  }
  function hideGate() {
    const gate = document.getElementById('flashGate');
    if (gate) gate.hidden = true;
    document.body.classList.remove('gated');
  }
  window.FlashGate = Object.freeze({ show: showGate, hide: hideGate });

  function bootGate() {
    const auth = window.__flashFirebase?.auth;
    if (gateUnlocked(auth?.currentUser)) return; // session or dev code already unlocks
    // Offline: skip account setup entirely. Games run fully without auth,
    // so opening Firebase on a dead network would only raise auth/net errors.
    if (!navigator.onLine || !auth) { notify('Offline mode', 'Games run fully without internet — account setup resumes next time you connect.', 'warn'); return; }
    showGate();
    if (!auth) return;
    auth.onAuthStateChanged((user) => {
      if (gateUnlocked(user)) hideGate();
      else showGate();
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bootGate, { once: true });
  else bootGate();
})();
