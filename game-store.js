(() => {
  'use strict';

  const DB_NAME = 'flashgames-library';
  const DB_VERSION = 3;
  const STORE_NAME = 'games';
  const SOURCE_ROOT = 'https://raw.githubusercontent.com/CoolDude2349/Offline-HTML-Games-Pack/master/offline/';
  const TREE_URL = 'https://api.github.com/repos/CoolDude2349/Offline-HTML-Games-Pack/git/trees/master?recursive=1';
  const CATALOGUE_KEY = 'flashgames.catalogue.full.v1';
  const FAVOURITES_KEY = 'flashgames.favourites.v1';

  let databasePromise = null;
  let cataloguePromise = null;

  const clean = (value) => String(value ?? '').trim();

  const slug = (value) => clean(value)
    .replace(/\.html?$/i, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const titleCase = (value) => slug(value)
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

  function normalizeName(filename) {
    const value = slug(filename);
    return titleCase(value)
      .replace(/\bLol\b/i, 'LoL')
      .replace(/\bFnaf\b/gi, 'FNAF')
      .replace(/\bAgar Io\b/gi, 'Agar.io')
      .replace(/\bRun 3\b/gi, 'Run 3');
  }

  function openDatabase() {
    if (databasePromise) return databasePromise;

    databasePromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = () => {
        const db = request.result;
        const stores = db.objectStoreNames;

        if (!stores.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        }
      };

      request.onsuccess = () => {
        const db = request.result;

        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.close();
          databasePromise = null;
          reject(new Error('Game cache store could not be created.'));
          return;
        }

        db.onversionchange = () => db.close();
        resolve(db);
      };

      request.onerror = () => {
        databasePromise = null;
        reject(request.error || new Error('Unable to open game cache.'));
      };

      request.onblocked = () => {
        // A stale tab can temporarily block an IndexedDB upgrade. The app still
        // has the network catalogue and can continue without the cache.
      };
    });

    return databasePromise;
  }

  async function putGame(game) {
    try {
      const db = await openDatabase();
      await new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readwrite');
        transaction.objectStore(STORE_NAME).put(game);
        transaction.oncomplete = resolve;
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error || new Error('Cache transaction aborted.'));
      });
    } catch {
      // Cache failure must never prevent a game from opening from the network.
    }
  }

  async function getAllCachedGames() {
    try {
      const db = await openDatabase();
      return await new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readonly');
        const request = transaction.objectStore(STORE_NAME).getAll();
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error);
      });
    } catch {
      return [];
    }
  }

  async function getCachedGame(id) {
    try {
      const db = await openDatabase();
      return await new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readonly');
        const request = transaction.objectStore(STORE_NAME).get(id);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error);
      });
    } catch {
      return null;
    }
  }

  async function deleteCachedGame(id) {
    try {
      const db = await openDatabase();
      await new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readwrite');
        transaction.objectStore(STORE_NAME).delete(id);
        transaction.oncomplete = resolve;
        transaction.onerror = () => reject(transaction.error);
      });
    } catch {
      // Safe no-op when browser storage is unavailable.
    }
  }

  async function clearGameCache() {
    try {
      const db = await openDatabase();
      await new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readwrite');
        transaction.objectStore(STORE_NAME).clear();
        transaction.oncomplete = resolve;
        transaction.onerror = () => reject(transaction.error);
      });
    } catch {
      // Safe no-op.
    }
  }

  async function fetchTree() {
    const response = await fetch(TREE_URL, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Catalogue request failed (${response.status}).`);
    const data = await response.json();
    return Array.isArray(data.tree) ? data.tree : [];
  }

  function chooseCover(htmlPath, imagePaths) {
    const directory = htmlPath.slice(0, htmlPath.lastIndexOf('/') + 1);
    const base = slug(htmlPath.slice(directory.length).replace(/\.html?$/i, ''))
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '');

    const candidates = imagePaths.filter((path) => {
      if (!path.startsWith(directory)) return false;
      const filename = path.slice(path.lastIndexOf('/') + 1).toLowerCase();
      return /\.(png|jpe?g|webp|gif|svg)$/i.test(filename);
    });

    const scored = candidates.map((path) => {
      const filename = path.slice(path.lastIndexOf('/') + 1).toLowerCase();
      const stem = filename.replace(/\.[^.]+$/, '').replace(/[^a-z0-9]/g, '');
      let score = 0;
      if (stem === base) score += 100;
      if (stem.includes(base) || base.includes(stem)) score += 50;
      if (/cover|thumbnail|thumb|icon|logo|preview/.test(filename)) score += 20;
      return { path, score };
    }).sort((a, b) => b.score - a.score);

    if (!scored.length || scored[0].score < 20) return '';
    return `https://raw.githubusercontent.com/CoolDude2349/Offline-HTML-Games-Pack/master/${scored[0].path}`;
  }

  function buildCatalogue(tree) {
    const files = tree
      .filter((entry) => entry.type === 'blob' && /^offline\/.*\.html?$/i.test(entry.path))
      .map((entry) => entry.path)
      .sort((a, b) => a.localeCompare(b));

    const images = tree
      .filter((entry) => entry.type === 'blob' && /^offline\/.*\.(png|jpe?g|webp|gif|svg)$/i.test(entry.path))
      .map((entry) => entry.path);

    return files.map((path) => {
      const filename = path.slice(path.lastIndexOf('/') + 1);
      const name = normalizeName(filename);
      const id = `offline-${filename.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;

      return {
        id,
        name,
        title: name,
        category: 'HTML Games',
        zone: 'OFFLINE PACK',
        description: 'Single-file HTML game from the Offline HTML Games Pack.',
        url: `${SOURCE_ROOT}${encodeURIComponent(filename).replace(/%2F/g, '/')}`,
        rawUrl: `${SOURCE_ROOT}${encodeURIComponent(filename).replace(/%2F/g, '/')}`,
        cover: chooseCover(path, images),
        source: 'CoolDude2349/Offline-HTML-Games-Pack'
      };
    });
  }

  async function loadCatalogue(force = false) {
    if (cataloguePromise && !force) return cataloguePromise;

    cataloguePromise = (async () => {
      let stored = [];
      try {
        stored = JSON.parse(localStorage.getItem(CATALOGUE_KEY) || '[]');
      } catch {
        stored = [];
      }

      try {
        const tree = await fetchTree();
        const games = buildCatalogue(tree);
        if (games.length) {
          localStorage.setItem(CATALOGUE_KEY, JSON.stringify(games));
          return games;
        }
      } catch {
        // Use the last real catalogue when GitHub is temporarily unavailable.
      }

      return Array.isArray(stored) ? stored : [];
    })();

    return cataloguePromise;
  }

  function getFavourites() {
    try {
      const values = JSON.parse(localStorage.getItem(FAVOURITES_KEY) || '[]');
      return new Set(Array.isArray(values) ? values : []);
    } catch {
      return new Set();
    }
  }

  function setFavourite(id, enabled) {
    const favourites = getFavourites();
    if (enabled) favourites.add(id);
    else favourites.delete(id);
    localStorage.setItem(FAVOURITES_KEY, JSON.stringify([...favourites]));
  }

  async function install(game, onProgress) {
    const response = await fetch(game.rawUrl || game.url, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Game download failed (${response.status}).`);

    const text = await response.text();
    const cached = {
      ...game,
      html: text,
      installedAt: Date.now(),
      size: text.length
    };

    await putGame(cached);
    if (typeof onProgress === 'function') onProgress(cached);
    return cached;
  }

  async function launch(game) {
    const cached = await getCachedGame(game.id);
    const html = cached?.html;

    if (html) {
      const blob = new Blob([html], { type: 'text/html' });
      return URL.createObjectURL(blob);
    }

    return game.rawUrl || game.url;
  }

  window.FlashGamesStore = {
    loadCatalogue,
    getAllCachedGames,
    getCachedGame,
    install,
    launch,
    deleteCachedGame,
    clearGameCache,
    getFavourites,
    setFavourite
  };
})();
