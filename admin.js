/* Flash Games administration — member moderation, release control, catalogue.
 * Public surface used by app.js: render, isAdmin, loadUsers, readMaintenance,
 * closeMembers. All element ids/classes match styles.css and index.html. */
(() => {
  'use strict';

  const PAGE = 20;
  const ROLES = ['user', 'moderator', 'admin', 'owner'];

  const $ = (selector, root = document) => root.querySelector(selector);
  const esc = (value) => window.FlashData?.esc
    ? window.FlashData.esc(value)
    : String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const icon = (name) => `<i data-lucide="${name}"></i>`;
  const toast = (title, message, type = 'info') => window.FlashUI?.toast?.(title, message, type);
  const icons = (root = document) => { try { window.lucide?.createIcons?.({ root, attrs: { 'stroke-width': 1.5 } }); } catch {} };

  const state = {
    users: [],
    filtered: [],
    page: 1,
    selected: null,
    loading: false,
    loadError: '',
    query: '',
    filter: 'all'
  };

  /* ---------- access ---------- */

  function isAdmin(user, profile = {}) {
    const role = String(profile.role || profile.accountRole || '').toLowerCase();
    const email = String(user?.email || '').toLowerCase();
    return ['admin', 'owner'].includes(role)
      || role.includes('admin')
      || role.includes('owner')
      || /admin|owner|itsmeh1/.test(email);
  }

  /* ---------- formatting ---------- */

  function avatar(value) {
    const source = String(value || '').trim();
    if (/^data:image\//i.test(source) || /^https?:\/\//i.test(source) || /^blob:/i.test(source)) return source;
    return './offline/logo.png';
  }

  function fmtDate(value) {
    const n = Number(value || 0);
    return n ? new Date(n).toLocaleString() : 'Never recorded';
  }

  function memberAge(createdAt) {
    const n = Number(createdAt || 0);
    if (!n) return 'Unknown';
    const days = Math.floor((Date.now() - n) / 86400000);
    if (days < 0) return 'Unknown';
    if (days === 0) return 'Today';
    if (days === 1) return '1 day';
    if (days < 30) return `${days} days`;
    if (days < 365) return `${Math.floor(days / 30)} mo`;
    return `${(days / 365).toFixed(1)} yr`;
  }

  function fullName(x) {
    return x.username || x.displayName || x.email || x.id;
  }

  function photoOf(x) {
    return x.pfp || x.photoURL || x.photo || x.avatar || '';
  }

  /* ---------- classification ---------- */

  // [level, label] — level drives the pill color.
  function riskOf(x) {
    const flags = [];
    if (x.banned) flags.push(['bad', 'Banned']);
    if (x.disabled) flags.push(['bad', 'Disabled']);
    if (Number(x.suspendedUntil) > Date.now()) flags.push(['warn', 'Suspended']);
    if (x.verified === false) flags.push(['warn', 'Unverified']);
    if (Number(x.loginCount || x.logins || 0) > 1000) flags.push(['warn', 'High login volume']);
    if (Number(x.gamesPlayed || x.playCount || 0) > 5000) flags.push(['warn', 'High play volume']);
    if (Number(x.installCount || x.installs || 0) > 1000) flags.push(['warn', 'High install volume']);
    if (x.lastAbuseAt || x.moderationFlag || x.abuseFlag || x.suspicious) flags.push(['bad', 'Abuse flag']);
    return flags;
  }

  function statusOf(x) {
    if (x.banned || x.disabled) return ['bad', 'Restricted'];
    if (Number(x.suspendedUntil) > Date.now()) return ['warn', 'Suspended'];
    if (x.verified === false) return ['warn', 'Unverified'];
    return ['good', 'Active'];
  }

  /* ---------- data layer ---------- */

  function db() {
    return window.__flashFirebase?.db || null;
  }

  function currentUid() {
    return window.__flashFirebase?.auth?.currentUser?.uid || 'admin-console';
  }

  async function loadUsers(force = false) {
    if (state.users.length && !force) return state.users;
    const store = db();
    if (!store) throw new Error('Firebase is not available.');
    state.loading = true;
    state.loadError = '';
    try {
      const snap = await store.collection('users').limit(1000).get();
      state.users = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      return state.users;
    } catch (error) {
      state.loadError = error?.message || 'The member list could not be loaded.';
      throw error;
    } finally {
      state.loading = false;
    }
  }

  async function saveMember(id, changes) {
    const store = db();
    if (!store) throw new Error('Firebase is not available.');
    await store.collection('users').doc(id).set(
      { ...changes, updatedAt: Date.now(), updatedBy: currentUid() },
      { merge: true }
    );
  }

  async function deleteMember(id) {
    const store = db();
    if (!store) throw new Error('Firebase is not available.');
    await store.collection('users').doc(id).delete();
    state.users = state.users.filter((u) => u.id !== id);
  }

  async function readMaintenance() {
    const store = db();
    if (!store) return { enabled: false, message: '' };
    try {
      const snap = await store.collection('settings').doc('maintenance').get();
      if (snap.exists) return snap.data();
    } catch {}
    return { enabled: false, message: '' };
  }

  async function saveMaintenance(enabled, message) {
    const store = db();
    if (!store) throw new Error('Firebase is not available.');
    await store.collection('settings').doc('maintenance').set(
      { enabled, message, updatedAt: Date.now(), updatedBy: currentUid() },
      { merge: true }
    );
  }

  /* ---------- member list (tools persist, rows refresh) ---------- */

  function applyFilters() {
    const q = state.query.trim().toLowerCase();
    state.filtered = state.users.filter((x) => {
      if (q) {
        const haystack = `${x.username || ''} ${x.displayName || ''} ${x.email || ''} ${x.id}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      if (state.filter === 'risk') return riskOf(x).some((f) => f[0] !== 'good');
      if (state.filter === 'restricted') return x.banned || x.disabled || Number(x.suspendedUntil) > Date.now();
      if (state.filter === 'unverified') return x.verified === false;
      return true;
    });
  }

  function statusPill(x) {
    const [level, label] = statusOf(x);
    return `<span class="admin-risk-badge ${level}"><i class="admin-status-dot ${level}"></i>${label}</span>`;
  }

  function ensureListTools() {
    const list = $('#adminMembersList');
    if (!list || list.querySelector('.admin-list-tools')) return;
    const tools = document.createElement('div');
    tools.className = 'admin-list-tools';
    tools.innerHTML =
      `<label class="admin-member-search">${icon('search')}` +
      `<input id="adminMemberSearch" placeholder="Search username, email, or UID" value="${esc(state.query)}"></label>` +
      `<select id="adminMemberFilter" aria-label="Filter members">` +
      `<option value="all">All members</option><option value="risk">Needs review</option>` +
      `<option value="restricted">Restricted</option><option value="unverified">Unverified</option></select>`;
    list.prepend(tools);
    icons(tools);
    $('#adminMemberSearch').oninput = (event) => {
      state.query = event.target.value;
      state.page = 1;
      renderListRows();
    };
    $('#adminMemberFilter').value = state.filter;
    $('#adminMemberFilter').onchange = (event) => {
      state.filter = event.target.value;
      state.page = 1;
      renderListRows();
    };
  }

  function renderListRows() {
    const list = $('#adminMembersList');
    const pager = $('#adminMembersPager');
    const count = $('#adminMembersCount');
    if (!list) return;
    applyFilters();
    const pages = Math.max(1, Math.ceil(state.filtered.length / PAGE));
    state.page = Math.min(Math.max(1, state.page), pages);
    const start = (state.page - 1) * PAGE;
    const rows = state.filtered.slice(start, start + PAGE);

    if (count) {
      count.textContent = state.loading
        ? 'Loading…'
        : `${state.filtered.length.toLocaleString()} shown · ${state.users.length.toLocaleString()} total`;
    }

    let rowsBox = list.querySelector('.admin-members-rows');
    if (!rowsBox) {
      rowsBox = document.createElement('div');
      rowsBox.className = 'admin-members-rows';
      list.appendChild(rowsBox);
    }

    if (state.loading) {
      rowsBox.innerHTML = `<div class="admin-members-empty">${icon('loader-circle')}<strong>Loading members…</strong></div>`;
    } else if (state.loadError && !state.users.length) {
      rowsBox.innerHTML = `<div class="admin-members-empty">${icon('cloud-off')}<strong>Could not load members</strong><span>${esc(state.loadError)}</span></div>`;
    } else {
      rowsBox.innerHTML = rows.map((x) => {
        const [level, label] = statusOf(x);
        const signals = riskOf(x);
        return `<button type="button" class="admin-member-row" data-member-id="${esc(x.id)}">` +
          `<span class="avatar"><img src="${esc(avatar(photoOf(x)))}" alt="" loading="lazy" onerror="this.onerror=null;this.src='./offline/logo.png'"></span>` +
          `<span class="admin-member-copy"><strong>${esc(fullName(x))}</strong><small>${esc(x.email || x.id)}</small></span>` +
          `<span class="admin-member-meta">${statusPill(x)}` +
          (signals.length ? `<span class="admin-risk-badge warn">${signals.length} signal${signals.length === 1 ? '' : 's'}</span>` : '') +
          `${icon('chevron-right')}</span></button>`;
      }).join('') || `<div class="admin-members-empty">${icon('users-round')}<strong>No matching members</strong><span>Try another search or filter.</span></div>`;
      rowsBox.querySelectorAll('.admin-member-row').forEach((button) => {
        button.onclick = () => {
          state.selected = state.users.find((x) => x.id === button.dataset.memberId) || null;
          renderEditor();
        };
      });
    }

    if (pager) {
      pager.innerHTML =
        `<button type="button" class="icon-btn" id="adminMembersPrev" aria-label="Previous page"${state.page <= 1 ? ' disabled' : ''}>${icon('chevron-left')}</button>` +
        `<span>${state.filtered.length ? start + 1 : 0}–${Math.min(start + PAGE, state.filtered.length)} of ${state.filtered.length}</span>` +
        `<button type="button" class="icon-btn" id="adminMembersNext" aria-label="Next page"${state.page >= pages ? ' disabled' : ''}>${icon('chevron-right')}</button>`;
      $('#adminMembersPrev').onclick = () => { state.page = Math.max(1, state.page - 1); renderListRows(); };
      $('#adminMembersNext').onclick = () => { state.page = Math.min(pages, state.page + 1); renderListRows(); };
    }
    icons(list);
    if (pager) icons(pager);
  }

  function renderList() {
    ensureListTools();
    renderListRows();
  }

  /* ---------- member editor ---------- */

  function suspensionLine(x) {
    const until = Number(x.suspendedUntil || 0);
    if (until > Date.now()) return `Suspended until ${new Date(until).toLocaleString()}`;
    return 'No active suspension';
  }

  function renderEditor() {
    const editor = $('#adminUserEditor');
    const x = state.selected;
    if (!editor || !x) return;
    editor.dataset.uid = x.id;
    const [level, label] = statusOf(x);
    const signals = riskOf(x);
    const name = fullName(x);
    const role = String(x.role || 'user').toLowerCase();
    const roleOptions = (ROLES.includes(role) ? ROLES : [role, ...ROLES])
      .map((r) => `<option value="${r}"${r === role ? ' selected' : ''}>${r[0].toUpperCase()}${r.slice(1)}</option>`).join('');

    editor.innerHTML =
      `<div class="admin-editor-head">` +
      `<button type="button" class="icon-btn" id="closeAdminUserEditor" aria-label="Back to list">${icon('arrow-left')}</button>` +
      `<span class="avatar large"><img src="${esc(avatar(photoOf(x)))}" alt="" onerror="this.onerror=null;this.src='./offline/logo.png'"></span>` +
      `<div><span class="eyebrow">MEMBER PROFILE</span><h3>${esc(name)}</h3><p>${esc(x.email || x.id)}</p></div>` +
      `${statusPill(x)}</div>` +
      `<div class="admin-detail-card"><span class="eyebrow">MODERATION SNAPSHOT</span><div class="admin-detail-grid">` +
      `<div><strong>${esc(x.uid || x.id)}</strong><span>UID</span></div>` +
      `<div><strong>${esc(fmtDate(x.createdAt || x.created_at))}</strong><span>Created</span></div>` +
      `<div><strong>${esc(memberAge(x.createdAt || x.created_at))}</strong><span>Member for</span></div>` +
      `<div><strong>${esc(fmtDate(x.lastSeen || x.lastLoginAt || x.lastActiveAt))}</strong><span>Last activity</span></div>` +
      `<div><strong>${Number(x.loginCount || x.logins || 0).toLocaleString()}</strong><span>Logins</span></div>` +
      `<div><strong>${Number(x.gamesPlayed || x.playCount || 0).toLocaleString()}</strong><span>Games played</span></div>` +
      `<div><strong>${Number(x.installCount || x.installs || 0).toLocaleString()}</strong><span>Installs</span></div>` +
      `<div><strong>${esc(suspensionLine(x))}</strong><span>Suspension</span></div>` +
      `<div><strong>${esc(x.verified === false ? 'No' : 'Yes')}</strong><span>Verified</span></div>` +
      `</div><div class="admin-signal-list">` +
      (signals.length
        ? signals.map((f) => `<div class="admin-signal ${f[0]}">${icon(f[0] === 'bad' ? 'triangle-alert' : 'flag')}<span>${esc(f[1])}</span></div>`).join('')
        : `<div class="admin-signal good">${icon('shield-check')}<span>No moderation flags on this profile.</span></div>`) +
      `</div></div>` +
      `<div class="admin-editor-grid">` +
      `<label><span>Username</span><input id="editUserName" value="${esc(x.username || x.displayName || '')}" maxlength="32"></label>` +
      `<label><span>Role</span><select id="editUserRole">${roleOptions}</select></label>` +
      `<label class="admin-editor-wide"><span>Profile photo URL or data URI</span><input id="editUserPhoto" value="${esc(photoOf(x))}" placeholder="https://…"></label>` +
      `<label class="admin-editor-wide"><span>Moderator notes</span><textarea id="editUserNotes" rows="4" placeholder="Private notes for staff…">${esc(x.moderatorNotes || x.modNotes || '')}</textarea></label>` +
      `<label class="admin-editor-toggle"><span><strong>Verified</strong><small>Grants verification perks such as cloud gaming.</small></span><input id="editUserVerified" type="checkbox"${x.verified !== false ? ' checked' : ''}><i class="switch${x.verified !== false ? ' on' : ''}"><i></i></i></label>` +
      `<label class="admin-editor-toggle"><span><strong>App access</strong><small>Disable the profile without deleting its data.</small></span><input id="editUserDisabled" type="checkbox"${x.disabled ? ' checked' : ''}><i class="switch${x.disabled ? ' on' : ''}"><i></i></i></label>` +
      `</div>` +
      `<section class="moderation-tools"><h4>Moderation actions</h4>` +
      `<div class="moderation-grid">` +
      `<button type="button" class="btn" id="moderationBan">${icon('ban')} Ban</button>` +
      `<button type="button" class="btn" id="moderationUnban">${icon('circle-check')} Unban</button></div>` +
      `<label>Suspension end date<input id="moderationSuspension" type="datetime-local"></label>` +
      `<div class="moderation-grid">` +
      `<button type="button" class="btn" id="moderationSuspend">${icon('clock')} Suspend</button>` +
      `<button type="button" class="btn" id="moderationUnsuspend">${icon('history')} Unsuspend</button></div>` +
      `<button type="button" class="btn danger moderation-danger" id="moderationDelete">${icon('trash-2')} Delete profile data</button></section>` +
      `<div class="admin-editor-actions">` +
      `<button type="button" class="btn" id="cancelAdminUserEdit">${icon('x')} Back</button>` +
      `<button type="button" class="btn primary" id="saveAdminUserEdit">${icon('save')} Save changes</button></div>`;

    const close = () => {
      state.selected = null;
      editor.hidden = true;
      delete editor.dataset.uid;
      $('#adminMembersList').hidden = false;
      $('#adminMembersPager').hidden = false;
      renderListRows();
    };

    $('#closeAdminUserEditor').onclick = close;
    $('#cancelAdminUserEdit').onclick = close;

    const syncSwitch = (id) => {
      const box = $(`#${id}`);
      if (!box) return;
      box.onchange = () => {
        const sw = box.closest('label')?.querySelector('.switch');
        if (sw) sw.classList.toggle('on', box.checked);
      };
    };
    syncSwitch('editUserVerified');
    syncSwitch('editUserDisabled');

    $('#saveAdminUserEdit').onclick = async () => {
      try {
        const verified = $('#editUserVerified').checked;
        const changes = {
          username: $('#editUserName').value.trim(),
          displayName: $('#editUserName').value.trim(),
          role: $('#editUserRole').value,
          pfp: $('#editUserPhoto').value.trim(),
          moderatorNotes: $('#editUserNotes').value.trim(),
          verified,
          verificationStatus: verified ? 'verified' : 'unverified',
          disabled: $('#editUserDisabled').checked
        };
        await saveMember(x.id, changes);
        Object.assign(x, changes);
        toast('Member updated', `${changes.username || x.id} was updated.`, 'success');
        close();
      } catch (error) {
        toast('Could not update member', error.message || 'Firebase rejected the change.', 'error');
      }
    };

    const afterModeration = () => {
      renderEditor();
      renderListRows();
    };
    const guard = (fn) => async () => {
      try { await fn(); afterModeration(); }
      catch (error) { toast('Moderation failed', error.message || 'The change could not be saved.', 'error'); }
    };

    $('#moderationBan').onclick = guard(async () => {
      await saveMember(x.id, { banned: true, disabled: true, bannedAt: Date.now() });
      toast('Member banned', `${name} is now blocked.`, 'success');
    });
    $('#moderationUnban').onclick = guard(async () => {
      await saveMember(x.id, { banned: false, disabled: false });
      toast('Member unbanned', `${name} can access Flash Games again.`, 'success');
    });
    $('#moderationSuspend').onclick = guard(async () => {
      const raw = $('#moderationSuspension').value;
      const until = raw ? new Date(raw).getTime() : 0;
      if (!Number.isFinite(until) || until <= Date.now()) throw new Error('Choose a future suspension end date.');
      await saveMember(x.id, { suspendedUntil: until });
      toast('Member suspended', `${name} is suspended until ${new Date(until).toLocaleString()}.`, 'success');
    });
    $('#moderationUnsuspend').onclick = guard(async () => {
      await saveMember(x.id, { suspendedUntil: 0 });
      toast('Suspension removed', `${name} is no longer suspended.`, 'success');
    });
    $('#moderationDelete').onclick = () => {
      const backdrop = $('#dialogBackdrop');
      if (!backdrop) return;
      $('#dialogTitle').textContent = 'Delete profile data?';
      $('#dialogText').textContent = `This permanently deletes the Flash Games user document for ${name}.`;
      $('#dialogIcon').innerHTML = icon('triangle-alert');
      const confirm = $('#dialogConfirm');
      const cancel = $('#dialogCancel');
      backdrop.hidden = false;
      icons(backdrop);
      cancel.onclick = () => { backdrop.hidden = true; };
      confirm.onclick = async () => {
        try {
          await deleteMember(x.id);
          backdrop.hidden = true;
          toast('Profile data deleted', `${name}'s profile data was deleted.`, 'success');
          close();
        } catch (error) {
          backdrop.hidden = true;
          toast('Delete failed', error.message || 'The profile could not be deleted.', 'error');
        }
      };
    };

    $('#adminMembersList').hidden = true;
    $('#adminMembersPager').hidden = true;
    editor.hidden = false;
    icons(editor);
  }

  /* ---------- member modal ---------- */

  function openMembers() {
    const backdrop = $('#userManagementBackdrop');
    if (!backdrop) return;
    backdrop.hidden = false;
    requestAnimationFrame(() => backdrop.classList.add('is-open'));
    $('#adminMembersList').hidden = false;
    $('#adminUserEditor').hidden = true;
    $('#adminMembersPager').hidden = false;
    state.loading = true;
    renderListRows();
    loadUsers(true)
      .then(() => renderList())
      .catch((error) => {
        renderListRows();
        toast('Could not load members', error.message || 'Firebase could not load the member list.', 'error');
      });
  }

  function closeMembers() {
    const backdrop = $('#userManagementBackdrop');
    if (!backdrop) return;
    backdrop.classList.remove('is-open');
    backdrop.hidden = true;
    state.selected = null;
    const editor = $('#adminUserEditor');
    if (editor) {
      editor.hidden = true;
      delete editor.dataset.uid;
    }
  }

  /* ---------- dashboard ---------- */

  async function render(target, user, profile) {
    if (!target) return false;
    if (!isAdmin(user, profile)) {
      target.innerHTML = `<div class="empty glass">${icon('shield-off')}<h3>Admin access required</h3><p>Your account is not authorized for this workspace.</p></div>`;
      icons(target);
      return false;
    }

    target.innerHTML = `<div class="admin-shell glass admin-loading-shell"><div class="admin-head"><div><span class="eyebrow">CONTROL CENTER</span><h1>Administration</h1><p>Loading moderation data…</p></div></div></div>`;
    icons(target);

    const [maintenance, updates] = await Promise.all([readMaintenance(), FlashData.loadUpdates()]);
    const catalogue = FlashData.getCachedCatalogue ? FlashData.getCachedCatalogue() : { games: [] };
    let users = [];
    try {
      users = await loadUsers();
    } catch {
      users = [];
    }

    const restricted = users.filter((x) => x.banned || x.disabled || Number(x.suspendedUntil) > Date.now()).length;
    const risky = users.filter((x) => riskOf(x).length).length;
    const unverified = users.filter((x) => x.verified === false).length;
    const version = updates.version || '0.0.0';

    target.innerHTML =
      `<div class="admin-shell glass"><div class="admin-head"><div><span class="eyebrow">MODERATION CONTROL CENTER</span><h1>Administration</h1>` +
      `<p>Review members, account health, and stored abuse signals.</p></div>` +
      `<span class="admin-role">${icon('shield-check')} ${esc(profile.role || 'staff')}</span></div>` +
      `<div class="admin-compact-grid">` +
      `<section class="admin-panel"><span class="eyebrow">MEMBER HEALTH</span><h2>At a glance</h2><div class="admin-metrics">` +
      `<div><strong>${users.length.toLocaleString()}</strong><small>Total members</small></div>` +
      `<div><strong>${risky.toLocaleString()}</strong><small>Needs review</small></div>` +
      `<div><strong>${restricted.toLocaleString()}</strong><small>Restricted</small></div></div>` +
      `<div class="admin-actions" style="margin-top:14px"><button class="btn primary" id="openMemberManagement">${icon('shield-check')} Open moderation</button></div></section>` +
      `<section class="admin-panel"><span class="eyebrow">VERIFICATION</span><h2>${unverified.toLocaleString()} unverified</h2>` +
      `<p>Review new or unverified accounts before granting additional trust.</p></section></div>` +
      `<section class="admin-panel"><div class="admin-section-head"><div><span class="eyebrow">RELEASE CONTROL</span>` +
      `<h2>${maintenance.enabled ? 'Update lock active' : 'Site is public'}</h2>` +
      `<p>${esc(maintenance.message || 'Use maintenance mode before publishing a release.')}</p></div>` +
      `<div class="admin-actions"><button class="btn primary" id="adminMaintenanceOn">${icon('lock')} Lock</button>` +
      `<button class="btn" id="adminMaintenanceOff">${icon('lock-open')} Open</button></div></div>` +
      `<textarea id="adminMaintenanceMessage" class="admin-input" rows="2">${esc(maintenance.message || 'Flash Games is being updated. Please check back soon.')}</textarea></section>` +
      `<section class="admin-panel"><div class="admin-section-head"><div><span class="eyebrow">CATALOGUE · v${esc(version)}</span><h2>Games</h2>` +
      `<p>${catalogue.games.length.toLocaleString()} cached games.</p></div>` +
      `<div class="admin-actions"><button class="btn" id="refreshCatalogue">${icon('refresh-cw')} Refresh</button>` +
      `<button class="btn" id="clearGameCacheAdmin">${icon('trash-2')} Clear cache</button></div></div></section>` +
      `<section class="admin-panel"><div class="admin-section-head"><div><span class="eyebrow">ACCOUNT DATA</span><h2>What moderation can see</h2>` +
      `<p>UID, account dates, verification, restrictions, notes, and activity counters when those fields are present in Firestore.</p></div></div></section></div>`;

    const message = () => $('#adminMaintenanceMessage', target)?.value.trim() || 'Flash Games is being updated. Please check back soon.';

    $('#adminMaintenanceOn', target).onclick = async () => {
      try {
        await saveMaintenance(true, message());
        toast('Update lock enabled', 'Normal users are now blocked from the app.', 'success');
        await render(target, user, profile);
      } catch (error) {
        toast('Could not enable maintenance', error.message || 'Firebase rejected the change.', 'error');
      }
    };
    $('#adminMaintenanceOff', target).onclick = async () => {
      try {
        await saveMaintenance(false, message());
        toast('Site reopened', 'Normal users can access Flash Games again.', 'success');
        await render(target, user, profile);
      } catch (error) {
        toast('Could not reopen site', error.message || 'Firebase rejected the change.', 'error');
      }
    };
    $('#refreshCatalogue', target).onclick = async () => {
      try {
        const result = await FlashData.loadGames(true);
        toast('Catalogue refreshed', `${result.games.length.toLocaleString()} real games are available.`, 'success');
        await render(target, user, profile);
      } catch (error) {
        toast('Refresh failed', error.message || 'GitHub could not be reached.', 'error');
      }
    };
    $('#clearGameCacheAdmin', target).onclick = async () => {
      try {
        await FlashGamesStore.clearGameCache();
        toast('Installed cache cleared', 'The store catalogue was left untouched.', 'success');
        window.dispatchEvent(new CustomEvent('flashgames:library-changed'));
      } catch (error) {
        toast('Clear failed', error.message || 'The cache could not be cleared.', 'error');
      }
    };
    $('#openMemberManagement', target).onclick = () => openMembers();

    icons(target);
    return true;
  }

  document.addEventListener('click', (event) => {
    if (event.target.closest('[data-close="userManagementBackdrop"]')) closeMembers();
  });

  window.FlashAdmin = Object.freeze({
    render,
    isAdmin,
    loadUsers,
    readMaintenance,
    closeMembers
  });
})();
