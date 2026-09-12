(() => {
  'use strict';
  const FAVOURITES_KEY = 'flashgames.favourites.v1';

  function readFavourites() {
    try {
      const value = JSON.parse(localStorage.getItem(FAVOURITES_KEY) || '[]');
      return Array.isArray(value) ? value.map(String) : [];
    } catch {
      return [];
    }
  }

  function writeFavourites(items) {
    const value = [...new Set((Array.isArray(items) ? items : []).map(String))];
    localStorage.setItem(FAVOURITES_KEY, JSON.stringify(value));
    return value;
  }

  function patchStore(store) {
    if (!store || typeof store !== 'object') return store;
    if (typeof store.getFavourites !== 'function') store.getFavourites = async () => readFavourites();
    if (typeof store.setFavourites !== 'function') store.setFavourites = async (items) => writeFavourites(items);
    if (typeof store.addFavourite !== 'function') store.addFavourite = async (id) => writeFavourites([...readFavourites(), id]);
    if (typeof store.removeFavourite !== 'function') store.removeFavourite = async (id) => writeFavourites(readFavourites().filter((item) => item !== String(id)));
    if (typeof store.toggleFavourite !== 'function') store.toggleFavourite = async (id) => {
      const key = String(id);
      const current = readFavourites();
      return current.includes(key)
        ? writeFavourites(current.filter((item) => item !== key))
        : writeFavourites([...current, key]);
    };
    return store;
  }

  function patch() {
    if (window.FlashData && typeof window.FlashData.loadGames !== 'function') {
      window.FlashData.loadGames = window.FlashGamesStore?.loadGames;
    }

    if (window.FlashGamesStore && !window.__flashStoreCompatInstalled) {
      let store = patchStore(window.FlashGamesStore);
      Object.defineProperty(window, 'FlashGamesStore', {
        configurable: true,
        enumerable: true,
        get: () => store,
        set: (next) => { store = patchStore(next); }
      });
      window.__flashStoreCompatInstalled = true;
    }

    if (window.FlashData && typeof window.FlashData.loadGames !== 'function') {
      window.FlashData.loadGames = window.FlashGamesStore?.loadGames;
    }
  }

  patch();
})();
