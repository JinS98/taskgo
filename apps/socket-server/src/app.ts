import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Server } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents, SocketAck, SocketProtocolVersion } from '@taskgo/contracts';

const protocolVersion: SocketProtocolVersion = 1;
const notReady = { ok: false, error: { code: 'AUTH_NOT_READY', message: '소켓 인증과 권한 검증은 아직 준비 중입니다.' } } as const;

export interface SocketAppOptions {
  allowedOrigins: readonly string[];
}

export function createSocketApp({ allowedOrigins }: SocketAppOptions) {
  const origins = new Set(allowedOrigins);
  const httpServer = createServer((request, response) => {
    if (request.method === 'GET' && request.url === '/healthz') {
      response.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
      response.end(JSON.stringify({ status: 'ok', protocolVersion }));
      return;
    }
    response.writeHead(404, { 'content-type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify({ error: 'not_found' }));
  });

  const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
    cors: { origin: [...origins], methods: ['GET', 'POST'] },
    allowRequest: (request, callback) => callback(null, typeof request.headers.origin === 'string' && origins.has(request.headers.origin)),
  });

  function reject<T>(ack: unknown): void {
    if (typeof ack === 'function') (ack as (result: SocketAck<T>) => void)(notReady);
  }

  io.on('connection', (socket) => {
    socket.emit('server:ready', { protocolVersion });
    socket.on('room:join', (_target, ack) => reject<{ joined: true }>(ack));
    socket.on('room:leave', (_target, ack) => reject<{ left: true }>(ack));
    socket.on('message:send', (_message, ack) => reject<{ messageId: string }>(ack));
    socket.on('typing:set', (_payload, ack) => reject<{ accepted: true }>(ack));
  });

  return { httpServer, io };
}

export async function listenSocketApp(app: ReturnType<typeof createSocketApp>, port: number, host: string): Promise<AddressInfo> {
  await new Promise<void>((resolve, reject) => {
    app.httpServer.once('error', reject);
    app.httpServer.listen(port, host, () => {
      app.httpServer.off('error', reject);
      resolve();
    });
  });
  const address = app.httpServer.address();
  if (!address || typeof address === 'string') throw new Error('소켓 서버 주소를 확인할 수 없습니다.');
  return address;
}

export async function closeSocketApp(app: ReturnType<typeof createSocketApp>): Promise<void> {
  await new Promise<void>((resolve) => app.io.close(() => resolve()));
}
