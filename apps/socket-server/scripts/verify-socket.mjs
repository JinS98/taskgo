import assert from 'node:assert/strict';
import { initializeApp as initializeAdminApp, deleteApp as deleteAdminApp } from 'firebase-admin/app';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { initializeApp, deleteApp } from 'firebase/app';
import { applyActionCode, connectAuthEmulator, createUserWithEmailAndPassword, getAuth, getIdToken, GoogleAuthProvider, reload, sendEmailVerification, signInWithCredential } from 'firebase/auth';
import { io as createClient } from 'socket.io-client';
import { createSocketApp, listenSocketApp, closeSocketApp } from '../dist/app.js';
import { createFirebaseSocketServices } from '../dist/firebase.js';

assert.equal(process.env.GCLOUD_PROJECT, 'demo-taskgo');
assert.ok(process.env.FIREBASE_AUTH_EMULATOR_HOST);
assert.ok(process.env.FIRESTORE_EMULATOR_HOST);
const projectId = 'demo-taskgo';
const allowedOrigin = 'http://localhost:5173';
const adminApp = initializeAdminApp({ projectId }, 'socket-test-fixture');
const adminAuth = getAdminAuth(adminApp);
const db = getFirestore(adminApp);
const services = createFirebaseSocketServices(projectId);
const app = createSocketApp({ allowedOrigins: [allowedOrigin], services });
const webApps = [];
const clients = [];

async function account(name, verified = true) {
  const webApp = initializeApp({ apiKey: 'demo-taskgo-key', authDomain: 'demo-taskgo.firebaseapp.com', projectId, appId: 'demo-taskgo-web' }, name);
  webApps.push(webApp);
  const auth = getAuth(webApp);
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  const email = `${name}@example.com`;
  const { user } = await createUserWithEmailAndPassword(auth, email, 'StrongPass123!');
  if (verified) {
    await sendEmailVerification(user);
    const { oobCodes } = await fetch('http://127.0.0.1:9099/emulator/v1/projects/demo-taskgo/oobCodes').then((response) => response.json());
    const code = oobCodes.find((item) => item.email === email && item.requestType === 'VERIFY_EMAIL')?.oobCode;
    assert.ok(code);
    await applyActionCode(auth, code);
    await reload(user);
  }
  return { uid: user.uid, token: await getIdToken(user, true) };
}

function openClient(url, token, origin = allowedOrigin, transport = 'websocket') {
  const client = createClient(url, { autoConnect: false, reconnection: false, timeout: 2500, transports: [transport], extraHeaders: { Origin: origin }, auth: token ? { token } : {} });
  clients.push(client);
  const connected = new Promise((resolve, reject) => {
    client.once('connect', resolve);
    client.once('connect_error', reject);
  });
  client.connect();
  return { client, connected };
}

async function rejectedConnection(url, token, expectedCode, origin = allowedOrigin, transport = 'websocket') {
  const attempt = openClient(url, token, origin, transport);
  await assert.rejects(attempt.connected, (error) => expectedCode ? error.data?.code === expectedCode : Boolean(error));
  assert.equal(attempt.client.connected, false);
}

async function ack(client, event, payload, expectedCode) {
  const result = await client.timeout(2500).emitWithAck(event, payload);
  assert.equal(result.ok, !expectedCode, `${event}: ${JSON.stringify(result)}`);
  if (expectedCode) assert.equal(result.error.code, expectedCode);
  return result;
}

try {
  const owner = await account('socket-owner');
  const member = await account('socket-member');
  const outsider = await account('socket-outsider');
  const unverified = await account('socket-unverified', false);
  const disabled = await account('socket-disabled');
  const revoked = await account('socket-revoked');
  await adminAuth.updateUser(disabled.uid, { disabled: true });
  await new Promise((resolve) => setTimeout(resolve, 1100));
  await adminAuth.revokeRefreshTokens(revoked.uid);

  const googleApp = initializeApp({ apiKey: 'demo-taskgo-key', authDomain: 'demo-taskgo.firebaseapp.com', projectId, appId: 'demo-taskgo-web' }, 'socket-google');
  webApps.push(googleApp);
  const googleAuth = getAuth(googleApp);
  connectAuthEmulator(googleAuth, 'http://127.0.0.1:9099', { disableWarnings: true });
  const googleUser = (await signInWithCredential(googleAuth, GoogleAuthProvider.credential(JSON.stringify({ sub: 'socket-google', email: 'socket-google@gmail.com', email_verified: true })))).user;
  const google = { uid: googleUser.uid, token: await getIdToken(googleUser, true) };

  await db.doc('workspaces/socket-team').set({ name: 'Socket Team', ownerId: owner.uid });
  await db.doc(`workspaces/socket-team/members/${owner.uid}`).set({ uid: owner.uid, role: 'owner' });
  await db.doc(`workspaces/socket-team/members/${member.uid}`).set({ uid: member.uid, role: 'member' });
  await db.doc(`workspaces/socket-team/members/${google.uid}`).set({ uid: google.uid, role: 'member' });
  await db.doc('workspaces/other-team').set({ name: 'Other Team', ownerId: outsider.uid });
  await db.doc(`workspaces/other-team/members/${outsider.uid}`).set({ uid: outsider.uid, role: 'owner' });
  await db.doc('channels/general').set({ workspaceId: 'socket-team', name: 'General' });
  await db.doc('channels/foreign').set({ workspaceId: 'other-team', name: 'Foreign' });
  await db.doc('dmRooms/private').set({ workspaceId: 'socket-team', participantIds: [owner.uid, member.uid] });
  await db.doc('dmRooms/other-dm').set({ workspaceId: 'other-team', participantIds: [outsider.uid, owner.uid] });

  const address = await listenSocketApp(app, 0, '127.0.0.1');
  const url = `http://127.0.0.1:${address.port}`;
  const health = await fetch(`${url}/healthz`);
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), { status: 'ok', protocolVersion: 1 });
  assert.equal(health.headers.get('cache-control'), 'no-store');
  assert.equal((await fetch(`${url}/unknown`)).status, 404);

  await rejectedConnection(url, null, 'UNAUTHENTICATED');
  await rejectedConnection(url, 'forged-token', 'UNAUTHENTICATED');
  await rejectedConnection(url, unverified.token, 'UNAUTHENTICATED');
  await rejectedConnection(url, disabled.token, 'UNAUTHENTICATED');
  await rejectedConnection(url, revoked.token, 'UNAUTHENTICATED');
  for (const transport of ['websocket', 'polling']) await rejectedConnection(url, owner.token, null, 'http://untrusted.invalid', transport);

  const { client: ownerClient, connected } = openClient(url, owner.token);
  const ready = new Promise((resolve) => ownerClient.once('server:ready', resolve));
  await connected;
  assert.deepEqual(await ready, { protocolVersion: 1 });
  const { client: memberClient, connected: memberConnected } = openClient(url, member.token);
  await memberConnected;
  const { client: outsiderClient, connected: outsiderConnected } = openClient(url, outsider.token);
  await outsiderConnected;
  const { client: googleClient, connected: googleConnected } = openClient(url, google.token);
  await googleConnected;

  const channel = { workspaceId: 'socket-team', kind: 'channel', roomId: 'general' };
  const dm = { workspaceId: 'socket-team', kind: 'dm', roomId: 'private' };
  await ack(ownerClient, 'room:join', channel);
  await ack(memberClient, 'room:join', channel);
  await ack(googleClient, 'room:join', channel);
  await ack(outsiderClient, 'room:join', channel, 'FORBIDDEN');
  await ack(ownerClient, 'room:join', dm);
  await ack(memberClient, 'room:join', dm);
  await ack(googleClient, 'room:join', dm, 'FORBIDDEN');
  await ack(outsiderClient, 'room:join', dm, 'FORBIDDEN');
  await ack(ownerClient, 'room:join', { ...channel, roomId: 'foreign' }, 'FORBIDDEN');
  await ack(ownerClient, 'room:join', { workspaceId: 'other-team', kind: 'dm', roomId: 'other-dm' }, 'FORBIDDEN');
  await ack(ownerClient, 'room:join', { ...channel, roomId: 'missing' }, 'FORBIDDEN');
  await ack(ownerClient, 'room:join', { ...channel, roomId: '../private' }, 'INVALID_REQUEST');
  await ack(ownerClient, 'room:join', { ...channel, kind: 'unknown' }, 'INVALID_REQUEST');

  const message = { ...channel, clientMessageId: 'message-one', content: '인증된 메시지' };
  await ack(outsiderClient, 'message:send', message, 'FORBIDDEN');
  await ack(ownerClient, 'message:send', { ...message, roomId: 'foreign' }, 'FORBIDDEN');
  await ack(ownerClient, 'message:send', message, 'FEATURE_NOT_READY');
  await ack(ownerClient, 'typing:set', { ...channel, active: true }, 'FEATURE_NOT_READY');
  assert.equal((await db.collection('messages').get()).empty, true);

  await db.doc('dmRooms/private').update({ participantIds: [owner.uid] });
  await ack(memberClient, 'typing:set', { ...dm, active: true }, 'FORBIDDEN');
  await ack(memberClient, 'room:join', dm, 'FORBIDDEN');
  await db.doc(`workspaces/socket-team/members/${member.uid}`).delete();
  await ack(memberClient, 'message:send', message, 'FORBIDDEN');
  await ack(memberClient, 'room:join', channel, 'FORBIDDEN');
  await ack(memberClient, 'typing:set', { ...dm, active: true }, 'FORBIDDEN');
  await ack(ownerClient, 'room:leave', channel);
  await ack(ownerClient, 'message:send', message, 'FORBIDDEN');

  console.log('Firebase token verification, channel/DM membership, revocation, blocked writes, and Origin policy passed.');
} finally {
  for (const client of clients) client.disconnect();
  await closeSocketApp(app);
  await services.close();
  for (const webApp of webApps) await deleteApp(webApp);
  await deleteAdminApp(adminApp);
}
