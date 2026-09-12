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
})();
