import { useState } from 'react';
import {
  GoogleAuthProvider,
  linkWithPopup,
  type Auth,
  type User,
} from 'firebase/auth';
import { signOutAndReset } from './authActions';
import { getAuthErrorMessage } from './authErrors';
import styles from './AccountMenu.module.scss';

interface AccountMenuProps {
  auth: Auth;
  user: User;
  onRefresh: () => Promise<void>;
}

export function AccountMenu({ auth, user, onRefresh }: AccountMenuProps) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const hasGoogle = user.providerData.some(({ providerId }) => providerId === 'google.com');
  const hasPassword = user.providerData.some(({ providerId }) => providerId === 'password');

  async function run(action: () => Promise<void>, successMessage = '') {
    if (pending) return;
    setPending(true);
    setMessage('');
    setErrorMessage('');
    try {
      await action();
      setMessage(successMessage);
      await onRefresh();
    } catch (error) {
      setErrorMessage(getAuthErrorMessage(error));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className={styles.container} onKeyDown={(event) => { if (event.key === 'Escape') setOpen(false); }}>
      <button className={styles.trigger} type="button" aria-expanded={open} aria-controls="account-menu-panel" onClick={() => setOpen((value) => !value)}><span className={styles.avatar} aria-hidden="true">{(user.displayName || user.email)?.charAt(0).toUpperCase() || '?'}</span><span>계정</span></button>
      {open && (
        <section className={styles.panel} id="account-menu-panel" aria-label="계정 설정">
          <p className={styles.label}>로그인한 계정</p>
          {user.displayName && <strong className={styles.name}>{user.displayName}</strong>}
          <strong className={styles.email}>{user.email}</strong>
          <p className={styles.label}>연결된 로그인 방식</p>
          <p className={styles.providers}>{[hasPassword && '이메일·비밀번호', hasGoogle && 'Google'].filter(Boolean).join(' · ') || '확인 중'}</p>

          {!hasGoogle && <button className={styles.action} type="button" disabled={pending} onClick={() => run(async () => { await linkWithPopup(user, new GoogleAuthProvider()); }, 'Google 로그인을 연결했습니다.')}>Google 로그인 연결</button>}
          {message && <p className={styles.success} role="status">{message}</p>}
          {errorMessage && <p className={styles.error} role="alert">{errorMessage}</p>}
          <button className={styles.signOut} type="button" disabled={pending} onClick={() => run(() => signOutAndReset(auth))}>로그아웃</button>
        </section>
      )}
    </div>
  );
}
