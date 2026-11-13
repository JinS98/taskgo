import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { chromium } from 'playwright-core';
import { createServer as createViteServer } from 'vite';

const projectId = 'demo-taskgo';
assert.equal(process.env.GCLOUD_PROJECT, projectId, 'Run with the demo-taskgo Firebase emulators.');
const authPort = Number(process.env.TASKGO_AUTH_EMULATOR_PORT ?? 9099);
const firestorePort = Number(process.env.TASKGO_FIRESTORE_EMULATOR_PORT ?? 8080);
const functionsPort = Number(process.env.TASKGO_FUNCTIONS_EMULATOR_PORT ?? 5001);
process.env.VITE_AUTH_EMULATOR_PORT = String(authPort);
process.env.VITE_FIRESTORE_EMULATOR_PORT = String(firestorePort);
process.env.VITE_FUNCTIONS_EMULATOR_PORT = String(functionsPort);
const root = resolve(process.cwd(), '../..');
const admin = initializeApp({ projectId }, 'live-chat-browser-test');
const db = getFirestore(admin);
let vite;
let browser;
let socketProcess;
let socketOutput = '';
const browserErrors = [];

async function availablePort() {
  const server = createServer();
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  const port = server.address().port;
  await new Promise((done) => server.close(done));
  return port;
}

async function waitForHealth(url) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      if ((await fetch(url)).ok) return;
    } catch { /* Server is still starting. */ }
    if (socketProcess?.exitCode !== null) throw new Error(`Socket server exited: ${socketOutput}`);
    await delay(150);
  }
  throw new Error(`Socket server did not start: ${socketOutput}`);
}

async function login(page, origin, email) {
  page.on('pageerror', (error) => browserErrors.push(`${email}: ${error.message}`));
  await page.goto(`${origin}/workspace`);
  await page.getByLabel('이메일', { exact: true }).fill(email);
  await page.getByLabel('비밀번호').fill('StrongPass123!');
  await page.getByRole('button', { name: '이메일로 로그인' }).click();
  await page.getByText('실시간 연결됨').waitFor({ timeout: 20000 });
}

async function send(page, content) {
  await page.getByRole('textbox', { name: '메시지 입력' }).fill(content);
  await page.getByRole('button', { name: '전송', exact: true }).click();
}

async function visibleOnce(page, content) {
  await page.getByText(content, { exact: true }).waitFor({ timeout: 10000 });
  assert.equal(await page.getByText(content, { exact: true }).count(), 1, `Duplicate message: ${content}`);
}

try {
  const owner = await getAuth(admin).createUser({ email: 'live-owner@example.com', password: 'StrongPass123!', emailVerified: true });
  const member = await getAuth(admin).createUser({ email: 'live-member@example.com', password: 'StrongPass123!', emailVerified: true });
  const workspaceId = 'live-team';
  const batch = db.batch();
  batch.set(db.doc(`workspaces/${workspaceId}`), { name: 'Live Team', ownerId: owner.uid, createdAt: Timestamp.now() });
  for (const [user, role] of [[owner, 'owner'], [member, 'member']]) {
    batch.set(db.doc(`workspaces/${workspaceId}/members/${user.uid}`), { uid: user.uid, email: user.email, role, joinedAt: Timestamp.now() });
    batch.set(db.doc(`users/${user.uid}/workspaces/${workspaceId}`), { workspaceId, name: 'Live Team', role, joinedAt: Timestamp.now() });
  }
  batch.set(db.doc('dmRooms/live-dm'), { workspaceId, participantIds: [owner.uid, member.uid] });
  const historyStart = Date.now() - 120000;
  for (let index = 0; index < 65; index += 1) {
    batch.set(db.doc(`messages/history-channel-${index}`), {
      workspaceId, sourceType: 'channel', channelId: `general_${workspaceId}`,
      senderId: owner.uid, clientMessageId: `history-${index}`,
      content: `history channel ${index}`, createdAt: Timestamp.fromMillis(historyStart + index * 1000),
    });
  }
  batch.set(db.doc('messages/history-dm'), {
    workspaceId, sourceType: 'dm', dmRoomId: 'live-dm',
    senderId: member.uid, clientMessageId: 'history-dm',
    content: 'earlier direct message', createdAt: Timestamp.fromMillis(historyStart),
  });
  await batch.commit();

  const [socketPort, vitePort] = await Promise.all([availablePort(), availablePort()]);
  const origin = `http://127.0.0.1:${vitePort}`;
  process.env.VITE_SOCKET_URL = `http://127.0.0.1:${socketPort}`;
  socketProcess = spawn(process.execPath, ['apps/socket-server/dist/index.js'], {
    cwd: root,
    env: { ...process.env, PORT: String(socketPort), SOCKET_HOST: '127.0.0.1', SOCKET_ALLOWED_ORIGINS: origin, FIREBASE_PROJECT_ID: projectId },
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  socketProcess.stdout.on('data', (chunk) => { socketOutput += chunk; });
  socketProcess.stderr.on('data', (chunk) => { socketOutput += chunk; });
  await waitForHealth(`http://127.0.0.1:${socketPort}/healthz`);

  vite = await createViteServer({ root: process.cwd(), mode: 'emulator', server: { host: '127.0.0.1', port: vitePort, strictPort: true, hmr: false } });
  await vite.listen();
  browser = await chromium.launch({ headless: true, executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', args: ['--no-sandbox'] });
  const ownerPage = await (await browser.newContext()).newPage();
  const memberPage = await (await browser.newContext()).newPage();
  await login(ownerPage, origin, owner.email);
  await login(memberPage, origin, member.email);
  assert.equal((await db.doc(`channels/general_${workspaceId}`).get()).get('name'), '전체');
  await visibleOnce(ownerPage, 'history channel 64');
  assert.equal(await ownerPage.getByText('history channel 34', { exact: true }).count(), 0);
  const messageList = ownerPage.getByLabel('메시지 목록');
  await messageList.evaluate((element) => { element.scrollTop = 0; });
  const initialHeight = await messageList.evaluate((element) => element.scrollHeight);
  await ownerPage.getByRole('button', { name: '이전 대화 불러오기' }).click();
  await visibleOnce(ownerPage, 'history channel 34');
  const afterOlder = await messageList.evaluate((element) => ({ top: element.scrollTop, height: element.scrollHeight }));
  assert.ok(afterOlder.height > initialHeight && afterOlder.top > 0, 'Loading older messages should preserve scroll position.');
  await ownerPage.getByRole('button', { name: '이전 대화 불러오기' }).click();
  await visibleOnce(ownerPage, 'history channel 0');
  assert.equal(await ownerPage.getByRole('button', { name: '이전 대화 불러오기' }).count(), 0);

  const channelSource = ownerPage.getByRole('listitem').filter({ hasText: 'history channel 64' });
  await channelSource.getByRole('button', { name: '업무 요청' }).click();
  await ownerPage.getByRole('dialog', { name: '업무 요청 만들기' }).waitFor();
  await ownerPage.keyboard.press('Escape');
  await ownerPage.getByRole('dialog', { name: '업무 요청 만들기' }).waitFor({ state: 'hidden' });
  assert.equal((await db.collection('tasks').get()).size, 0, 'Closing the draft must not create a task.');
  await channelSource.getByRole('button', { name: '업무 요청' }).click();
  let taskDialog = ownerPage.getByRole('dialog', { name: '업무 요청 만들기' });
  assert.equal(await taskDialog.getByLabel('업무 제목').inputValue(), '');
  assert.equal(await taskDialog.getByText('로컬 문장 기반 초안입니다. AI 생성 결과는 아닙니다.').count(), 0);
  await taskDialog.getByRole('button', { name: '초안 제안받기' }).click();
  await taskDialog.getByText('로컬 문장 기반 초안입니다. AI 생성 결과는 아닙니다.').waitFor();
  await taskDialog.getByRole('button', { name: /history channel 64/ }).click();
  assert.equal(await taskDialog.getByLabel('업무 제목').inputValue(), 'history channel 64');
  assert.equal((await db.collection('tasks').get()).size, 0, 'Choosing a suggestion must not create a task.');
  if (process.env.TASKGO_CAPTURE_TASK_DIALOG) {
    await taskDialog.screenshot({ path: resolve(root, '.tmp-day18-dialog.png') });
    await ownerPage.setViewportSize({ width: 390, height: 844 });
    await taskDialog.screenshot({ path: resolve(root, '.tmp-day18-dialog-mobile.png') });
    await ownerPage.setViewportSize({ width: 1280, height: 720 });
  }
  const dueLocal = await ownerPage.evaluate(() => {
    const nextDay = new Date(Date.now() + 86400000);
    return new Date(nextDay.getTime() - nextDay.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  });
  await taskDialog.getByLabel('업무 제목').fill('고객 요청 정리');
  await taskDialog.getByLabel('담당자').selectOption({ label: member.email });
  await taskDialog.getByLabel('마감 날짜·시간').fill(dueLocal);
  await taskDialog.getByLabel('예상 작업 시간').selectOption('90');
  await taskDialog.getByRole('button', { name: '업무 요청 저장' }).click();
  await ownerPage.getByText('업무 요청이 저장되었습니다.').waitFor();
  const channelTasks = await db.collection('tasks').get();
  assert.equal(channelTasks.size, 1);
  assert.equal(channelTasks.docs[0].get('sourceMessageId'), 'history-channel-64');
  assert.equal(channelTasks.docs[0].get('requesterId'), owner.uid);
  assert.equal(channelTasks.docs[0].get('assigneeId'), member.uid);
  assert.equal(channelTasks.docs[0].get('title'), '고객 요청 정리');
  assert.equal(channelTasks.docs[0].get('status'), 'REQUESTED');
  assert.equal(channelTasks.docs[0].get('estimatedMinutes'), 90);
  assert.equal(channelTasks.docs[0].get('reviewRequired'), false);

  await send(ownerPage, 'owner channel message');
  await visibleOnce(ownerPage, 'owner channel message');
  await visibleOnce(memberPage, 'owner channel message');
  await send(memberPage, 'member channel reply');
  await visibleOnce(ownerPage, 'member channel reply');
  await ownerPage.getByRole('textbox', { name: '메시지 입력' }).fill('typing in channel');
  await memberPage.getByText('live-owner@example.com님이 입력 중…').waitFor();
  await ownerPage.getByRole('textbox', { name: '메시지 입력' }).fill('');
  await memberPage.getByText('live-owner@example.com님이 입력 중…').waitFor({ state: 'hidden' });
  await ownerPage.getByRole('textbox', { name: '메시지 입력' }).fill('typing before outage');
  await memberPage.getByText('live-owner@example.com님이 입력 중…').waitFor();
  await ownerPage.context().setOffline(true);
  await ownerPage.getByText('오프라인').waitFor({ timeout: 10000 });
  await memberPage.getByText('live-owner@example.com님이 입력 중…').waitFor({ state: 'hidden', timeout: 10000 });
  await ownerPage.getByRole('textbox', { name: '메시지 입력' }).fill('owner draft after outage');
  assert.equal(await ownerPage.getByRole('button', { name: '전송', exact: true }).isDisabled(), true);
  for (let index = 0; index < 35; index += 1) {
    const content = `offline gap ${index}`;
    await send(memberPage, content);
    await memberPage.getByRole('listitem').filter({ hasText: content }).getByText('전송됨').waitFor();
  }
  await ownerPage.context().setOffline(false);
  await ownerPage.getByText('실시간 연결됨').waitFor({ timeout: 30000 });
  await visibleOnce(ownerPage, 'offline gap 0');
  await visibleOnce(ownerPage, 'offline gap 34');
  assert.equal(await ownerPage.getByText(/^offline gap \d+$/).count(), 35, 'All missed messages should be restored exactly once.');
  assert.equal(await ownerPage.getByRole('textbox', { name: '메시지 입력' }).inputValue(), 'owner draft after outage');
  await ownerPage.getByRole('button', { name: '전송', exact: true }).click();
  await visibleOnce(memberPage, 'owner draft after outage');
  await ownerPage.goto('about:blank');
  await send(memberPage, 'message while owner away');
  await ownerPage.goto(`${origin}/workspace`);
  await visibleOnce(ownerPage, 'message while owner away');

  await ownerPage.getByRole('button', { name: member.email }).click();
  await memberPage.getByRole('button', { name: owner.email }).click();
  await visibleOnce(ownerPage, 'earlier direct message');
  await visibleOnce(memberPage, 'earlier direct message');
  await ownerPage.getByRole('listitem').filter({ hasText: 'earlier direct message' }).getByRole('button', { name: '업무 요청' }).click();
  taskDialog = ownerPage.getByRole('dialog', { name: '업무 요청 만들기' });
  assert.equal(await taskDialog.getByLabel('업무 제목').inputValue(), '', 'DM text must not become a public task title.');
  await taskDialog.getByText('earlier direct message').waitFor();
  await taskDialog.getByRole('button', { name: '초안 제안받기' }).click();
  await taskDialog.getByRole('button', { name: /earlier direct message/ }).click();
  assert.equal(await taskDialog.getByLabel('업무 제목').inputValue(), 'earlier direct message');
  await taskDialog.getByLabel('업무 제목').fill('비공개 대화 후속 업무');
  await taskDialog.getByLabel('담당자').selectOption({ label: member.email });
  await taskDialog.getByLabel('마감 날짜·시간').fill(dueLocal);
  await taskDialog.getByLabel('완료 후 검수 요청').check();
  await taskDialog.getByLabel('검수 기간').selectOption('2');
  await taskDialog.getByRole('button', { name: '업무 요청 저장' }).click();
  await ownerPage.getByText('업무 요청이 저장되었습니다.').waitFor();
  const dmTask = (await db.collection('tasks').where('sourceMessageId', '==', 'history-dm').get()).docs[0];
  assert.ok(dmTask);
  assert.equal(dmTask.get('sourceType'), 'dm');
  assert.equal(dmTask.get('reviewRequired'), true);
  assert.equal(dmTask.get('reviewWorkingDays'), 2);
  assert.equal('content' in dmTask.data(), false);
  await ownerPage.getByText('실시간 연결됨').waitFor();
  await memberPage.getByText('실시간 연결됨').waitFor();
  await ownerPage.getByRole('textbox', { name: '메시지 입력' }).fill('typing in DM');
  await memberPage.getByText('live-owner@example.com님이 입력 중…').waitFor();
  await ownerPage.getByRole('textbox', { name: '메시지 입력' }).fill('');
  await memberPage.getByText('live-owner@example.com님이 입력 중…').waitFor({ state: 'hidden' });
  await send(ownerPage, 'owner direct message');
  await visibleOnce(memberPage, 'owner direct message');
  await ownerPage.getByRole('button', { name: '전체' }).click();
  await ownerPage.getByText('실시간 연결됨').waitFor();
  await send(memberPage, 'member direct reply');
  await visibleOnce(memberPage, 'member direct reply');
  assert.equal(await ownerPage.getByText('member direct reply', { exact: true }).count(), 0, 'DM leaked into channel view.');
  await ownerPage.getByRole('button', { name: member.email }).click();
  await visibleOnce(ownerPage, 'owner direct message');
  await ownerPage.getByText('실시간 연결됨').waitFor();
  await ownerPage.reload();
  await ownerPage.getByText('실시간 연결됨').waitFor();
  await visibleOnce(ownerPage, 'offline gap 34');
  assert.ok((await db.collection('messages').get()).size >= 70);
  assert.deepEqual(browserErrors, []);
  console.log('PASS: two Chrome sessions verified explicit local suggestions, editable channel/DM tasks, typing, history, offline recovery, and live messages.');
} finally {
  await browser?.close();
  await vite?.close();
  if (socketProcess && socketProcess.exitCode === null) socketProcess.kill();
  await deleteApp(admin);
}
