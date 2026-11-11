import { useState } from 'react';
import { sendEmailVerification, type Auth, type User } from 'firebase/auth';
import { signOutAndReset } from './authActions';
import { getAuthErrorMessage } from './authErrors';
import styles from './AuthPage.module.scss';

interface VerifyEmailPageProps {
  auth: Auth;
  user: User;
  onRefresh: () => Promise<void>;
}

export function VerifyEmailPage({ auth, user, onRefresh }: VerifyEmailPageProps) {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  async function run(action: () => Promise<void>, successMessage = '') {
    if (pending) return;
    setPending(true);
    setMessage('');
    setErrorMessage('');
    try {
      await action();
      setMessage(successMessage);
    } catch (error) {
      setErrorMessage(getAuthErrorMessage(error));
    } finally {
      setPending(false);
    }
  }

  return (
    <main className={styles.page}>
      <section className={`${styles.card} ${styles.verifyCard}`} aria-labelledby="verify-title">
        <p className={styles.eyebrow}>EMAIL VERIFICATION</p>
        <h1 id="verify-title">이메일을 확인해 주세요</h1>
        <p className={styles.helper}><strong>{user.email}</strong> 주소로 보낸 인증 링크를 열고 아래 버튼을 눌러 주세요.</p>
        {message && <p className={styles.success} role="status">{message}</p>}
        {errorMessage && <p className={styles.error} role="alert">{errorMessage}</p>}
        <div className={styles.buttonStack}>
          <button className={styles.primaryButton} type="button" onClick={() => run(onRefresh)} disabled={pending}>인증 확인</button>
          <button className={styles.secondaryButton} type="button" onClick={() => run(() => sendEmailVerification(user), '인증 메일을 다시 보냈습니다.')} disabled={pending}>인증 메일 다시 보내기</button>
          <button className={styles.textButton} type="button" onClick={() => run(() => signOutAndReset(auth))} disabled={pending}>다른 계정으로 로그인</button>
        </div>
        <p className={styles.note}>로컬 에뮬레이터에서는 인증 링크를 에뮬레이터 UI 로그에서 확인할 수 있습니다.</p>
      </section>
    </main>
  );
}
