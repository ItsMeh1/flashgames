(() => {
  'use strict';

  const $ = (selector, root = document) => root.querySelector(selector);
  const esc = (value) => window.FlashData?.esc ? window.FlashData.esc(value) : String(value ?? '');
  const icon = (name) => `<i data-lucide="${name}"></i>`;
  const PAGE_SIZE = 12;

  const state = { users: [], page: 1, selected: null };

  function isAdmin(user, profile = {}) {
    const role = String(profile.role || profile.accountRole || '').toLowerCase();
    const email = String(user?.email || '').toLowerCase();
    return role === 'admin' || role === 'owner' || role.includes('admin') || role.includes('owner') || /admin|owner|itsmeh1/.test(email);
  }

  async function getProfile(user) {
    const db = window.__flashFirebase?.db;
    if (!db || !user) return {};
    try {
      const snap = await db.collection('users').doc(user.uid).get();
      return snap.exists ? snap.data() : {};
    } catch { return {}; }
  }

  async function readMaintenance() {
    const db = window.__flashFirebase?.db;
    if (!db) return { enabled: false, message: '' };
    try {
      const snap = await db.collection('settings').doc('maintenance').get();
      return snap.exists ? snap.data() : { enabled: false, message: '' };
    } catch { return { enabled: false, message: '' }; }
  }

  async function saveMaintenance(user, enabled, message) {
    const db = window.__flashFirebase?.db;
    if (!db || !user) throw new Error('Firebase is not available.');
    await db.collection('settings').doc('maintenance').set({ enabled, message, updatedAt: Date.now(), updatedBy: user.uid }, { merge: true });
  }

  async function loadUsers() {
    const db = window.__flashFirebase?.db;
    if (!db) return [];
    try {
      const snapshot = await db.collection('users').limit(500).get();
      return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }))
        .sort((a, b) => String(a.username || a.displayName || a.email || a.id).localeCompare(String(b.username || b.displayName || b.email || b.id), undefined, { sensitivity: 'base', numeric: true }));
    } catch { return []; }
  }

  function refreshIcons(root) {
    if (window.lucide?.createIcons) requestAnimationFrame(() => window.lucide.createIcons({ root, attrs: { 'stroke-width': 1.5 } }));
  }

  function renderLoading(target, profile) {
    target.innerHTML = `<div class="admin-shell glass admin-loading-shell"><div class="admin-head"><div><span class="eyebrow">CONTROL CENTER</span><h1>Admin</h1><p>Loading the latest Flash Games control data…</p></div><span class="admin-role">${esc(profile.role || 'admin')}</span></div><div class="admin-panel admin-loading-card">${icon('loader-circle')}<div><strong>Connecting to Flash Games data</strong><small>Loading the control center.</small></div></div></div>`;
    refreshIcons(target);
  }

  async function saveUser(user, id, changes) {
    const db = window.__flashFirebase?.db;
    if (!db || !user) throw new Error('Firebase is not available.');
    await db.collection('users').doc(id).set({ ...changes, updatedAt: Date.now(), updatedBy: user.uid }, { merge: true });
  }

  function openUserManagement(users, user, toast) {
    const backdrop = $('#userManagementBackdrop');
    if (!backdrop) return;
    state.users = users;
    state.page = 1;
    state.selected = null;
    backdrop.hidden = false;
    renderUserManagement(user, toast);
  }

  function renderUserManagement(user, toast) {
    const backdrop = $('#userManagementBackdrop');
    const list = $('#adminMembersList');
    const pager = $('#adminMembersPager');
    const count = $('#adminMembersCount');
    if (!backdrop || !list || !pager || !count) return;

    const pages = Math.max(1, Math.ceil(state.users.length / PAGE_SIZE));
    state.page = Math.min(state.page, pages);
    const start = (state.page - 1) * PAGE_SIZE;
    const visible = state.users.slice(start, start + PAGE_SIZE);
    count.textContent = `${state.users.length.toLocaleString()} members · page ${state.page} of ${pages}`;

    list.innerHTML = visible.map((item) => {
      const name = item.username || item.displayName || item.email || item.id;
      const photo = item.photoURL || item.photo || item.pfp || './offline/logo.png';
      return `<button class="admin-member-row" data-member-id="${esc(item.id)}"><span class="avatar"><img src="${esc(photo)}" alt=""></span><span class="admin-member-copy"><strong>${esc(name)}</strong><small>${esc(item.email || item.role || 'Member')}</small></span><span class="admin-role">${esc(item.role || 'user')}</span>${icon('chevron-right')}</button>`;
    }).join('') || `<div class="admin-members-empty">${icon('users-round')}<strong>No members found</strong><span>There are no user documents to manage.</span></div>`;

    pager.innerHTML = `<button class="icon-btn" id="adminMembersPrev" aria-label="Previous page" ${state.page <= 1 ? 'disabled' : ''}>${icon('chevron-left')}</button><span>${start + 1}-${Math.min(start + PAGE_SIZE, state.users.length)} of ${state.users.length}</span><button class="icon-btn" id="adminMembersNext" aria-label="Next page" ${state.page >= pages ? 'disabled' : ''}>${icon('chevron-right')}</button>`;

    $$('.admin-member-row', list).forEach((row) => row.addEventListener('click', () => {
      state.selected = state.users.find((item) => item.id === row.dataset.memberId) || null;
      renderUserEditor(user, toast);
    }));
    $('#adminMembersPrev')?.addEventListener('click', () => { state.page -= 1; renderUserManagement(user, toast); });
    $('#adminMembersNext')?.addEventListener('click', () => { state.page += 1; renderUserManagement(user, toast); });
    refreshIcons(backdrop);
  }

  function renderUserEditor(user, toast) {
    const editor = $('#adminUserEditor');
    const item = state.selected;
    if (!editor || !item) return;
    const name = item.username || item.displayName || item.email || item.id;
    editor.innerHTML = `<div class="admin-editor-head"><button class="icon-btn" id="closeAdminUserEditor" aria-label="Back to members">${icon('arrow-left')}</button><div><span class="eyebrow">MEMBER</span><h3>${esc(name)}</h3><p>${esc(item.email || item.id)}</p></div></div><div class="admin-editor-grid"><label><span>Display name</span><input id="editUserName" value="${esc(item.username || item.displayName || '')}"></label><label><span>Role</span><select id="editUserRole"><option value="user">User</option><option value="moderator">Moderator</option><option value="admin">Admin</option><option value="owner">Owner</option></select></label><label class="admin-editor-wide"><span>Profile photo URL or data URI</span><input id="editUserPhoto" value="${esc(item.pfp || item.photoURL || item.photo || '')}"></label><label class="admin-editor-toggle"><span><strong>App access</strong><small>Use this flag for your app's own access controls.</small></span><input id="editUserDisabled" type="checkbox" ${item.disabled === true ? 'checked' : ''}><i class="switch ${item.disabled ? 'on' : ''}"><i></i></i></label></div><div class="admin-editor-actions"><button class="btn" id="cancelAdminUserEdit">${icon('x')} Cancel</button><button class="btn primary" id="saveAdminUserEdit">${icon('save')} Save changes</button></div>`;
    $('#editUserRole').value = String(item.role || 'user').toLowerCase();
    $('#editUserDisabled')?.addEventListener('change', (event) => $('.admin-editor-toggle .switch', editor)?.classList.toggle('on', event.target.checked));
    const close = () => { state.selected = null; editor.hidden = true; $('#adminMembersList')?.removeAttribute('hidden'); $('#adminMembersPager')?.removeAttribute('hidden'); };
    $('#closeAdminUserEditor')?.addEventListener('click', close);
    $('#cancelAdminUserEdit')?.addEventListener('click', close);
    $('#saveAdminUserEdit')?.addEventListener('click', async () => {
      try {
        const changes = {
          username: $('#editUserName').value.trim(),
          displayName: $('#editUserName').value.trim(),
          role: $('#editUserRole').value,
          pfp: $('#editUserPhoto').value.trim(),
          disabled: $('#editUserDisabled').checked
        };
        await saveUser(user, item.id, changes);
        Object.assign(item, changes);
        toast('Member updated', `${changes.username || item.id} was updated.`, 'success');
        close();
        renderUserManagement(user, toast);
      } catch (error) {
        toast('Could not update member', error.message || 'Firebase rejected the change.', 'error');
      }
    });
    $('#adminMembersList')?.setAttribute('hidden', '');
    $('#adminMembersPager')?.setAttribute('hidden', '');
    editor.hidden = false;
    refreshIcons(editor);
  }

  function bind(target, user, profile, toast, users) {
    const message = () => $('#adminMaintenanceMessage', target)?.value.trim() || 'Flash Games is being updated. Please check back soon.';
    $('#adminMaintenanceOn', target)?.addEventListener('click', async () => { try { await saveMaintenance(user, true, message()); toast('Update lock enabled', 'Normal users are now blocked from the app.', 'success'); await render(target, user, profile, toast); } catch (error) { toast('Could not enable maintenance', error.message || 'Firebase rejected the change.', 'error'); } });
    $('#adminMaintenanceOff', target)?.addEventListener('click', async () => { try { await saveMaintenance(user, false, message()); toast('Site reopened', 'Normal users can access Flash Games again.', 'success'); await render(target, user, profile, toast); } catch (error) { toast('Could not reopen site', error.message || 'Firebase rejected the change.', 'error'); } });
    $('#refreshCatalogue', target)?.addEventListener('click', async () => { try { const result = await FlashData.loadGames(true); toast('Catalogue refreshed', `${result.games.length.toLocaleString()} real games are available.`, 'success'); await render(target, user, profile, toast); } catch (error) { toast('Refresh failed', error.message || 'GitHub could not be reached.', 'error'); } });
    $('#clearGameCacheAdmin', target)?.addEventListener('click', async () => { await FlashGamesStore.clearGameCache(); toast('Installed cache cleared', 'The Store catalogue was left untouched.', 'success'); window.dispatchEvent(new CustomEvent('flashgames:library-changed')); });
    $('#openMemberManagement', target)?.addEventListener('click', () => openUserManagement(users, user, toast));
    refreshIcons(target);
  }

  async function render(target, user, profile, toast) {
    if (!target) return false;
    if (!isAdmin(user, profile)) { target.innerHTML = `<div class="empty glass">${icon('shield-off')}<h3>Admin access required</h3><p>Your Firebase account is not authorized for this workspace.</p></div>`; refreshIcons(target); return false; }

    renderLoading(target, profile);
    const [maintenance, users, catalogue, updates] = await Promise.all([readMaintenance(), loadUsers(), FlashData.loadGames(), FlashData.loadUpdates()]);

    target.innerHTML = `<div class="admin-shell glass"><div class="admin-head"><div><span class="eyebrow">CONTROL CENTER</span><h1>Admin</h1><p>Manage Flash Games without leaving the app.</p></div><span class="admin-role">${esc(profile.role || 'admin')}</span></div><div class="admin-compact-grid"><section class="admin-panel compact"><span class="eyebrow">OVERVIEW</span><h2>Dashboard</h2><div class="admin-metrics"><div><strong>${catalogue.games.length.toLocaleString()}</strong><small>Games</small></div><div><strong>${users.length.toLocaleString()}</strong><small>Members</small></div><div><strong>${esc(updates.version)}</strong><small>Release</small></div></div></section><section class="admin-panel compact"><span class="eyebrow">RELEASE CONTROL</span><h2>${maintenance.enabled ? 'Update lock active' : 'Site is public'}</h2><p>${esc(maintenance.message || 'Use maintenance mode before publishing a release.')}</p><div class="maintenance-card"><div><strong>${maintenance.enabled ? 'Locked for updates' : 'Public access'}</strong><small>Admins can always access this workspace.</small></div><span class="switch ${maintenance.enabled ? 'on' : ''}"><i></i></span></div><textarea id="adminMaintenanceMessage" class="admin-input compact-input" rows="2" placeholder="Maintenance message">${esc(maintenance.message || 'Flash Games is being updated. Please check back soon.')}</textarea><div class="admin-actions"><button class="btn primary" id="adminMaintenanceOn">${icon('lock')} Lock</button><button class="btn" id="adminMaintenanceOff">${icon('lock-open')} Open</button></div></section></div><section class="admin-panel compact"><div class="admin-section-head"><div><span class="eyebrow">CATALOGUE</span><h2>Games</h2><p>${catalogue.games.length.toLocaleString()} real games from the configured sources.</p></div><div class="admin-actions"><button class="btn" id="refreshCatalogue">${icon('refresh-cw')} Refresh</button><button class="btn" id="clearGameCacheAdmin">${icon('trash-2')} Clear cache</button></div></div></section><section class="admin-panel compact"><div class="admin-section-head"><div><span class="eyebrow">MEMBERS</span><h2>User management</h2><p>Manage names, roles, profile images and app-access flags.</p></div><button class="btn primary" id="openMemberManagement">${icon('users-round')} View all ${users.length.toLocaleString()} members</button></div></section><section class="admin-panel compact"><div class="admin-section-head"><div><span class="eyebrow">UPDATES</span><h2>Release history</h2><p>Public changelog from <code>update.json</code>.</p></div><button class="btn" data-route="updates">${icon('history')} Changelog</button></div></section></div>`;
    bind(target, user, profile, toast, users);
    return true;
  }

  window.FlashAdmin = { render, isAdmin, getProfile, readMaintenance };
})();
