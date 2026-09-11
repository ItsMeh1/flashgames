(() => {
  'use strict';

  const KEY = 'flashgames.offline.session.v1';
  const VERSION = 1;

  function read() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return null;
      const value = JSON.parse(raw);
      return value && value.version === VERSION && value.uid && value.banStatus === 'clear' ? value : null;
    } catch { return null; }
  }

  function write(user, profile = {}) {
    if (!user?.uid) return false;
    try {
      localStorage.setItem(KEY, JSON.stringify({
        version: VERSION,
        uid: String(user.uid),
        email: String(user.email || '').slice(0, 320),
        displayName: String(profile.displayName || user.displayName || '').slice(0, 120),
        photoURL: String(profile.photoURL || user.photoURL || '').slice(0, 2048),
        role: String(profile.role || '').slice(0, 40),
        banStatus: 'clear',
        verifiedAt: Date.now()
      }));
      return true;
    } catch { return false; }
  }

  function clear() {
    try { localStorage.removeItem(KEY); } catch {}
  }

  function isOffline() {
    return navigator.onLine === false;
  }

  window.FlashOfflineSession = Object.freeze({
    key: KEY,
    read,
    write,
    clear,
    isOffline
  });
})();
