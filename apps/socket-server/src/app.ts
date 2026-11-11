import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Server } from 'socket.io';
import type { ClientToServerEvents, CreatedMessage, RoomTarget, SendMessageRequest, ServerToClientEvents, SocketAck, SocketErrorCode, SocketProtocolVersion } from '@taskgo/contracts';

const protocolVersion: SocketProtocolVersion = 1;
const idPattern = /^[A-Za-z0-9_-]{1,128}$/;

export interface SocketIdentity {
  uid: string;
  expiresAt: number;
}

export interface SocketServices {
  verifyIdentity(token: string): Promise<SocketIdentity | null>;
  canAccessRoom(uid: string, target: RoomTarget): Promise<boolean>;
  saveMessage(uid: string, message: SendMessageRequest): Promise<SaveMessageResult>;
}

export type SaveMessageResult =
  | { status: 'created'; message: CreatedMessage }
  | { status: 'duplicate'; message: CreatedMessage }
  | { status: 'forbidden' }
  | { status: 'conflict' };

export interface SocketAppOptions {
  allowedOrigins: readonly string[];
  services: SocketServices;
}

function targetFrom(value: unknown): RoomTarget | null {
  if (!value || typeof value !== 'object') return null;
  const target = value as Record<string, unknown>;
  if (typeof target.workspaceId !== 'string' || !idPattern.test(target.workspaceId)
    || typeof target.roomId !== 'string' || !idPattern.test(target.roomId)
    || (target.kind !== 'channel' && target.kind !== 'dm')) return null;
  return { workspaceId: target.workspaceId, roomId: target.roomId, kind: target.kind };
}

function roomName(target: RoomTarget): string {
  return `workspace/${target.workspaceId}/${target.kind}/${target.roomId}`;
}

function failure<T>(code: SocketErrorCode, message: string): SocketAck<T> {
  return { ok: false, error: { code, message } };
}

function connectionError(code: string, message: string): Error {
  return Object.assign(new Error(message), { data: { code } });
}

export function createSocketApp({ allowedOrigins, services }: SocketAppOptions) {
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

  const io = new Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, { identity: SocketIdentity }>(httpServer, {
    cors: { origin: [...origins], methods: ['GET', 'POST'] },
    allowRequest: (request, callback) => callback(null, typeof request.headers.origin === 'string' && origins.has(request.headers.origin)),
  });

  async function deliverToAuthorizedRoom(message: CreatedMessage): Promise<void> {
    const target: RoomTarget = message;
    const name = roomName(target);
    const socketIds = [...(io.sockets.adapter.rooms.get(name) ?? [])];
    await Promise.all(socketIds.map(async (socketId) => {
      const recipient = io.sockets.sockets.get(socketId);
      if (!recipient?.connected || !recipient.rooms.has(name)) return;
      if (recipient.data.identity.expiresAt <= Date.now()) {
        recipient.disconnect(true);
        return;
      }
      try {
        if (!await services.canAccessRoom(recipient.data.identity.uid, target)) {
          await recipient.leave(name);
          return;
        }
        if (recipient.connected && recipient.rooms.has(name) && recipient.data.identity.expiresAt > Date.now()) {
          recipient.emit('message:created', message);
        }
      } catch {
        // A failed permission lookup must never become permission to receive.
      }
    }));
  }

  io.use(async (socket, next) => {
    const token = socket.handshake.auth?.token;
    if (typeof token !== 'string' || !token || token.length > 8192) {
      next(connectionError('UNAUTHENTICATED', 'Firebase 로그인이 필요합니다.'));
      return;
    }
    try {
      const identity = await services.verifyIdentity(token);
      if (!identity || !identity.uid || identity.expiresAt <= Date.now()) {
        next(connectionError('UNAUTHENTICATED', '유효한 Firebase 로그인이 필요합니다.'));
        return;
      }
      socket.data.identity = identity;
      next();
    } catch {
      next(connectionError('AUTH_UNAVAILABLE', '로그인 상태를 확인할 수 없습니다.'));
    }
  });

  io.on('connection', (socket) => {
    const identity = socket.data.identity;
    const expiryTimer = setTimeout(() => socket.disconnect(true), Math.max(0, identity.expiresAt - Date.now()));
    socket.on('disconnect', () => clearTimeout(expiryTimer));
    socket.emit('server:ready', { protocolVersion });

    async function authorize<T>(rawTarget: unknown, ack: (result: SocketAck<T>) => void, requireJoined: boolean): Promise<RoomTarget | null> {
      const target = targetFrom(rawTarget);
      if (!target) {
        if (typeof ack === 'function') ack(failure('INVALID_REQUEST', '워크스페이스와 룸 정보를 확인해 주세요.'));
        return null;
      }
      if (identity.expiresAt <= Date.now()) {
        if (typeof ack === 'function') ack(failure('AUTH_EXPIRED', '로그인을 갱신한 뒤 다시 연결해 주세요.'));
        socket.disconnect(true);
        return null;
      }
      if (requireJoined && !socket.rooms.has(roomName(target))) {
        if (typeof ack === 'function') ack(failure('FORBIDDEN', '먼저 접근 가능한 룸에 참가해 주세요.'));
        return null;
      }
      try {
        if (!await services.canAccessRoom(identity.uid, target)) {
          if (requireJoined) {
            try { await socket.leave(roomName(target)); } catch { socket.disconnect(true); }
          }
          if (typeof ack === 'function') ack(failure('FORBIDDEN', '이 룸에 접근할 수 없습니다.'));
          return null;
        }
      } catch {
        if (typeof ack === 'function') ack(failure('INTERNAL_ERROR', '권한을 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.'));
        return null;
      }
      return target;
    }

    function run<T>(ack: (result: SocketAck<T>) => void, action: () => Promise<void>): void {
      void action().catch(() => {
        if (typeof ack === 'function') ack(failure('INTERNAL_ERROR', '요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.'));
      });
    }

    socket.on('room:join', (rawTarget, ack) => {
      run(ack, async () => {
        const target = await authorize(rawTarget, ack, false);
        if (!target) return;
        await socket.join(roomName(target));
        if (typeof ack === 'function') ack({ ok: true, data: { joined: true } });
      });
    });

    socket.on('room:leave', (rawTarget, ack) => {
      run(ack, async () => {
        const target = targetFrom(rawTarget);
        if (!target) {
          if (typeof ack === 'function') ack(failure('INVALID_REQUEST', '워크스페이스와 룸 정보를 확인해 주세요.'));
          return;
        }
        await socket.leave(roomName(target));
        if (typeof ack === 'function') ack({ ok: true, data: { left: true } });
      });
    });

    socket.on('message:send', (message, ack) => {
      run(ack, async () => {
        const target = await authorize(message, ack, true);
        if (!target) return;
        if (!message || typeof message.clientMessageId !== 'string' || !idPattern.test(message.clientMessageId)
          || typeof message.content !== 'string' || !message.content.trim() || message.content.length > 4000) {
          if (typeof ack === 'function') ack(failure('INVALID_REQUEST', '메시지 내용을 확인해 주세요.'));
          return;
        }
        const request: SendMessageRequest = { ...target, clientMessageId: message.clientMessageId, content: message.content };
        const result = await services.saveMessage(identity.uid, request);
        if (result.status === 'forbidden') {
          try { await socket.leave(roomName(target)); } catch { socket.disconnect(true); }
          if (typeof ack === 'function') ack(failure('FORBIDDEN', '이 룸에 접근할 수 없습니다.'));
          return;
        }
        if (result.status === 'conflict') {
          if (typeof ack === 'function') ack(failure('CONFLICT', '이미 다른 내용으로 사용한 메시지 ID입니다.'));
          return;
        }
        if (typeof ack === 'function') ack({ ok: true, data: { messageId: result.message.messageId } });
        if (result.status === 'created') {
          void deliverToAuthorizedRoom(result.message).catch((error: unknown) => {
            console.error('Saved message delivery failed', error);
          });
        }
      });
    });

    socket.on('typing:set', (payload, ack) => {
      run(ack, async () => {
        const target = await authorize(payload, ack, true);
        if (!target) return;
        if (typeof payload.active !== 'boolean') {
          if (typeof ack === 'function') ack(failure('INVALID_REQUEST', '타이핑 상태를 확인해 주세요.'));
          return;
        }
        if (typeof ack === 'function') ack(failure('FEATURE_NOT_READY', '타이핑 전파는 다음 작업에서 연결합니다.'));
      });
    });
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
