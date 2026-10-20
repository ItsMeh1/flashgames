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
    filter: 'all',
    tab: 'overview'
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

  /* ---------- dashboard: tabbed control center ---------- */

  const TABS = [
    { id: 'overview', label: 'Overview', icon: 'layout-dashboard' },
    { id: 'members', label: 'Members', icon: 'users-round' },
    { id: 'releases', label: 'Releases & locks', icon: 'rocket' },
    { id: 'catalogue', label: 'Catalogue', icon: 'library-big' },
    { id: 'system', label: 'System & data', icon: 'activity' },
    { id: 'codes', label: 'Access codes', icon: 'key-round' }
  ];

  function lsTotal() {
    try {
      let total = 0;
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        total += (String(k).length + String(localStorage.getItem(k) || '').length) * 2;
      }
      return total;
    } catch { return 0; }
  }
  const fmtBytes = (n) => !Number.isFinite(n) ? '—' : n >= 1e9 ? `${(n / 1e9).toFixed(2)} GB` : n >= 1e6 ? `${(n / 1e6).toFixed(1)} MB` : n >= 1e3 ? `${Math.round(n / 1e3)} KB` : `${n} B`;

  function flaggedMembers(users) {
    return users
      .map((x) => ({ x, signals: riskOf(x) }))
      .filter((row) => row.signals.length)
      .sort((a, b) => b.signals.length - a.signals.length || (b.x.createdAt || 0) - (a.x.createdAt || 0));
  }

  function memberMiniRow(row) {
    const { x, signals } = row;
    return `<button type="button" class="admin-mini-row" data-open-members="${esc(x.id)}">` +
      `<span class="avatar"><img src="${esc(avatar(photoOf(x)))}" alt="" loading="lazy" onerror="this.onerror=null;this.src='./offline/logo.png'"></span>` +
      `<span class="admin-mini-copy"><strong>${esc(fullName(x))}</strong><small>${esc(x.email || x.id)}</small></span>` +
      `<span class="admin-member-meta">${statusPill(x)}<span class="admin-risk-badge warn">${signals.length} signal${signals.length === 1 ? '' : 's'}</span></span></button>`;
  }

  function maskCode(code) {
    return String(code).replace(/./g, (ch, i) => (ch === '-' ? '-' : i > 3 && i < String(code).length - 2 ? '•' : ch));
  }

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
    const sync = FlashData.getSyncMeta ? FlashData.getSyncMeta() : {};
    let users = [];
    try {
      users = await loadUsers();
    } catch {
      users = [];
    }

    const restricted = users.filter((x) => x.banned || x.disabled || Number(x.suspendedUntil) > Date.now()).length;
    const risky = flaggedMembers(users);
    const unverified = users.filter((x) => x.verified === false).length;
    const version = updates.version || '0.0.0';
    const installedCount = await (async () => {
      try { return (await window.FlashGamesStore?.getAllCachedGames?.()).length || 0; } catch { return 0; }
    })();
    const bridge = window.FlashBridge?.status?.() || { mode: 'idle' };
    const dev = !!(window.FlashAccess?.isDeveloper?.());
    const codes = Array.isArray(window.FlashAccess?.codes) ? window.FlashAccess.codes : [];
    const recentMembers = [...users].filter((x) => x.createdAt)
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
      .slice(0, 5)
      .map((x) => ({ x, signals: riskOf(x) }));

    state.tab = TABS.some((t) => t.id === state.tab) ? state.tab : 'overview';
    const tabHead = `<div class="admin-tabs">${TABS.map((t) => `<button type="button" class="admin-tab${t.id === state.tab ? ' active' : ''}" data-admin-tab="${t.id}">${icon(t.icon)}<span>${t.label}</span></button>`).join('')}</div>`;

    /* ----- panes ----- */

    const paneOverview =
      `<section class="admin-pane${state.tab === 'overview' ? ' active' : ''}" data-admin-pane="overview">` +
      `<div class="admin-panel"><div class="admin-section-head"><div><span class="eyebrow">HEALTH CHECK</span><h2>${(() => { const w = risky.length + restricted; return w ? `${w} member${w === 1 ? '' : 's'} need attention` : 'All members healthy'; })()}</h2><p>${users.length.toLocaleString()} member records · ${unverified.toLocaleString()} unverified${users.length >= 1000 ? ' · showing the first 1000' : ''}</p></div>` +
      `<div class="admin-actions"><button type="button" class="btn" data-admin-goto="members">${icon('users-round')} Members</button><button type="button" class="btn primary" id="openMemberManagement">${icon('shield-check')} Open moderation</button></div></div>` +
      `<div class="admin-metric-grid">` +
      `<div><strong>${users.length.toLocaleString()}</strong><small>Total members</small></div>` +
      `<div class="warn"><strong>${risky.length.toLocaleString()}</strong><small>Needs review</small></div>` +
      `<div class="bad"><strong>${restricted.toLocaleString()}</strong><small>Restricted</small></div>` +
      `<div><strong>${unverified.toLocaleString()}</strong><small>Unverified</small></div>` +
      `<div><strong>${catalogue.games.length.toLocaleString()}</strong><small>Catalogue games</small></div>` +
      `<div><strong>${esc(version)}</strong><small>App version</small></div></div></div>` +
      `<div class="admin-panel"><div class="admin-section-head"><div><span class="eyebrow">NEWEST ACCOUNTS</span><h2>Recent signups</h2><p>The freshest member records. Click through for the full moderation view.</p></div></div>` +
      `<div class="admin-mini-list">${recentMembers.map(memberMiniRow).join('') || `<div class="admin-members-empty">${icon('users-round')}<strong>No member records</strong><span>Accounts appear here once users register.</span></div>`}</div></section>`;

    const paneMembers =
      `<section class="admin-pane${state.tab === 'members' ? ' active' : ''}" data-admin-pane="members">` +
      `<div class="admin-panel"><div class="admin-section-head"><div><span class="eyebrow">MODERATION QUEUE</span><h2>${risky.length ? `${risky.length} flagged member${risky.length === 1 ? '' : 's'}` : 'Queue is clear'}</h2><p>Profiles with verification, suspension or abuse signals. The full tool supports search, filters, roles, bans and notes.</p></div>` +
      `<button type="button" class="btn primary" id="openMemberManagement">${icon('shield-check')} Full moderation</button></div>` +
      `<div class="admin-mini-list">${risky.slice(0, 8).map(memberMiniRow).join('') || `<div class="admin-members-empty">${icon('shield-check')}<strong>No flags on any member</strong><span>Bans and suspensions will surface here.</span></div>`}</div></div></section>`;

    const paneReleases =
      `<section class="admin-pane${state.tab === 'releases' ? ' active' : ''}" data-admin-pane="releases">` +
      `<div class="admin-panel"><div class="admin-section-head"><div><span class="eyebrow">RELEASE LOCK</span><h2>${maintenance.enabled ? 'Update lock is ACTIVE' : 'Site is public'}</h2><p>${esc(maintenance.message || 'Use maintenance mode while publishing a release — normal users see an update screen.')}</p></div>` +
      `<div class="admin-actions"><button type="button" class="btn primary" id="adminMaintenanceOn">${icon('lock')} Lock</button><button type="button" class="btn" id="adminMaintenanceOff">${icon('lock-open')} Open</button></div></div>` +
      `<label class="admin-inline-label">Maintenance message</label><textarea id="adminMaintenanceMessage" class="admin-input" rows="2">${esc(maintenance.message || 'Flash Games is being updated. Please check back soon.')}</textarea></div>` +
      `<div class="admin-panel"><div class="admin-section-head"><div><span class="eyebrow">CHANGELOG</span><h2>v${esc(version)}</h2><p>${(updates.releases || []).length.toLocaleString()} published release entries.</p></div>` +
      `<button type="button" class="btn" data-route="updates">${icon('history')} Open changelog</button></div></section>`;

    const paneCatalogue =
      `<section class="admin-pane${state.tab === 'catalogue' ? ' active' : ''}" data-admin-pane="catalogue">` +
      `<div class="admin-panel"><div class="admin-section-head"><div><span class="eyebrow">CATALOGUE · v${esc(version)}</span><h2>${catalogue.games.length.toLocaleString()} games cached</h2><p>Last remote sync ${sync.at ? new Date(sync.at).toLocaleString() : 'not yet'} via ${esc(sync.source || 'network')}.</p></div>` +
      `<div class="admin-actions"><button type="button" class="btn primary" id="refreshCatalogue">${icon('refresh-cw')} Refresh listing</button><button type="button" class="btn" id="clearGameCacheAdmin">${icon('trash-2')} Clear installed cache</button></div></div>` +
      `<div class="admin-metric-grid three">` +
      `<div><strong>${catalogue.games.length.toLocaleString()}</strong><small>Store catalogue entries</small></div>` +
      `<div><strong>${installedCount.toLocaleString()}</strong><small>User-installed games</small></div>` +
      `<div><strong>${window.FlashEagler ? 'Eagler + Flash' : 'Flash'}</strong><small>Launchers in build</small></div></div>` +
      `<p class="panel-note">Catalogue listings come from the GitHub API with an ungh.cc mirror fallback. A healthy cache serves instantly; remote listings refresh in the background every 30 minutes.</p></section>`;

    const paneSystem = await (async () => {
      let storeRows = [];
      if ('caches' in window) {
        try {
          storeRows = await Promise.all((await caches.keys()).map(async (k) => ({ k, n: (await (await caches.open(k)).keys()).length })));
        } catch {}
      }
      const estimate = navigator.storage?.estimate ? await navigator.storage.estimate().catch(() => null) : null;
      return `<section class="admin-pane${state.tab === 'system' ? ' active' : ''}" data-admin-pane="system">` +
      `<div class="admin-panel"><div class="admin-section-head"><div><span class="eyebrow">RUNTIME</span><h2>System status</h2><p>What the control center sees about this device and session.</p></div></div>` +
      `<div class="admin-metric-grid three">` +
      `<div><strong>${navigator.serviceWorker ? 'Supported' : 'None'}</strong><small>Service worker</small></div>` +
      `<div class="${window.__flashFirebase?.auth ? '' : 'warn'}"><strong>${window.__flashFirebase?.auth ? 'Connected' : 'Blocked'}</strong><small>Firebase</small></div>` +
      `<div class="${bridge.engine ? '' : 'warn'}"><strong>${bridge.engine ? 'WASM loaded' : 'Not warmed'}</strong><small>Fetch engine</small></div>` +
      `<div><strong>${esc(bridge.endpointUrl || bridge.mode || '—')}</strong><small>Engine endpoint</small></div>` +
      `<div><strong>${esc(bridge.region || 'auto')}</strong><small>Cloud region</small></div>` +
      `<div><strong>${storeRows.length}</strong><small>Cache stores</small></div>` +
      `<div><strong>${fmtBytes(lsTotal())}</strong><small>localStorage used</small></div>` +
      `<div><strong>${estimate ? fmtBytes(estimate.usage) : '—'}</strong><small>Origin quota used</small></div>` +
      `<div><strong>${navigator.onLine ? 'Online' : 'Offline'}</strong><small>Network</small></div></div>` +
      (storeRows.length ? `<p class="panel-note">${storeRows.map((r) => `${esc(r.k)} · ${r.n} items`).join('<br>')}</p>` : '') + `</div>` +
      `<div class="admin-panel"><div class="admin-section-head"><div><span class="eyebrow">PRIVACY</span><h2>What moderation can see</h2></div></div>` +
      `<p class="panel-note">Moderation is limited to data members' own app writes to Firestore: username, email, profile photo, verification state, restriction history, moderator notes, and optional activity counters. The tool cannot read passwords, browser storage, or device data.</p></section></section>`;
    })();

    const paneCodes =
      `<section class="admin-pane${state.tab === 'codes' ? ' active' : ''}" data-admin-pane="codes">` +
      `<div class="admin-panel"><div class="admin-section-head"><div><span class="eyebrow">DEVELOPER CODES</span><h2>Recovery access</h2><p>Codes unlock this device without an account when sign-in is impossible. Stored locally until revoked.</p></div>` +
      `<span class="admin-risk-badge ${dev ? 'good' : 'warn'}" data-admin-codestate>${dev ? 'Device unlocked' : 'Device locked'}</span></div>` +
      `<ul class="admin-code-list">${codes.map((code) => `<li class="admin-code-row"><code data-code>${esc(maskCode(code))}</code><span class="admin-code-actions"><button type="button" class="icon-btn" data-admin-reveal aria-label="Reveal code">${icon('eye')}</button><button type="button" class="icon-btn" data-admin-copy aria-label="Copy code">${icon('copy')}</button></span></li>`).join('')}</ul>` +
      `<div class="admin-actions" style="margin-top:16px">` +
      `<input class="admin-input" id="adminCodeProbe" type="text" placeholder="Validate a code…" style="margin:0 0 10px">` +
      `<div class="row"><button type="button" class="btn" id="adminCodeValidate">${icon('badge-check')} Validate</button>` +
      `<button type="button" class="btn" id="adminCodeUnlockThis">${icon('unlock')} Unlock this device</button>` +
      `<button type="button" class="btn ${dev ? 'danger' : ''}" id="adminCodeLockThis" ${dev ? '' : 'disabled'}>${icon('lock')} Lock this device</button></div></div></section>`;

    target.innerHTML =
      `<div class="admin-shell glass"><div class="admin-head"><div><span class="eyebrow">CONTROL CENTER</span><h1>Administration</h1>` +
      `<p>Six workspaces: member health, moderation, releases, catalogue, runtime and recovery codes.</p></div>` +
      `<span class="admin-role">${icon('shield-check')} ${esc(profile.role || 'staff')}</span></div>` +
      tabHead +
      `${paneOverview}${paneMembers}${paneReleases}${paneCatalogue}${paneSystem}${paneCodes}</div>`;

    /* ----- wiring ----- */

    const setTab = (id) => {
      state.tab = TABS.some((t) => t.id === id) ? id : 'overview';
      target.querySelectorAll('[data-admin-tab]').forEach((b) => b.classList.toggle('active', b.dataset.adminTab === state.tab));
      target.querySelectorAll('[data-admin-pane]').forEach((p) => p.classList.toggle('active', p.dataset.adminPane === state.tab));
    };
    target.querySelectorAll('[data-admin-tab]').forEach((b) => { b.onclick = () => setTab(b.dataset.adminTab); });
    target.querySelectorAll('[data-admin-goto]').forEach((b) => { b.onclick = () => setTab(b.dataset.adminGoto); });
    target.querySelectorAll('[data-open-members]').forEach((b) => { b.onclick = () => openMembers(); });

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
        await render(target, user, profile);
      } catch (error) {
        toast('Clear failed', error.message || 'The cache could not be cleared.', 'error');
      }
    };
    $('#openMemberManagement', target).onclick = () => openMembers();

    /* access codes */
    const codesPane = $('.admin-pane[data-admin-pane="codes"]', target);
    codesPane?.addEventListener('click', async (e) => {
      const row = e.target.closest('.admin-code-row');
      if (row && e.target.closest('[data-admin-reveal]')) {
        const codeEl = row.querySelector('[data-code]');
        const idx = Array.from(codesPane.querySelectorAll('.admin-code-row')).indexOf(row);
        const revealed = codeEl.dataset.revealed === '1';
        codeEl.textContent = revealed ? maskCode(codes[idx] || '') : (codes[idx] || '');
        codeEl.dataset.revealed = revealed ? '0' : '1';
        try { e.target.closest('[data-admin-reveal]').innerHTML = icon(revealed ? 'eye' : 'eye-off'); } catch {}
        icons(e.target.closest('[data-admin-reveal]'));
        return;
      }
      if (row && e.target.closest('[data-admin-copy]')) {
        const idx = Array.from(codesPane.querySelectorAll('.admin-code-row')).indexOf(row);
        try { await navigator.clipboard.writeText(codes[idx] || ''); toast('Code copied', 'Paste it carefully — copy once, use once.', 'success'); }
        catch { toast('Copy failed', 'Clipboard access was blocked.', 'error'); }
      }
    });
    $('#adminCodeValidate', target).onclick = () => {
      const value = $('#adminCodeProbe', target)?.value || '';
      const ok = !!window.FlashAccess?.unlockWithCode?.(value);
      toast(ok ? 'Code is valid' : 'Invalid code', ok ? 'The device is now unlocked (this also applied the unlock).' : 'That code did not match any recovery code.', ok ? 'success' : 'error');
      if (ok) render(target, user, profile);
    };
    $('#adminCodeUnlockThis', target).onclick = () => {
      const probe = $('#adminCodeProbe', target)?.value || '';
      if (!probe.trim()) { toast('Enter a code', 'Type the recovery code in the field first.', 'info'); return; }
      $('#adminCodeValidate', target).click();
    };
    $('#adminCodeLockThis', target).onclick = () => {
      window.FlashAccess?.lock?.();
      toast('Device locked', 'Developer access was removed from this device.', 'success');
      render(target, user, profile);
    };

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
