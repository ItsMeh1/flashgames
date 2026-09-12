(() => {
  'use strict';
  const KEY = 'flashgames.favourites.v1';
  const read = () => {
    try {
      const value = JSON.parse(localStorage.getItem(KEY) || '[]');
      return Array.isArray(value) ? value.map(String) : [];
    } catch {
      return [];
    }
  };
  const write = (items) => {
    const unique = [...new Set(items.map(String))];
    localStorage.setItem(KEY, JSON.stringify(unique));
    return unique;
  };
  const install = () => {
    if (!window.FlashGamesStore) return;
    if (typeof window.FlashGamesStore.getFavourites !== 'function') {
      window.FlashGamesStore.getFavourites = async () => read();
    }
    if (typeof window.FlashGamesStore.setFavourites !== 'function') {
      window.FlashGamesStore.setFavourites = async (items) => write(Array.isArray(items) ? items : []);
    }
    if (typeof window.FlashGamesStore.addFavourite !== 'function') {
      window.FlashGamesStore.addFavourite = async (id) => write([...read(), id]);
    }
    if (typeof window.FlashGamesStore.removeFavourite !== 'function') {
      window.FlashGamesStore.removeFavourite = async (id) => write(read().filter((item) => item !== String(id)));
    }
    if (typeof window.FlashGamesStore.toggleFavourite !== 'function') {
      window.FlashGamesStore.toggleFavourite = async (id) => {
        const key = String(id);
        const current = read();
        return current.includes(key) ? write(current.filter((item) => item !== key)) : write([...current, key]);
      };
    }
  };
  install();
  window.addEventListener('load', install, { once: true });
})();
