import { deleteApp, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import type { RoomTarget } from '@taskgo/contracts';
import type { SocketServices } from './app.js';

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
    async close() {
      await deleteApp(app);
    },
  };
}
