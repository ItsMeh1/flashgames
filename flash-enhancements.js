(() => {
  'use strict';

  const esc = (value) => window.FlashData?.esc ? window.FlashData.esc(value) : String(value ?? '').replace(/[&<>\"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]));
  const icon = (name) => `<i data-lucide="${name}"></i>`;

  const cloudCatalog = [
    { id:'roblox-cloud', name:'Roblox Cloud', provider:'now.gg', url:'https://now.gg/apps/roblox-corporation/5349/roblox.html', description:'Roblox cloud-streaming entry. now.gg currently redirects this legacy app URL on some visits, so Flash keeps an Open fallback.', icon:'box' },
    { id:'nowgg-games', name:'now.gg Games', provider:'now.gg', url:'https://now.gg/', description:'Browser cloud catalog with many streamed games.', icon:'cloud' },
    { id:'minecraft-cloud', name:'Minecraft Games Cloud', provider:'now.gg', url:'https://now.gg/games/minecraft.html', description:'Cloud/browser catalog for Minecraft-style and related games.', icon:'blocks' },
    { id:'xbox-cloud', name:'Xbox Cloud Gaming', provider:'Xbox', url:'https://www.xbox.com/play', description:'Microsoft cloud gaming web experience. Sign-in or subscription may be required.', icon:'gamepad-2' },
    { id:'geforce-cloud', name:'GeForce NOW', provider:'NVIDIA', url:'https://play.geforcenow.com/', description:'NVIDIA cloud gaming web client. Account and game availability vary.', icon:'monitor-play' },
    { id:'raccoon-cloud', name:'Raccoon Cloud Games', provider:'Raccoon Game', url:'https://www.raccoongame.com/wap/dist/', description:'Raccoon Game cloud-game web client.', icon:'rabbit' },
    { id:'yom-cloud', name:'YOM Instant Cloud Games', provider:'YOM', url:'https://yom.net/demo/', description:'YOM cloud-game demos and browser streaming.', icon:'zap' }
  ];

  function refreshIcons(root = document) {
    try { window.lucide?.createIcons?.({ root, attrs:{'stroke-width':1.5,width:18,height:18} }); } catch (_) {}
  }

  function installBanner() {
    if (document.getElementById('flashInstallBanner')) return;
    const headings = [...document.querySelectorAll('h1,h2,h3')];
    const heading = headings.find((node) => /play anything/i.test(node.textContent || ''));
    if (!heading) return;
    const host = heading.closest('.hero,section,.home-hero,.banner,.glass') || heading.parentElement;
    if (!host || host.parentElement?.querySelector('#flashInstallBanner')) return;
    const banner = document.createElement('section');
    banner.id = 'flashInstallBanner';
    banner.className = 'flash-install-banner';
    banner.innerHTML = `<div class="flash-install-icon">${icon('download')}${icon('sparkles')}</div><div class="flash-install-copy"><span class="flash-install-kicker">APP</span><h3>Install Flash Games</h3><p>Keep Flash Games one click away and get the app-like experience.</p></div><button class="flash-install-button" type="button"><span>Install app</span>${icon('download')}</button>`;
    host.insertAdjacentElement('afterend', banner);
    const button = banner.querySelector('.flash-install-button');
    let deferred = null;
    window.addEventListener('beforeinstallprompt', (event) => { event.preventDefault(); deferred = event; button.disabled = false; button.querySelector('span').textContent = 'Install app'; });
    button.addEventListener('click', async () => {
      if (deferred) {
        deferred.prompt();
        try { await deferred.userChoice; } catch (_) {}
        deferred = null;
        button.disabled = true;
        button.querySelector('span').textContent = 'Installed';
        return;
      }
      const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
      if (standalone) {
        button.querySelector('span').textContent = 'Already installed';
        return;
      }
      banner.classList.toggle('show-install-help');
      button.querySelector('span').textContent = 'Install help';
    });
    refreshIcons(banner);
  }

  function renderCloudHub() {
    const view = document.getElementById('cloudView');
    if (!view || view.dataset.flashCloudEnhanced === '1') return;
    if (!/cloud/i.test(location.hash || '')) return;
    view.dataset.flashCloudEnhanced = '1';
    view.innerHTML = `<div class="flash-cloud-page"><div class="page-head"><div><span class="eyebrow">CLOUD GAMING</span><h1>Play in the cloud</h1><p>Streaming clients are embedded below when the provider permits framing. If a provider blocks embeds, use Open instead.</p></div></div><div class="flash-cloud-grid">${cloudCatalog.map(card => `<article class="flash-cloud-card" data-cloud-id="${esc(card.id)}"><div class="flash-cloud-card-head"><div class="flash-cloud-icon">${icon(card.icon)}</div><div><h3>${esc(card.name)}</h3><span>${esc(card.provider)}</span></div><a class="flash-cloud-open" href="${esc(card.url)}" target="_blank" rel="noopener noreferrer">Open ${icon('external-link')}</a></div><p>${esc(card.description)}</p><div class="flash-cloud-frame-wrap"><div class="flash-cloud-loading"><span></span><strong>Loading cloud game...</strong></div><iframe class="flash-cloud-frame" src="${esc(card.url)}" title="${esc(card.name)}" loading="lazy" allow="fullscreen; autoplay; gamepad; clipboard-read; clipboard-write" referrerpolicy="strict-origin-when-cross-origin"></iframe></div></article>`).join('')}</div></div>`;
    refreshIcons(view);
    view.querySelectorAll('.flash-cloud-frame').forEach((frame) => frame.addEventListener('load', () => frame.closest('.flash-cloud-frame-wrap')?.classList.add('loaded'), { once:true }));
  }

  function enhanceOnlineDownloads() {
    const games = new Map();
    const wrapLumin = () => {
      const lumin = window.Lumin;
      if (!lumin || lumin.__flashDownloadEnhancer) return;
      lumin.__flashDownloadEnhancer = true;
      const original = lumin.getGames?.bind(lumin);
      if (!original) return;
      lumin.getGames = async (...args) => {
        const result = await original(...args);
        const list = Array.isArray(result?.games) ? result.games : Array.isArray(result) ? result : [];
        list.forEach((game) => games.set(String(game.id || game.game_id || game.slug || game.name), game));
        queueMicrotask(() => window.FlashOnlineCache?.cacheGames?.(list));
        return result;
      };
    };
    wrapLumin();
    const timer = setInterval(() => { wrapLumin(); if (window.Lumin?.__flashDownloadEnhancer) clearInterval(timer); }, 250);
    const addButtons = () => {
      document.querySelectorAll('.game-card[data-lumin-id]').forEach((card) => {
        if (card.querySelector('[data-flash-online-download]')) return;
        const rawId = card.dataset.luminId;
        const game = games.get(rawId);
        const overlay = card.querySelector('.card-overlay');
        if (!overlay) return;
        const button = document.createElement('button');
        button.className = 'expand-action flash-online-download';
        button.dataset.flashOnlineDownload = '1';
        button.innerHTML = `${icon('download')}<span>Download</span>`;
        button.addEventListener('click', async (event) => {
          event.preventDefault(); event.stopPropagation();
          const current = games.get(rawId) || game;
          if (!current) return;
          button.disabled = true;
          button.querySelector('span').textContent = 'Downloading…';
          try {
            const ok = await window.FlashOnlineCache?.cacheOne?.(current);
            button.querySelector('span').textContent = ok ? 'Downloaded' : 'Unavailable';
          } catch (_) { button.querySelector('span').textContent = 'Failed'; }
          setTimeout(() => { button.disabled = false; if (button.querySelector('span').textContent !== 'Downloaded') button.querySelector('span').textContent = 'Download'; }, 1800);
        });
        overlay.appendChild(button);
        refreshIcons(button);
      });
    };
    new MutationObserver(addButtons).observe(document.body, { childList:true, subtree:true });
    addButtons();
  }

  function terminalUI() {
    const output = document.getElementById('flashTerminalOutput');
    if (!output || output.dataset.flashTerminalEnhanced === '1') return;
    output.dataset.flashTerminalEnhanced = '1';
    const colorize = (line) => {
      if (line.dataset.colored === '1') return;
      const text = line.textContent || '';
      const frag = document.createDocumentFragment();
      const parts = text.split(/(\b(?:online|offline|controller|registration|state|connection|downlink|usage|quota|platform|cores|memory|language|fullscreen|supported|pictureInPicture|visibility|firebaseUser|uid|version)\b|(?:https?:\/\/[^\s]+)|(?:\b\d+(?:\.\d+)?(?:\s*(?:MB|GB|Mbps|ms|bytes|x))?\b)|(?:\[[^\]]+\])|(?:--[^\s]+)/gi);
      parts.forEach((part, index) => {
        if (!part) return;
        const span = document.createElement('span');
        if (/^https?:\/\//i.test(part)) span.className = 'syntax-url';
        else if (/^\d/.test(part)) span.className = 'syntax-number';
        else if (/^\[.*\]$/.test(part)) span.className = 'syntax-tag';
        else if (/^(?:online|offline|controller|registration|state|connection|downlink|usage|quota|platform|cores|memory|language|fullscreen|supported|pictureInPicture|visibility|firebaseUser|uid|version)$/i.test(part)) span.className = 'syntax-key';
        else if (/^--/.test(part)) span.className = 'syntax-flag';
        else span.className = index % 2 ? 'syntax-text' : '';
        span.textContent = part; frag.appendChild(span);
      });
      line.textContent = ''; line.appendChild(frag); line.dataset.colored = '1';
    };
    const observer = new MutationObserver(() => output.querySelectorAll('.terminal-line').forEach(colorize));
    observer.observe(output, { childList:true, subtree:true });
    output.querySelectorAll('.terminal-line').forEach(colorize);
    const quick = document.createElement('div');
    quick.className = 'terminal-quick-actions';
    quick.innerHTML = `<span>Quick actions</span><button type="button" data-command="help">Help</button><button type="button" data-command="system status">System</button><button type="button" data-command="browser viewport">Viewport</button><button type="button" data-command="modules install">Modules</button><button type="button" data-command="network status">Network</button>`;
    output.parentElement?.insertBefore(quick, output);
    quick.querySelectorAll('button').forEach((button) => button.addEventListener('click', () => {
      const input = document.getElementById('flashTerminalInput');
      const form = document.getElementById('flashTerminalForm');
      if (!input || !form) return;
      input.value = button.dataset.command || '';
      form.requestSubmit();
    }));
  }

  function boot() {
    installBanner();
    renderCloudHub();
    enhanceOnlineDownloads();
    terminalUI();
    refreshIcons(document);
  }
  const observer = new MutationObserver(() => { installBanner(); renderCloudHub(); terminalUI(); });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once:true }); else boot();
  observer.observe(document.documentElement, { childList:true, subtree:true });
})();
