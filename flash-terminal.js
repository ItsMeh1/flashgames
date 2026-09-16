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

  add({ trusted: true, name: 'system', description: 'Basic app and browser status.', commands: {
    help: ({ out }) => print(out, 'system status | system time'),
    status: ({ out }) => print(out, `online=${navigator.onLine} | visibility=${document.visibilityState} | language=${navigator.language}`),
    time: ({ out }) => print(out, new Date().toString())
  }});
  add({ trusted: true, name: 'browser', description: 'Browser information and viewport details.', commands: {
    help: ({ out }) => print(out, 'browser info | browser storage | browser viewport'),
    info: ({ out }) => print(out, navigator.userAgent),
    storage: ({ out }) => print(out, `localStorage=${typeof localStorage !== 'undefined'} | cacheStorage=${'caches' in window}`),
    viewport: ({ out }) => print(out, `${innerWidth}x${innerHeight} @ ${devicePixelRatio}x`)
  }});
  add({ trusted: true, name: 'offline', description: 'Service worker and Cache Storage diagnostics.', commands: {
    help: ({ out }) => print(out, 'offline status | offline caches | offline games'),
    status: async ({ out }) => print(out, `online=${navigator.onLine} | controller=${!!navigator.serviceWorker?.controller}`),
    caches: async ({ out }) => print(out, (await caches.keys()).join('\n') || 'No Cache Storage entries found.'),
    games: async ({ out }) => { try { const games = await window.FlashGamesStore?.getAllCachedGames?.() || []; print(out, `${games.length} installed game(s). Game names are intentionally omitted.`); } catch { print(out, 'Game cache could not be inspected.', 'error'); } }
  }});
  add({ trusted: true, name: 'localstorage', description: 'Inspect non-sensitive localStorage data.', commands: {
    help: ({ out }) => print(out, 'localstorage keys | localstorage get <key>'),
    keys: ({ out }) => { const keys = []; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && !blockedKey.test(k)) keys.push(k); } print(out, keys.join('\n') || 'No non-sensitive keys available.'); },
    get: ({ out, args }) => { const k = args.join(' ').trim(); if (!k) return print(out, 'Usage: localstorage get <key>', 'error'); if (blockedKey.test(k)) return print(out, 'That key is protected from terminal access.', 'error'); const value = localStorage.getItem(k); print(out, value === null ? 'Key not found.' : value); }
  }});
  add({ trusted: true, name: 'session', description: 'Read-only current-account diagnostics.', commands: {
    help: ({ out }) => print(out, 'session status'),
    status: ({ out }) => { const user = window.__flashFirebase?.auth?.currentUser; const cached = window.FlashOfflineSession?.read?.(); print(out, `firebaseUser=${!!user}`); print(out, `uid=${user?.uid ? '[redacted]' : 'none'}`); print(out, `offlineVerificationCache=${!!cached}`); }
  }});

  const extensionCatalog = Object.freeze({
    network: { trusted: true, name: 'network', description: 'Connection type, online state, and estimated downlink.', commands: {
      help: ({ out }) => print(out, 'network status'),
      status: ({ out }) => { print(out, `online=${navigator.onLine}`); print(out, `connection=${navigator.connection?.effectiveType || 'unknown'}`); print(out, `downlink=${navigator.connection?.downlink ?? 'unknown'} Mbps`); }
    }},
    performance: { trusted: true, name: 'performance', description: 'Page timing and memory information when the browser exposes it.', commands: {
      help: ({ out }) => print(out, 'performance timing | performance memory'),
      timing: ({ out }) => { const t = performance.getEntriesByType('navigation')[0]; print(out, t ? `dom=${Math.round(t.domContentLoadedEventEnd)}ms | load=${Math.round(t.loadEventEnd)}ms | transfer=${t.transferSize ?? 'unknown'} bytes` : 'Navigation timing unavailable.'); },
      memory: ({ out }) => { const m = performance.memory; print(out, m ? `used=${Math.round(m.usedJSHeapSize / 1048576)} MB | total=${Math.round(m.totalJSHeapSize / 1048576)} MB | limit=${Math.round(m.jsHeapSizeLimit / 1048576)} MB` : 'Memory metrics are not available in this browser.'); }
    }},
    device: { trusted: true, name: 'device', description: 'Screen, platform, language, and hardware information.', commands: {
      help: ({ out }) => print(out, 'device info | device screen'),
      info: ({ out }) => { print(out, `platform=${navigator.platform || 'unknown'}`); print(out, `cores=${navigator.hardwareConcurrency || 'unknown'}`); print(out, `memory=${navigator.deviceMemory ? `${navigator.deviceMemory} GB` : 'unknown'}`); print(out, `language=${navigator.language}`); },
      screen: ({ out }) => print(out, `${screen.width}x${screen.height} @ ${devicePixelRatio}x | available=${screen.availWidth}x${screen.availHeight}`)
    }},
    media: { trusted: true, name: 'media', description: 'Check browser media and display capabilities.', commands: {
      help: ({ out }) => print(out, 'media fullscreen | media pictureinpicture'),
      fullscreen: ({ out }) => print(out, `fullscreen=${!!document.fullscreenElement} | supported=${!!document.documentElement.requestFullscreen}`),
      pictureinpicture: ({ out }) => print(out, `pictureInPicture=${document.pictureInPictureEnabled ? 'supported' : 'unsupported'}`)
    }},
    serviceworker: { trusted: true, name: 'serviceworker', description: 'Inspect the active service worker registration.', commands: {
      help: ({ out }) => print(out, 'serviceworker status'),
      status: async ({ out }) => { if (!navigator.serviceWorker) return print(out, 'Service workers are unavailable.'); const r = await navigator.serviceWorker.getRegistration(); print(out, `controller=${!!navigator.serviceWorker.controller} | registration=${!!r} | state=${r?.active?.state || 'none'}`); }
    }},
    storage: { trusted: true, name: 'storage', description: 'Read-only browser storage availability and quota.', commands: {
      help: ({ out }) => print(out, 'storage estimate'),
      estimate: async ({ out }) => { if (!navigator.storage?.estimate) return print(out, 'Storage estimate is unavailable.'); const e = await navigator.storage.estimate(); print(out, `usage=${e.usage != null ? `${Math.round(e.usage / 1048576)} MB` : 'unknown'} | quota=${e.quota != null ? `${Math.round(e.quota / 1048576)} MB` : 'unknown'}`); }
    }}
  });
  const installedExtensions = new Set();

  const moduleUI = (out) => {
    const wrap = document.createElement('div'); wrap.className = 'terminal-modules';
    const available = Object.values(extensionCatalog).filter((mod) => !state.modules.has(mod.name));
    if (!available.length) { print(out, 'All optional modules are installed.'); return; }
    available.forEach((mod) => {
      const card = document.createElement('div'); card.className = 'terminal-module';
      const info = document.createElement('div'); info.className = 'terminal-module-info';
      const name = document.createElement('div'); name.className = 'terminal-module-name'; name.textContent = mod.name;
      const desc = document.createElement('div'); desc.className = 'terminal-module-description'; desc.textContent = mod.description;
      const install = document.createElement('button'); install.type = 'button'; install.className = 'terminal-module-install'; install.textContent = 'Install';
      install.addEventListener('click', () => { if (!add(mod)) return; installedExtensions.add(mod.name); install.disabled = true; install.textContent = 'Installed'; print(out, `Installed ${mod.name}.`); });
      info.append(name, desc); card.append(info, install); wrap.appendChild(card);
    });
    out.appendChild(wrap); out.scrollTop = out.scrollHeight;
  };

  add({ trusted: true, name: 'modules', description: 'Browse and install optional terminal modules.', commands: {
    help: ({ out }) => print(out, 'modules list | modules install | modules available | modules remove <name>'),
    list: ({ out }) => print(out, [...state.modules.keys()].join('\n')),
    available: ({ out }) => print(out, Object.values(extensionCatalog).filter((m) => !state.modules.has(m.name)).map((m) => `${m.name} — ${m.description}`).join('\n') || 'No additional trusted modules available.'),
    install: ({ out, args }) => { const name = args[0]?.toLowerCase(); if (!name) return moduleUI(out); const mod = extensionCatalog[name]; if (!mod) return print(out, 'Module not found. Use modules install to see available modules.', 'error'); if (add(mod)) { installedExtensions.add(name); print(out, `Installed ${name}.`); } },
    remove: ({ out, args }) => { const name = args[0]?.toLowerCase(); if (!installedExtensions.has(name)) return print(out, 'Only optional installed modules can be removed.', 'error'); state.modules.delete(name); installedExtensions.delete(name); print(out, `Removed ${name}.`); }
  }});

  function help(out) {
    print(out, 'Flash Terminal'); print(out, 'Type a module followed by a command. Type clear to clear the terminal.'); print(out, ''); print(out, 'BUILT-IN MODULES');
    print(out, '  system        Basic app/browser status       status, time'); print(out, '  browser       Browser information            info, storage, viewport'); print(out, '  offline       Service worker/cache info      status, caches, games'); print(out, '  localstorage  Safe storage inspection        keys, get <key>'); print(out, '  session       Account diagnostics             status'); print(out, '  modules       Install optional modules        list, install, available, remove'); print(out, ''); print(out, 'OPTIONAL MODULES');
    Object.values(extensionCatalog).forEach((m) => print(out, `  ${m.name.padEnd(13)} ${m.description}`)); print(out, ''); print(out, 'EXAMPLES'); print(out, '  system status'); print(out, '  browser viewport'); print(out, '  offline caches'); print(out, '  modules install'); print(out, '  network status   (after installing network)');
  }

  function run(out, raw) {
    const input = raw.trim(); if (!input) return; state.history.push(input); state.index = state.history.length;
    const parts = input.split(/\s+/); const head = parts.shift().toLowerCase(); if (head === 'clear') { out.textContent = ''; return; } if (head === 'help') { help(out); return; }
    const module = state.modules.get(head); if (!module) return print(out, `Unknown command/module: ${head}`, 'error'); const command = (parts.shift() || 'help').toLowerCase(); const fn = module.commands[command];
    if (typeof fn !== 'function') return print(out, `Unknown ${head} command: ${command}`, 'error'); Promise.resolve(fn({ out, args: parts })).catch(() => print(out, 'Command failed safely.', 'error'));
  }

  function mount() {
    if (document.getElementById('flashTerminal')) return;
    const button = document.createElement('button'); button.className = 'icon-btn flash-terminal-trigger'; button.type = 'button'; button.title = 'Flash Terminal — Option+T'; button.setAttribute('aria-label', 'Flash Terminal — Option+T'); button.innerHTML = '<i data-lucide="terminal"></i>';
    document.querySelector('.top-actions')?.appendChild(button);
    const backdrop = document.createElement('div'); backdrop.id = 'flashTerminal'; backdrop.className = 'modal-backdrop'; backdrop.hidden = true;
    backdrop.innerHTML = '<section class="flash-terminal" role="dialog" aria-modal="true" aria-label="Flash Terminal"><div class="terminal-body"><div class="terminal-toolbar"><div class="terminal-toolbar-title"><span class="terminal-orb"><i data-lucide="terminal"></i></span><div><strong>Flash Terminal</strong><small>Browser diagnostics & tools</small></div></div><div class="terminal-toolbar-actions"><button type="button" data-terminal-action="help"><i data-lucide="circle-help"></i><span>Help</span></button><button type="button" data-terminal-action="clear"><i data-lucide="eraser"></i><span>Clear</span></button></div></div><div id="flashTerminalOutput" class="terminal-output" aria-live="polite"></div><div class="terminal-quick-actions"><span>Quick actions</span><button type="button" data-command="system status">System</button><button type="button" data-command="browser viewport">Viewport</button><button type="button" data-command="offline status">Offline</button><button type="button" data-command="modules install">Modules</button></div><form id="flashTerminalForm" class="terminal-form"><span>&gt;</span><input id="flashTerminalInput" autocomplete="off" spellcheck="false" placeholder="Type a command…"><button type="submit">Run</button></form></div></section>';
    document.body.appendChild(backdrop);
    const out = backdrop.querySelector('#flashTerminalOutput'); const input = backdrop.querySelector('#flashTerminalInput');
    const open = () => { backdrop.hidden = false; input.focus(); if (!out.childElementCount) print(out, 'Flash Terminal ready. Choose a quick action or type help.'); };
    const close = () => { backdrop.hidden = true; };
    button.addEventListener('click', open); backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });
    backdrop.querySelector('#flashTerminalForm').addEventListener('submit', (e) => { e.preventDefault(); const v = input.value; input.value = ''; print(out, `> ${v}`, 'command'); run(out, v); });
    backdrop.querySelectorAll('[data-command]').forEach((action) => action.addEventListener('click', () => { const command = action.dataset.command || ''; input.value = command; backdrop.querySelector('#flashTerminalForm').requestSubmit(); }));
    backdrop.querySelector('[data-terminal-action="help"]').addEventListener('click', () => { print(out, ''); help(out); });
    backdrop.querySelector('[data-terminal-action="clear"]').addEventListener('click', () => { out.textContent = ''; print(out, 'Terminal cleared. Choose a quick action or type help.'); });
    input.addEventListener('keydown', (e) => { if (e.key === 'ArrowUp') { e.preventDefault(); state.index = Math.max(0, state.index - 1); input.value = state.history[state.index] || ''; } if (e.key === 'ArrowDown') { e.preventDefault(); state.index = Math.min(state.history.length, state.index + 1); input.value = state.history[state.index] || ''; } if (e.key === 'Escape') close(); });
    window.addEventListener('keydown', (e) => { if (e.altKey && (e.code === 'KeyT' || e.key.toLowerCase() === 't')) { e.preventDefault(); e.stopPropagation(); open(); } }, true);
    window.lucide?.createIcons?.({ root: backdrop, attrs: { 'stroke-width': 1.5 } }); window.lucide?.createIcons?.({ root: button, attrs: { 'stroke-width': 1.5 } });
  }
  function boot() { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true }); else mount(); }
  boot();
})();
