(() => {
  'use strict';

  let hideTimer = 0;

  const icon = (name) => `<i data-lucide="${name}"></i>`;
  const toast = (title, message, type = 'info') => window.FlashUI?.toast?.(title, message, type);

  function installControls() {
    const overlay = document.getElementById('playerOverlay');
    const shell = overlay?.querySelector('.player-shell');
    const oldClose = document.getElementById('closePlayer');
    if (!overlay || !shell || shell.querySelector('.player-controls')) return;

    const notch = document.createElement('button');
    notch.className = 'player-notch';
    notch.type = 'button';
    notch.setAttribute('aria-label', 'Show game controls');
    shell.appendChild(notch);

    const controls = document.createElement('div');
    controls.className = 'player-controls';
    controls.innerHTML = `<button class="player-control performance" data-player-action="performance">${icon('gauge')}<span>Performance+</span></button><button class="player-control" data-player-action="fullscreen">${icon('maximize')}<span>Fullscreen</span></button><button class="player-control close" data-player-action="close">${icon('x')}<span>Close game</span></button>`;
    shell.appendChild(controls);

    if (oldClose) oldClose.hidden = true;
    const show = () => {
      shell.classList.add('player-controls-visible');
      clearTimeout(hideTimer);
      hideTimer = window.setTimeout(() => shell.classList.remove('player-controls-visible'), 1800);
    };
    notch.addEventListener('mouseenter', show);
    notch.addEventListener('focus', show);
    controls.addEventListener('mouseenter', () => clearTimeout(hideTimer));
    controls.addEventListener('mouseleave', () => {
      clearTimeout(hideTimer);
      hideTimer = window.setTimeout(() => shell.classList.remove('player-controls-visible'), 900);
    });
    notch.addEventListener('click', show);

    controls.addEventListener('click', async (event) => {
      const button = event.target.closest('[data-player-action]');
      if (!button) return;
      const action = button.dataset.playerAction;
      if (action === 'close') {
        document.getElementById('closePlayer')?.click();
        return;
      }
      if (action === 'performance') {
        const active = !document.body.classList.contains('player-performance');
        document.body.classList.toggle('player-performance', active);
        button.classList.toggle('active', active);
        localStorage.setItem('flashgames.playerPerformance', active ? '1' : '0');
        toast(active ? 'Performance+ enabled' : 'Performance+ disabled', 'Reduces player UI overhead without changing game quality.', 'success');
        show();
        return;
      }
      if (action === 'fullscreen') {
        try {
          if (document.fullscreenElement) await document.exitFullscreen();
          else await shell.requestFullscreen();
        } catch (error) {
          toast('Fullscreen unavailable', error.message || 'The browser denied fullscreen.', 'error');
        }
        show();
      }
    });

    if (localStorage.getItem('flashgames.playerPerformance') === '1') {
      document.body.classList.add('player-performance');
      controls.querySelector('[data-player-action="performance"]')?.classList.add('active');
    }
    window.lucide?.createIcons?.({ root: controls, attrs: { 'stroke-width': 1.5 } });
  }

  function watchPlayer() {
    const overlay = document.getElementById('playerOverlay');
    if (!overlay) return;
    const observer = new MutationObserver(() => {
      if (!overlay.hidden) installControls();
    });
    observer.observe(overlay, { attributes: true, attributeFilter: ['hidden'] });
    if (!overlay.hidden) installControls();
  }

  window.addEventListener('DOMContentLoaded', watchPlayer, { once: true });
})();
