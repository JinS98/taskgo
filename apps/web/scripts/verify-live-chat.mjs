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

  await send(ownerPage, 'owner channel message');
  await visibleOnce(ownerPage, 'owner channel message');
  await visibleOnce(memberPage, 'owner channel message');
  await send(memberPage, 'member channel reply');
  await visibleOnce(ownerPage, 'member channel reply');
  await ownerPage.context().setOffline(true);
  await ownerPage.getByText('연결 중…').waitFor({ timeout: 10000 });
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
  await ownerPage.getByText('실시간 연결됨').waitFor();
  await memberPage.getByText('실시간 연결됨').waitFor();
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
  console.log('PASS: two Chrome sessions loaded paginated channel and DM history, preserved scroll, recovered missed messages, and exchanged live messages.');
} finally {
  await browser?.close();
  await vite?.close();
  if (socketProcess && socketProcess.exitCode === null) socketProcess.kill();
  await deleteApp(admin);
}
