import { Navigate, Route, Routes, useLocation } from 'react-router';
import { getFirebaseServices } from '../../services/firebase';
import { InvitePage } from '../workspace/InvitePage';
import { WorkspaceGate } from '../workspace/WorkspaceGate';
import { AuthPage } from './AuthPage';
import { VerifyEmailPage } from './VerifyEmailPage';
import { useAuthSession } from './useAuthSession';
import styles from './AuthPage.module.scss';

export default function AuthApp() {
  const { auth, user, ready, setupError, refreshUser } = useAuthSession();
  const location = useLocation();

  if (!ready) {
    return <div className={styles.statusPage} role="status">로그인 상태를 확인하는 중입니다…</div>;
  }

  if (setupError || !auth) {
    return (
      <div className={styles.statusPage} role="alert">
        <h1>Firebase 설정을 확인해 주세요</h1>
        <p>{setupError}</p>
      </div>
    );
  }

  const requestedNext = new URLSearchParams(location.search).get('next');
  const inviteNext = requestedNext && /^\/invite\/[A-Za-z0-9]+\?token=[A-Za-z0-9_-]+$/.test(requestedNext) ? requestedNext : null;
  const nextQuery = inviteNext ? `?next=${encodeURIComponent(inviteNext)}` : '';
  const nextPath = !user ? `/login${nextQuery}` : user.emailVerified ? inviteNext ?? '/workspace' : `/verify-email${nextQuery}`;
  const { db, functions } = getFirebaseServices();

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to={nextPath} replace /> : <AuthPage auth={auth} />} />
      <Route path="/verify-email" element={!user || user.emailVerified ? <Navigate to={nextPath} replace /> : <VerifyEmailPage auth={auth} user={user} onRefresh={refreshUser} />} />
      <Route path="/workspace" element={!user || !user.emailVerified ? <Navigate to={nextPath} replace /> : <WorkspaceGate auth={auth} user={user} db={db} functions={functions} onRefresh={refreshUser} />} />
      <Route path="/invite/:inviteId" element={!user || !user.emailVerified ? <Navigate to={`${nextPath}${nextPath.includes('?') ? '&' : '?'}next=${encodeURIComponent(location.pathname + location.search)}`} replace /> : <InvitePage auth={auth} functions={functions} />} />
      <Route path="*" element={<Navigate to={nextPath} replace />} />
    </Routes>
  );
}
