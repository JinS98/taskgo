import { Navigate, Route, Routes } from 'react-router';
import App from '../../App';
import { AccountMenu } from './AccountMenu';
import { AuthPage } from './AuthPage';
import { VerifyEmailPage } from './VerifyEmailPage';
import { useAuthSession } from './useAuthSession';
import styles from './AuthPage.module.scss';

export default function AuthApp() {
  const { auth, user, ready, setupError, refreshUser } = useAuthSession();

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

  const nextPath = !user ? '/login' : user.emailVerified ? '/workspace' : '/verify-email';

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to={nextPath} replace /> : <AuthPage auth={auth} />} />
      <Route path="/verify-email" element={!user ? <Navigate to="/login" replace /> : user.emailVerified ? <Navigate to="/workspace" replace /> : <VerifyEmailPage auth={auth} user={user} onRefresh={refreshUser} />} />
      <Route path="/workspace" element={!user || !user.emailVerified ? <Navigate to={nextPath} replace /> : <App accountControls={<AccountMenu auth={auth} user={user} onRefresh={refreshUser} />} />} />
      <Route path="*" element={<Navigate to={nextPath} replace />} />
    </Routes>
  );
}
