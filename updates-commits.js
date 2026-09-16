(() => {
  'use strict';

  const REPO = 'ItsMeh1/flashgames';
  const BRANCH = 'v4';
  let loaded = false;

  const esc = (value) => String(value ?? '').replace(/[&<>\"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '\"':'&quot;', "'":'&#39;' }[c]));
  const icon = (name) => `<i data-lucide="${name}"></i>`;
  const refreshIcons = (root) => { try { window.lucide?.createIcons?.({ root, attrs:{'stroke-width':1.5,width:17,height:17} }); } catch (_) {} };

  function commitCard(commit, index) {
    const data = commit.commit || {};
    const message = String(data.message || 'Untitled commit').split('\n')[0];
    const date = data.author?.date ? new Date(data.author.date).toLocaleString() : 'Unknown date';
    const author = data.author?.name || commit.author?.login || 'Unknown author';
    return `<article class="change-commit glass" data-commit-sha="${esc(commit.sha)}"><div class="change-commit-top"><div class="change-commit-icon">${icon(index === 0 ? 'git-commit-horizontal' : 'git-branch')}</div><div class="change-commit-heading"><div class="change-commit-title-row"><h3>${esc(message)}</h3>${index === 0 ? '<span class="change-current">Current</span>' : ''}</div><div class="change-commit-meta"><span>${esc(author)}</span><span>•</span><span>${esc(date)}</span><code>${esc(commit.sha.slice(0,7))}</code></div></div></div><p class="change-commit-summary">${esc(message)}${data.message && data.message.includes('\n') ? ` — ${esc(data.message.split('\n').slice(1).join(' ').trim())}` : ''}</p><button class="change-commit-details" type="button" data-commit-details="${esc(commit.sha)}">${icon('list-tree')}<span>View details</span>${icon('chevron-down')}</button><div class="change-commit-detail" data-detail-for="${esc(commit.sha)}" hidden></div></article>`;
  }

  async function loadCommitDetails(card, sha) {
    const detail = card.querySelector(`[data-detail-for="${CSS.escape(sha)}"]`);
    const button = card.querySelector(`[data-commit-details="${CSS.escape(sha)}"]`);
    if (!detail || !button) return;
    if (!detail.hidden) { detail.hidden = true; button.querySelector('svg:last-child')?.remove(); button.insertAdjacentHTML('beforeend', icon('chevron-down')); refreshIcons(button); return; }
    detail.hidden = false; detail.innerHTML = `<div class="change-detail-loading">${icon('loader-circle')} Loading commit details…</div>`; refreshIcons(detail);
    try {
      const response = await fetch(`https://api.github.com/repos/${REPO}/commits/${encodeURIComponent(sha)}`, { cache:'no-store', headers:{Accept:'application/vnd.github+json'} });
      if (!response.ok) throw new Error(`GitHub returned ${response.status}`);
      const commit = await response.json();
      const stats = commit.stats || {};
      const files = Array.isArray(commit.files) ? commit.files : [];
      detail.innerHTML = `<div class="change-detail-stats"><span>${icon('file-plus')} ${Number(stats.additions || 0).toLocaleString()} additions</span><span>${icon('file-minus')} ${Number(stats.deletions || 0).toLocaleString()} deletions</span><span>${icon('files')} ${files.length} file${files.length === 1 ? '' : 's'}</span></div>${files.length ? `<div class="change-file-list">${files.map(file => `<div class="change-file"><span>${icon(file.status === 'added' ? 'plus' : file.status === 'removed' ? 'minus' : 'file-pen-line')}${esc(file.filename)}</span><small>${esc(file.status || 'modified')} · +${Number(file.additions || 0)} / −${Number(file.deletions || 0)}</small></div>`).join('')}</div>` : '<div class="change-detail-empty">No file-level details were returned.</div>'}`;
      button.querySelector('svg:last-child')?.remove(); button.insertAdjacentHTML('beforeend', icon('chevron-up')); refreshIcons(detail); refreshIcons(button);
    } catch (error) { detail.innerHTML = `<div class="change-detail-error">${icon('circle-alert')} Could not load details. ${esc(error.message)}</div>`; refreshIcons(detail); }
  }

  async function loadCommits(target) {
    if (loaded) return;
    const list = target.querySelector('#changeCommits'); if (!list) return;
    list.innerHTML = `<div class="change-loading glass">${icon('loader-circle')}<strong>Loading commits</strong><span>Building the project history…</span></div>`; refreshIcons(list);
    try {
      const response = await fetch(`https://api.github.com/repos/${REPO}/commits?sha=${BRANCH}&per_page=20`, { cache:'no-store', headers:{Accept:'application/vnd.github+json'} });
      if (!response.ok) throw new Error(`GitHub returned ${response.status}`);
      const commits = await response.json();
      list.innerHTML = Array.isArray(commits) && commits.length ? commits.map(commitCard).join('') : `<div class="change-loading glass">${icon('history')}<strong>No commits yet</strong><span>Project history will appear here.</span></div>`;
      refreshIcons(list);
      list.querySelectorAll('[data-commit-details]').forEach(button => button.addEventListener('click', () => loadCommitDetails(button.closest('.change-commit'), button.dataset.commitDetails)));
      loaded = true;
    } catch (error) { list.innerHTML = `<div class="change-loading glass">${icon('circle-alert')}<strong>Commit history unavailable</strong><span>${esc(error.message)}</span></div>`; refreshIcons(list); }
  }

  function enhance() {
    const target = document.getElementById('updatesView'); if (!target || !target.classList.contains('active')) return;
    if (target.dataset.changeCommitsEnhanced === '1') return;
    target.dataset.changeCommitsEnhanced = '1';
    const pageHead = target.querySelector('.page-head');
    if (!pageHead) return;
    const toggle = document.createElement('div'); toggle.className = 'changes-toggle glass'; toggle.innerHTML = `<button type="button" class="active" data-change-tab="updates">${icon('sparkles')}<span>Updates</span></button><button type="button" data-change-tab="commits">${icon('git-commit-horizontal')}<span>Commits</span></button>`;
    const updates = target.querySelector('.timeline');
    if (updates) { updates.classList.add('change-panel'); updates.dataset.changePanel = 'updates'; }
    const commits = document.createElement('div'); commits.className = 'change-panel change-commits-panel'; commits.dataset.changePanel = 'commits'; commits.hidden = true; commits.innerHTML = '<div id="changeCommits"></div>';
    pageHead.insertAdjacentElement('afterend', toggle); (updates || pageHead).insertAdjacentElement('afterend', commits);
    toggle.querySelectorAll('[data-change-tab]').forEach(button => button.addEventListener('click', () => {
      const tab = button.dataset.changeTab; toggle.querySelectorAll('button').forEach(b => b.classList.toggle('active', b === button));
      target.querySelectorAll('.change-panel').forEach(panel => { panel.hidden = panel.dataset.changePanel !== tab; });
      if (tab === 'commits') loadCommits(target);
      refreshIcons(toggle);
    }));
    refreshIcons(toggle);
  }

  const observer = new MutationObserver(enhance);
  function boot() { enhance(); observer.observe(document.getElementById('updatesView') || document.body, {childList:true,subtree:true}); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, {once:true}); else boot();
})();
