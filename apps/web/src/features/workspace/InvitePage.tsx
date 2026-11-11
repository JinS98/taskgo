import { useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import type { Auth } from 'firebase/auth';
import type { Functions } from 'firebase/functions';
import { callWorkspace, workspaceError } from './workspaceApi';
import styles from './WorkspaceGate.module.scss';

export function InvitePage({ auth, functions }: { auth: Auth; functions: Functions }) {
  const { inviteId } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const token = params.get('token');

  async function accept() {
    if (!inviteId || !token || pending) return;
    setPending(true);
    setError('');
    try {
      const { workspaceId } = await callWorkspace<{ workspaceId: string }>(auth, functions, 'acceptInvite', { inviteId, token });
      navigate(`/workspace?workspaceId=${encodeURIComponent(workspaceId)}`, { replace: true });
    } catch (cause) {
      setError(workspaceError(cause));
    } finally {
      setPending(false);
    }
  }

  return (
    <main className={styles.page}>
      <section className={styles.card}>
        <p className={styles.eyebrow}>WORKSPACE INVITATION</p>
        <h1>워크스페이스 초대</h1>
        <p>이메일 주소 <strong>{auth.currentUser?.email}</strong>로 로그인했습니다. 초대받은 주소와 같다면 아래 버튼을 눌러 주세요.</p>
        {!inviteId || !token ? <p role="alert">초대 링크가 올바르지 않습니다.</p> : <button type="button" disabled={pending} onClick={accept}>{pending ? '확인 중…' : '초대 수락'}</button>}
        {error && <p className={styles.error} role="alert">{error}</p>}
        <button className={styles.textButton} type="button" onClick={() => navigate('/workspace')}>내 워크스페이스로 이동</button>
      </section>
    </main>
  );
}
