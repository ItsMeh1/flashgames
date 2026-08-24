const crypto = require('crypto');
const admin = require('firebase-admin');
const { beforeUserSignedIn, HttpsError, onCall } = require('firebase-functions/v2/identity');
const { onCall: httpsCallable } = require('firebase-functions/v2/https');

admin.initializeApp();
const db = admin.firestore();
const hashIp = (ip) => crypto.createHash('sha256').update(String(ip || '')).digest('hex');
const now = () => Date.now();

function restriction(profile = {}) {
  if (profile.banned || profile.disabled || profile.deleted) return { blocked: true, reason: 'banned' };
  const until = Number(profile.suspendedUntil || 0);
  if (until > now()) return { blocked: true, reason: 'suspended', until };
  return { blocked: false };
}

exports.beforeFlashSignIn = beforeUserSignedIn(async (event) => {
  const uid = event.data?.uid;
  const ip = event.ipAddress || '';
  const ipHash = hashIp(ip);
  const ipDoc = await db.collection('securityIpBans').doc(ipHash).get();
  const ipRule = ipDoc.exists ? ipDoc.data() || {} : {};
  const ipUntil = Number(ipRule.suspendedUntil || 0);
  if (ipRule.banned || ipUntil > now()) {
    throw new HttpsError('permission-denied', ipRule.banned ? 'Access from this network is banned.' : 'Access from this network is temporarily suspended.');
  }
  if (uid) {
    const userRef = db.collection('users').doc(uid);
    const snap = await userRef.get();
    const profile = snap.exists ? snap.data() || {} : {};
    const status = restriction(profile);
    if (status.blocked) throw new HttpsError('permission-denied', 'This account is restricted.');
    if (profile.verified === false) {
      const global = await db.collection('settings').doc('unverifiedAccess').get();
      if (global.exists && global.data()?.suspended === true) throw new HttpsError('permission-denied', 'Unverified accounts are temporarily restricted.');
    }
    await userRef.set({ lastIpHash: ipHash, lastSecurityCheckAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
  }
});

exports.manageFlashRestriction = httpsCallable(async (request) => {
  const actor = request.auth;
  if (!actor) throw new HttpsError('unauthenticated', 'Sign in required.');
  const actorSnap = await db.collection('users').doc(actor.uid).get();
  const role = String(actorSnap.data()?.role || '').toLowerCase();
  if (!['admin', 'owner'].includes(role)) throw new HttpsError('permission-denied', 'Admin access required.');
  const { uid, action, suspendedUntil = 0 } = request.data || {};
  if (!uid || !action) throw new HttpsError('invalid-argument', 'uid and action are required.');
  const targetRef = db.collection('users').doc(String(uid));
  const target = await targetRef.get();
  if (!target.exists) throw new HttpsError('not-found', 'User not found.');
  const profile = target.data() || {};
  const patch = {};
  if (action === 'ban') patch.banned = true;
  else if (action === 'unban') patch.banned = false;
  else if (action === 'suspend') patch.suspendedUntil = Number(suspendedUntil);
  else if (action === 'unsuspend') patch.suspendedUntil = 0;
  else if (action === 'banIp' || action === 'suspendIp') {
    if (!profile.lastIpHash) throw new HttpsError('failed-precondition', 'No server-observed network identifier is available for this user yet.');
    await db.collection('securityIpBans').doc(profile.lastIpHash).set(action === 'banIp' ? { banned: true, updatedAt: admin.firestore.FieldValue.serverTimestamp(), updatedBy: actor.uid } : { banned: false, suspendedUntil: Number(suspendedUntil), updatedAt: admin.firestore.FieldValue.serverTimestamp(), updatedBy: actor.uid }, { merge: true });
  } else if (action === 'unbanIp') {
    if (!profile.lastIpHash) throw new HttpsError('failed-precondition', 'No server-observed network identifier is available for this user.');
    await db.collection('securityIpBans').doc(profile.lastIpHash).delete();
  } else throw new HttpsError('invalid-argument', 'Unknown action.');
  if (Object.keys(patch).length) await targetRef.set(patch, { merge: true });
  if (['ban', 'suspend'].includes(action)) await admin.auth().revokeRefreshTokens(String(uid));
  return { ok: true };
});
