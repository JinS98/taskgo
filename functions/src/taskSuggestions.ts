import { FieldPath, type Firestore, Timestamp } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';

const idPattern = /^[A-Za-z0-9_-]{1,128}$/;
const maxContextMessages = 8;
const dailyLimit = 10;

export interface TaskCandidate { title: string; reason: string }
export interface TaskSuggestionResult { candidates: TaskCandidate[]; demo: boolean }
export interface TaskSuggestionContext { messages: { sender: string; content: string }[]; selectedIndex: number }
export type CandidateGenerator = (context: TaskSuggestionContext) => Promise<TaskCandidate[]>;

function requestFields(value: unknown): { workspaceId: string; sourceMessageId: string } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new HttpsError('invalid-argument', '원본 메시지를 선택해 주세요.');
  const data = value as Record<string, unknown>;
  if (Object.keys(data).length !== 2 || typeof data.workspaceId !== 'string' || !idPattern.test(data.workspaceId)
    || typeof data.sourceMessageId !== 'string' || !idPattern.test(data.sourceMessageId)) {
    throw new HttpsError('invalid-argument', '원본 메시지 정보를 확인해 주세요.');
  }
  return { workspaceId: data.workspaceId, sourceMessageId: data.sourceMessageId };
}

function validatedCandidates(value: unknown): TaskCandidate[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 3) throw new Error('AI 후보 수가 올바르지 않습니다.');
  const titles = new Set<string>();
  return value.map((item): TaskCandidate => {
    if (!item || typeof item !== 'object' || typeof item.title !== 'string' || typeof item.reason !== 'string') throw new Error('AI 후보 형식이 올바르지 않습니다.');
    const title = item.title.trim();
    const reason = item.reason.trim();
    if (title.length < 2 || title.length > 160 || reason.length > 200 || titles.has(title)) throw new Error('AI 후보 내용이 올바르지 않습니다.');
    titles.add(title);
    return { title, reason };
  });
}

export async function suggestTaskFromMessage(db: Firestore, requesterId: string, value: unknown, generate: CandidateGenerator, demo = false): Promise<TaskSuggestionResult> {
  const { workspaceId, sourceMessageId } = requestFields(value);
  const member = await db.doc(`workspaces/${workspaceId}/members/${requesterId}`).get();
  if (!member.exists) throw new HttpsError('permission-denied', '워크스페이스 멤버만 제안을 요청할 수 있습니다.');
  const message = await db.doc(`messages/${sourceMessageId}`).get();
  if (!message.exists || message.get('workspaceId') !== workspaceId) throw new HttpsError('permission-denied', '원본 메시지에 접근할 수 없습니다.');
  const sourceType = message.get('sourceType');
  const roomField = sourceType === 'channel' ? 'channelId' : sourceType === 'dm' ? 'dmRoomId' : null;
  if (!roomField) throw new HttpsError('failed-precondition', '원본 대화 종류를 확인할 수 없습니다.');
  const roomId = message.get(roomField);
  if (typeof roomId !== 'string' || !idPattern.test(roomId)) throw new HttpsError('failed-precondition', '원본 대화방을 확인할 수 없습니다.');
  const room = await db.doc(`${sourceType === 'channel' ? 'channels' : 'dmRooms'}/${roomId}`).get();
  if (!room.exists || room.get('workspaceId') !== workspaceId
    || (sourceType === 'dm' && (!Array.isArray(room.get('participantIds')) || !room.get('participantIds').includes(requesterId)))) {
    throw new HttpsError('permission-denied', '원본 대화방에 접근할 수 없습니다.');
  }
  const createdAt = message.get('createdAt');
  if (!(createdAt instanceof Timestamp)) throw new HttpsError('failed-precondition', '원본 메시지 시각을 확인할 수 없습니다.');

  const snapshot = await db.collection('messages')
    .where('workspaceId', '==', workspaceId).where('sourceType', '==', sourceType).where(roomField, '==', roomId)
    .orderBy('createdAt', 'desc').orderBy(FieldPath.documentId(), 'desc')
    .startAt(message).limit(maxContextMessages).get();
  const context = snapshot.docs.reverse().map((item) => ({
    sender: item.get('senderId') === requesterId ? '요청자' : '팀원',
    content: String(item.get('content') ?? '').slice(0, 1200),
    id: item.id,
  }));
  const selectedIndex = context.findIndex((item) => item.id === sourceMessageId);
  if (selectedIndex < 0) throw new HttpsError('failed-precondition', '선택한 메시지가 문맥 범위에 없습니다.');

  const day = new Date().toISOString().slice(0, 10);
  const usageRef = db.doc(`aiUsage/${requesterId}_${day}`);
  await db.runTransaction(async (transaction) => {
    const usage = await transaction.get(usageRef);
    const count = usage.exists ? Number(usage.get('count') ?? 0) : 0;
    if (count >= dailyLimit) throw new HttpsError('resource-exhausted', '오늘의 AI 제안 횟수를 모두 사용했습니다.');
    transaction.set(usageRef, { userId: requesterId, day, count: count + 1, updatedAt: Timestamp.now() });
  });

  try {
    const candidates = await generate({ messages: context.map(({ sender, content }) => ({ sender, content })), selectedIndex });
    return { candidates: validatedCandidates(candidates), demo };
  } catch {
    throw new HttpsError('unavailable', 'AI 제안을 만들지 못했습니다. 수동으로 업무를 작성해 주세요.');
  }
}

export async function localTaskCandidates(context: TaskSuggestionContext): Promise<TaskCandidate[]> {
  const selected = context.messages[context.selectedIndex]?.content.trim().replace(/\s+/g, ' ');
  if (!selected) throw new Error('선택한 메시지가 비어 있습니다.');
  const summary = selected.slice(0, 90).replace(/[.!?]+$/, '');
  const candidates: TaskCandidate[] = [{ title: summary, reason: '선택한 메시지에서 가져온 초안입니다.' }];
  const previous = context.messages[context.selectedIndex - 1]?.content.trim().replace(/\s+/g, ' ');
  if (previous && previous !== selected) candidates.push({ title: previous.slice(0, 90).replace(/[.!?]+$/, ''), reason: '앞선 대화에서 가져온 초안입니다.' });
  return candidates.filter((item, index, list) => item.title.length >= 2 && list.findIndex((other) => other.title === item.title) === index);
}
