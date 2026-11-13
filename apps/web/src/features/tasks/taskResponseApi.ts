import { getIdToken, type Auth } from 'firebase/auth';
import { httpsCallable, type Functions } from 'firebase/functions';
import type { RespondToTaskRequest, TaskStatus } from '@taskgo/contracts/task';

export interface TaskResponseResult { taskId: string; status: TaskStatus; dueDate: string; proposedDueDate: string | null }

export async function respondTask(auth: Auth, functions: Functions, request: RespondToTaskRequest): Promise<TaskResponseResult> {
  const user = auth.currentUser;
  if (!user) throw new Error('다시 로그인해 주세요.');
  await getIdToken(user, true);
  return (await httpsCallable<RespondToTaskRequest, TaskResponseResult>(functions, 'respondTask')(request)).data;
}

export function taskResponseError(error: unknown): string {
  const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
  switch (code) {
    case 'functions/unauthenticated': return '다시 로그인한 뒤 시도해 주세요.';
    case 'functions/permission-denied': return '이 업무 요청에 응답할 권한이 없습니다.';
    case 'functions/failed-precondition': return '업무 상태나 마감일이 바뀌었습니다. 새로고침된 내용을 확인해 주세요.';
    case 'functions/not-found': return '업무 요청을 찾지 못했습니다.';
    case 'functions/invalid-argument': return '제안한 마감 날짜와 시간을 확인해 주세요.';
    case 'functions/unavailable': return '업무 서버에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.';
    default: return error instanceof Error && !code ? error.message : '업무 요청을 처리하지 못했습니다.';
  }
}
