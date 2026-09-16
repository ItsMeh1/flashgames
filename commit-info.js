(() => {
  'use strict';

  const REPO = 'ItsMeh1/flashgames';
  const BRANCH = 'v4';
  const escapeHtml = (value) => String(value ?? '').replace(/[&<>\"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '\"':'&quot;', "'":'&#39;' }[c]));
  const refreshIcons = (root) => { try { window.lucide?.createIcons?.({ root, attrs: { 'stroke-width': 1.5 } }); } catch (_) {} };
  const brand = document.querySelector('.brand');
  if (!brand || document.getElementById('flashCommitInfo')) return;

  const currentName = brand.dataset.commitName || 'v4: add commit name and history to brand';
  brand.title = currentName;
  brand.setAttribute('aria-label', `Flash Games — ${currentName}`);

  const info = document.createElement('button');
  info.id = 'flashCommitInfo';
  info.type = 'button';
  info.className = 'flash-commit-info';
  info.setAttribute('aria-label', 'View commit information');
  info.title = 'View commit history';
  info.innerHTML = '<i data-lucide="info"></i>';
  brand.insertAdjacentElement('afterend', info);

  const modal = document.createElement('div');
  modal.className = 'flash-commit-backdrop';
  modal.hidden = true;
  modal.innerHTML = `<section class="flash-commit-modal glass" role="dialog" aria-modal="true" aria-labelledby="flashCommitTitle"><div class="flash-commit-head"><div><span class="eyebrow">VERSION HISTORY</span><h2 id="flashCommitTitle">Commits</h2></div><button type="button" class="icon-btn" data-commit-close aria-label="Close"><i data-lucide="x"></i></button></div><div class="flash-current-commit"><span>Current commit</span><strong>${escapeHtml(currentName)}</strong><code id="flashCurrentSha">Loading…</code></div><div id="flashCommitList" class="flash-commit-list"><div class="flash-commit-loading">Loading commit history…</div></div></section>`;
  document.body.appendChild(modal);

  async function loadHistory() {
    const list = document.getElementById('flashCommitList');
    try {
      const response = await fetch(`https://api.github.com/repos/${REPO}/commits?sha=${BRANCH}&per_page=20`, { cache: 'no-store', headers: { Accept: 'application/vnd.github+json' } });
      if (!response.ok) throw new Error(`GitHub returned ${response.status}`);
      const commits = await response.json();
      const current = commits[0];
      if (current) document.getElementById('flashCurrentSha').textContent = current.sha.slice(0, 7);
      list.innerHTML = commits.map((commit, index) => {
        const message = String(commit.commit?.message || '').split('\n')[0];
        const date = commit.commit?.author?.date ? new Date(commit.commit.author.date).toLocaleString() : '';
        return `<article class="flash-commit-item${index === 0 ? ' current' : ''}"><div class="flash-commit-dot"></div><div class="flash-commit-main"><div class="flash-commit-row"><strong>${escapeHtml(message)}</strong><code>${escapeHtml(commit.sha.slice(0, 7))}</code></div><small>${escapeHtml(date)}${index === 0 ? ' · Current' : ''}</small><a href="https://github.com/${REPO}/commit/${encodeURIComponent(commit.sha)}" target="_blank" rel="noopener noreferrer">View commit <i data-lucide="external-link"></i></a></div></article>`;
      }).join('');
      refreshIcons(list);
    } catch (error) {
      list.innerHTML = `<div class="flash-commit-error">Could not load GitHub commit history right now.<br><small>${escapeHtml(error.message)}</small></div>`;
    }
  }

  const open = () => { modal.hidden = false; document.body.classList.add('flash-commit-open'); refreshIcons(modal); loadHistory(); };
  const close = () => { modal.hidden = true; document.body.classList.remove('flash-commit-open'); };
  info.addEventListener('click', open);
  modal.querySelector('[data-commit-close]').addEventListener('click', close);
  modal.addEventListener('click', event => { if (event.target === modal) close(); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && !modal.hidden) close(); });
  refreshIcons(info);
})();
