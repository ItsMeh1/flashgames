(() => {
  'use strict';

  const icon = (name) => `<i data-lucide="${name}"></i>`;
  const toast = (title, message, type = 'info') => window.FlashUI?.toast?.(title, message, type);

  function openModal() {
    let backdrop = document.getElementById('customInstallBackdrop');
    if (!backdrop) {
      backdrop = document.createElement('div');
      backdrop.className = 'modal-backdrop';
      backdrop.id = 'customInstallBackdrop';
      backdrop.innerHTML = `<section class="custom-install-modal glass" role="dialog" aria-modal="true" aria-labelledby="customInstallTitle"><div class="panel-head"><div><span class="eyebrow">CUSTOM GAME</span><h2 id="customInstallTitle">Install from URL</h2></div><button class="icon-btn" data-custom-close aria-label="Close">${icon('x')}</button></div><div class="custom-install-body"><label>Game URL<input id="customGameUrl" type="url" placeholder="https://raw.githubusercontent.com/.../game.html" autocomplete="url"></label><label>Name<input id="customGameName" type="text" placeholder="My Game"></label><label>Description<input id="customGameDescription" type="text" placeholder="A game I added myself"></label><label>Favicon / cover URL or data URI<input id="customGameCover" type="text" placeholder="https://.../icon.png or data:image/png;base64,..."></label><p class="custom-install-help">Only this button accepts a manually supplied URL. Store installation remains separate and installs the selected catalogue game.</p></div><div class="custom-install-actions"><button class="btn" data-custom-close>Cancel</button><button class="btn primary" id="customInstallSubmit">${icon('download')} Install from URL</button></div></section>`;
      document.body.appendChild(backdrop);
      backdrop.addEventListener('click', (event) => {
        if (event.target === backdrop || event.target.closest('[data-custom-close]')) closeModal();
      });
      backdrop.querySelector('#customInstallSubmit').addEventListener('click', install);
      window.lucide?.createIcons?.({ root: backdrop, attrs: { 'stroke-width': 1.5 } });
    }
    backdrop.hidden = false;
    backdrop.querySelector('#customGameUrl')?.focus();
  }

  function closeModal() {
    const backdrop = document.getElementById('customInstallBackdrop');
    if (backdrop) backdrop.hidden = true;
  }

  async function install() {
    const url = document.getElementById('customGameUrl')?.value.trim();
    const name = document.getElementById('customGameName')?.value.trim();
    const description = document.getElementById('customGameDescription')?.value.trim();
    const cover = document.getElementById('customGameCover')?.value.trim();
    const button = document.getElementById('customInstallSubmit');
    if (!url) { toast('URL required', 'Enter the direct HTML game URL.', 'error'); return; }
    button.disabled = true;
    try {
      const game = await window.FlashGamesStore.installCustom({ url, name, description, cover });
      toast('Game installed', `${game.name} is now available offline.`, 'success');
      closeModal();
      location.hash = '#library';
      location.reload();
    } catch (error) {
      toast('Install failed', error.message || 'The game could not be downloaded.', 'error');
    } finally { button.disabled = false; }
  }

  function addLibraryButton() {
    const view = document.getElementById('libraryView');
    const head = view?.querySelector('.page-head');
    if (!head || head.querySelector('.custom-install-trigger')) return;
    const button = document.createElement('button');
    button.className = 'btn custom-install-trigger';
    button.innerHTML = `${icon('link')} Install from URL`;
    button.addEventListener('click', openModal);
    head.appendChild(button);
    window.lucide?.createIcons?.({ root: button, attrs: { 'stroke-width': 1.5 } });
  }

  function init() {
    addLibraryButton();
    document.addEventListener('click', (event) => {
      const library = event.target.closest('#libraryView');
      if (!library) return;
      if (event.target.closest('[data-route="store"]')) {
        /* This is the normal Store button. Never hijack it into custom URL install. */
        requestAnimationFrame(addLibraryButton);
        return;
      }
      if (event.target.closest('.custom-install-trigger')) return;
      requestAnimationFrame(addLibraryButton);
    }, { passive: true });
  }

  window.addEventListener('DOMContentLoaded', init, { once: true });
})();
