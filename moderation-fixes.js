(() => {
  'use strict';

  const icon = (name) => `<i data-lucide="${name}"></i>`;
  const toast = (title, message, type = 'info') => window.FlashUI?.toast?.(title, message, type);

  async function saveProfile(id, changes) {
    const db = window.__flashFirebase?.db;
    const auth = window.__flashFirebase?.auth;
    const admin = auth?.currentUser;
    if (!db || !admin) throw new Error('Firebase is not available.');
    await db.collection('users').doc(id).set({ ...changes, updatedAt: Date.now(), updatedBy: admin.uid }, { merge: true });
  }

  function confirmAction(title, text, action, danger = false) {
    const backdrop = document.getElementById('dialogBackdrop');
    const titleNode = document.getElementById('dialogTitle');
    const textNode = document.getElementById('dialogText');
    const iconNode = document.getElementById('dialogIcon');
    const confirm = document.getElementById('dialogConfirm');
    const cancel = document.getElementById('dialogCancel');
    if (!backdrop || !titleNode || !textNode || !iconNode || !confirm || !cancel) return;
    titleNode.textContent = title;
    textNode.textContent = text;
    iconNode.innerHTML = icon(danger ? 'triangle-alert' : 'circle-help');
    confirm.className = `btn ${danger ? 'danger' : 'primary'}`;
    backdrop.hidden = false;
    const close = () => { backdrop.hidden = true; confirm.onclick = null; cancel.onclick = null; };
    cancel.onclick = close;
    confirm.onclick = async () => { try { await action(); } catch (error) { toast('Moderation failed', error.message || 'The change could not be saved.', 'error'); } finally { close(); } };
    window.lucide?.createIcons?.({ root: backdrop, attrs: { 'stroke-width': 1.5 } });
  }

  function addTools() {
    const editor = document.getElementById('adminUserEditor');
    if (!editor || editor.hidden || editor.querySelector('.moderation-tools')) return;
    const name = editor.querySelector('.admin-editor-head h3')?.textContent || 'this member';
    const email = editor.querySelector('.admin-editor-head p')?.textContent || '';
    const id = window.__flashModerationSelectedId;
    if (!id) return;
    const tools = document.createElement('section');
    tools.className = 'moderation-tools';
    tools.innerHTML = `<h4>Moderation</h4><div class="moderation-grid"><button class="btn" id="moderationBan">${icon('ban')} Ban</button><button class="btn" id="moderationUnban">${icon('circle-check')} Unban</button></div><label>Suspension end date<input id="moderationSuspension" type="datetime-local"></label><div class="moderation-grid"><button class="btn" id="moderationSuspend">${icon('clock-3')} Suspend</button><button class="btn" id="moderationUnsuspend">${icon('clock-restore')} Unsuspend</button></div><button class="btn danger moderation-danger" id="moderationDelete">${icon('trash-2')} Delete profile data</button>`;
    editor.appendChild(tools);
    tools.querySelector('#moderationBan').onclick = () => confirmAction('Ban member?', `Ban ${name}${email ? ` (${email})` : ''}. They will be blocked from Flash Games.`, async () => { await saveProfile(id, { banned: true, disabled: true, bannedAt: Date.now() }); toast('Member banned', `${name} is now blocked.`, 'success'); });
    tools.querySelector('#moderationUnban').onclick = async () => { try { await saveProfile(id, { banned: false, disabled: false }); toast('Member unbanned', `${name} can access Flash Games again.`, 'success'); } catch (error) { toast('Could not unban member', error.message || 'The change failed.', 'error'); } };
    tools.querySelector('#moderationSuspend').onclick = async () => { const value = tools.querySelector('#moderationSuspension').value; const until = value ? new Date(value).getTime() : 0; if (!until || until <= Date.now()) { toast('Invalid suspension', 'Choose a future suspension end date.', 'error'); return; } try { await saveProfile(id, { suspendedUntil: until }); toast('Member suspended', `${name} is suspended until ${new Date(until).toLocaleString()}.`, 'success'); } catch (error) { toast('Could not suspend member', error.message || 'The change failed.', 'error'); } };
    tools.querySelector('#moderationUnsuspend').onclick = async () => { try { await saveProfile(id, { suspendedUntil: 0 }); toast('Suspension removed', `${name} is no longer suspended.`, 'success'); } catch (error) { toast('Could not unsuspend member', error.message || 'The change failed.', 'error'); } };
    tools.querySelector('#moderationDelete').onclick = () => confirmAction('Delete profile data?', `This permanently deletes the Flash Games user document for ${name}. Firebase Authentication accounts cannot be deleted for another user from a browser-only client.`, async () => { const db = window.__flashFirebase?.db; if (!db) throw new Error('Firebase is not available.'); await db.collection('users').doc(id).delete(); toast('Profile data deleted', `${name}'s Flash Games profile was deleted.`, 'success'); document.getElementById('closeAdminUserEditor')?.click(); }, true);
    window.lucide?.createIcons?.({ root: tools, attrs: { 'stroke-width': 1.5 } });
  }

  function captureSelectedUser() {
    document.addEventListener('click', (event) => {
      const row = event.target.closest('.admin-member-row');
      if (!row) return;
      window.__flashModerationSelectedId = row.dataset.memberId || null;
      window.setTimeout(addTools, 0);
    }, true);
  }

  window.addEventListener('DOMContentLoaded', captureSelectedUser, { once: true });
})();
