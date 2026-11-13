import assert from 'node:assert/strict';
import { initializeApp as initializeAdminApp, deleteApp as deleteAdminApp } from 'firebase-admin/app';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';
import { getFirestore as getAdminFirestore, Timestamp } from 'firebase-admin/firestore';
import { initializeApp, deleteApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { connectFirestoreEmulator, doc, getDoc, getFirestore, setDoc } from 'firebase/firestore';
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions';
import { openAiTaskCandidates, suggestTaskFromMessage } from '../lib/taskSuggestions.js';

assert.equal(process.env.GCLOUD_PROJECT, 'demo-taskgo');
const projectId = 'demo-taskgo';
const authPort = Number(process.env.TASKGO_AUTH_EMULATOR_PORT ?? 9099);
const firestorePort = Number(process.env.TASKGO_FIRESTORE_EMULATOR_PORT ?? 8080);
const functionsPort = Number(process.env.TASKGO_FUNCTIONS_EMULATOR_PORT ?? 5001);
const admin = initializeAdminApp({ projectId }, 'task-model-test');
const adminDb = getAdminFirestore(admin);
const apps = [];

async function account(name, verified = true) {
  const email = `${name}@example.com`;
  const password = 'StrongPass123!';
  const user = await getAdminAuth(admin).createUser({ email, password, emailVerified: verified });
  const app = initializeApp({ apiKey: 'demo-taskgo-key', authDomain: 'demo-taskgo.firebaseapp.com', projectId, appId: 'demo-taskgo-web' }, name);
  apps.push(app);
  const auth = getAuth(app);
  connectAuthEmulator(auth, `http://127.0.0.1:${authPort}`, { disableWarnings: true });
  await signInWithEmailAndPassword(auth, email, password);
  const db = getFirestore(app);
  connectFirestoreEmulator(db, '127.0.0.1', firestorePort);
  const functions = getFunctions(app, 'asia-northeast3');
  connectFunctionsEmulator(functions, '127.0.0.1', functionsPort);
  return { user, db, create: (data) => httpsCallable(functions, 'createTask')(data), suggest: (data) => httpsCallable(functions, 'suggestTask')(data) };
}

async function rejected(promise, code) {
  await assert.rejects(promise, (error) => error.code === `functions/${code}`);
}

try {
  const owner = await account('task-owner');
  const member = await account('task-member');
  const assignee = await account('task-assignee');
  const outsider = await account('task-outsider');
  const unverified = await account('task-unverified', false);
  const workspaceId = 'task-team';
  const batch = adminDb.batch();
  batch.set(adminDb.doc(`workspaces/${workspaceId}`), { name: 'Task Team', ownerId: owner.user.uid });
  for (const participant of [owner, member, assignee]) {
    batch.set(adminDb.doc(`workspaces/${workspaceId}/members/${participant.user.uid}`), { uid: participant.user.uid, role: 'member' });
  }
  batch.set(adminDb.doc('workspaces/other-team'), { name: 'Other Team', ownerId: outsider.user.uid });
  batch.set(adminDb.doc(`workspaces/other-team/members/${outsider.user.uid}`), { uid: outsider.user.uid, role: 'owner' });
  batch.set(adminDb.doc('channels/task-general'), { workspaceId, name: 'General' });
  batch.set(adminDb.doc('dmRooms/task-private'), { workspaceId, participantIds: [member.user.uid, assignee.user.uid] });
  batch.set(adminDb.doc('messages/task-channel-source'), {
    workspaceId, sourceType: 'channel', channelId: 'task-general', senderId: owner.user.uid,
    clientMessageId: 'task-channel-client', content: 'Channel original text', createdAt: Timestamp.now(),
  });
  batch.set(adminDb.doc('messages/task-dm-source'), {
    workspaceId, sourceType: 'dm', dmRoomId: 'task-private', senderId: member.user.uid,
    clientMessageId: 'task-dm-client', content: 'Private original text', createdAt: Timestamp.now(),
  });
  batch.set(adminDb.doc('messages/task-foreign-source'), {
    workspaceId: 'other-team', sourceType: 'channel', channelId: 'foreign', senderId: outsider.user.uid,
    clientMessageId: 'task-foreign-client', content: 'Foreign text', createdAt: Timestamp.now(),
  });
  await batch.commit();

  const dueDate = new Date(Date.now() + 86400000).toISOString();
  const input = { workspaceId, sourceMessageId: 'task-channel-source', title: '  모델 검증 업무  ', assigneeId: assignee.user.uid, dueDate, reviewRequired: false };
  await rejected(outsider.create(input), 'permission-denied');
  await rejected(unverified.create(input), 'permission-denied');
  await rejected(owner.create({ ...input, requesterId: outsider.user.uid }), 'invalid-argument');
  await rejected(owner.create({ ...input, status: 'DONE' }), 'invalid-argument');
  await rejected(owner.create({ ...input, assigneeId: outsider.user.uid }), 'failed-precondition');
  await rejected(owner.create({ ...input, dueDate: new Date(Date.now() - 60000).toISOString() }), 'invalid-argument');
  await rejected(owner.create({ ...input, dueDate: 'tomorrow' }), 'invalid-argument');
  await rejected(owner.create({ ...input, reviewRequired: true }), 'invalid-argument');
  await rejected(owner.create({ ...input, reviewWorkingDays: 2 }), 'invalid-argument');
  await rejected(owner.create({ ...input, estimatedMinutes: 17 }), 'invalid-argument');
  await rejected(owner.create({ ...input, sourceMessageId: 'task-foreign-source' }), 'permission-denied');
  await rejected(owner.create({ ...input, sourceMessageId: 'task-dm-source' }), 'permission-denied');

  const channelTaskId = (await owner.create(input)).data.taskId;
  const channelTask = await adminDb.doc(`tasks/${channelTaskId}`).get();
  assert.equal(channelTask.get('requesterId'), owner.user.uid);
  assert.equal(channelTask.get('assigneeId'), assignee.user.uid);
  assert.equal(channelTask.get('title'), '모델 검증 업무');
  assert.equal(channelTask.get('status'), 'REQUESTED');
  assert.equal(channelTask.get('sourceType'), 'channel');
  assert.equal(channelTask.get('sourceMessageId'), 'task-channel-source');
  assert.equal(channelTask.get('dueDate').toDate().toISOString(), dueDate);
  assert.equal(channelTask.get('reviewRequired'), false);
  assert.equal(channelTask.get('reviewWorkingDays'), null);
  assert.equal(channelTask.get('reviewCycle'), 0);
  assert.equal(channelTask.get('reviewDeadlineAt'), null);
  assert.equal(channelTask.get('proposedDueDate'), null);
  assert.equal(channelTask.get('completionReason'), null);
  assert.ok(channelTask.get('createdAt') instanceof Timestamp);
  assert.ok(channelTask.get('updatedAt') instanceof Timestamp);
  assert.equal('content' in channelTask.data(), false);
  assert.equal('dmRoomId' in channelTask.data(), false);

  const dmTaskId = (await member.create({ ...input, sourceMessageId: 'task-dm-source', title: 'DM에서 만든 공개 업무', reviewRequired: true, reviewWorkingDays: 2, estimatedMinutes: 90 })).data.taskId;
  const dmTask = await adminDb.doc(`tasks/${dmTaskId}`).get();
  assert.equal(dmTask.get('requesterId'), member.user.uid);
  assert.equal(dmTask.get('sourceType'), 'dm');
  assert.equal(dmTask.get('reviewRequired'), true);
  assert.equal(dmTask.get('reviewWorkingDays'), 2);
  assert.equal(dmTask.get('estimatedMinutes'), 90);
  assert.equal('content' in dmTask.data(), false);
  assert.equal('dmRoomId' in dmTask.data(), false);
  assert.equal((await getDoc(doc(owner.db, 'tasks', dmTaskId))).data().title, 'DM에서 만든 공개 업무');
  await assert.rejects(getDoc(doc(owner.db, 'messages', 'task-dm-source')), (error) => error.code === 'permission-denied');
  await assert.rejects(getDoc(doc(outsider.db, 'tasks', dmTaskId)), (error) => error.code === 'permission-denied');
  await assert.rejects(setDoc(doc(owner.db, 'tasks', 'forged'), { workspaceId, title: 'forged' }), (error) => error.code === 'permission-denied');
  assert.equal((await adminDb.collection('tasks').get()).size, 2);

  const channelSource = { workspaceId, sourceMessageId: 'task-channel-source' };
  const dmSource = { workspaceId, sourceMessageId: 'task-dm-source' };
  await rejected(outsider.suggest(channelSource), 'permission-denied');
  await rejected(owner.suggest(dmSource), 'permission-denied');
  await rejected(unverified.suggest(channelSource), 'permission-denied');
  await rejected(member.suggest({ ...dmSource, arbitrary: true }), 'invalid-argument');
  await rejected(owner.suggest({ workspaceId, sourceMessageId: 'task-foreign-source' }), 'permission-denied');
  const suggestion = (await member.suggest(dmSource)).data;
  assert.equal(suggestion.demo, true);
  assert.equal(suggestion.candidates[0].title, 'Private original text');
  assert.equal((await adminDb.collection('tasks').get()).size, 2, 'A suggestion must never create a task');

  const sourceTime = (await adminDb.doc('messages/task-dm-source').get()).get('createdAt').toMillis();
  const contextBatch = adminDb.batch();
  for (let index = 0; index < 10; index++) contextBatch.set(adminDb.doc(`messages/task-dm-earlier-${index}`), {
    workspaceId, sourceType: 'dm', dmRoomId: 'task-private', senderId: assignee.user.uid,
    content: `Earlier private context ${index}`, createdAt: Timestamp.fromMillis(sourceTime - 10000 + index),
  });
  contextBatch.set(adminDb.doc('dmRooms/task-other-private'), { workspaceId, participantIds: [owner.user.uid, assignee.user.uid] });
  contextBatch.set(adminDb.doc('messages/task-other-dm'), {
    workspaceId, sourceType: 'dm', dmRoomId: 'task-other-private', senderId: owner.user.uid,
    content: 'OTHER DM MUST NOT LEAK', createdAt: Timestamp.fromMillis(sourceTime - 1),
  });
  await contextBatch.commit();
  let capturedContext;
  await suggestTaskFromMessage(adminDb, member.user.uid, dmSource, async (context) => {
    capturedContext = context;
    return [{ title: '검증 후보', reason: '문맥 범위 확인' }];
  });
  assert.equal(capturedContext.messages.length, 8);
  assert.deepEqual(capturedContext.messages.map((item) => item.content), [
    ...Array.from({ length: 7 }, (_, index) => `Earlier private context ${index + 3}`),
    'Private original text',
  ]);
  assert.equal(capturedContext.selectedIndex, 7);

  let sentRequest;
  const sampleContext = { messages: [{ sender: '요청자', content: '보고서 작성 부탁해요' }], selectedIndex: 0 };
  const sampleCandidates = [{ title: '보고서 작성', reason: '명시된 요청' }, { title: '보고서 검토', reason: '완료 후 확인' }];
  const candidates = await openAiTaskCandidates(sampleContext, 'test-key', 'gpt-4.1-mini', async (url, init) => {
    sentRequest = { url, init };
    return new Response(JSON.stringify({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify({ candidates: sampleCandidates }) }] }] }), { status: 200 });
  });
  assert.deepEqual(candidates, sampleCandidates);
  assert.equal(sentRequest.url, 'https://api.openai.com/v1/responses');
  assert.equal(sentRequest.init.headers.Authorization, 'Bearer test-key');
  const sentBody = JSON.parse(sentRequest.init.body);
  assert.equal(sentBody.store, false);
  assert.equal(sentBody.model, 'gpt-4.1-mini');
  assert.equal(sentBody.max_output_tokens, 500);
  assert.deepEqual(JSON.parse(sentBody.input), sampleContext);
  assert.equal(sentBody.text.format.type, 'json_schema');
  assert.equal(sentBody.text.format.strict, true);
  await assert.rejects(openAiTaskCandidates(sampleContext, 'test-key', 'gpt-4.1-mini', async () => new Response(JSON.stringify({ status: 'incomplete' }), { status: 200 })));
  await assert.rejects(openAiTaskCandidates(sampleContext, 'test-key', 'gpt-4.1-mini', async () => new Response(JSON.stringify({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify({ candidates: [sampleCandidates[0], sampleCandidates[0]] }) }] }] }), { status: 200 })));
  await assert.rejects(openAiTaskCandidates(sampleContext, 'test-key', 'gpt-4.1-mini', async () => new Response('rate limited', { status: 429 })));

  console.log('PASS: task schema, permissions, scoped suggestions, OpenAI request/response contract, and member-only reads.');
} finally {
  for (const app of apps) await deleteApp(app);
  await deleteAdminApp(admin);
}
