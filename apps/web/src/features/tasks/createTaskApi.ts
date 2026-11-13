import { getIdToken, type Auth } from 'firebase/auth';
import { httpsCallable, type Functions } from 'firebase/functions';
import type { CreateTaskRequest } from '@taskgo/contracts/task';

export async function createTask(auth: Auth, functions: Functions, request: CreateTaskRequest): Promise<{ taskId: string }> {
  const user = auth.currentUser;
  if (!user) throw new Error('다시 로그인해 주세요.');
  await getIdToken(user, true);
  return (await httpsCallable<CreateTaskRequest, { taskId: string }>(functions, 'createTask')(request)).data;
}

export interface TaskSuggestion { title: string; reason: string }
export interface TaskSuggestionResult { candidates: TaskSuggestion[]; demo: boolean }

export async function suggestTask(auth: Auth, functions: Functions, request: { workspaceId: string; sourceMessageId: string }): Promise<TaskSuggestionResult> {
  const user = auth.currentUser;
  if (!user) throw new Error('다시 로그인해 주세요.');
  await getIdToken(user, true);
  return (await httpsCallable<typeof request, TaskSuggestionResult>(functions, 'suggestTask')(request)).data;
}

export function taskSuggestionError(error: unknown): string {
  const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
  switch (code) {
    case 'functions/unauthenticated': return '다시 로그인한 뒤 제안을 요청해 주세요.';
    case 'functions/permission-denied': return '이 대화에 접근할 수 없습니다.';
    case 'functions/resource-exhausted': return '오늘의 제안 횟수를 모두 사용했습니다.';
    case 'functions/failed-precondition': return 'AI 제안을 사용할 수 없습니다. 직접 업무 제목을 입력해 주세요.';
    case 'functions/unavailable': return '제안을 만들지 못했습니다. 직접 업무 제목을 입력해 주세요.';
    default: return error instanceof Error && !code ? error.message : '제안 요청에 실패했습니다. 직접 업무 제목을 입력해 주세요.';
  }
}

export function taskCreationError(error: unknown): string {
  const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
  switch (code) {
    case 'functions/unauthenticated': return '다시 로그인한 뒤 업무를 요청해 주세요.';
    case 'functions/permission-denied': return '원본 메시지나 워크스페이스에 접근할 수 없습니다.';
    case 'functions/failed-precondition': return '담당자 또는 원본 대화방 상태를 확인해 주세요.';
    case 'functions/invalid-argument': return '업무 제목, 마감, 검수 설정을 확인해 주세요.';
    case 'functions/not-found': return '업무 생성 기능을 찾지 못했습니다. Functions 설정을 확인해 주세요.';
    case 'functions/unavailable': return '업무 서버에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.';
    default: return error instanceof Error && !code ? error.message : '업무 요청을 저장하지 못했습니다. 다시 시도해 주세요.';
  }
}
