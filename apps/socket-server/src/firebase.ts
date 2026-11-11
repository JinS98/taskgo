import { createHash } from 'node:crypto';
import { deleteApp, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import type { RoomTarget, SendMessageRequest } from '@taskgo/contracts';
import type { SaveMessageResult, SocketServices } from './app.js';

const rejectedTokenCodes = new Set([
  'auth/argument-error',
  'auth/invalid-id-token',
  'auth/id-token-expired',
  'auth/id-token-revoked',
  'auth/user-disabled',
  'auth/user-not-found',
]);

export function createFirebaseSocketServices(projectId: string): SocketServices & { close(): Promise<void> } {
  const app = initializeApp({ projectId }, 'taskgo-socket-server');
  const auth = getAuth(app);
  const db = getFirestore(app);

  return {
    async verifyIdentity(token) {
      try {
        const decoded = await auth.verifyIdToken(token, true);
        if (decoded.email_verified !== true) return null;
        return { uid: decoded.uid, expiresAt: decoded.exp * 1000 };
      } catch (error) {
        const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
        if (rejectedTokenCodes.has(code)) return null;
        throw error;
      }
    },
    async canAccessRoom(uid: string, target: RoomTarget) {
      const member = await db.doc(`workspaces/${target.workspaceId}/members/${uid}`).get();
      if (!member.exists) return false;
      if (target.kind === 'channel') {
        const channel = await db.doc(`channels/${target.roomId}`).get();
        return channel.exists && channel.get('workspaceId') === target.workspaceId;
      }
      const room = await db.doc(`dmRooms/${target.roomId}`).get();
      return room.exists && room.get('workspaceId') === target.workspaceId
        && Array.isArray(room.get('participantIds')) && room.get('participantIds').includes(uid);
    },
    async saveMessage(uid: string, message: SendMessageRequest): Promise<SaveMessageResult> {
      const messageId = createHash('sha256').update(`${uid.length}:${uid}:${message.clientMessageId}`).digest('hex');
      const messageRef = db.doc(`messages/${messageId}`);
      const memberRef = db.doc(`workspaces/${message.workspaceId}/members/${uid}`);
      const roomRef = db.doc(`${message.kind === 'channel' ? 'channels' : 'dmRooms'}/${message.roomId}`);

      return db.runTransaction(async (transaction): Promise<SaveMessageResult> => {
        const member = await transaction.get(memberRef);
        const room = await transaction.get(roomRef);
        const existing = await transaction.get(messageRef);
        if (!member.exists || !room.exists || room.get('workspaceId') !== message.workspaceId
          || (message.kind === 'dm' && (!Array.isArray(room.get('participantIds')) || !room.get('participantIds').includes(uid)))) {
          return { status: 'forbidden' };
        }

        if (existing.exists) {
          const sameRequest = existing.get('workspaceId') === message.workspaceId
            && existing.get('sourceType') === message.kind
            && existing.get(message.kind === 'channel' ? 'channelId' : 'dmRoomId') === message.roomId
            && existing.get('senderId') === uid
            && existing.get('clientMessageId') === message.clientMessageId
            && existing.get('content') === message.content;
          if (!sameRequest) return { status: 'conflict' };
          const createdAt = existing.get('createdAt');
          if (!(createdAt instanceof Timestamp)) throw new Error('저장된 메시지의 생성 시각이 없습니다.');
          return { status: 'duplicate', message: { ...message, messageId, senderId: uid, createdAt: createdAt.toDate().toISOString() } };
        }

        const createdAt = Timestamp.now();
        transaction.create(messageRef, {
          workspaceId: message.workspaceId,
          sourceType: message.kind,
          ...(message.kind === 'channel' ? { channelId: message.roomId } : { dmRoomId: message.roomId }),
          senderId: uid,
          clientMessageId: message.clientMessageId,
          content: message.content,
          createdAt,
        });
        return { status: 'created', message: { ...message, messageId, senderId: uid, createdAt: createdAt.toDate().toISOString() } };
      });
    },
    async close() {
      await deleteApp(app);
    },
  };
}
