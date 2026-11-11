import assert from 'node:assert/strict';
import { io as createClient } from 'socket.io-client';
import { createSocketApp, listenSocketApp, closeSocketApp } from '../dist/app.js';

const allowedOrigin = 'http://localhost:5173';
const app = createSocketApp({ allowedOrigins: [allowedOrigin] });
const clients = [];

function openClient(url, origin, transports = ['websocket']) {
  const client = createClient(url, { autoConnect: false, reconnection: false, timeout: 1500, transports, extraHeaders: { Origin: origin } });
  clients.push(client);
  const connected = new Promise((resolve, reject) => {
    client.once('connect', resolve);
    client.once('connect_error', reject);
  });
  client.connect();
  return { client, connected };
}

try {
  const address = await listenSocketApp(app, 0, '127.0.0.1');
  const url = `http://127.0.0.1:${address.port}`;
  const health = await fetch(`${url}/healthz`);
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), { status: 'ok', protocolVersion: 1 });
  assert.equal(health.headers.get('cache-control'), 'no-store');
  assert.equal((await fetch(`${url}/unknown`)).status, 404);

  const { client, connected } = openClient(url, allowedOrigin);
  const ready = new Promise((resolve) => client.once('server:ready', resolve));
  await connected;
  assert.deepEqual(await ready, { protocolVersion: 1 });
  const target = { workspaceId: 'workspace-one', kind: 'channel', roomId: 'general' };
  const expected = { ok: false, error: { code: 'AUTH_NOT_READY', message: '소켓 인증과 권한 검증은 아직 준비 중입니다.' } };
  let broadcast = false;
  client.on('message:created', () => { broadcast = true; });
  assert.deepEqual(await client.timeout(1000).emitWithAck('room:join', target), expected);
  assert.deepEqual(await client.timeout(1000).emitWithAck('room:leave', target), expected);
  assert.deepEqual(await client.timeout(1000).emitWithAck('message:send', { ...target, clientMessageId: 'message-one', content: '아직 저장되면 안 됩니다.' }), expected);
  assert.deepEqual(await client.timeout(1000).emitWithAck('typing:set', { ...target, active: true }), expected);
  assert.equal(broadcast, false);
  assert.equal(client.connected, true);
  client.emit('room:join', target);
  assert.equal((await fetch(`${url}/healthz`)).status, 200);

  for (const transport of ['websocket', 'polling']) {
    const denied = openClient(url, 'http://untrusted.invalid', [transport]);
    await assert.rejects(denied.connected);
    assert.equal(denied.client.connected, false);
  }

  console.log('Socket healthcheck, local connection, event ACK contract, blocked writes, and Origin policy passed.');
} finally {
  for (const client of clients) client.disconnect();
  await closeSocketApp(app);
}
