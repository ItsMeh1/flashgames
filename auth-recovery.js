(() => {
  'use strict';

  const MAX_PFP_BYTES = 700 * 1024;
  const clean = (v) => String(v ?? '').trim();
  const toast = (title, message, type = 'info') => window.FlashUI?.toast?.(title, message, type);
  const icon = (name) => `<i data-lucide="${name}"></i>`;
  let mode = 'signin';
  let bound = false;

  function setMode(next) {
    mode = next === 'signup' ? 'signup' : 'signin';
    const email = document.getElementById('authEmail');
    const password = document.getElementById('authPassword');
    const actions = document.querySelector('.auth-actions');
    if (!email || !password || !actions) return;
    let username = document.getElementById('authUsername');
    let pfp = document.getElementById('authPfpFile');
    if (mode === 'signup') {
      if (!username) {
        const wrap = document.createElement('label');
        wrap.className = 'auth-extra-field';
        wrap.innerHTML = `<span>Username</span><input id="authUsername" type="text" autocomplete="username" maxlength="32" placeholder="Choose a username">`;
        actions.parentElement.insertBefore(wrap, actions);
        username = wrap.querySelector('input');
      }
      if (!pfp) {
        const wrap = document.createElement('label');
        wrap.className = 'auth-extra-field';
        wrap.innerHTML = `<span>Profile picture <small>(optional)</small></span><input id="authPfpFile" type="file" accept="image/*">`;
        actions.parentElement.insertBefore(wrap, actions);
        pfp = wrap.querySelector('input');
      }
      email.autocomplete = 'email';
      password.autocomplete = 'new-password';
      actions.innerHTML = `<button class="btn primary" id="createAccountBtn" type="button">${icon('user-plus')} Create account</button><button class="btn" id="backToSignInBtn" type="button">${icon('log-in')} Sign in instead</button>`;
      const status = document.getElementById('authStatus');
      if (status) status.textContent = 'Create your Flash Games account with a username and email.';
      document.getElementById('createAccountBtn').onclick = createAccount;
      document.getElementById('backToSignInBtn').onclick = () => setMode('signin');
    } else {
      document.querySelectorAll('.auth-extra-field').forEach((n) => n.remove());
      actions.innerHTML = `<button class="btn primary" id="signInBtn">${icon('log-in')} Sign in</button><button class="btn" id="createAccountToggle" type="button">${icon('user-plus')} Create account</button><button class="btn" id="signOutBtn" hidden>${icon('log-out')} Sign out</button>`;
      const status = document.getElementById('authStatus');
      if (status) status.textContent = 'Firebase account data is used when you sign in.';
      bindSignin();
      document.getElementById('createAccountToggle').onclick = () => setMode('signup');
      window.lucide?.createIcons?.({ root: actions, attrs: { 'stroke-width': 1.5 } });
    }
    window.lucide?.createIcons?.({ root: actions, attrs: { 'stroke-width': 1.5 } });
  }

  function bindSignin() {
    const auth = window.__flashFirebase?.auth;
    const button = document.getElementById('signInBtn');
    const email = document.getElementById('authEmail');
    const password = document.getElementById('authPassword');
    if (!auth || !button || button.__flashBound) return;
    button.__flashBound = true;
    button.onclick = async () => {
      const address = clean(email?.value);
      const secret = password?.value || '';
      if (!address || !secret) return toast('Missing information', 'Enter your email and password.', 'error');
      button.disabled = true;
      try {
        await auth.signInWithEmailAndPassword(address, secret);
        if (password) password.value = '';
        toast('Signed in', 'Your Firebase profile has been loaded.', 'success');
      } catch (error) {
        toast('Sign in failed', error?.message || 'Firebase rejected the login.', 'error');
      } finally { button.disabled = false; }
    };
  }

  async function maintenanceLocked() {
    try {
      const db = window.__flashFirebase?.db;
      if (!db) return false;
      const snap = await db.collection('settings').doc('maintenance').get();
      return !!(snap.exists && snap.data()?.enabled === true);
    } catch { return false; }
  }

  function readPfp(file) {
    if (!file) return Promise.resolve('');
    if (!file.type.startsWith('image/')) return Promise.reject(new Error('Choose an image file for your profile picture.'));
    if (file.size > MAX_PFP_BYTES) return Promise.reject(new Error('That profile picture is too large. Please use an image under 700 KB.'));
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('The profile picture could not be read.'));
      reader.readAsDataURL(file);
    });
  }

  async function createAccount() {
    const auth = window.__flashFirebase?.auth;
    const db = window.__flashFirebase?.db;
    const button = document.getElementById('createAccountBtn');
    const usernameNode = document.getElementById('authUsername');
    const emailNode = document.getElementById('authEmail');
    const passwordNode = document.getElementById('authPassword');
    const pfpNode = document.getElementById('authPfpFile');
    if (!auth || !db) return toast('Account creation unavailable', 'Firebase is unavailable right now.', 'error');
    if (await maintenanceLocked()) return toast('Accounts locked', 'You cannot make a new account at this time.', 'error');
    const username = clean(usernameNode?.value);
    const email = clean(emailNode?.value);
    const password = passwordNode?.value || '';
    if (!/^[A-Za-z0-9_ -]{3,32}$/.test(username)) return toast('Invalid username', 'Use 3–32 letters, numbers, spaces, hyphens, or underscores.', 'error');
    if (!email || !password) return toast('Missing information', 'Enter your email and password.', 'error');
    if (password.length < 6) return toast('Password too short', 'Firebase passwords must be at least 6 characters.', 'error');
    button.disabled = true;
    try {
      const duplicate = await db.collection('users').where('usernameLower', '==', username.toLowerCase()).limit(1).get();
      if (!duplicate.empty) throw new Error('That username is already taken.');
      const photoURL = await readPfp(pfpNode?.files?.[0]);
      const credential = await auth.createUserWithEmailAndPassword(email, password);
      const user = credential.user;
      await db.collection('users').doc(user.uid).set({
        uid: user.uid,
        email: user.email || email,
        username,
        usernameLower: username.toLowerCase(),
        displayName: username,
        pfp: photoURL,
        photoURL: photoURL,
        role: 'user',
        banned: false,
        disabled: false,
        deleted: false,
        verified: false,
        createdAt: Date.now(),
        updatedAt: Date.now()
      }, { merge: true });
      if (passwordNode) passwordNode.value = '';
      toast('Account created', `Welcome to Flash Games, ${username}!`, 'success');
    } catch (error) {
      const code = String(error?.code || '');
      const message = code === 'auth/operation-not-allowed' || code === 'auth/admin-restricted-operation'
        ? 'You cannot make a new account at this time.'
        : code === 'auth/email-already-in-use'
          ? 'That email is already connected to an account. Try signing in.'
          : error?.message || 'The account could not be created.';
      toast('Could not create account', message, 'error');
    } finally { button.disabled = false; }
  }

  function injectGateSignup() {
    const root = document.querySelector('.flash-login-gate');
    const form = root?.querySelector('#flashGateForm');
    if (!form || root.querySelector('#flashGateSignup')) return;
    const button = document.createElement('button');
    button.id = 'flashGateSignup';
    button.type = 'button';
    button.className = 'btn';
    button.innerHTML = `${icon('user-plus')} Create account`;
    form.appendChild(button);
    button.onclick = () => renderGateSignup(root);
    window.lucide?.createIcons?.({ root: button, attrs: { 'stroke-width': 1.5 } });
  }

  function renderGateSignup(root) {
    const old = root.querySelector('#flashGateEmail')?.value || '';
    root.querySelector('.flash-login-card').innerHTML = `<span class="brand-mark"><img src="./offline/logo.png" alt=""></span><span class="eyebrow">FLASH GAMES</span><h1>Create your account</h1><p>Make a Flash Games account with a username, email, password, and optional profile picture.</p><form id="flashGateSignupForm"><div class="login-fields"><input id="flashGateUsername" type="text" maxlength="32" autocomplete="username" placeholder="Username" required><input id="flashGateSignupEmail" type="email" autocomplete="email" placeholder="Email" value="${old.replace(/"/g, '&quot;')}" required><input id="flashGateSignupPassword" type="password" autocomplete="new-password" placeholder="Password" minlength="6" required><input id="flashGatePfp" type="file" accept="image/*"></div><p class="login-error" id="flashGateSignupError"></p><button class="btn primary" type="submit">${icon('user-plus')} Create account</button><button class="btn" id="flashGateBack" type="button">${icon('log-in')} Sign in instead</button></form>`;
    const form = root.querySelector('#flashGateSignupForm');
    form.onsubmit = async (event) => {
      event.preventDefault();
      const errorNode = root.querySelector('#flashGateSignupError');
      const submit = form.querySelector('button[type="submit"]');
      const auth = window.__flashFirebase?.auth;
      const db = window.__flashFirebase?.db;
      errorNode.textContent = '';
      if (!auth || !db) { errorNode.textContent = 'Firebase is unavailable.'; return; }
      if (await maintenanceLocked()) { errorNode.textContent = 'You cannot make a new account at this time.'; return; }
      const username = clean(root.querySelector('#flashGateUsername')?.value);
      const email = clean(root.querySelector('#flashGateSignupEmail')?.value);
      const password = root.querySelector('#flashGateSignupPassword')?.value || '';
      if (!/^[A-Za-z0-9_ -]{3,32}$/.test(username)) { errorNode.textContent = 'Use a username with 3–32 letters, numbers, spaces, hyphens, or underscores.'; return; }
      if (password.length < 6) { errorNode.textContent = 'Password must be at least 6 characters.'; return; }
      submit.disabled = true;
      try {
        const duplicate = await db.collection('users').where('usernameLower', '==', username.toLowerCase()).limit(1).get();
        if (!duplicate.empty) throw new Error('That username is already taken.');
        const photoURL = await readPfp(root.querySelector('#flashGatePfp')?.files?.[0]);
        const credential = await auth.createUserWithEmailAndPassword(email, password);
        const user = credential.user;
        await db.collection('users').doc(user.uid).set({uid:user.uid,email:user.email||email,username,usernameLower:username.toLowerCase(),displayName:username,pfp:photoURL,photoURL,role:'user',banned:false,disabled:false,deleted:false,verified:false,createdAt:Date.now(),updatedAt:Date.now()},{merge:true});
        toast('Account created', `Welcome to Flash Games, ${username}!`, 'success');
      } catch (error) {
        const code = String(error?.code || '');
        errorNode.textContent = code === 'auth/operation-not-allowed' || code === 'auth/admin-restricted-operation' ? 'You cannot make a new account at this time.' : code === 'auth/email-already-in-use' ? 'That email is already connected to an account. Try signing in.' : error?.message || 'The account could not be created.';
      } finally { submit.disabled = false; }
    };
    root.querySelector('#flashGateBack').onclick = () => { window.dispatchEvent(new Event('flashgames:auth-gate-refresh')); };
    window.lucide?.createIcons?.({ root, attrs: { 'stroke-width': 1.5 } });
  }

  function observeGate() {
    injectGateSignup();
    if (bound) return;
    bound = true;
    const observer = new MutationObserver(() => injectGateSignup());
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('flashgames:auth-gate-refresh', () => window.location.reload());
  }

  document.addEventListener('DOMContentLoaded', () => {
    bindSignin();
    const panel = document.getElementById('profilePanel');
    if (panel) setMode('signin');
    observeGate();
  }, { once: true });
})();
