(() => {
  'use strict';

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
        window.FlashUI?.toast('Missing information', 'Enter your email and password.', 'error');
        return;
      }
      signIn.disabled = true;
      try {
        await auth.signInWithEmailAndPassword(address, secret);
        if (password) password.value = '';
        window.FlashUI?.toast('Signed in', 'Your Firebase profile has been loaded.', 'success');
      } catch (error) {
        window.FlashUI?.toast('Sign in failed', error.message || 'Firebase rejected the login.', 'error');
      } finally {
        signIn.disabled = false;
      }
    });

    signOut?.addEventListener('click', async () => {
      try {
        await auth.signOut();
        window.FlashUI?.toast('Signed out', 'Your Firebase session has ended.', 'success');
      } catch (error) {
        window.FlashUI?.toast('Sign out failed', error.message || 'Firebase rejected the request.', 'error');
      }
    });
  }, { once: true });
})();
