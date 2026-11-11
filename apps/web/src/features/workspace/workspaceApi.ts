import { getIdToken, type Auth } from 'firebase/auth';
import { collection, doc, serverTimestamp, writeBatch, type Firestore } from 'firebase/firestore';
import { httpsCallable, type Functions } from 'firebase/functions';

export async function createWorkspace(auth: Auth, db: Firestore, name: string): Promise<{ workspaceId: string }> {
  const user = auth.currentUser;
  if (!user?.email || !user.emailVerified) throw new Error('이메일 확인 후 워크스페이스를 만들 수 있습니다.');
  await getIdToken(user, true);
  const workspace = doc(collection(db, 'workspaces'));
  const batch = writeBatch(db);
  const trimmedName = name.trim();
  batch.set(workspace, { name: trimmedName, ownerId: user.uid, createdAt: serverTimestamp() });
  batch.set(doc(db, 'workspaces', workspace.id, 'members', user.uid), { uid: user.uid, email: user.email, role: 'owner', joinedAt: serverTimestamp() });
  batch.set(doc(db, 'users', user.uid, 'workspaces', workspace.id), { workspaceId: workspace.id, name: trimmedName, role: 'owner', joinedAt: serverTimestamp() });
  await batch.commit();
  return { workspaceId: workspace.id };
}

export async function callWorkspace<T>(auth: Auth, functions: Functions, name: string, data: Record<string, string>): Promise<T> {
  if (!auth.currentUser) throw new Error('로그인이 필요합니다.');
  await getIdToken(auth.currentUser, true);
  return (await httpsCallable<Record<string, string>, T>(functions, name)(data)).data;
}

export function workspaceCreationError(error: unknown): string {
  const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
  if (code === 'permission-denied') return '워크스페이스 생성 권한이 없습니다. 이메일 인증과 Firestore 규칙을 확인해 주세요.';
  if (code === 'unavailable') return 'Firestore에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.';
  return error instanceof Error && !code ? error.message : '워크스페이스를 만들지 못했습니다. 잠시 후 다시 시도해 주세요.';
}

export function workspaceError(error: unknown): string {
  const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
  switch (code) {
    case 'functions/permission-denied': return '권한이 없거나 초대받은 이메일과 로그인 이메일이 다릅니다.';
    case 'functions/unauthenticated': return '다시 로그인해 주세요.';
    case 'functions/already-exists': return '이미 워크스페이스에 가입했거나 초대된 계정입니다.';
    case 'functions/deadline-exceeded': return '만료된 초대 링크입니다.';
    case 'functions/failed-precondition': return '초대 상태 또는 메일 발송 설정을 확인해 주세요.';
    case 'functions/invalid-argument': return '입력값 또는 초대 링크를 확인해 주세요.';
    case 'functions/not-found': return '초대나 초대 서버 기능을 찾지 못했습니다.';
    case 'functions/unavailable': return '서버에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.';
    case 'functions/internal': return '초대 서버 요청을 처리하지 못했습니다. Functions 설정을 확인해 주세요.';
    default: return error instanceof Error && !code ? error.message : '요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.';
  }
}
