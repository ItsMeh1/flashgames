(() => {
  'use strict';

  const icon = (name) => `<i data-lucide="${name}"></i>`;

  function closeStats() { document.getElementById('flashStatsBackdrop')?.remove(); }

  function openStats() {
    closeStats();
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.id = 'flashStatsBackdrop';
    backdrop.innerHTML = `<section class="notification-modal glass" role="dialog" aria-modal="true" aria-labelledby="flashStatsTitle"><div class="panel-head"><div><span class="eyebrow">ACTIVITY</span><h2 id="flashStatsTitle">Your stats</h2></div><button class="icon-btn" id="closeFlashStats" aria-label="Close">${icon('x')}</button></div><div class="stats-grid"><div><strong id="flashStatPlayed">0</strong><span>Games played</span></div><div><strong id="flashStatInstalls">0</strong><span>Installed</span></div><div><strong id="flashStatTime">0m</strong><span>Time played</span></div><div><strong id="flashStatMember">New Member</strong><span>Member level</span></div></div></section>`;
    document.body.appendChild(backdrop);
    const stored = JSON.parse(localStorage.getItem('flashgames.stats') || '{}');
    const played = Number(stored.played || 0);
    const installs = Number(stored.installs || 0);
    const minutes = Math.floor(Number(stored.time || 0) / 60000);
    const member = played >= 100 || minutes >= 600 ? 'Elite Member' : played >= 30 || minutes >= 120 || installs >= 30 ? 'Dedicated Member' : played >= 5 || installs >= 5 ? 'Active Member' : 'New Member';
    backdrop.querySelector('#flashStatPlayed').textContent = String(played);
    backdrop.querySelector('#flashStatInstalls').textContent = String(installs);
    backdrop.querySelector('#flashStatTime').textContent = `${minutes}m`;
    backdrop.querySelector('#flashStatMember').textContent = member;
    backdrop.addEventListener('click', (event) => { if (event.target === backdrop || event.target.closest('#closeFlashStats')) closeStats(); });
    window.lucide?.createIcons?.({ root: backdrop, attrs: { 'stroke-width': 1.5 } });
  }

  function init() {
    document.addEventListener('click', (event) => {
      const stats = event.target.closest('#openStats');
      if (!stats) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      openStats();
    }, true);
  }

  window.addEventListener('DOMContentLoaded', init, { once: true });
})();
