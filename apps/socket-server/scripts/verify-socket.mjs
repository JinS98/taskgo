import assert from 'node:assert/strict';
import { initializeApp as initializeAdminApp, deleteApp as deleteAdminApp } from 'firebase-admin/app';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { initializeApp, deleteApp } from 'firebase/app';
import { connectAuthEmulator, createUserWithEmailAndPassword, getAuth, getIdToken, GoogleAuthProvider, signInWithCredential } from 'firebase/auth';
import { connectFirestoreEmulator, doc, getDoc, getFirestore as getClientFirestore, setDoc } from 'firebase/firestore';
import { io as createClient } from 'socket.io-client';
import { createSocketApp, listenSocketApp, closeSocketApp } from '../dist/app.js';
import { createFirebaseSocketServices } from '../dist/firebase.js';

assert.equal(process.env.GCLOUD_PROJECT, 'demo-taskgo');
assert.ok(process.env.FIREBASE_AUTH_EMULATOR_HOST);
assert.ok(process.env.FIRESTORE_EMULATOR_HOST);
const authPort = Number(process.env.FIREBASE_AUTH_EMULATOR_HOST.split(':').at(-1));
const firestorePort = Number(process.env.FIRESTORE_EMULATOR_HOST.split(':').at(-1));
const projectId = 'demo-taskgo';
const allowedOrigin = 'http://localhost:5173';
const adminApp = initializeAdminApp({ projectId }, 'socket-test-fixture');
const adminAuth = getAdminAuth(adminApp);
const db = getFirestore(adminApp);
const services = createFirebaseSocketServices(projectId);
let failNextSave = false;
const app = createSocketApp({ allowedOrigins: [allowedOrigin], services: {
  ...services,
  async saveMessage(uid, message) {
    if (failNextSave) {
      failNextSave = false;
      throw new Error('Firestore 저장 실패 모의');
    }
    return services.saveMessage(uid, message);
  },
} });
const webApps = [];
const clients = [];

async function account(name) {
  const webApp = initializeApp({ apiKey: 'demo-taskgo-key', authDomain: 'demo-taskgo.firebaseapp.com', projectId, appId: 'demo-taskgo-web' }, name);
  webApps.push(webApp);
  const auth = getAuth(webApp);
  connectAuthEmulator(auth, `http://127.0.0.1:${authPort}`, { disableWarnings: true });
  const clientDb = getClientFirestore(webApp);
  connectFirestoreEmulator(clientDb, '127.0.0.1', firestorePort);
  const email = `${name}@example.com`;
  const { user } = await createUserWithEmailAndPassword(auth, email, 'StrongPass123!');
  return { uid: user.uid, token: await getIdToken(user, true), clientDb };
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
  let result;
  try {
    result = await client.timeout(10000).emitWithAck(event, payload);
  } catch (error) {
    throw new Error(`${event} ACK 시간 초과: ${JSON.stringify(payload)}`, { cause: error });
  }
  assert.equal(result.ok, !expectedCode, `${event}: ${JSON.stringify(result)}`);
  if (expectedCode) assert.equal(result.error.code, expectedCode);
  return result;
}

function nextMessage(client) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      client.off('message:created', onMessage);
      reject(new Error('message:created 이벤트가 도착하지 않았습니다.'));
    }, 10000);
    function onMessage(message) {
      clearTimeout(timer);
      resolve(message);
    }
    client.once('message:created', onMessage);
  });
}

async function waitUntil(predicate) {
  const deadline = Date.now() + 5000;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error('권한 변경이 소켓 룸에 반영되지 않았습니다.');
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

try {
  const owner = await account('socket-owner');
  const member = await account('socket-member');
  const outsider = await account('socket-outsider');
  const unverified = await account('socket-unverified');
  const disabled = await account('socket-disabled');
  const revoked = await account('socket-revoked');
  await adminAuth.updateUser(disabled.uid, { disabled: true });
  await new Promise((resolve) => setTimeout(resolve, 1100));
  await adminAuth.revokeRefreshTokens(revoked.uid);

  const googleApp = initializeApp({ apiKey: 'demo-taskgo-key', authDomain: 'demo-taskgo.firebaseapp.com', projectId, appId: 'demo-taskgo-web' }, 'socket-google');
  webApps.push(googleApp);
  const googleAuth = getAuth(googleApp);
  connectAuthEmulator(googleAuth, `http://127.0.0.1:${authPort}`, { disableWarnings: true });
  const googleDb = getClientFirestore(googleApp);
  connectFirestoreEmulator(googleDb, '127.0.0.1', firestorePort);
  const googleUser = (await signInWithCredential(googleAuth, GoogleAuthProvider.credential(JSON.stringify({ sub: 'socket-google', email: 'socket-google@gmail.com', email_verified: true })))).user;
  const google = { uid: googleUser.uid, token: await getIdToken(googleUser, true), clientDb: googleDb };

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
  await rejectedConnection(url, disabled.token, 'UNAUTHENTICATED');
  await rejectedConnection(url, revoked.token, 'UNAUTHENTICATED');
  for (const transport of ['websocket', 'polling']) await rejectedConnection(url, owner.token, null, 'http://untrusted.invalid', transport);

  const { client: ownerClient, connected } = openClient(url, owner.token);
  const ready = new Promise((resolve) => ownerClient.once('server:ready', resolve));
  await connected;
  const { client: unverifiedClient, connected: unverifiedConnected } = openClient(url, unverified.token);
  await unverifiedConnected;
  assert.deepEqual(await ready, { protocolVersion: 1 });
  const { client: memberClient, connected: memberConnected } = openClient(url, member.token);
  await memberConnected;
  const { client: outsiderClient, connected: outsiderConnected } = openClient(url, outsider.token);
  await outsiderConnected;
  const { client: googleClient, connected: googleConnected } = openClient(url, google.token);
  await googleConnected;

  const channel = { workspaceId: 'socket-team', kind: 'channel', roomId: 'general' };
  await ack(unverifiedClient, 'room:join', channel, 'FORBIDDEN');
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

  const ownerEvents = [];
  const memberEvents = [];
  const googleEvents = [];
  const outsiderEvents = [];
  const ownerTypingEvents = [];
  const memberTypingEvents = [];
  const googleTypingEvents = [];
  const outsiderTypingEvents = [];
  ownerClient.on('message:created', (message) => ownerEvents.push(message));
  memberClient.on('message:created', (message) => memberEvents.push(message));
  googleClient.on('message:created', (message) => googleEvents.push(message));
  outsiderClient.on('message:created', (message) => outsiderEvents.push(message));
  ownerClient.on('typing:changed', (event) => ownerTypingEvents.push(event));
  memberClient.on('typing:changed', (event) => memberTypingEvents.push(event));
  googleClient.on('typing:changed', (event) => googleTypingEvents.push(event));
  outsiderClient.on('typing:changed', (event) => outsiderTypingEvents.push(event));

  await ack(outsiderClient, 'typing:set', { ...channel, active: true }, 'FORBIDDEN');
  await ack(ownerClient, 'typing:set', { ...channel, active: 'yes' }, 'INVALID_REQUEST');
  await ack(ownerClient, 'typing:set', { ...channel, active: true });
  await waitUntil(() => memberTypingEvents.length === 1 && googleTypingEvents.length === 1);
  assert.deepEqual(memberTypingEvents[0], { ...channel, userId: owner.uid, active: true });
  assert.deepEqual(googleTypingEvents[0], memberTypingEvents[0]);
  assert.equal(ownerTypingEvents.length, 0);
  assert.equal(outsiderTypingEvents.length, 0);
  await ack(ownerClient, 'typing:set', { ...channel, active: false });
  await waitUntil(() => memberTypingEvents.length === 2 && googleTypingEvents.length === 2);
  assert.equal(memberTypingEvents[1].active, false);
  await ack(ownerClient, 'typing:set', { ...dm, active: true });
  await waitUntil(() => memberTypingEvents.length === 3);
  assert.deepEqual(memberTypingEvents[2], { ...dm, userId: owner.uid, active: true });
  assert.equal(googleTypingEvents.length, 2, 'DM typing leaked to a non-participant.');
  await ack(ownerClient, 'room:leave', dm);
  await waitUntil(() => memberTypingEvents.length === 4);
  assert.equal(memberTypingEvents[3].active, false);
  await ack(ownerClient, 'room:join', dm);

  const message = { ...channel, clientMessageId: 'message-one', content: '인증된 메시지' };
  await ack(outsiderClient, 'message:send', message, 'FORBIDDEN');
  await ack(ownerClient, 'message:send', { ...message, roomId: 'foreign' }, 'FORBIDDEN');
  await ack(ownerClient, 'message:send', { ...message, content: '   ' }, 'INVALID_REQUEST');
  failNextSave = true;
  await ack(ownerClient, 'message:send', { ...message, clientMessageId: 'failed-write' }, 'INTERNAL_ERROR');
  assert.equal((await db.collection('messages').get()).empty, true);

  const firstOwnerEvent = nextMessage(ownerClient);
  const firstMemberEvent = nextMessage(memberClient);
  const firstGoogleEvent = nextMessage(googleClient);
  const firstAck = await ack(ownerClient, 'message:send', {
    ...message, senderId: outsider.uid, messageId: 'forged', sourceType: 'dm', dmRoomId: 'private', createdAt: '1970-01-01T00:00:00.000Z',
  });
  const firstId = firstAck.data.messageId;
  assert.notEqual(firstId, 'forged');
  const firstDoc = await db.doc(`messages/${firstId}`).get();
  assert.equal(firstDoc.exists, true);
  assert.equal(firstDoc.get('workspaceId'), 'socket-team');
  assert.equal(firstDoc.get('sourceType'), 'channel');
  assert.equal(firstDoc.get('channelId'), 'general');
  assert.equal(firstDoc.get('dmRoomId'), undefined);
  assert.equal(firstDoc.get('senderId'), owner.uid);
  assert.equal(firstDoc.get('clientMessageId'), 'message-one');
  assert.equal(firstDoc.get('content'), message.content);
  assert.equal((await getDoc(doc(member.clientDb, 'messages', firstId))).data().content, message.content);
  await assert.rejects(getDoc(doc(outsider.clientDb, 'messages', firstId)), (error) => error.code === 'permission-denied');
  await assert.rejects(setDoc(doc(owner.clientDb, 'messages', 'forged-client-write'), { content: 'forged' }), (error) => error.code === 'permission-denied');
  const [firstOwner, firstMember, firstGoogle] = await Promise.all([firstOwnerEvent, firstMemberEvent, firstGoogleEvent]);
  for (const received of [firstOwner, firstMember, firstGoogle]) {
    assert.equal(received.messageId, firstId);
    assert.equal(received.senderId, owner.uid);
    assert.equal(received.createdAt, firstDoc.get('createdAt').toDate().toISOString());
  }
  assert.equal(outsiderEvents.length, 0);

  const retryAck = await ack(ownerClient, 'message:send', message);
  assert.equal(retryAck.data.messageId, firstId);
  await ack(ownerClient, 'message:send', { ...message, content: '바뀐 내용' }, 'CONFLICT');
  await ack(ownerClient, 'message:send', { ...dm, clientMessageId: message.clientMessageId, content: message.content }, 'CONFLICT');
  assert.equal((await db.collection('messages').get()).size, 1);

  const secondOwnerEvent = nextMessage(ownerClient);
  const secondMemberEvent = nextMessage(memberClient);
  const secondGoogleEvent = nextMessage(googleClient);
  const concurrentMessage = { ...message, clientMessageId: 'concurrent-one', content: '동시 재시도' };
  const concurrentAcks = await Promise.all([
    ack(ownerClient, 'message:send', concurrentMessage),
    ack(ownerClient, 'message:send', concurrentMessage),
  ]);
  assert.equal(concurrentAcks[0].data.messageId, concurrentAcks[1].data.messageId);
  await Promise.all([secondOwnerEvent, secondMemberEvent, secondGoogleEvent]);
  assert.equal((await db.collection('messages').get()).size, 2);
  await new Promise((resolve) => setTimeout(resolve, 150));
  assert.equal(ownerEvents.length, 2);
  assert.equal(memberEvents.length, 2);
  assert.equal(googleEvents.length, 2);

  const googleAck = await ack(googleClient, 'message:send', { ...message, content: '다른 발신자' });
  assert.notEqual(googleAck.data.messageId, firstId);
  assert.equal((await db.collection('messages').get()).size, 3);
  await waitUntil(() => ownerEvents.length === 3 && memberEvents.length === 3 && googleEvents.length === 3);

  const dmOwnerEvent = nextMessage(ownerClient);
  const dmMemberEvent = nextMessage(memberClient);
  const dmMessage = { ...dm, clientMessageId: 'dm-one', content: '비공개 대화' };
  const dmAck = await ack(ownerClient, 'message:send', dmMessage);
  const dmDoc = await db.doc(`messages/${dmAck.data.messageId}`).get();
  assert.equal(dmDoc.get('sourceType'), 'dm');
  assert.equal(dmDoc.get('dmRoomId'), 'private');
  assert.equal(dmDoc.get('channelId'), undefined);
  assert.equal(dmDoc.get('senderId'), owner.uid);
  assert.equal((await getDoc(doc(member.clientDb, 'messages', dmAck.data.messageId))).data().content, dmMessage.content);
  await assert.rejects(getDoc(doc(google.clientDb, 'messages', dmAck.data.messageId)), (error) => error.code === 'permission-denied');
  assert.equal((await dmOwnerEvent).messageId, dmAck.data.messageId);
  assert.equal((await dmMemberEvent).messageId, dmAck.data.messageId);
  assert.equal(googleEvents.length, 3);
  assert.equal(outsiderEvents.length, 0);

  await db.doc('dmRooms/private').update({ participantIds: [owner.uid] });
  const dmEventsBeforeRemoval = memberEvents.length;
  const memberTypingBeforeRemoval = memberTypingEvents.length;
  await ack(ownerClient, 'typing:set', { ...dm, active: true });
  await waitUntil(() => !app.io.sockets.sockets.get(memberClient.id)?.rooms.has('workspace/socket-team/dm/private'));
  assert.equal(memberTypingEvents.length, memberTypingBeforeRemoval, 'Revoked DM participant received typing.');
  await ack(ownerClient, 'typing:set', { ...dm, active: false });
  const ownerDmAfterRemoval = nextMessage(ownerClient);
  await ack(ownerClient, 'message:send', { ...dm, clientMessageId: 'dm-two', content: '권한 변경 후' });
  await ownerDmAfterRemoval;
  await waitUntil(() => !app.io.sockets.sockets.get(memberClient.id)?.rooms.has('workspace/socket-team/dm/private'));
  assert.equal(memberEvents.length, dmEventsBeforeRemoval);
  await ack(memberClient, 'message:send', { ...dm, clientMessageId: 'dm-member', content: '차단' }, 'FORBIDDEN');
  await ack(memberClient, 'room:join', dm, 'FORBIDDEN');

  await db.doc(`workspaces/socket-team/members/${member.uid}`).delete();
  const channelEventsBeforeRemoval = memberEvents.length;
  const ownerChannelAfterRemoval = nextMessage(ownerClient);
  await ack(ownerClient, 'message:send', { ...message, clientMessageId: 'channel-after-removal', content: '멤버 제거 후' });
  await ownerChannelAfterRemoval;
  await waitUntil(() => !app.io.sockets.sockets.get(memberClient.id)?.rooms.has('workspace/socket-team/channel/general'));
  assert.equal(memberEvents.length, channelEventsBeforeRemoval);
  await ack(memberClient, 'message:send', message, 'FORBIDDEN');
  await ack(memberClient, 'room:join', channel, 'FORBIDDEN');
  await ack(memberClient, 'typing:set', { ...dm, active: true }, 'FORBIDDEN');

  const lostAckMessage = { ...channel, clientMessageId: 'lost-ack', content: 'ACK를 받지 못한 전송' };
  const ownerEventsBeforeRetry = ownerEvents.length;
  const lostAckEvent = nextMessage(ownerClient);
  ownerClient.emit('message:send', lostAckMessage);
  const deliveredWithoutAck = await lostAckEvent;
  const recoveredAck = await ack(ownerClient, 'message:send', lostAckMessage);
  assert.equal(recoveredAck.data.messageId, deliveredWithoutAck.messageId);
  assert.equal((await db.doc(`messages/${recoveredAck.data.messageId}`).get()).exists, true);
  await new Promise((resolve) => setTimeout(resolve, 150));
  assert.equal(ownerEvents.length, ownerEventsBeforeRetry + 1);

  await ack(ownerClient, 'room:leave', channel);
  await ack(ownerClient, 'message:send', { ...message, clientMessageId: 'after-leave' }, 'FORBIDDEN');
  assert.equal(outsiderEvents.length, 0);
  assert.equal((await db.collection('messages').get()).size, 7);

  console.log('Firebase auth, channel/DM access, transactional message storage, deduplication, ACK, and recipient filtering passed.');
} finally {
  for (const client of clients) client.disconnect();
  await closeSocketApp(app);
  await services.close();
  for (const webApp of webApps) await deleteApp(webApp);
  await deleteAdminApp(adminApp);
}
