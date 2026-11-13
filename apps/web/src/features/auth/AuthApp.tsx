import { Navigate, Route, Routes, useLocation } from 'react-router';
import type { Auth, User } from 'firebase/auth';
import type { Firestore } from 'firebase/firestore';
import type { Functions } from 'firebase/functions';
import { getFirebaseServices } from '../../services/firebase';
import { InvitePage } from '../workspace/InvitePage';
import { WorkspaceGate } from '../workspace/WorkspaceGate';
import { AuthPage } from './AuthPage';
import { ProfileSetupPage } from './ProfileSetupPage';
import { useUserProfile } from './userProfile';
import { useAuthSession } from './useAuthSession';
import styles from './AuthPage.module.scss';

function SignedInApp({ auth, user, db, functions, onRefresh }: { auth: Auth; user: User; db: Firestore; functions: Functions; onRefresh: () => Promise<void> }) {
  const location = useLocation();
  const { profile, error, saveName } = useUserProfile(db, user);
  const requestedNext = new URLSearchParams(location.search).get('next');
  const inviteNext = requestedNext && /^\/invite\/[A-Za-z0-9]+\?token=[A-Za-z0-9_-]+$/.test(requestedNext) ? requestedNext : null;
  const nextPath = inviteNext ?? '/workspace';

  if (error) return <div className={styles.statusPage} role="alert"><p>{error}</p><button type="button" onClick={() => window.location.reload()}>다시 시도</button></div>;
  if (!profile) return <div className={styles.statusPage} role="status">이름 정보를 준비하는 중입니다…</div>;
  if (!profile.setupComplete) return <ProfileSetupPage auth={auth} profile={profile} onSave={async (name) => { await saveName(name); await onRefresh(); }} />;

  return <Routes>
    <Route path="/login" element={<Navigate to={nextPath} replace />} />
    <Route path="/verify-email" element={<Navigate to={nextPath} replace />} />
    <Route path="/workspace" element={<WorkspaceGate auth={auth} user={user} db={db} functions={functions} displayName={profile.displayName} onSaveName={saveName} onRefresh={onRefresh} />} />
    <Route path="/invite/:inviteId" element={<InvitePage auth={auth} functions={functions} />} />
    <Route path="*" element={<Navigate to={nextPath} replace />} />
  </Routes>;
}

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
  const nextPath = `/login${nextQuery}`;
  const { db, functions } = getFirebaseServices();

  if (user) return <SignedInApp key={user.uid} auth={auth} user={user} db={db} functions={functions} onRefresh={refreshUser} />;

  return (
    <Routes>
      <Route path="/login" element={<AuthPage auth={auth} />} />
      <Route path="/verify-email" element={<Navigate to={nextPath} replace />} />
      <Route path="/workspace" element={<Navigate to={nextPath} replace />} />
      <Route path="/invite/:inviteId" element={<Navigate to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`} replace />} />
      <Route path="*" element={<Navigate to={nextPath} replace />} />
    </Routes>
  );
}
