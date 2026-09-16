(() => {
  'use strict';

  const REPO = 'ItsMeh1/flashgames';
  const BRANCH = 'v4';
  const escapeHtml = (value) => String(value ?? '').replace(/[&<>\"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '\"':'&quot;', "'":'&#39;' }[c]));
  const refreshIcons = (root) => { try { window.lucide?.createIcons?.({ root, attrs: { 'stroke-width': 1.5 } }); } catch (_) {} };
  const brand = document.querySelector('.brand');
  if (!brand || document.getElementById('flashCommitInfo')) return;
  const currentName = brand.dataset.commitName || 'Current Flash Games update';
  brand.title = currentName;
  brand.setAttribute('aria-label', `Flash Games — ${currentName}`);
  const info = document.createElement('button');
  info.id = 'flashCommitInfo'; info.type = 'button'; info.className = 'flash-commit-info';
  info.setAttribute('aria-label', 'View current change information'); info.title = 'View current change information';
  info.innerHTML = '<i data-lucide="info"></i>'; brand.insertAdjacentElement('afterend', info);
  const modal = document.createElement('div'); modal.className = 'flash-commit-backdrop'; modal.hidden = true;
  modal.innerHTML = `<section class="flash-commit-modal glass" role="dialog" aria-modal="true" aria-labelledby="flashCommitTitle"><div class="flash-commit-head"><div><span class="eyebrow">CURRENT CHANGE</span><h2 id="flashCommitTitle">${escapeHtml(currentName)}</h2></div><button type="button" class="icon-btn" data-commit-close aria-label="Close"><i data-lucide="x"></i></button></div><div class="flash-current-commit"><span>Commit history</span><strong>See the full history in Changes → Commits.</strong><small>Each commit includes its message, author, date, summary, and file-level details.</small></div></section>`;
  document.body.appendChild(modal);
  const open = () => { modal.hidden = false; document.body.classList.add('flash-commit-open'); refreshIcons(modal); };
  const close = () => { modal.hidden = true; document.body.classList.remove('flash-commit-open'); };
  info.addEventListener('click', open); modal.querySelector('[data-commit-close]').addEventListener('click', close); modal.addEventListener('click', event => { if (event.target === modal) close(); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && !modal.hidden) close(); }); refreshIcons(info);
})();
