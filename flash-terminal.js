(() => {
  'use strict';

  const state = { modules: new Map(), history: [], index: -1 };
  const blockedKey = /(token|secret|password|credential|auth|firebase|session|game|progress|score|xp|currency|coins|save)/i;
  const print = (out, text, type = '') => {
    const p = document.createElement('div');
    p.className = `terminal-line ${type}`;
    p.textContent = String(text ?? '');
    out.appendChild(p);
    out.scrollTop = out.scrollHeight;
  };
  const add = (module) => {
    if (!module?.name || module.trusted !== true || typeof module.commands !== 'object') return false;
    state.modules.set(module.name, Object.freeze(module));
    return true;
  };

  add({ trusted: true, name: 'system', description: 'Safe browser and app diagnostics.', commands: {
    help: ({ out }) => print(out, 'system status | system time'),
    status: ({ out }) => print(out, `online=${navigator.onLine} | visibility=${document.visibilityState} | language=${navigator.language}`),
    time: ({ out }) => print(out, new Date().toString())
  }});
  add({ trusted: true, name: 'browser', description: 'Read-only browser diagnostics.', commands: {
    help: ({ out }) => print(out, 'browser info | browser storage | browser viewport'),
    info: ({ out }) => print(out, navigator.userAgent),
    storage: ({ out }) => print(out, `localStorage=${typeof localStorage !== 'undefined'} | cacheStorage=${'caches' in window}`),
    viewport: ({ out }) => print(out, `${innerWidth}x${innerHeight} @ ${devicePixelRatio}x`)
  }});
  add({ trusted: true, name: 'offline', description: 'Service worker and cache diagnostics.', commands: {
    help: ({ out }) => print(out, 'offline status | offline caches | offline games'),
    status: async ({ out }) => print(out, `online=${navigator.onLine} | controller=${!!navigator.serviceWorker?.controller}`),
    caches: async ({ out }) => print(out, (await caches.keys()).join('\n') || 'No Cache Storage entries found.'),
    games: async ({ out }) => { try { const games = await window.FlashGamesStore?.getAllCachedGames?.() || []; print(out, `${games.length} installed game(s). Game names are intentionally omitted.`); } catch { print(out, 'Game cache could not be inspected.', 'error'); } }
  }});
  add({ trusted: true, name: 'localstorage', description: 'Inspect non-sensitive storage metadata only.', commands: {
    help: ({ out }) => print(out, 'localstorage keys | localstorage get <key>'),
    keys: ({ out }) => { const keys = []; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && !blockedKey.test(k)) keys.push(k); } print(out, keys.join('\n') || 'No non-sensitive keys available.'); },
    get: ({ out, args }) => { const k = args.join(' ').trim(); if (!k) return print(out, 'Usage: localstorage get <key>', 'error'); if (blockedKey.test(k)) return print(out, 'That key is protected from terminal access.', 'error'); const value = localStorage.getItem(k); print(out, value === null ? 'Key not found.' : value); }
  }});
  add({ trusted: true, name: 'session', description: 'Read-only current-account diagnostics.', commands: {
    help: ({ out }) => print(out, 'session status'),
    status: ({ out }) => { const user = window.__flashFirebase?.auth?.currentUser; const cached = window.FlashOfflineSession?.read?.(); print(out, `firebaseUser=${!!user}`); print(out, `uid=${user?.uid ? '[redacted]' : 'none'}`); print(out, `offlineVerificationCache=${!!cached}`); }
  }});

  const extensionCatalog = Object.freeze({
    network: { trusted: true, name: 'network', description: 'Read-only connection diagnostics.', commands: {
      help: ({ out }) => print(out, 'network status'),
      status: ({ out }) => { print(out, `online=${navigator.onLine}`); print(out, `connection=${navigator.connection?.effectiveType || 'unknown'}`); print(out, `downlink=${navigator.connection?.downlink ?? 'unknown'} Mbps`); }
    }}
  });
  const installedExtensions = new Set();

  const moduleUI = (out) => {
    const wrap = document.createElement('div');
    wrap.className = 'terminal-modules';
    const available = Object.values(extensionCatalog).filter((mod) => !state.modules.has(mod.name));
    if (!available.length) {
      print(out, 'All optional modules are installed.');
      return;
    }
    available.forEach((mod) => {
      const card = document.createElement('div');
      card.className = 'terminal-module';
      const info = document.createElement('div');
      info.className = 'terminal-module-info';
      const name = document.createElement('div');
      name.className = 'terminal-module-name';
      name.textContent = mod.name;
      const desc = document.createElement('div');
      desc.className = 'terminal-module-description';
      desc.textContent = mod.description;
      const install = document.createElement('button');
      install.type = 'button';
      install.className = 'terminal-module-install';
      install.textContent = 'Install';
      install.addEventListener('click', () => {
        if (!add(mod)) return;
        installedExtensions.add(mod.name);
        install.disabled = true;
        install.textContent = 'Installed';
        print(out, `Installed ${mod.name}.`);
      });
      info.append(name, desc);
      card.append(info, install);
      wrap.appendChild(card);
    });
    out.appendChild(wrap);
    out.scrollTop = out.scrollHeight;
  };

  add({ trusted: true, name: 'modules', description: 'Install or inspect trusted bundled modules.', commands: {
    help: ({ out }) => print(out, 'modules list | modules install | modules available | modules remove <name>'),
    list: ({ out }) => print(out, [...state.modules.keys()].join('\n')),
    available: ({ out }) => print(out, Object.keys(extensionCatalog).filter((name) => !state.modules.has(name)).join('\n') || 'No additional trusted modules available.'),
    install: ({ out, args }) => {
      const name = args[0]?.toLowerCase();
      if (!name) return moduleUI(out);
      const mod = extensionCatalog[name];
      if (!mod) return print(out, 'Only bundled trusted modules can be installed. Use modules install.', 'error');
      if (add(mod)) { installedExtensions.add(name); print(out, `Installed ${name}.`); }
    },
    remove: ({ out, args }) => { const name = args[0]?.toLowerCase(); if (!installedExtensions.has(name)) return print(out, 'Only optional installed modules can be removed.', 'error'); state.modules.delete(name); installedExtensions.delete(name); print(out, `Removed ${name}.`); }
  }});

  function run(out, raw) {
    const input = raw.trim();
    if (!input) return;
    state.history.push(input);
    state.index = state.history.length;
    const parts = input.split(/\s+/);
    const head = parts.shift().toLowerCase();
    if (head === 'clear') { out.textContent = ''; return; }
    if (head === 'help') { print(out, 'Type <module> <command>. Try: modules install'); return; }
    const module = state.modules.get(head);
    if (!module) return print(out, `Unknown command/module: ${head}`, 'error');
    const command = (parts.shift() || 'help').toLowerCase();
    const fn = module.commands[command];
    if (typeof fn !== 'function') return print(out, `Unknown ${head} command: ${command}`, 'error');
    Promise.resolve(fn({ out, args: parts })).catch(() => print(out, 'Command failed safely.', 'error'));
  }

  function mount() {
    if (document.getElementById('flashTerminal')) return;
    const button = document.createElement('button');
    button.className = 'icon-btn flash-terminal-trigger';
    button.type = 'button';
    button.title = 'Flash Terminal — Option+T';
    button.setAttribute('aria-label', 'Flash Terminal — Option+T');
    button.innerHTML = '<i data-lucide="terminal"></i>';
    document.querySelector('.top-actions')?.appendChild(button);

    const backdrop = document.createElement('div');
    backdrop.id = 'flashTerminal';
    backdrop.className = 'modal-backdrop';
    backdrop.hidden = true;
    backdrop.innerHTML = '<section class="flash-terminal" role="dialog" aria-modal="true" aria-label="Terminal"><div class="terminal-body"><div id="flashTerminalOutput" class="terminal-output" aria-live="polite"></div><form id="flashTerminalForm" class="terminal-form"><span>&gt;</span><input id="flashTerminalInput" autocomplete="off" spellcheck="false" placeholder="type a command"><button type="submit">Run</button></form></div></section>';
    document.body.appendChild(backdrop);

    const out = backdrop.querySelector('#flashTerminalOutput');
    const input = backdrop.querySelector('#flashTerminalInput');
    const open = () => { backdrop.hidden = false; input.focus(); if (!out.childElementCount) print(out, 'Flash Terminal ready. Type help.'); };
    const close = () => { backdrop.hidden = true; };
    button.addEventListener('click', open);
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });
    backdrop.querySelector('#flashTerminalForm').addEventListener('submit', (e) => { e.preventDefault(); const v = input.value; input.value = ''; print(out, `> ${v}`, 'command'); run(out, v); });
    input.addEventListener('keydown', (e) => { if (e.key === 'ArrowUp') { e.preventDefault(); state.index = Math.max(0, state.index - 1); input.value = state.history[state.index] || ''; } if (e.key === 'ArrowDown') { e.preventDefault(); state.index = Math.min(state.history.length, state.index + 1); input.value = state.history[state.index] || ''; } if (e.key === 'Escape') close(); });

    window.addEventListener('keydown', (e) => {
      const optionT = e.altKey && (e.code === 'KeyT' || e.key.toLowerCase() === 't' || e.key === '†');
      if (optionT) { e.preventDefault(); e.stopPropagation(); open(); }
    }, true);
    window.lucide?.createIcons?.({ root: button, attrs: { 'stroke-width': 1.5 } });
  }

  function boot() { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true }); else mount(); }
  boot();
})();
