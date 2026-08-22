(() => {
  'use strict';

  let scheduled = false;
  let syncing = false;

  function toast(title, message, type = 'info') {
    window.FlashUI?.toast?.(title, message, type);
  }

  function addSyncButton() {
    const pageHead = document.querySelector('#storeView .page-head');
    if (!pageHead || pageHead.querySelector('.sync-button')) return;
    const button = document.createElement('button');
    button.className = 'btn sync-button';
    button.type = 'button';
    button.innerHTML = '<i data-lucide="refresh-cw"></i><span>Sync games</span>';
    button.addEventListener('click', async () => {
      if (syncing) return;
      syncing = true;
      button.classList.add('is-syncing');
      button.disabled = true;
      try {
        const result = await window.FlashData.syncGames();
        toast('Catalogue synced', `${result.games.length.toLocaleString()} games are up to date.`, 'success');
        window.dispatchEvent(new CustomEvent('flashgames:catalogue-synced', { detail: result }));
      } catch (error) {
        toast('Sync failed', error.message || 'The catalogue could not be refreshed.', 'error');
      } finally {
        syncing = false;
        button.classList.remove('is-syncing');
        button.disabled = false;
      }
    });
    pageHead.appendChild(button);
    window.lucide?.createIcons?.({ root: button, attrs: { 'stroke-width': 1.5 } });
  }

  function scheduleStoreCheck() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      addSyncButton();
    });
  }

  window.FlashGamesSync = { refresh: addSyncButton };
  window.addEventListener('DOMContentLoaded', () => {
    scheduleStoreCheck();
    window.addEventListener('hashchange', scheduleStoreCheck, { passive: true });
  }, { once: true });
})();