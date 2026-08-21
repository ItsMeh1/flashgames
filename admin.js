(() => {
  'use strict';

  const $ = (selector, root = document) => root.querySelector(selector);
  const esc = (value) => window.FlashData?.esc ? FlashData.esc(value) : String(value ?? '');
  const icon = (name) => `<i data-lucide="${name}"></i>`;

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
    } catch {
      return {};
    }
  }

  async function readMaintenance() {
    const db = window.__flashFirebase?.db;
    if (!db) return { enabled: false, message: '' };
    try {
      const snap = await db.collection('settings').doc('maintenance').get();
      return snap.exists ? snap.data() : { enabled: false, message: '' };
    } catch {
      return { enabled: false, message: '' };
    }
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
      const snapshot = await db.collection('users').limit(100).get();
      return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    } catch {
      return [];
    }
  }

  async function render(target, user, profile, toast) {
    if (!target) return false;
    if (!isAdmin(user, profile)) {
      target.innerHTML = `<div class="empty glass">${icon('shield-off')}<h3>Admin access required</h3><p>Your Firebase account is not authorized for this workspace.</p></div>`;
      return false;
    }

    const [maintenance, users, catalogue, updates] = await Promise.all([
      readMaintenance(),
      loadUsers(),
      FlashData.loadGames(),
      FlashData.loadUpdates()
    ]);

    target.innerHTML = `<div class="admin-shell glass">
      <div class="admin-head"><div><span class="eyebrow">CONTROL CENTER</span><h1>Admin</h1><p>Manage Flash Games without leaving the app.</p></div><span class="admin-role">${esc(profile.role || 'admin')}</span></div>
      <section class="admin-panel"><span class="eyebrow">OVERVIEW</span><h2>Dashboard</h2><p>The live Flash Games data layer currently exposes <strong>${catalogue.games.length.toLocaleString()}</strong> real games. Current release: <strong>${esc(updates.version)}</strong>. Users loaded: <strong>${users.length}</strong>.</p></section>
      <section class="admin-panel"><span class="eyebrow">RELEASE CONTROL</span><h2>Maintenance mode</h2><p>Enable this before publishing an update. Normal users are blocked from the app while authorized admins can still use the control center.</p><div class="maintenance-card ${maintenance.enabled ? 'locked' : ''}"><div><strong>${maintenance.enabled ? 'Update lock is ON' : 'Site is public'}</strong><small>${esc(maintenance.message || 'No maintenance message set.')}</small></div><span class="switch ${maintenance.enabled ? 'on' : ''}"><i></i></span></div><textarea id="adminMaintenanceMessage" class="admin-input" rows="3" placeholder="Maintenance message">${esc(maintenance.message || 'Flash Games is being updated. Please check back soon.')}</textarea><div class="admin-actions"><button class="btn primary" id="adminMaintenanceOn">${icon('lock')} Lock for update</button><button class="btn" id="adminMaintenanceOff">${icon('lock-open')} Re-open site</button></div></section>
      <section class="admin-panel"><span class="eyebrow">CATALOGUE</span><h2>Games</h2><p>The Store discovers the real Offline HTML Games Pack instead of maintaining a tiny hard-coded list.</p><div class="admin-actions"><button class="btn" id="refreshCatalogue">${icon('refresh-cw')} Refresh ${catalogue.games.length.toLocaleString()} games</button><button class="btn" id="clearGameCacheAdmin">${icon('trash-2')} Clear installed cache</button></div></section>
      <section class="admin-panel"><span class="eyebrow">USER MANAGEMENT</span><h2>Users</h2><p>Firebase users are read from the shared Mobify users collection.</p><div class="admin-user-list">${users.map((item) => `<div class="setting-action"><span><span class="avatar"><img src="${esc(item.photoURL || item.photo || item.pfp || './offline/logo.png')}" alt=""></span><span><strong>${esc(item.username || item.displayName || item.email || item.id)}</strong><small>${esc(item.email || item.role || 'User')}</small></span></span><span class="admin-role">${esc(item.role || 'user')}</span></div>`).join('') || '<p>No user documents could be loaded.</p>'}</div></section>
      <section class="admin-panel"><span class="eyebrow">UPDATES</span><h2>Release history</h2><p>Public changelog data comes from <code>update.json</code>. The release view supports the green plus, yellow hammer, and red X markers.</p><button class="btn" data-route="updates">${icon('history')} Open changelog</button></section>
    </div>`;

    const message = () => $('#adminMaintenanceMessage', target)?.value.trim() || 'Flash Games is being updated. Please check back soon.';
    $('#adminMaintenanceOn', target)?.addEventListener('click', async () => { try { await saveMaintenance(user, true, message()); toast('Update lock enabled', 'Normal users are now blocked from the app.', 'success'); await render(target, user, profile, toast); } catch (error) { toast('Could not enable maintenance', error.message || 'Firebase rejected the change.', 'error'); } });
    $('#adminMaintenanceOff', target)?.addEventListener('click', async () => { try { await saveMaintenance(user, false, message()); toast('Site reopened', 'Normal users can access Flash Games again.', 'success'); await render(target, user, profile, toast); } catch (error) { toast('Could not reopen site', error.message || 'Firebase rejected the change.', 'error'); } });
    $('#refreshCatalogue', target)?.addEventListener('click', async () => { try { const result = await FlashData.loadGames(true); toast('Catalogue refreshed', `${result.games.length.toLocaleString()} real games are available.`, 'success'); await render(target, user, profile, toast); } catch (error) { toast('Refresh failed', error.message || 'GitHub could not be reached.', 'error'); } });
    $('#clearGameCacheAdmin', target)?.addEventListener('click', async () => { await FlashGamesStore.clearGameCache(); toast('Installed cache cleared', 'The Store catalogue was left untouched.', 'success'); window.dispatchEvent(new CustomEvent('flashgames:library-changed')); });
    refreshIcons(target);
    return true;
  }

  function refreshIcons(root) {
    if (window.lucide?.createIcons) requestAnimationFrame(() => window.lucide.createIcons({ root, attrs: { 'stroke-width': 1.5 } }));
  }

  window.FlashAdmin = { render, isAdmin, getProfile, readMaintenance };
})();
