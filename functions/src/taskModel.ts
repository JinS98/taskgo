import { type Firestore, Timestamp } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import type { CreateTaskRequest, TaskRecord, TaskSourceType } from '@taskgo/contracts/task';

const idPattern = /^[A-Za-z0-9_-]{1,128}$/;
const requiredFields = ['workspaceId', 'sourceMessageId', 'title', 'assigneeId', 'dueDate', 'reviewRequired'];
const allowedFields = new Set([...requiredFields, 'reviewWorkingDays', 'estimatedMinutes', 'description']);

function parseCreateTaskRequest(value: unknown): CreateTaskRequest & { due: Timestamp; reviewDays: number | null; estimate: number | null; description: string | null } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new HttpsError('invalid-argument', '업무 정보를 확인해 주세요.');
  const data = value as Record<string, unknown>;
  if (requiredFields.some((key) => !(key in data)) || Object.keys(data).some((key) => !allowedFields.has(key))) {
    throw new HttpsError('invalid-argument', '업무 필드 구성을 확인해 주세요.');
  }
  for (const key of ['workspaceId', 'sourceMessageId', 'assigneeId']) {
    if (typeof data[key] !== 'string' || !idPattern.test(data[key])) throw new HttpsError('invalid-argument', `${key} 값을 확인해 주세요.`);
  }
  if (typeof data.title !== 'string' || data.title.trim().length < 2 || data.title.trim().length > 160) {
    throw new HttpsError('invalid-argument', '업무 제목은 2~160자로 입력해 주세요.');
  }
  const description = data.description ?? null;
  if (description !== null && (typeof description !== 'string' || description.trim().length > 2000)) {
    throw new HttpsError('invalid-argument', '업무 설명은 2000자 이내로 입력해 주세요.');
  }
  if (typeof data.dueDate !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(data.dueDate)) {
    throw new HttpsError('invalid-argument', '마감일은 UTC ISO 시각으로 입력해 주세요.');
  }
  const dueMillis = Date.parse(data.dueDate);
  if (!Number.isFinite(dueMillis) || new Date(dueMillis).toISOString() !== data.dueDate || dueMillis <= Date.now()) {
    throw new HttpsError('invalid-argument', '미래의 올바른 마감일을 입력해 주세요.');
  }
  if (typeof data.reviewRequired !== 'boolean') throw new HttpsError('invalid-argument', '검수 여부를 확인해 주세요.');
  const reviewDays = data.reviewWorkingDays ?? null;
  if (data.reviewRequired ? !Number.isInteger(reviewDays) || (reviewDays as number) < 1 || (reviewDays as number) > 10 : reviewDays !== null) {
    throw new HttpsError('invalid-argument', '검수 기간은 선택 시 1~10근무일이어야 합니다.');
  }
  const estimate = data.estimatedMinutes ?? null;
  if (estimate !== null && (!Number.isInteger(estimate) || (estimate as number) < 15 || (estimate as number) > 480 || (estimate as number) % 15 !== 0)) {
    throw new HttpsError('invalid-argument', '예상 작업 시간은 15분 단위의 15~480분이어야 합니다.');
  }
  return {
    workspaceId: data.workspaceId as string,
    sourceMessageId: data.sourceMessageId as string,
    title: (data.title as string).trim(),
    description: typeof description === 'string' ? description.trim() || null : null,
    assigneeId: data.assigneeId as string,
    dueDate: data.dueDate,
    reviewRequired: data.reviewRequired,
    reviewWorkingDays: reviewDays as number | null,
    estimatedMinutes: estimate as number | null,
    due: Timestamp.fromMillis(dueMillis),
    reviewDays: reviewDays as number | null,
    estimate: estimate as number | null,
  };
}

export async function createTaskRecord(db: Firestore, requesterId: string, value: unknown): Promise<{ taskId: string }> {
  const input = parseCreateTaskRequest(value);
  const requesterRef = db.doc(`workspaces/${input.workspaceId}/members/${requesterId}`);
  const assigneeRef = db.doc(`workspaces/${input.workspaceId}/members/${input.assigneeId}`);
  const messageRef = db.doc(`messages/${input.sourceMessageId}`);
  const taskRef = db.collection('tasks').doc();

  return db.runTransaction(async (transaction) => {
    const [requester, assignee, message] = await Promise.all([
      transaction.get(requesterRef), transaction.get(assigneeRef), transaction.get(messageRef),
    ]);
    if (!requester.exists || !message.exists || message.get('workspaceId') !== input.workspaceId) {
      throw new HttpsError('permission-denied', '이 워크스페이스의 원본 메시지에 접근할 수 없습니다.');
    }
    if (!assignee.exists) throw new HttpsError('failed-precondition', '담당자가 워크스페이스 멤버가 아닙니다.');
    const sourceType = message.get('sourceType');
    if (sourceType !== 'channel' && sourceType !== 'dm') throw new HttpsError('failed-precondition', '원본 메시지 종류를 확인할 수 없습니다.');
    const roomId = message.get(sourceType === 'channel' ? 'channelId' : 'dmRoomId');
    if (typeof roomId !== 'string' || !idPattern.test(roomId)) throw new HttpsError('failed-precondition', '원본 대화방을 확인할 수 없습니다.');
    const room = await transaction.get(db.doc(`${sourceType === 'channel' ? 'channels' : 'dmRooms'}/${roomId}`));
    if (!room.exists || room.get('workspaceId') !== input.workspaceId
      || (sourceType === 'dm' && (!Array.isArray(room.get('participantIds')) || !room.get('participantIds').includes(requesterId)))) {
      throw new HttpsError('permission-denied', '원본 대화방에 접근할 수 없습니다.');
    }

    const now = Timestamp.now();
    const task: TaskRecord<Timestamp> = {
      workspaceId: input.workspaceId,
      sourceMessageId: input.sourceMessageId,
      sourceType: sourceType as TaskSourceType,
      title: input.title,
      description: input.description,
      requesterId,
      assigneeId: input.assigneeId,
      dueDate: input.due,
      proposedDueDate: null,
      estimatedMinutes: input.estimate,
      status: 'REQUESTED',
      reviewRequired: input.reviewRequired,
      reviewWorkingDays: input.reviewDays,
      reviewCycle: 0,
      reviewSubmittedAt: null,
      reviewRejectionReason: null,
      reviewDeadlineAt: null,
      completionReason: null,
      createdAt: now,
      updatedAt: now,
    };
    transaction.create(taskRef, task);
    return { taskId: taskRef.id };
  });
}
