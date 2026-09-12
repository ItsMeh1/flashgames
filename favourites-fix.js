(() => {
  'use strict';
  const KEY = 'flashgames.favourites.v1';
  const read = () => {
    try {
      const value = JSON.parse(localStorage.getItem(KEY) || '[]');
      return Array.isArray(value) ? value.map(String) : [];
    } catch { return []; }
  };
  const write = (items) => {
    const value = [...new Set((Array.isArray(items) ? items : [...items]).map(String))];
    localStorage.setItem(KEY, JSON.stringify(value));
    return value;
  };
  const install = () => {
    if (!window.FlashGamesStore) return;
    const store = window.FlashGamesStore;
    if (typeof store.getFavourites !== 'function') store.getFavourites = async () => read();
    if (typeof store.setFavourites !== 'function') store.setFavourites = async (items) => write(items);
    if (typeof store.setFavourite !== 'function') store.setFavourite = async (id, enabled) => {
      const current = read();
      return write(enabled ? [...current, id] : current.filter((item) => item !== String(id)));
    };
    if (typeof store.addFavourite !== 'function') store.addFavourite = async (id) => write([...read(), id]);
    if (typeof store.removeFavourite !== 'function') store.removeFavourite = async (id) => write(read().filter((item) => item !== String(id)));
    if (typeof store.toggleFavourite !== 'function') store.toggleFavourite = async (id) => {
      const key = String(id), current = read();
      return current.includes(key) ? write(current.filter((item) => item !== key)) : write([...current, key]);
    };
  };
  install();
  window.addEventListener('load', install, { once: true });
})();
