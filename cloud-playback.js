(() => {
  'use strict';

  function openCloud(url, name) {
    if (!url) return;
    const overlay = document.getElementById('playerOverlay');
    const frame = document.getElementById('gameFrame');
    if (!overlay || !frame) return window.open(url, '_blank', 'noopener,noreferrer');
    const title = name || 'Cloud Game';
    frame.title = title;
    frame.src = url;
    overlay.hidden = false;
    document.body.classList.add('player-open');
    window.lucide?.createIcons?.({ root: overlay, attrs: { 'stroke-width': 1.5 } });
  }

  document.addEventListener('click', (event) => {
    const button = event.target.closest('[data-cloud-url]');
    if (!button) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const card = button.closest('.cloud-game-card');
    const name = card?.querySelector('h3')?.textContent || 'Cloud Game';
    openCloud(button.dataset.cloudUrl, name);
  }, true);

  window.FlashCloudPlayer = { open: openCloud };

  function loadEnhancements() {
    if (!document.querySelector('link[data-flash-enhancements-css]')) {
      const css = document.createElement('link');
      css.rel = 'stylesheet';
      css.href = './flash-enhancements.css';
      css.dataset.flashEnhancementsCss = '1';
      document.head?.appendChild(css);
    }
    if (document.querySelector('script[data-flash-enhancements]')) return;
    const script = document.createElement('script');
    script.src = './flash-enhancements.js';
    script.dataset.flashEnhancements = '1';
    script.async = false;
    script.onerror = () => {};
    (document.body || document.head || document.documentElement).appendChild(script);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', loadEnhancements, { once: true });
  else loadEnhancements();
})();
