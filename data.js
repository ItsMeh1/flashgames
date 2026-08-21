(() => {
  'use strict';

  const GAME_CACHE = 'flashgames.catalogue.v6';
  const LEGACY_CACHES = [
    'flashgames.catalogue.v5',
    'flashgames.catalogue.v4',
    'flashgames.catalogue.v3'
  ];

  const clean = (value) => String(value ?? '').trim();

  const escapeHtml = (value) => clean(value).replace(/[&<>\"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '\"': '&quot;',
    "'": '&#39;'
  })[char]);

  function stableId(game, index) {
    return clean(game.id) || clean(game.url) || `${
      clean(game.name)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
    }-${index}`;
  }

  function normalizeGame(game, index) {
    if (!game || typeof game !== 'object') return null;

    const name = clean(game.name || game.title);
    const url = clean(game.url || game.href || game.link);

    if (!name || !url) return null;

    const rating = game.rating == null ? null : Number(game.rating);

    return {
      id: stableId(game, index),
      name,
      title: name,
      url,
      zone: clean(
        game.zone ||
        game.type ||
        (game.isOfflinePackage ? 'OFFLINE' : 'STORE')
      ),
      category: clean(game.category || game.genre || 'Games'),
      description: clean(game.description || game.desc),
      cover: clean(
        game.cover ||
        game.image ||
        game.thumbnail ||
        game.icon
      ),
      tags: Array.isArray(game.tags)
        ? game.tags.map(clean).filter(Boolean)
        : [],
      rating: Number.isFinite(rating) ? rating : null
    };
  }

  function normalize(list) {
    return Array.isArray(list)
      ? list.map(normalizeGame).filter(Boolean)
      : [];
  }

  function dedupe(list) {
    const seen = new Set();

    return list.filter((game) => {
      const key = clean(game.url) || game.id;

      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function readCache(key) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || 'null');
      return Array.isArray(value?.games) ? value.games : [];
    } catch {
      return [];
    }
  }

  function readAllCaches() {
    const current = readCache(GAME_CACHE);
    const legacy = LEGACY_CACHES.flatMap(readCache);
    return dedupe(normalize([...current, ...legacy]));
  }

  function writeCache(games) {
    try {
      localStorage.setItem(
        GAME_CACHE,
        JSON.stringify({
          version: 6,
          time: Date.now(),
          games
        })
      );
    } catch {
      // Local storage can be unavailable or full. The app can still use memory.
    }
  }

  async function fetchJson(url, timeout = 12000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        cache: 'no-store',
        signal: controller.signal,
        headers: {
          Accept: 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      return await response.json();
    } finally {
      clearTimeout(timer);
    }
  }

  function extractArrayAfterMarker(source, marker) {
    let cursor = 0;

    while ((cursor = source.indexOf(marker, cursor)) !== -1) {
      const open = source.indexOf('[', cursor);
      if (open === -1) break;

      let depth = 0;
      let quote = '';
      let escaped = false;

      for (let index = open; index < source.length; index += 1) {
        const character = source[index];

        if (quote) {
          if (escaped) {
            escaped = false;
          } else if (character === '\\') {
            escaped = true;
          } else if (character === quote) {
            quote = '';
          }
          continue;
        }

        if (character === '"' || character === "'") {
          quote = character;
          continue;
        }

        if (character === '[') depth += 1;
        if (character === ']') depth -= 1;

        if (depth === 0) {
          try {
            const value = Function(
              `"use strict"; return (${source.slice(open, index + 1)})`
            )();

            if (Array.isArray(value)) return value;
          } catch {
            // Try the next occurrence.
          }
          break;
        }
      }

      cursor = open + 1;
    }

    return [];
  }

  async function loadLegacyStore() {
    const urls = [
      './legacy.html',
      './index-legacy.html',
      'https://raw.githubusercontent.com/ItsMeh1/flashgames/main/index.html',
      'https://raw.githubusercontent.com/ItsMeh1/flashgames/v2/legacy.html'
    ];

    for (const url of urls) {
      try {
        const response = await fetch(
          `${url}${url.includes('?') ? '&' : '?'}v=${Date.now()}`,
          { cache: 'no-store' }
        );

        if (!response.ok) continue;

        const source = await response.text();
        const candidates = [
          extractArrayAfterMarker(source, 'STORE_GAMES'),
          extractArrayAfterMarker(source, 'window.STORE_GAMES'),
          extractArrayAfterMarker(source, 'GAME_LIST'),
          extractArrayAfterMarker(source, 'games')
        ];

        for (const candidate of candidates) {
          const games = normalize(candidate);
          if (games.length) return games;
        }
      } catch {
        // Continue to the next real source.
      }
    }

    return [];
  }

  async function loadOfflineCatalogue() {
    try {
      const data = await fetchJson(`./offline.json?v=${Date.now()}`);
      return normalize(
        Array.isArray(data)
          ? data
          : data.games || data.data || []
      );
    } catch {
      return [];
    }
  }

  async function loadConfiguredSource() {
    const configured = clean(
      localStorage.getItem('flashgames.apiBase') ||
      window.FLASH_API_BASE
    ).replace(/\/$/, '');

    if (!configured) return [];

    const endpoints = [
      `${configured}/games`,
      `${configured}/api/games`,
      `${configured}/info`
    ];

    for (const endpoint of endpoints) {
      try {
        const data = await fetchJson(endpoint);
        const games = normalize(data?.games || data?.data || data);
        if (games.length) return games;
      } catch {
        // Try the next endpoint.
      }
    }

    return [];
  }

  async function loadGames(force = false) {
    const cached = readAllCaches();

    if (!force && cached.length) {
      writeCache(cached);
      return {
        games: cached,
        source: 'cache'
      };
    }

    const configured = await loadConfiguredSource();
    if (configured.length) {
      const games = dedupe([...configured, ...cached]);
      writeCache(games);
      return {
        games,
        source: 'configured+cache'
      };
    }

    const [legacy, offline] = await Promise.all([
      loadLegacyStore(),
      loadOfflineCatalogue()
    ]);

    const games = dedupe([...legacy, ...offline, ...cached]);

    if (games.length) {
      writeCache(games);
    }

    return {
      games,
      source: games.length ? 'legacy+offline+cache' : 'empty'
    };
  }

  async function loadUpdates() {
    try {
      const data = await fetchJson(`./update.json?v=${Date.now()}`);
      const releases = Array.isArray(data)
        ? data
        : data.releases || [];

      return {
        version: clean(data.version || releases[0]?.version || '0.0.0'),
        releases
      };
    } catch {
      return {
        version: '0.0.0',
        releases: []
      };
    }
  }

  async function loadNotifications(uid) {
    const db = window.__flashFirebase?.db;
    if (!db) return [];

    try {
      const collection = db.collection('notifications');
      let snapshot;

      try {
        snapshot = uid
          ? await collection.where('uid', '==', uid).limit(30).get()
          : await collection.limit(30).get();
      } catch {
        snapshot = await collection.limit(30).get();
      }

      return snapshot.docs
        .map((doc) => ({ id: doc.id, ...doc.data() }))
        .sort((a, b) => {
          const left = Number(a.createdAt?.seconds || a.createdAt || 0);
          const right = Number(b.createdAt?.seconds || b.createdAt || 0);
          return right - left;
        });
    } catch {
      return [];
    }
  }

  async function getPresenceCount() {
    const db = window.__flashFirebase?.db;
    if (!db) return null;

    for (const collection of ['presence', 'onlineUsers']) {
      try {
        const snapshot = await db.collection(collection).get();
        if (snapshot.size) return snapshot.size;
      } catch {
        // Try the next collection.
      }
    }

    return null;
  }

  window.FlashData = {
    loadGames,
    loadUpdates,
    loadNotifications,
    getPresenceCount,
    clearCache() {
      localStorage.removeItem(GAME_CACHE);
    },
    esc: escapeHtml
  };
})();
