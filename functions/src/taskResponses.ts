import { type Firestore, Timestamp } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import type { RespondToTaskRequest, TaskRequestAction, TaskStatus } from '@taskgo/contracts/task';

const idPattern = /^[A-Za-z0-9_-]{1,128}$/;
const actions = new Set<TaskRequestAction>(['accept', 'decline', 'startProgress', 'proposeDueDate', 'approveDueDate', 'rejectDueDate']);

function parseFutureDate(value: unknown): Timestamp {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) {
    throw new HttpsError('invalid-argument', '제안 마감일은 UTC ISO 시각으로 입력해 주세요.');
  }
  const millis = Date.parse(value);
  if (!Number.isFinite(millis) || new Date(millis).toISOString() !== value || millis <= Date.now()) {
    throw new HttpsError('invalid-argument', '미래의 올바른 마감일을 입력해 주세요.');
  }
  return Timestamp.fromMillis(millis);
}

function parseRequest(value: unknown): RespondToTaskRequest & { proposedDue: Timestamp | null } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new HttpsError('invalid-argument', '업무 응답을 확인해 주세요.');
  const data = value as Record<string, unknown>;
  if (typeof data.taskId !== 'string' || !idPattern.test(data.taskId) || !actions.has(data.action as TaskRequestAction)) {
    throw new HttpsError('invalid-argument', '업무 ID와 응답 종류를 확인해 주세요.');
  }
  const action = data.action as TaskRequestAction;
  const expected = action === 'proposeDueDate' ? ['taskId', 'action', 'proposedDueDate'] : ['taskId', 'action'];
  if (Object.keys(data).length !== expected.length || expected.some((key) => !(key in data))) {
    throw new HttpsError('invalid-argument', '업무 응답 필드를 확인해 주세요.');
  }
  return {
    taskId: data.taskId,
    action,
    proposedDueDate: action === 'proposeDueDate' ? data.proposedDueDate as string : undefined,
    proposedDue: action === 'proposeDueDate' ? parseFutureDate(data.proposedDueDate) : null,
  };
}

export async function respondToTaskRequest(db: Firestore, actorId: string, value: unknown): Promise<{ taskId: string; status: TaskStatus; dueDate: string; proposedDueDate: string | null }> {
  const input = parseRequest(value);
  const taskRef = db.doc(`tasks/${input.taskId}`);
  const eventRef = db.collection('taskEvents').doc();

  return db.runTransaction(async (transaction) => {
    const task = await transaction.get(taskRef);
    if (!task.exists) throw new HttpsError('not-found', '업무 요청을 찾지 못했습니다.');
    const workspaceId = task.get('workspaceId');
    if (typeof workspaceId !== 'string' || !idPattern.test(workspaceId)) throw new HttpsError('failed-precondition', '업무 워크스페이스를 확인할 수 없습니다.');
    const member = await transaction.get(db.doc(`workspaces/${workspaceId}/members/${actorId}`));
    if (!member.exists) throw new HttpsError('permission-denied', '워크스페이스 멤버만 업무에 응답할 수 있습니다.');
    const requesterId = task.get('requesterId');
    const assigneeId = task.get('assigneeId');
    const actorIsAssignee = assigneeId === actorId;
    const actorIsRequester = requesterId === actorId;
    const assigneeAction = input.action === 'accept' || input.action === 'decline' || input.action === 'startProgress' || input.action === 'proposeDueDate';
    if (assigneeAction ? !actorIsAssignee : !actorIsRequester) {
      throw new HttpsError('permission-denied', assigneeAction ? '담당자만 요청에 응답할 수 있습니다.' : '요청자만 마감 변경 제안에 응답할 수 있습니다.');
    }
    const currentStatus = task.get('status') as TaskStatus;
    if ((input.action === 'accept' || input.action === 'decline') && currentStatus !== 'REQUESTED') {
      throw new HttpsError('failed-precondition', '대기 중인 업무 요청만 수락하거나 거절할 수 있습니다.');
    }
    if (input.action === 'startProgress' && currentStatus !== 'ACCEPTED') {
      throw new HttpsError('failed-precondition', '수락된 업무만 진행을 시작할 수 있습니다.');
    }
    if ((input.action === 'proposeDueDate' || input.action === 'approveDueDate' || input.action === 'rejectDueDate')
      && currentStatus !== 'REQUESTED' && currentStatus !== 'ACCEPTED' && currentStatus !== 'IN_PROGRESS') {
      throw new HttpsError('failed-precondition', '요청·수락·진행 중인 업무에서만 마감을 협의할 수 있습니다.');
    }
    const currentDue = task.get('dueDate');
    const pendingDue = task.get('proposedDueDate');
    if (!(currentDue instanceof Timestamp) || (pendingDue !== null && !(pendingDue instanceof Timestamp))) {
      throw new HttpsError('failed-precondition', '업무 마감 정보를 확인할 수 없습니다.');
    }
    if (input.action === 'accept' && currentDue.toMillis() <= Date.now()) {
      throw new HttpsError('failed-precondition', '마감일이 지났습니다. 새 날짜를 제안해 주세요.');
    }
    if ((input.action === 'accept' || input.action === 'proposeDueDate') && pendingDue !== null) {
      throw new HttpsError('failed-precondition', '대기 중인 마감 변경 제안을 먼저 처리해 주세요.');
    }
    if ((input.action === 'approveDueDate' || input.action === 'rejectDueDate') && pendingDue === null) {
      throw new HttpsError('failed-precondition', '처리할 마감 변경 제안이 없습니다.');
    }
    if (input.action === 'approveDueDate' && pendingDue!.toMillis() <= Date.now()) {
      throw new HttpsError('failed-precondition', '제안한 마감일이 지났습니다. 새 날짜를 요청해 주세요.');
    }
    if (input.action === 'proposeDueDate' && input.proposedDue!.isEqual(currentDue)) {
      throw new HttpsError('invalid-argument', '현재 마감일과 다른 날짜를 제안해 주세요.');
    }

    const now = Timestamp.now();
    const updates: { updatedAt: Timestamp; status?: TaskStatus; proposedDueDate?: Timestamp | null; dueDate?: Timestamp } = { updatedAt: now };
    let status: TaskStatus = currentStatus;
    let due = currentDue;
    let proposed: Timestamp | null = pendingDue;
    if (input.action === 'accept') { status = 'ACCEPTED'; updates.status = status; }
    if (input.action === 'decline') { status = 'DECLINED'; updates.status = status; updates.proposedDueDate = null; proposed = null; }
    if (input.action === 'startProgress') { status = 'IN_PROGRESS'; updates.status = status; }
    if (input.action === 'proposeDueDate') { updates.proposedDueDate = input.proposedDue; proposed = input.proposedDue; }
    if (input.action === 'approveDueDate') { updates.dueDate = pendingDue; updates.proposedDueDate = null; due = pendingDue!; proposed = null; }
    if (input.action === 'rejectDueDate') { updates.proposedDueDate = null; proposed = null; }
    transaction.update(taskRef, updates);
    const metadata = input.action === 'proposeDueDate'
      ? { previousDueDate: currentDue.toDate().toISOString(), proposedDueDate: input.proposedDue!.toDate().toISOString() }
      : input.action === 'approveDueDate'
        ? { previousDueDate: currentDue.toDate().toISOString(), dueDate: pendingDue!.toDate().toISOString() }
        : input.action === 'rejectDueDate'
          ? { proposedDueDate: pendingDue!.toDate().toISOString() }
          : {};
    transaction.create(eventRef, {
      taskId: input.taskId,
      actorId,
      action: input.action,
      createdAt: now,
      metadata,
    });
    return { taskId: input.taskId, status, dueDate: due.toDate().toISOString(), proposedDueDate: proposed?.toDate().toISOString() ?? null };
  });
}
