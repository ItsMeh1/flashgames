(() => {
  'use strict';

  const $ = (selector, root = document) => root.querySelector(selector);
  const esc = (value) => window.FlashData?.esc ? FlashData.esc(value) : String(value ?? '');
  const icon = (name) => `<i data-lucide="${name}"></i>`;

  const isAdmin = (user, profile = {}) => {
    const role = String(profile.role || profile.accountRole || '').toLowerCase();
    const email = String(user?.email || '').toLowerCase();
    return ['admin', 'owner'].includes(role) || role.includes('admin') || role.includes('owner') || /admin|owner|itsmeh1/.test(email);
  };

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

  async function setMaintenance(enabled, message, user) {
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

    const maintenance = await readMaintenance();
    const users = await loadUsers();
    const gameCount = (await FlashData.loadGames()).games.length;
    const version = (await FlashData.loadUpdates()).version;

    target.innerHTML = `
      <div class="page-head">
        <div><span class="eyebrow">CONTROL CENTER</span><h1>Admin</h1><p>Manage Flash Games without leaving the app.</p></div>
      </div>
      <div class="admin-grid">
        <section class="admin-card glass">
          <div class="admin-card-head"><div><span class="eyebrow">OVERVIEW</span><h2>Dashboard</h2></div>${icon('layout-dashboard')}</div>
          <div class="admin-stats"><div><strong>${gameCount.toLocaleString()}</strong><span>Games</span></div><div><strong>${users.length}</strong><span>Users loaded</span></div><div><strong>${esc(version)}</strong><span>Version</span></div></div>
        </section>
        <section class="admin-card glass">
          <div class="admin-card-head"><div><span class="eyebrow">RELEASE CONTROL</span><h2>Maintenance</h2></div>${icon('wrench')}</div>
          <label class="admin-toggle"><span><strong>Private update mode</strong><small>When enabled, normal users see a maintenance screen while admins can continue.</small></span><input id="adminMaintenance" type="checkbox" ${maintenance.enabled ? 'checked' : ''}><span class="switch ${maintenance.enabled ? 'on' : ''}"><i></i></span></label>
          <textarea id="adminMaintenanceMessage" class="admin-textarea" placeholder="Message shown during maintenance">${esc(maintenance.message || 'Flash Games is being updated. Please check back soon.')}</textarea>
          <button class="btn primary" id="saveMaintenance">${icon('save')} Save maintenance settings</button>
        </section>
        <section class="admin-card glass">
          <div class="admin-card-head"><div><span class="eyebrow">CATALOGUE</span><h2>Games</h2></div>${icon('gamepad-2')}</div>
          <p class="admin-note">The Store discovers the real HTML catalogue from the Offline HTML Games Pack. No manual 13-game list is used.</p>
          <div class="admin-actions"><button class="btn" id="refreshCatalogue">${icon('refresh-cw')} Refresh catalogue</button><button class="btn" id="clearGameCacheAdmin">${icon('trash-2')} Clear installed cache</button></div>
        </section>
        <section class="admin-card glass admin-users-card">
          <div class="admin-card-head"><div><span class="eyebrow">USER MANAGEMENT</span><h2>Users</h2></div>${icon('users')}</div>
          <div class="admin-user-list">${users.map((item) => `<div class="admin-user"><span class="avatar"><img src="${esc(item.photoURL || item.photo || item.pfp || './offline/logo.png')}" alt=""></span><div><strong>${esc(item.username || item.displayName || item.email || item.id)}</strong><small>${esc(item.email || item.role || 'User')}</small></div><span class="admin-role">${esc(item.role || 'user')}</span></div>`).join('') || '<p class="admin-note">No user documents could be loaded.</p>'}</div>
        </section>
        <section class="admin-card glass">
          <div class="admin-card-head"><div><span class="eyebrow">UPDATES</span><h2>Changelog</h2></div>${icon('history')}</div>
          <p class="admin-note">Edit <code>update.json</code> in the repository for the public release log. The app automatically displays the green plus, yellow hammer and red X change markers.</p>
          <button class="btn" data-route="updates">${icon('arrow-right')} Open changelog</button>
        </section>
      </div>`;

    $('#saveMaintenance', target)?.addEventListener('click', async () => {
      const enabled = $('#adminMaintenance', target)?.checked === true;
      const message = $('#adminMaintenanceMessage', target)?.value.trim() || 'Flash Games is being updated. Please check back soon.';
      try {
        await setMaintenance(enabled, message, user);
        toast('Maintenance updated', enabled ? 'Normal users will see the maintenance screen.' : 'The site is public again.', 'success');
      } catch (error) {
        toast('Could not save', error.message || 'Firebase rejected the change.', 'error');
      }
    });

    $('#refreshCatalogue', target)?.addEventListener('click', async () => {
      try {
        const result = await FlashData.loadGames(true);
        toast('Catalogue refreshed', `${result.games.length.toLocaleString()} real games are available.`, 'success');
        window.location.hash = 'store';
      } catch (error) {
        toast('Refresh failed', error.message || 'The catalogue could not be refreshed.', 'error');
      }
    });

    $('#clearGameCacheAdmin', target)?.addEventListener('click', async () => {
      await FlashGamesStore.clearGameCache();
      toast('Installed cache cleared', 'The catalogue remains available; installed HTML files were removed.', 'success');
      window.dispatchEvent(new CustomEvent('flashgames:library-changed'));
    });

    if (window.lucide?.createIcons) requestAnimationFrame(() => window.lucide.createIcons({ root: target, attrs: { 'stroke-width': 1.5 } }));
    return true;
  }

  window.FlashAdmin = { render, isAdmin, getProfile, readMaintenance };
})();
