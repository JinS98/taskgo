import { collection, documentId, getDocs, limit, orderBy, query, startAfter, where, type DocumentData, type Firestore, type QueryDocumentSnapshot } from 'firebase/firestore';
import type { CreatedMessage, RoomTarget } from '@taskgo/contracts';

export const MESSAGE_PAGE_SIZE = 30;
export type MessageCursor = QueryDocumentSnapshot<DocumentData>;

export async function fetchMessagePage(db: Firestore, target: RoomTarget, after?: MessageCursor) {
  const roomField = target.kind === 'channel' ? 'channelId' : 'dmRoomId';
  const conditions = [
    where('workspaceId', '==', target.workspaceId),
    where('sourceType', '==', target.kind),
    where(roomField, '==', target.roomId),
    orderBy('createdAt', 'desc'),
    orderBy(documentId(), 'desc'),
    ...(after ? [startAfter(after)] : []),
    limit(MESSAGE_PAGE_SIZE),
  ];
  const snapshot = await getDocs(query(collection(db, 'messages'), ...conditions));
  const messages = snapshot.docs.map((item): CreatedMessage => {
    const data = item.data();
    return {
      workspaceId: target.workspaceId,
      kind: target.kind,
      roomId: target.roomId,
      messageId: item.id,
      clientMessageId: data.clientMessageId,
      senderId: data.senderId,
      content: data.content,
      createdAt: data.createdAt.toDate().toISOString(),
    };
  });
  return {
    messages,
    cursor: snapshot.docs.at(-1),
    hasMore: snapshot.size === MESSAGE_PAGE_SIZE,
  };
}