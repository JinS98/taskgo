import assert from 'node:assert/strict';
import { initializeApp as initializeAdminApp, deleteApp as deleteAdminApp } from 'firebase-admin/app';
import { getFirestore as getAdminFirestore, Timestamp } from 'firebase-admin/firestore';
import { initializeApp, deleteApp } from 'firebase/app';
import { applyActionCode, connectAuthEmulator, createUserWithEmailAndPassword, getAuth, getIdToken, GoogleAuthProvider, reload, sendEmailVerification, signInWithCredential } from 'firebase/auth';
import { collection, connectFirestoreEmulator, doc, getFirestore, serverTimestamp, setDoc, writeBatch } from 'firebase/firestore';
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';

process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST ||= '127.0.0.1:9099';
const projectId = 'demo-taskgo';
const adminApp = initializeAdminApp({ projectId }, 'workspace-test-admin');
const adminDb = getAdminFirestore(adminApp);
const apps = [];
let rules;

async function account(name, email, verify = true) {
  const app = initializeApp({ apiKey: 'demo-taskgo-key', authDomain: 'demo-taskgo.firebaseapp.com', projectId, appId: 'demo-taskgo-web' }, name);
  apps.push(app);
  const auth = getAuth(app);
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  const db = getFirestore(app);
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  const functions = getFunctions(app, 'asia-northeast3');
  connectFunctionsEmulator(functions, '127.0.0.1', 5001);
  const { user } = await createUserWithEmailAndPassword(auth, email, 'StrongPass123!');
  if (verify) {
    await sendEmailVerification(user);
    const { oobCodes } = await fetch('http://127.0.0.1:9099/emulator/v1/projects/demo-taskgo/oobCodes').then((response) => response.json());
    const code = oobCodes.find((item) => item.email === email && item.requestType === 'VERIFY_EMAIL')?.oobCode;
    assert.ok(code);
    await applyActionCode(auth, code);
    await reload(user);
  }
  const call = (name, data) => httpsCallable(functions, name)(data);
  return { user, auth, db, call };
}

async function createWorkspace(account, name) {
  await getIdToken(account.user, true);
  const workspace = doc(collection(account.db, 'workspaces'));
  const batch = writeBatch(account.db);
  batch.set(workspace, { name, ownerId: account.user.uid, createdAt: serverTimestamp() });
  batch.set(doc(account.db, 'workspaces', workspace.id, 'members', account.user.uid), { uid: account.user.uid, email: account.user.email, role: 'owner', joinedAt: serverTimestamp() });
  batch.set(doc(account.db, 'users', account.user.uid, 'workspaces', workspace.id), { workspaceId: workspace.id, name, role: 'owner', joinedAt: serverTimestamp() });
  await batch.commit();
  return workspace.id;
}

async function rejected(promise, code) {
  await assert.rejects(promise, (error) => error.code === `functions/${code}`);
}

try {
  const owner = await account('owner', 'owner@gmail.com');
  const googleApp = initializeApp({ apiKey: 'demo-taskgo-key', authDomain: 'demo-taskgo.firebaseapp.com', projectId, appId: 'demo-taskgo-web' }, 'google-owner');
  apps.push(googleApp);
  const googleAuth = getAuth(googleApp);
  connectAuthEmulator(googleAuth, 'http://127.0.0.1:9099', { disableWarnings: true });
  const googleDb = getFirestore(googleApp);
  connectFirestoreEmulator(googleDb, '127.0.0.1', 8080);
  const googleUser = (await signInWithCredential(googleAuth, GoogleAuthProvider.credential(JSON.stringify({ sub: 'workspace-google-owner', email: 'google-owner@gmail.com', email_verified: true })))).user;
  const googleWorkspaceId = await createWorkspace({ user: googleUser, db: googleDb }, 'Google Team');
  assert.equal((await adminDb.doc(`workspaces/${googleWorkspaceId}`).get()).get('ownerId'), googleUser.uid);
  const guest = await account('guest', 'guest@gmail.com');
  const stranger = await account('stranger', 'stranger@gmail.com');
  const unverified = await account('unverified', 'unverified@gmail.com', false);

  await assert.rejects(createWorkspace(unverified, 'Unauthorized'), (error) => error.code === 'permission-denied');
  const workspaceId = await createWorkspace(owner, 'Taskgo Team');
  assert.equal((await adminDb.collection('workspaceInvites').get()).size, 0);
  await assert.rejects(setDoc(doc(collection(owner.db, 'workspaces')), { name: 'Incomplete', ownerId: owner.user.uid, createdAt: serverTimestamp() }), (error) => error.code === 'permission-denied');
  assert.equal((await adminDb.doc(`workspaces/${workspaceId}`).get()).get('ownerId'), owner.user.uid);
  assert.equal((await adminDb.doc(`workspaces/${workspaceId}/members/${owner.user.uid}`).get()).get('role'), 'owner');

  await rejected(guest.call('inviteMember', { workspaceId, email: 'stranger@gmail.com' }), 'permission-denied');
  await rejected(owner.call('inviteMember', { workspaceId, email: 'outside@example.com' }), 'invalid-argument');
  const first = (await owner.call('inviteMember', { workspaceId, email: 'guest@gmail.com' })).data;
  assert.ok(first.link);
  const firstToken = new URL(first.link).searchParams.get('token');
  await rejected(guest.call('revokeInvite', { inviteId: first.inviteId }), 'permission-denied');
  await owner.call('revokeInvite', { inviteId: first.inviteId });
  await rejected(guest.call('acceptInvite', { inviteId: first.inviteId, token: firstToken }), 'failed-precondition');

  const second = (await owner.call('inviteMember', { workspaceId, email: 'guest@gmail.com' })).data;
  const secondToken = new URL(second.link).searchParams.get('token');
  await rejected(stranger.call('acceptInvite', { inviteId: second.inviteId, token: secondToken }), 'permission-denied');
  await rejected(unverified.call('acceptInvite', { inviteId: second.inviteId, token: secondToken }), 'permission-denied');
  await rejected(guest.call('acceptInvite', { inviteId: second.inviteId, token: 'x'.repeat(43) }), 'permission-denied');
  assert.equal((await guest.call('acceptInvite', { inviteId: second.inviteId, token: secondToken })).data.workspaceId, workspaceId);
  await rejected(guest.call('acceptInvite', { inviteId: second.inviteId, token: secondToken }), 'failed-precondition');
  assert.equal((await adminDb.doc(`workspaces/${workspaceId}/members/${guest.user.uid}`).get()).get('role'), 'member');

  const expired = (await owner.call('inviteMember', { workspaceId, email: 'stranger@gmail.com' })).data;
  await adminDb.doc(`workspaceInvites/${expired.inviteId}`).update({ expiresAt: Timestamp.fromMillis(Date.now() - 1000) });
  await rejected(stranger.call('acceptInvite', { inviteId: expired.inviteId, token: new URL(expired.link).searchParams.get('token') }), 'deadline-exceeded');
  const race = (await owner.call('inviteMember', { workspaceId, email: 'stranger@gmail.com' })).data;
  const raceData = { inviteId: race.inviteId, token: new URL(race.link).searchParams.get('token') };
  const results = await Promise.allSettled([stranger.call('acceptInvite', raceData), stranger.call('acceptInvite', raceData)]);
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal(results.filter((result) => result.status === 'rejected').length, 1);
  assert.equal((await adminDb.doc(`workspaceInvites/${race.inviteId}`).get()).get('status'), 'accepted');

  rules = await initializeTestEnvironment({ projectId, firestore: { host: '127.0.0.1', port: 8080 } });
  const ownerDb = rules.authenticatedContext(owner.user.uid).firestore();
  const guestDb = rules.authenticatedContext(guest.user.uid).firestore();
  const unknownDb = rules.authenticatedContext(unverified.user.uid).firestore();
  const publicDb = rules.unauthenticatedContext().firestore();
  const workspacePath = `workspaces/${workspaceId}`;
  await assertSucceeds(ownerDb.doc(workspacePath).get());
  await assertSucceeds(guestDb.doc(workspacePath).get());
  await assertFails(unknownDb.doc(workspacePath).get());
  await assertFails(publicDb.doc(workspacePath).get());
  await assertSucceeds(guestDb.doc(`users/${guest.user.uid}/workspaces/${workspaceId}`).get());
  await assertFails(ownerDb.doc(`users/${guest.user.uid}/workspaces/${workspaceId}`).get());
  await assertFails(guestDb.doc(`workspaceInvites/${second.inviteId}`).get());
  await assertFails(ownerDb.doc(`workspaceInvites/${second.inviteId}`).get());

  await adminDb.doc('channels/general').set({ workspaceId, name: 'general' });
  await adminDb.doc('dmRooms/private').set({ workspaceId, participantIds: [owner.user.uid, stranger.user.uid] });
  await adminDb.doc('messages/channel-message').set({ workspaceId, sourceType: 'channel', channelId: 'general', content: 'public to members' });
  await adminDb.doc('messages/dm-message').set({ workspaceId, sourceType: 'dm', dmRoomId: 'private', content: 'private' });
  await adminDb.doc('tasks/sample').set({ workspaceId, title: 'Visible task metadata', sourceMessageId: 'dm-message' });
  await assertSucceeds(guestDb.doc('channels/general').get());
  await assertFails(unknownDb.doc('channels/general').get());
  await assertSucceeds(guestDb.doc('messages/channel-message').get());
  await assertFails(guestDb.doc('messages/dm-message').get());
  await assertSucceeds(ownerDb.doc('messages/dm-message').get());
  await assertSucceeds(guestDb.doc('tasks/sample').get());
  await assertFails(unknownDb.doc('tasks/sample').get());
  await assertFails(ownerDb.doc('messages/channel-message').set({ workspaceId, content: 'forged' }));
  await assertFails(guestDb.doc(workspacePath).update({ ownerId: guest.user.uid }));
  await rejected(guest.call('listInvites', { workspaceId }), 'permission-denied');
  assert.ok((await owner.call('listInvites', { workspaceId })).data.invites.length >= 4);

  console.log('Workspace creation, invitation lifecycle, concurrent acceptance, and member-scoped Firestore rules passed.');
} finally {
  if (rules) await rules.cleanup();
  for (const app of apps) await deleteApp(app);
  await deleteAdminApp(adminApp);
}
