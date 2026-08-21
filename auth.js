(() => {
  'use strict';

  function notify(title, message, type = 'info') {
    if (window.FlashUI?.toast) {
      window.FlashUI.toast(title, message, type);
      return;
    }
    const stack = document.getElementById('toastStack');
    if (!stack) return;
    const node = document.createElement('article');
    node.className = 'toast show';
    node.innerHTML = `<div><strong>${String(title)}</strong><p>${String(message)}</p></div>`;
    stack.appendChild(node);
    setTimeout(() => node.remove(), 4200);
  }

  document.addEventListener('DOMContentLoaded', () => {
    const auth = window.__flashFirebase?.auth;
    const signIn = document.getElementById('signInBtn');
    const signOut = document.getElementById('signOutBtn');
    const email = document.getElementById('authEmail');
    const password = document.getElementById('authPassword');
    const status = document.getElementById('authStatus');

    if (!auth) {
      if (status) status.textContent = 'Firebase could not initialize. Check your connection and reload.';
      return;
    }

    signIn?.addEventListener('click', async () => {
      const address = email?.value.trim();
      const secret = password?.value || '';
      if (!address || !secret) {
        notify('Missing information', 'Enter your email and password.', 'error');
        return;
      }
      signIn.disabled = true;
      try {
        await auth.signInWithEmailAndPassword(address, secret);
        if (password) password.value = '';
        notify('Signed in', 'Your Firebase profile has been loaded.', 'success');
      } catch (error) {
        notify('Sign in failed', error.message || 'Firebase rejected the login.', 'error');
      } finally {
        signIn.disabled = false;
      }
    });

    signOut?.addEventListener('click', async () => {
      try {
        await auth.signOut();
        notify('Signed out', 'Your Firebase session has ended.', 'success');
      } catch (error) {
        notify('Sign out failed', error.message || 'Firebase rejected the request.', 'error');
      }
    });
  }, { once: true });
})();
