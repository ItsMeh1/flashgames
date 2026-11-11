/* Flash Games OPS — administration rebuilt as an operations console.
 * Public surface: render, isAdmin, loadUsers, readMaintenance, closeMembers.
 * Visuals are intentionally unrelated to the pre-5.4.3 admin cards. */
(() => {
  'use strict';

  const $ = (selector, root = document) => root.querySelector(selector);
  const esc = (value) => window.FlashData?.esc
    ? window.FlashData.esc(value)
    : String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const icon = (name) => `<i data-lucide="${name}"></i>`;
  const icons = (root = document) => { try { window.lucide?.createIcons?.({ root, attrs: { 'stroke-width': 1.5 } }); } catch {} };
  const toast = (title, message, type) => window.FlashUI?.toast?.(title, message, type);

  const ROLES = ['user', 'moderator', 'admin', 'owner'];
  const ARM_WORDS = { ban: 'BAN', delete: 'DELETE', shutdown: 'SHUTDOWN', lock: 'LOCK' };
  const SUS_PRESETS = [
    ['1h', 3600e3, '1 hour'],
    ['24h', 86400e3, '1 day'],
    ['72h', 259200e3, '3 days'],
    ['30d', 2592000e3, '30 days']
  ];
  const MESSAGE_TEMPLATES = [
    ['profile', 'Profile picture', 'Profile picture changed', "Hi {name}, we changed your profile picture because it didn't meet our content rules. You can upload a different one from your profile."],
    ['warning', 'Warning', 'Warning from moderation', "Hi {name}, this is a warning about activity on your account. Please review the community rules and keep things appropriate."],
    ['session', 'Session ended', 'Live session ended', "Hi {name}, a moderator ended your live session. You can start a new one when you're ready."],
    ['content', 'Content', 'Content removed', "Hi {name}, some content on your profile was removed because it didn't follow the community rules. Please update it when you can."]
  ];

  const state = {
    users: [],
    page: 1,
    query: '',
    filter: 'all',
    section: 'pulse',
    selected: null,
    memberTab: 'overview',
    loading: false,
    loadError: ''
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

  /* ---------- records ---------- */

  const nameOf = (x) => x.username || x.displayName || x.email || x.id;
  const photoOf = (x) => x.pfp || x.photoURL || x.photo || x.avatar || '';
  const secureImage = (src) => (/^(data:image\/|https?:\/\/|blob:)/.test(String(src || '')) ? src : './offline/logo.png');
  const fmtDate = (v) => { const n = Number(v || 0); return n ? new Date(n).toLocaleString() : '—'; };

  function statusOf(x) {
    if (x.banned) return ['Banned', 'ban'];
    if (x.disabled) return ['Restricted', 'ban'];
    const until = Number(x.suspendedUntil || 0);
    if (until > Date.now()) return ['Suspended', 'sus'];
    return ['Active', 'ok'];
  }

  /* ---------- data layer ---------- */

  const db = () => window.__flashFirebase?.db || null;
  const currentUid = () => window.__flashFirebase?.auth?.currentUser?.uid || 'ops-deck';

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
      state.loadError = error?.message || 'The member index could not be pulled.';
      throw error;
    } finally {
      state.loading = false;
    }
  }

  async function saveRecord(id, changes) {
    const store = db();
    if (!store) throw new Error('Firebase is not available.');
    await store.collection('users').doc(id).set({ ...changes, updatedAt: Date.now(), updatedBy: currentUid() }, { merge: true });
  }

  async function removeRecord(id) {
    const store = db();
    if (!store) throw new Error('Firebase is not available.');
    await store.collection('users').doc(id).delete();
    state.users = state.users.filter((u) => u.id !== id);
  }

  async function readMaintenance() {
    const store = db();
    if (!store) return { enabled: false, message: '', mode: 'maintenance' };
    try {
      const snap = await store.collection('settings').doc('maintenance').get();
      if (snap.exists) {
        const data = snap.data() || {};
        return { enabled: !!data.enabled, message: data.message || '', mode: data.mode === 'shutdown' ? 'shutdown' : 'maintenance' };
      }
    } catch {}
    return { enabled: false, message: '', mode: 'maintenance' };
  }

  async function saveMaintenance(enabled, message, mode = 'maintenance') {
    const store = db();
    if (!store) throw new Error('Firebase is not available.');
    await store.collection('settings').doc('maintenance').set(
      { enabled, message, mode, updatedAt: Date.now(), updatedBy: currentUid() },
      { merge: true }
    );
  }

  /* ---------- paint ---------- */

  function accessTags(x) {
    const role = String(x.role || 'user').toLowerCase();
    const tags = [];
    if (role && role !== 'user') tags.push(`<span class="ops-tag admin">${esc(role[0].toUpperCase() + role.slice(1))}</span>`);
    if (x.verified !== false) tags.push('<span class="ops-tag">Verified</span>');
    if (x.ultra === true) tags.push('<span class="ops-tag ultra">Ultra</span>');
    return tags.length ? tags.join('') : '<span class="ops-tag">Member</span>';
  }

  function memberRow(x) {
    const [code, cls] = statusOf(x);
    return `<button type="button" class="ops-row" data-ops-member="${esc(x.id)}">` +
      `<span class="avatar"><img src="${esc(secureImage(photoOf(x)))}` + `" alt="" loading="lazy" onerror="this.onerror=null;this.src='./offline/logo.png'"></span>` +
      `<span class="ops-who"><strong>${esc(nameOf(x))}</strong><small>${esc(x.email || x.id)}</small></span>` +
      `<span class="ops-status ${cls}">${code}</span>` +
      `<span class="ops-tags">${accessTags(x)}</span></button>`;
  }

  function filteredMembers() {
    const q = state.query.trim().toLowerCase();
    return state.users.filter((x) => {
      if (q && !`${x.username || ''} ${x.displayName || ''} ${x.email || ''} ${x.id}`.toLowerCase().includes(q)) return false;
      if (state.filter === 'restricted') return x.banned || x.disabled;
      if (state.filter === 'suspended') return Number(x.suspendedUntil || 0) > Date.now();
      if (state.filter === 'unverified') return x.verified === false;
      return true;
    });
  }

  function rowsHTML() {
    const PAGE = 15;
    const rows = filteredMembers();
    const pages = Math.max(1, Math.ceil(rows.length / PAGE));
    state.page = Math.min(Math.max(1, state.page), pages);
    const start = (state.page - 1) * PAGE;
    const slice = rows.slice(start, start + PAGE);
    const body = state.loading
      ? `<div class="ops-empty">${icon('loader-circle')}<span>Loading members…</span></div>`
      : state.loadError && !state.users.length
        ? `<div class="ops-empty bad">${icon('cloud-off')}<strong>Member index unavailable</strong><span>Moderation is read-only until Firebase reconnects.</span></div>`
        : slice.map(memberRow).join('') || `<div class="ops-empty">${icon('users-round')}<strong>No members match</strong><span>Clear the search or choose another filter.</span></div>`;
    return body +
      `<div class="ops-pager"><button type="button" class="ops-btn" data-ops-page="prev"${state.page <= 1 ? ' disabled' : ''} aria-label="Previous">‹</button>` +
      `<span class="ops-mono">${rows.length ? start + 1 : 0}–${Math.min(start + PAGE, rows.length)} / ${rows.length}</span>` +
      `<button type="button" class="ops-btn" data-ops-page="next"${state.page >= pages ? ' disabled' : ''} aria-label="Next">›</button></div>`;
  }

  function factsHTML(x) {
    const until = Number(x.suspendedUntil || 0);
    const suspended = until > Date.now();
    const count = (v) => (v === undefined || v === null || v === '' || !Number.isFinite(Number(v)) ? '—' : Number(v).toLocaleString());
    const cells = [
      [x.uid || x.id, 'Member ID'],
      [fmtDate(x.createdAt || x.created_at), 'Joined'],
      [fmtDate(x.lastSeen || x.lastLoginAt || x.lastActiveAt), 'Last active'],
      [count(x.loginCount ?? x.logins), 'Sign-ins'],
      [count(x.gamesPlayed ?? x.playCount), 'Games played'],
      [suspended ? new Date(until).toLocaleString() : 'None', 'Suspended until'],
      [x.banned ? 'Banned' : (x.disabled ? 'Access disabled' : (suspended ? 'Suspended' : 'None')), 'Restriction']
    ];
    return `<div class="ops-facts">${cells.map((c) => `<div><b>${esc(String(c[0]))}</b><span>${c[1]}</span></div>`).join('')}</div>`;
  }

  function warningsOf(x) {
    const raw = Array.isArray(x?.warnings) ? x.warnings : [];
    return raw.map((warning, index) => {
      if (typeof warning === 'string') return { id: `legacy-${index}`, text: warning, createdAt: 0, by: '' };
      return {
        id: String(warning?.id || `warning-${index}`),
        text: String(warning?.text || warning?.message || warning?.reason || ''),
        createdAt: Number(warning?.createdAt || 0),
        by: String(warning?.by || '')
      };
    }).filter((warning) => warning.text);
  }
  function messagesOf(x) {
    const raw = Array.isArray(x?.moderatorMessages) ? x.moderatorMessages : [];
    return raw.map((message, index) => ({
      id: String(message?.id || `message-${index}`),
      subject: String(message?.subject || 'Message from moderation'),
      body: String(message?.body || message?.message || ''),
      createdAt: Number(message?.createdAt || 0),
      by: String(message?.by || '')
    })).filter((message) => message.body);
  }
  function warningCountOf(x) { return Math.max(Number(x?.warningCount || 0), warningsOf(x).length); }
  function standingOf(x) {
    const [code, cls] = statusOf(x);
    if (cls === 'ban') return [code, 'ban'];
    if (cls === 'sus') return ['Suspended', 'sus'];
    if (warningCountOf(x) > 0) return ['Watch', 'sus'];
    const custom = String(x?.standing || '').trim();
    return custom ? [custom, 'ok'] : ['Good standing', 'ok'];
  }

  function membersIndexHTML() {
    return `<div class="ops-panel">
      <div class="ops-panel-head"><div><strong>Members</strong><small class="ops-note">${state.users.length.toLocaleString()} records loaded</small></div></div>
      <div class="ops-toolbar">
        <input class="ops-input" data-ops-search placeholder="Search by name, email, or member ID" value="${esc(state.query)}">
        <select class="ops-input" data-ops-filter>
          <option value="all"${state.filter === 'all' ? ' selected' : ''}>All members</option>
          <option value="restricted"${state.filter === 'restricted' ? ' selected' : ''}>Restricted</option>
          <option value="suspended"${state.filter === 'suspended' ? ' selected' : ''}>Suspended</option>
          <option value="unverified"${state.filter === 'unverified' ? ' selected' : ''}>Unverified</option>
        </select>
        <button type="button" class="ops-btn" data-ops-reload>${icon('refresh-cw')} Reload</button>
      </div>
      <div class="ops-thead"><span></span><span>Member</span><span>Status</span><span>Access</span></div>
      <div class="ops-table" data-ops-rows>${rowsHTML()}</div>
    </div>`;
  }

  function memberLogItem(title, body, meta) {
    return `<article class="ops-log-item"><div><strong>${esc(title)}</strong>${body ? `<p>${esc(body)}</p>` : ''}<small>${esc(meta)}</small></div></article>`;
  }

  function memberOverviewHTML(x) {
    const [code, cls] = statusOf(x);
    const [standing, standingCls] = standingOf(x);
    const warnings = warningsOf(x), messages = messagesOf(x);
    const context = [
      ['Ban reason', x.banReason],
      ['Suspension reason', x.suspendReason],
      ['Session ended', x.kickReason]
    ].filter(([, value]) => value);
    return `<div class="ops-member-pane${state.memberTab === 'overview' ? ' active' : ''}" data-ops-member-pane="overview">
      <div class="ops-grid2">
        <div class="ops-panel">
          <div class="ops-panel-head"><div><strong>Standing</strong><small class="ops-note">Current access and moderation history.</small></div><span class="ops-status ${standingCls}">${esc(standing)}</span></div>
          <div class="ops-facts">
            <div><b>${esc(code)}</b><span>Account status</span></div>
            <div><b>${warningCountOf(x)}</b><span>Warnings</span></div>
            <div><b>${messages.length}</b><span>Staff messages</span></div>
            <div><b>${esc(String(x.role || 'user'))}</b><span>Role</span></div>
          </div>
          <p class="ops-note">${cls === 'ban' ? 'This account is currently blocked.' : cls === 'sus' ? 'A suspension is active on this account.' : warningCountOf(x) ? 'Warnings are on file. Review the history below.' : 'No active restrictions or warnings on file.'}</p>
        </div>
        <div class="ops-panel">
          <div class="ops-panel-head"><div><strong>Member facts</strong><small class="ops-note">Read directly from the member record.</small></div></div>
          ${factsHTML(x)}
        </div>
      </div>
      <div class="ops-grid2">
        <div class="ops-panel">
          <div class="ops-panel-head"><div><strong>Warnings</strong><small class="ops-note">${warningCountOf(x) ? `${warningCountOf(x)} on file` : 'No warnings recorded'}</small></div></div>
          <div class="ops-log-list">${warnings.length
            ? warnings.slice(0, 12).map((warning) => memberLogItem(warning.text, '', `${fmtDate(warning.createdAt)}${warning.by ? ` · ${warning.by}` : ''}`)).join('')
            : `<div class="ops-empty">${icon('shield-check')}<strong>Clean record</strong><span>No warning entries have been recorded.</span></div>`}</div>
        </div>
        <div class="ops-panel">
          <div class="ops-panel-head"><div><strong>Staff messages</strong><small class="ops-note">Sent to this member's notifications.</small></div></div>
          <div class="ops-log-list">${messages.length
            ? messages.slice(0, 8).map((message) => memberLogItem(message.subject, message.body, `${fmtDate(message.createdAt)}${message.by ? ` · ${message.by}` : ''}`)).join('')
            : `<div class="ops-empty">${icon('mail')}<strong>No messages</strong><span>Messages sent from Actions appear here.</span></div>`}</div>
        </div>
      </div>
      <div class="ops-grid2">
        <div class="ops-panel">
          <div class="ops-panel-head"><div><strong>Moderation context</strong><small class="ops-note">Reasons attached to the latest actions.</small></div></div>
          ${context.length ? `<div class="ops-log-list">${context.map(([label, value]) => memberLogItem(label, value, '')).join('')}</div>` : `<p class="ops-note">No ban, suspension, or session-end reasons recorded.</p>`}
        </div>
        <div class="ops-panel">
          <div class="ops-panel-head"><div><strong>Internal notes</strong><small class="ops-note">Only visible to staff.</small></div></div>
          <p class="ops-member-notes">${esc(x.moderatorNotes || x.modNotes || 'No internal notes have been added.')}</p>
        </div>
      </div>
    </div>`;
  }

  function memberActionsHTML(x) {
    const name = nameOf(x);
    return `<div class="ops-member-pane${state.memberTab === 'actions' ? ' active' : ''}" data-ops-member-pane="actions">
      <div class="ops-grid2">
        <div class="ops-panel">
          <div class="ops-panel-head"><div><strong>Restrict or suspend</strong><small class="ops-note">Changes apply to ${esc(name)} immediately.</small></div></div>
          <label class="ops-inputlabel">Reason shown to the member</label>
          <input class="ops-input" data-ops-reason placeholder="e.g. Cheating in a multiplayer game" maxlength="120">
          <div class="ops-steps">
            <button type="button" class="ops-btn" data-ops-act="unban">${icon('circle-check')} Lift restriction</button>
            <button type="button" class="ops-btn" data-ops-act="kick">${icon('door-open')} End live session</button>
          </div>
          <label class="ops-inputlabel">Suspend for</label>
          <div class="ops-chips">${SUS_PRESETS.map((preset) => `<button type="button" class="ops-chip" data-ops-suspend="${preset[1]}" data-draft="${preset[2]}">${preset[2]}</button>`).join('')}
            <button type="button" class="ops-chip" data-ops-act="unsuspend">${icon('history')} Clear suspension</button></div>
          <p class="ops-note">Bans also disable app access. Type ${ARM_WORDS.ban} to confirm.</p>
          <div class="ops-arm"><input class="ops-input" data-ops-arm placeholder="Type ${ARM_WORDS.ban} to confirm" maxlength="12"><button type="button" class="ops-btn danger" data-ops-act="ban" disabled>${icon('gavel')} Ban member</button></div>
        </div>
        <div class="ops-panel">
          <div class="ops-panel-head"><div><strong>Message this member</strong><small class="ops-note">Delivered to their notifications.</small></div></div>
          <div class="ops-chips">${MESSAGE_TEMPLATES.map((template) => `<button type="button" class="ops-chip" data-ops-template="${template[0]}">${esc(template[1])}</button>`).join('')}</div>
          <label class="ops-inputlabel">Subject</label>
          <input class="ops-input" data-ops-msg-subject maxlength="80" placeholder="Message subject">
          <label class="ops-inputlabel">Message</label>
          <textarea class="ops-input" data-ops-msg-body rows="4" maxlength="1000" placeholder="Explain the action and what they should do next."></textarea>
          <div class="ops-steps"><button type="button" class="ops-btn primary" data-ops-act="message">${icon('send')} Send message</button></div>
          <div class="ops-divider"></div>
          <label class="ops-inputlabel">Warning</label>
          <textarea class="ops-input" data-ops-warning rows="3" maxlength="500" placeholder="Describe the warning shown to the member."></textarea>
          <div class="ops-steps"><button type="button" class="ops-btn" data-ops-act="warning">${icon('triangle-alert')} Issue warning + notify</button></div>
          <p class="ops-note">Warnings appear in Overview and the member's notifications. Use messages for profile-picture or content changes.</p>
        </div>
      </div>
    </div>`;
  }

  function memberAccountHTML(x) {
    const role = String(x.role || 'user').toLowerCase();
    const roles = ROLES.includes(role) ? ROLES : [role, ...ROLES];
    return `<div class="ops-member-pane${state.memberTab === 'account' ? ' active' : ''}" data-ops-member-pane="account">
      <div class="ops-grid2">
        <div class="ops-panel">
          <div class="ops-panel-head"><div><strong>Account access</strong><small class="ops-note">Role and feature flags.</small></div></div>
          <label class="ops-inputlabel">Role</label>
          <select class="ops-input" data-ops-role>${roles.map((item) => `<option value="${item}"${item === role ? ' selected' : ''}>${item[0].toUpperCase()}${item.slice(1)}</option>`).join('')}</select>
          <div class="ops-toggle"><span><strong>Verified</strong><small>Cloud gaming access.</small></span><span class="ops-switch${x.verified !== false ? ' on' : ''}" data-ops-verified><i></i></span></div>
          <div class="ops-toggle"><span><strong>Ultra</strong><small>Game DevTools and hacks.</small></span><span class="ops-switch${x.ultra === true ? ' on' : ''}" data-ops-ultra><i></i></span></div>
          <div class="ops-toggle"><span><strong>App access</strong><small>Disable without deleting data.</small></span><span class="ops-switch${x.disabled ? ' on' : ''}" data-ops-disabled><i></i></span></div>
          <div class="ops-steps"><button type="button" class="ops-btn primary" data-ops-act="save">${icon('save')} Save account changes</button></div>
        </div>
        <div class="ops-panel">
          <div class="ops-panel-head"><div><strong>Internal notes</strong><small class="ops-note">Only visible to staff.</small></div></div>
          <textarea class="ops-input" data-ops-notes rows="7" placeholder="Add context for the next moderator.">${esc(x.moderatorNotes || x.modNotes || '')}</textarea>
          <p class="ops-note">These notes are saved with the account changes.</p>
        </div>
      </div>
      <div class="ops-panel ops-danger-zone">
        <div class="ops-panel-head"><div><strong>Delete record</strong><small class="ops-note">Removes the member document. This cannot be undone.</small></div></div>
        <div class="ops-arm"><input class="ops-input" data-ops-armedit placeholder="Type ${ARM_WORDS.delete} to confirm" maxlength="10"><button type="button" class="ops-btn danger" data-ops-act="deletefire" disabled>${icon('trash-2')} Delete record</button></div>
      </div>
    </div>`;
  }

  function memberPageHTML(x) {
    const [code, cls] = statusOf(x);
    const [standing, standingCls] = standingOf(x);
    const tab = ['overview', 'actions', 'account'].includes(state.memberTab) ? state.memberTab : 'overview';
    return `<div class="ops-member-page" data-ops-member-page="${esc(x.id)}">
      <div class="ops-member-head">
        <button type="button" class="ops-back" data-ops-back>${icon('arrow-left')} Back to members</button>
        <div class="ops-member-id">
          <span class="avatar"><img src="${esc(secureImage(photoOf(x)))}" alt="" onerror="this.onerror=null;this.src='./offline/logo.png'"></span>
          <div><span class="ops-label">Member record</span><h2>${esc(nameOf(x))}</h2><small>${esc(x.email || x.uid || x.id)}</small></div>
        </div>
        <div class="ops-member-tags"><span class="ops-status ${cls}">${code}</span>${standing !== code ? `<span class="ops-status ${standingCls}">${esc(standing)}</span>` : ''}${accessTags(x)}</div>
      </div>
      <div class="ops-subnav" role="tablist" aria-label="Member sections">
        <button type="button" data-ops-member-tab="overview" class="${tab === 'overview' ? 'active' : ''}" role="tab" aria-selected="${tab === 'overview'}">${icon('layout-dashboard')} Overview</button>
        <button type="button" data-ops-member-tab="actions" class="${tab === 'actions' ? 'active' : ''}" role="tab" aria-selected="${tab === 'actions'}">${icon('shield')} Actions</button>
        <button type="button" data-ops-member-tab="account" class="${tab === 'account' ? 'active' : ''}" role="tab" aria-selected="${tab === 'account'}">${icon('user-cog')} Account</button>
      </div>
      ${memberOverviewHTML(x)}
      ${memberActionsHTML(x)}
      ${memberAccountHTML(x)}
    </div>`;
  }

  function memberContentHTML() { return state.selected ? memberPageHTML(state.selected) : membersIndexHTML(); }

  function switchboardHTML(id, title, copy, note, armWord) {
    return `<div class="ops-panel ops-switchboard-unit" data-ops-power="${id}">
      <div class="ops-panel-head"><div><strong>${title}</strong><small class="ops-note">${copy}</small></div><span class="ops-status" data-ops-state>—</span></div>
      ${note ? '<span class="ops-note" data-ops-live-note></span>' : ''}
      <label class="ops-inputlabel">Message shown to members</label>
      <textarea class="ops-input" data-ops-power-msg rows="2" placeholder="Explain what is happening and when to return."></textarea>
      <div class="ops-arm"><input class="ops-input" data-ops-power-arm placeholder="Type ${armWord} to confirm" maxlength="12"><button type="button" class="ops-btn danger" data-ops-power-fire disabled>${icon('power')} Turn off service</button></div>
      <div class="ops-steps"><button type="button" class="ops-btn" data-ops-power-restore>${icon('plug-zap')} Restore service</button></div>
    </div>`;
  }

  function latestHTML(users) {
    const fresh = [...users].filter((x) => x.createdAt).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)).slice(0, 6);
    const hasDates = users.some((x) => x.createdAt);
    return `<div class="ops-panel">
      <div class="ops-panel-head"><strong>Newest members</strong><span class="ops-note">${fresh.length ? `Most recent ${fresh.length}` : (users.length ? 'No join dates' : 'No records')}</span></div>
      <div class="ops-table">${fresh.map(memberRow).join('') || `<div class="ops-empty">${icon('users-round')}<strong>${users.length ? 'No join dates recorded' : 'No members yet'}</strong><span>${users.length ? (hasDates ? 'No recent records.' : 'This member index does not include join dates.') : 'New accounts appear here.'}</span></div>`}</div>
    </div>`;
  }

  function codesHTML(dev, codes) {
    return `<div class="ops-panel">
      <div class="ops-panel-head"><div><strong>Developer access</strong><small class="ops-note">Built-in codes that unlock developer features on this device.</small></div><span class="ops-status ${dev ? 'ok' : 'sus'}">${dev ? 'Unlocked' : 'Locked'}</span></div>
      <div class="ops-table">${codes.map((c, i) => `<div class="ops-code-row" data-code-row="${i}"><code class="ops-key">${esc(maskCode(c))}</code><span class="ops-steps"><button type="button" class="ops-btn" data-code-reveal aria-label="Reveal code">${icon('eye')}</button><button type="button" class="ops-btn" data-code-copy aria-label="Copy code">${icon('copy')}</button></span></div>`).join('') || `<div class="ops-empty">${icon('key-round')}<strong>No developer codes</strong><span>Codes are configured in the access module.</span></div>`}</div>
      <div class="ops-toolbar"><input class="ops-input" data-code-probe placeholder="Enter a developer code"><button type="button" class="ops-btn" data-code-check>${icon('badge-check')} Validate</button><button type="button" class="ops-btn" data-code-unlock>${icon('unlock')} Unlock this device</button><button type="button" class="ops-btn ${dev ? 'danger' : 'ops-dim'}" data-code-lock ${dev ? '' : 'disabled'}>${icon('lock')} Lock device</button></div>
      <p class="ops-note">Unlocking applies only to this browser. Codes are shared across installations.</p>
    </div>`;
  }

  /* ---------- render ---------- */

  async function render(target, user, profile) {
    if (!target) return false;
    if (!isAdmin(user, profile)) {
      target.innerHTML = `<div class="ops-gate glass">${icon('shield-off')}<strong>Admin access required</strong><span>Your account does not have permission to open the admin console.</span></div>`;
      icons(target);
      return false;
    }

    target.innerHTML = `<div class="ops-loading">${icon('loader-circle')}<span>Loading admin console…</span></div>`;
    icons(target);

    const [maintenance, updates] = await Promise.all([readMaintenance(), FlashData.loadUpdates().catch(() => ({}))]);
    let users = [];
    try { users = await loadUsers(); } catch { users = []; }
    if (state.selected) state.selected = users.find((member) => member.id === state.selected.id) || null;
    const catalogue = FlashData.getCachedCatalogue ? FlashData.getCachedCatalogue() : { games: [] };
    const dev = !!(window.FlashAccess?.isDeveloper?.());
    const codes = Array.isArray(window.FlashAccess?.codes) ? window.FlashAccess.codes : [];
    state.section = ['pulse', 'members', 'power', 'access'].includes(state.section) ? state.section : 'pulse';

    const restricted = users.filter((x) => x.banned || x.disabled).length;
    const suspended = users.filter((x) => Number(x.suspendedUntil || 0) > Date.now()).length;
    const unverified = users.filter((x) => x.verified === false).length;
    const version = updates.version || '—';
    const firebaseReady = !!window.__flashFirebase?.db;
    const serviceState = !maintenance.enabled
      ? { label: 'Operational', cls: 'ok' }
      : maintenance.mode === 'shutdown'
        ? { label: 'Shut down', cls: 'ban' }
        : { label: 'Update lock', cls: 'sus' };

    const rail =
      `<aside class="ops-rail"><div class="ops-brand"><span class="ops-brand-mark">FG</span><div><strong>Flash Games</strong><small>Admin console</small></div></div>` +
      `<nav class="ops-nav" aria-label="Admin sections">` +
      `<button type="button" data-ops-rail="pulse" class="${state.section === 'pulse' ? 'active' : ''}">${icon('layout-dashboard')}<span>Overview</span></button>` +
      `<button type="button" data-ops-rail="members" class="${state.section === 'members' ? 'active' : ''}">${icon('users')}<span>Members</span></button>` +
      `<button type="button" data-ops-rail="power" class="${state.section === 'power' ? 'active' : ''}">${icon('server')}<span>Service</span></button>` +
      `<button type="button" data-ops-rail="access" class="${state.section === 'access' ? 'active' : ''}">${icon('key-round')}<span>Access</span></button>` +
      `</nav>` +
      `<div class="ops-rail-foot"><span class="ops-dot${maintenance.enabled ? ' bad' : ''}" data-rail-dot></span><span>${firebaseReady ? 'Firebase configured' : 'Firebase offline'}</span></div></aside>`;

    const pulsePane = `<section class="ops-section${state.section === 'pulse' ? ' active' : ''}" data-ops-section="pulse">
      <div class="ops-stats">
        <div class="ops-stat"><b>${users.length.toLocaleString()}</b><span>Members</span></div>
        <div class="ops-stat bad"><b>${restricted.toLocaleString()}</b><span>Restricted</span></div>
        <div class="ops-stat warn"><b>${suspended.toLocaleString()}</b><span>Suspended</span></div>
        <div class="ops-stat"><b>${unverified.toLocaleString()}</b><span>Unverified</span></div>
      </div>
      <div class="ops-grid2">
        ${latestHTML(users)}
        <div class="ops-panel">
          <div class="ops-panel-head"><strong>System</strong><span class="ops-status ${serviceState.cls}">${serviceState.label}</span></div>
          <div class="ops-facts">
            <div><b>${esc(String(version))}</b><span>Version</span></div>
            <div><b>${Number(catalogue.games?.length || 0).toLocaleString()}</b><span>Catalogue games</span></div>
            <div><b>${navigator.onLine ? 'Online' : 'Offline'}</b><span>Network</span></div>
            <div><b>${firebaseReady ? 'Configured' : 'Offline'}</b><span>Firebase</span></div>
          </div>
          <p class="ops-note">Only data the app writes to Firestore appears here — no passwords or device data.</p>
        </div>
      </div>
    </section>`;

    const membersPane = `<section class="ops-section${state.section === 'members' ? ' active' : ''}" data-ops-section="members">${memberContentHTML()}</section>`;

    const powerPane = `<section class="ops-section${state.section === 'power' ? ' active' : ''}" data-ops-section="power">
      <div class="ops-grid2 ops-power-grid">
        ${switchboardHTML('shutdown', 'Global shutdown', 'Takes the whole service offline for members. Staff keep access.', true, ARM_WORDS.shutdown)}
        <div class="ops-panel ops-switchboard-unit" data-ops-lock="${maintenance.mode === 'shutdown' ? 'shutdown' : 'lock'}">
          <div class="ops-panel-head"><div><strong>Update lock</strong><small class="ops-note">Shows a maintenance screen while you publish a release.</small></div><span class="ops-status ${maintenance.enabled && maintenance.mode !== 'shutdown' ? 'sus' : 'ok'}" data-ops-lock-state>—</span></div>
          <label class="ops-inputlabel">Message shown to members</label>
          <textarea class="ops-input" data-ops-lock-msg rows="2" placeholder="Explain what is being updated and when to return."></textarea>
          <div class="ops-arm"><input class="ops-input" data-ops-lock-arm placeholder="Type ${ARM_WORDS.lock} to confirm" maxlength="10"><button type="button" class="ops-btn danger" data-ops-lock-fire disabled>${icon('lock')} Turn on update lock</button></div>
          <div class="ops-steps"><button type="button" class="ops-btn" data-ops-lock-restore>${icon('plug-zap')} Restore service</button></div>
        </div>
      </div>
    </section>`;

    const accessPane = `<section class="ops-section${state.section === 'access' ? ' active' : ''}" data-ops-section="access">${codesHTML(dev, codes)}</section>`;

    target.innerHTML =
      `<div class="ops-deck">${rail}` +
      `<main class="ops-main">` +
      `<header class="ops-pagehead"><div><span class="eyebrow">ADMINISTRATION</span><h1>Admin console</h1><p>Manage members, service availability, and developer access.</p></div><span class="ops-note">${user?.email ? esc(user.email) : 'Signed out'}</span></header>` +
      `${pulsePane}${membersPane}${powerPane}${accessPane}</main></div>`;

    if (state.loadError && !state.users.length) {
      $('.ops-main', target)?.insertAdjacentHTML('afterbegin', `<div class="ops-deck-err">${icon('triangle-alert')} Firebase could not load members: ${esc(state.loadError)}. Moderation is read-only until it reconnects.</div>`);
    }

    /* ----- live values ----- */
    const shutdownOn = maintenance.enabled && maintenance.mode === 'shutdown';
    const lockOn = maintenance.enabled && maintenance.mode !== 'shutdown';
    const shutdown = $('[data-ops-power="shutdown"]', target);
    if (shutdown) {
      const stateEl = $('[data-ops-state]', shutdown);
      stateEl.textContent = shutdownOn ? 'Service off' : 'Service on';
      stateEl.className = `ops-status ${shutdownOn ? 'ban' : 'ok'}`;
      if (shutdownOn) $('[data-ops-live-note]', shutdown).textContent = `Current message: ${maintenance.message || '—'}`;
      $('[data-ops-power-msg]', shutdown).value = shutdownOn ? (maintenance.message || '') : '';
    }
    const lockRail = $('[data-ops-lock]', target);
    if (lockRail) {
      const lockState = $('[data-ops-lock-state]', lockRail);
      lockState.textContent = lockOn ? 'Update lock on' : 'Off';
      lockState.className = `ops-status ${lockOn ? 'sus' : 'ok'}`;
      $('[data-ops-lock-msg]', lockRail).value = lockOn ? (maintenance.message || '') : '';
      const restore = $('[data-ops-lock-fire]', lockRail);
      restore.disabled = lockOn;
      if (lockOn) restore.innerHTML = `${icon('lock')} Update lock on`;
    }

    /* ----- rail + sections ----- */
    target.querySelectorAll('[data-ops-rail]').forEach((b) => {
      b.onclick = () => {
        state.section = b.dataset.opsRail;
        if (state.section !== 'members') state.selected = null;
        target.querySelectorAll('[data-ops-rail]').forEach((x) => x.classList.toggle('active', x === b));
        target.querySelectorAll('[data-ops-section]').forEach((s) => s.classList.toggle('active', s.dataset.opsSection === state.section));
        if (state.section === 'members' && !state.selected) {
          const membersSection = $('[data-ops-section="members"]', target);
          if (membersSection?.querySelector('[data-ops-member-page]')) paintMembersSection(target);
        }
      };
    });

    /* ----- members console ----- */
    const membersPaneEl = $('[data-ops-section="members"]', target);
    if (membersPaneEl) {
      if (state.selected) wireMemberPage(target, state.selected);
      else wireMembersIndex(target);
    }

    wirePowerSection(target, maintenance, user, profile);
    wireAccessSection(target, dev, codes, user, profile);

    icons(target);
    return true;
  }

  /* every member row opens the full Members pane, never a drawer */
  function wireMemberRows(target) {
    target.querySelectorAll('[data-ops-member]').forEach((row) => { row.onclick = () => openMember(row.dataset.opsMember, target); });
  }

  function wireMembersIndex(target) {
    const section = $('[data-ops-section="members"]', target);
    if (!section) return;
    const search = $('[data-ops-search]', section);
    const filter = $('[data-ops-filter]', section);
    if (search) search.oninput = (event) => { state.query = event.target.value; state.page = 1; paintTable(target); };
    if (filter) filter.onchange = (event) => { state.filter = event.target.value; state.page = 1; paintTable(target); };
    const reload = $('[data-ops-reload]', section);
    if (reload) reload.onclick = (event) => {
      event.preventDefault();
      loadUsers(true).then(() => { state.page = 1; paintTable(target); toast('Member index reloaded', `${state.users.length.toLocaleString()} records pulled.`, 'success'); }).catch((error) => toast('Reload failed', error.message || 'Firebase could not be reached.', 'error'));
    };
    paintTable(target);
  }

  function paintMembersSection(target) {
    const section = $('[data-ops-section="members"]', target);
    if (!section) return;
    section.innerHTML = memberContentHTML();
    if (state.selected) wireMemberPage(target, state.selected);
    else wireMembersIndex(target);
    icons(section);
  }

  function openMember(id, target) {
    state.selected = state.users.find((x) => x.id === id) || null;
    state.memberTab = 'overview';
    if (!state.selected) { toast('Member unavailable', 'That member record is no longer loaded.', 'error'); return; }
    state.section = 'members';
    target.querySelectorAll('[data-ops-rail]').forEach((b) => b.classList.toggle('active', b.dataset.opsRail === 'members'));
    target.querySelectorAll('[data-ops-section]').forEach((s) => s.classList.toggle('active', s.dataset.opsSection === 'members'));
    paintMembersSection(target);
  }

  function paintTable(target) {
    const table = $('[data-ops-rows]', target);
    if (table) table.innerHTML = rowsHTML();
    const scope = $('[data-ops-section="members"]', target);
    if (scope) scope.querySelectorAll('[data-ops-page]').forEach((button) => {
      button.onclick = () => { state.page = Math.max(1, state.page + (button.dataset.opsPage === 'next' ? 1 : -1)); paintTable(target); };
    });
    wireMemberRows(target);
  }

  async function notifyUser(uid, title, message, type = 'moderator') {
    const store = db();
    if (!store) throw new Error('Firebase is not available.');
    await store.collection('notifications').add({ uid, title, message, type, createdAt: Date.now(), createdBy: currentUid(), read: false });
  }

  function wireMemberPage(scope, x) {
    if (!x) return;
    const page = $('[data-ops-member-page]', scope);
    if (!page) return;
    const name = nameOf(x);
    const reason = () => $('[data-ops-reason]', page)?.value.trim() || '';
    const armInput = $('[data-ops-arm]', page);
    const armFire = $('[data-ops-act="ban"]', page);
    if (armInput && armFire) armInput.oninput = () => { armFire.disabled = armInput.value.trim().toUpperCase() !== ARM_WORDS.ban; };
    const delInput = $('[data-ops-armedit]', page);
    const delFire = $('[data-ops-act="deletefire"]', page);
    if (delInput && delFire) delInput.oninput = () => { delFire.disabled = delInput.value.trim().toUpperCase() !== ARM_WORDS.delete; };
    ['verified', 'ultra', 'disabled'].forEach((key) => {
      const toggle = $(`[data-ops-${key}]`, page);
      if (toggle) toggle.onclick = () => toggle.classList.toggle('on');
    });

    $('[data-ops-back]', page).onclick = () => { state.selected = null; state.memberTab = 'overview'; paintMembersSection(scope); };
    page.querySelectorAll('[data-ops-member-tab]').forEach((button) => {
      button.onclick = () => {
        const tab = button.dataset.opsMemberTab;
        state.memberTab = tab;
        page.querySelectorAll('[data-ops-member-tab]').forEach((item) => {
          const active = item === button;
          item.classList.toggle('active', active);
          item.setAttribute('aria-selected', String(active));
        });
        page.querySelectorAll('[data-ops-member-pane]').forEach((pane) => pane.classList.toggle('active', pane.dataset.opsMemberPane === tab));
      };
    });

    page.querySelectorAll('[data-ops-template]').forEach((button) => {
      button.onclick = () => {
        const template = MESSAGE_TEMPLATES.find((item) => item[0] === button.dataset.opsTemplate);
        if (!template) return;
        const subject = $('[data-ops-msg-subject]', page);
        const body = $('[data-ops-msg-body]', page);
        if (subject) subject.value = template[2];
        if (body) body.value = template[3].replace(/\{name\}/g, name);
        body?.focus();
      };
    });

    const after = (title, message) => { toast(title, message, 'success'); paintMembersSection(scope); };
    const fail = (error) => toast('Action failed', error?.message || 'Firebase rejected the change.', 'error');

    page.querySelectorAll('[data-ops-act]').forEach((button) => {
      button.onclick = async () => {
        const act = button.dataset.opsAct;
        try {
          if (act === 'ban') {
            if (!armInput || armInput.value.trim().toUpperCase() !== ARM_WORDS.ban) { toast('Confirmation word', `Type ${ARM_WORDS.ban} in the box to confirm.`, 'info'); return; }
            await saveRecord(x.id, { banned: true, disabled: true, bannedAt: Date.now(), bannedBy: currentUid(), banReason: reason() });
            Object.assign(x, { banned: true, disabled: true, banReason: reason() });
            after('Member banned', `${name} is now blocked from Flash Games.`);
          } else if (act === 'unban') {
            await saveRecord(x.id, { banned: false, disabled: false, suspendedUntil: 0 });
            Object.assign(x, { banned: false, disabled: false, suspendedUntil: 0 });
            after('Restriction lifted', `${name} can return to Flash Games.`);
          } else if (act === 'kick') {
            await saveRecord(x.id, { kickAt: Date.now(), kickReason: reason(), kickedBy: currentUid() });
            Object.assign(x, { kickAt: Date.now(), kickReason: reason() });
            after('Session ended', `${name} was removed from any live session.`);
          } else if (act === 'unsuspend') {
            await saveRecord(x.id, { suspendedUntil: 0 });
            Object.assign(x, { suspendedUntil: 0 });
            after('Suspension cleared', `${name} is no longer suspended.`);
          } else if (act === 'save') {
            const changes = {
              role: $('[data-ops-role]', page).value,
              verified: $('[data-ops-verified]', page).classList.contains('on'),
              ultra: $('[data-ops-ultra]', page).classList.contains('on'),
              disabled: $('[data-ops-disabled]', page).classList.contains('on'),
              verificationStatus: $('[data-ops-verified]', page).classList.contains('on') ? 'verified' : 'unverified',
              moderatorNotes: $('[data-ops-notes]', page)?.value.trim() || ''
            };
            await saveRecord(x.id, changes);
            Object.assign(x, changes);
            after('Account saved', `${name}'s account was updated.`);
          } else if (act === 'message') {
            const subject = $('[data-ops-msg-subject]', page)?.value.trim() || 'Message from moderation';
            const body = $('[data-ops-msg-body]', page)?.value.trim() || '';
            if (!body) { toast('Message required', 'Write the message before sending it.', 'warn'); return; }
            const message = { id: `msg-${Date.now().toString(36)}`, subject, body, createdAt: Date.now(), by: currentUid() };
            const messages = [message, ...messagesOf(x)].slice(0, 30);
            await saveRecord(x.id, { moderatorMessages: messages });
            await notifyUser(x.id, subject, body, 'moderator');
            Object.assign(x, { moderatorMessages: messages });
            after('Message sent', `${name} will see it in notifications.`);
          } else if (act === 'warning') {
            const text = $('[data-ops-warning]', page)?.value.trim() || '';
            if (!text) { toast('Warning required', 'Describe the warning before issuing it.', 'warn'); return; }
            const warning = { id: `warn-${Date.now().toString(36)}`, text, createdAt: Date.now(), by: currentUid() };
            const warnings = [warning, ...warningsOf(x)].slice(0, 50);
            await saveRecord(x.id, { warnings, warningCount: warnings.length });
            await notifyUser(x.id, 'Warning from moderation', text, 'warning');
            Object.assign(x, { warnings, warningCount: warnings.length });
            after('Warning issued', `${name} has been warned and notified.`);
          } else if (act === 'deletefire') {
            if (!delInput || delInput.value.trim().toUpperCase() !== ARM_WORDS.delete) { toast('Confirmation word', `Type ${ARM_WORDS.delete} to confirm.`, 'info'); return; }
            await removeRecord(x.id);
            state.selected = null;
            state.memberTab = 'overview';
            paintMembersSection(scope);
            toast('Record deleted', `${name}'s profile data was deleted.`, 'success');
          }
        } catch (error) { fail(error); }
      };
    });

    page.querySelectorAll('[data-ops-suspend]').forEach((chip) => {
      chip.onclick = async () => {
        const until = Date.now() + Number(chip.dataset.opsSuspend);
        try {
          await saveRecord(x.id, { suspendedUntil: until, suspendReason: reason() });
          Object.assign(x, { suspendedUntil: until, suspendReason: reason() });
          after('Member suspended', `${name} is suspended for ${chip.dataset.draft}.`);
        } catch (error) { fail(error); }
      };
    });
  }

  /* ----- power switchboards ----- */
  function wirePowerSection(target, maintenance, user, profile) {
    const shutdown = $('[data-ops-power="shutdown"]', target);
    const bindArm = (scope, inputSel, fireSel, word) => {
      const input = $(inputSel, scope);
      const fire = $(fireSel, scope);
      if (input && fire) input.oninput = () => { fire.disabled = input.value.trim().toUpperCase() !== word; };
    };

    if (shutdown) {
      bindArm(shutdown, '[data-ops-power-arm]', '[data-ops-power-fire]', ARM_WORDS.shutdown);
      $('[data-ops-power-fire]', shutdown).onclick = async () => {
        const word = $('[data-ops-power-arm]', shutdown).value.trim().toUpperCase();
        if (word !== ARM_WORDS.shutdown) { toast('Confirmation word', `Type ${ARM_WORDS.shutdown} to arm the shutdown.`, 'info'); return; }
        const message = $('[data-ops-power-msg]', shutdown).value.trim() || 'Flash Games has been shut down. Check back soon.';
        try {
          await saveMaintenance(true, message, 'shutdown');
          toast('Service shut down', 'Every non-staff member now sees the powered-off screen.', 'success');
          await render(target, user, profile);
        } catch (error) { toast('Shutdown failed', error.message || 'Firebase rejected the change.', 'error'); }
      };
      $('[data-ops-power-restore]', shutdown).onclick = async () => {
        try {
          await saveMaintenance(false, $('[data-ops-power-msg]', shutdown).value.trim(), 'maintenance');
          toast('Service restored', 'Members can load Flash Games again.', 'success');
          await render(target, user, profile);
        } catch (error) { toast('Restore failed', error.message || 'Firebase rejected the change.', 'error'); }
      };
    }

    const lock = $('[data-ops-lock]', target);
    if (lock) {
      bindArm(lock, '[data-ops-lock-arm]', '[data-ops-lock-fire]', ARM_WORDS.lock);
      $('[data-ops-lock-fire]', lock).onclick = async () => {
        const word = $('[data-ops-lock-arm]', lock).value.trim().toUpperCase();
        if (word !== ARM_WORDS.lock) { toast('Confirmation word', `Type ${ARM_WORDS.lock} to engage the lock.`, 'info'); return; }
        const message = $('[data-ops-lock-msg]', lock).value.trim() || 'Flash Games is being updated. Please check back soon.';
        try {
          await saveMaintenance(true, message, 'maintenance');
          toast('Release lock engaged', 'Normal members see the update screen while you ship.', 'success');
          await render(target, user, profile);
        } catch (error) { toast('Lock failed', error.message || 'Firebase rejected the change.', 'error'); }
      };
      $('[data-ops-lock-restore]', lock).onclick = async () => {
        try {
          await saveMaintenance(false, '', 'maintenance');
          toast('Site reopened', 'Members can access Flash Games again.', 'success');
          await render(target, user, profile);
        } catch (error) { toast('Restore failed', error.message || 'Firebase rejected the change.', 'error'); }
      };
    }
  }

  /* ----- access codes ----- */
  function wireAccessSection(target, dev, codes, user, profile) {
    const pane = $('[data-ops-section="access"]', target);
    if (!pane) return;
    pane.querySelectorAll('[data-code-reveal]').forEach((b) => {
      b.onclick = () => {
        const row = b.closest('[data-code-row]');
        const i = Number(row.dataset.codeRow);
        const key = row.querySelector('.ops-key');
        const hidden = !key.dataset.plain;
        key.textContent = hidden ? codes[i] : maskCode(codes[i]);
        if (hidden) key.dataset.plain = '1'; else delete key.dataset.plain;
        icons(pane);
      };
    });
    pane.querySelectorAll('[data-code-copy]').forEach((b) => {
      b.onclick = async () => {
        const i = Number(b.closest('[data-code-row]').dataset.codeRow);
        try { await navigator.clipboard.writeText(codes[i] || ''); toast('Code copied', 'Paste it where you need it.', 'success'); }
        catch { toast('Copy failed', 'Clipboard access was blocked.', 'error'); }
      };
    });
    const probe = () => $('[data-code-probe]', pane)?.value || '';
    $('[data-code-check]', pane).onclick = () => {
      const ok = !!window.FlashAccess?.unlockWithCode?.(probe());
      toast(ok ? 'Code is valid' : 'Invalid code', ok ? 'The device is now unlocked.' : 'That code did not match any recovery code.', ok ? 'success' : 'error');
      if (ok) render(target, user, profile);
    };
    $('[data-code-unlock]', pane).onclick = () => {
      if (!probe().trim()) { toast('Enter a code', 'Type the recovery code in the field first.', 'info'); return; }
      $('[data-code-check]', pane).click();
    };
    $('[data-code-lock]', pane).onclick = () => {
      window.FlashAccess?.lock?.();
      toast('Device locked', 'Developer access was removed from this device.', 'success');
      render(target, user, profile);
    };
  }

  const maskCode = (code) => String(code).replace(/./g, (ch, i) => (ch === '-' ? '-' : i > 3 && i < String(code).length - 2 ? '•' : ch));

  /* ---------- legacy modal hook ---------- */

  function closeMembers() { /* the deck has no external member modal anymore */ }

  window.FlashAdmin = Object.freeze({
    render,
    isAdmin,
    loadUsers,
    readMaintenance,
    closeMembers
  });
})();
