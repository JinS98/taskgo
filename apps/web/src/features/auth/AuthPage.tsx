import { useState, type FormEvent } from 'react';
import { FirebaseError } from 'firebase/app';
import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithEmailAndPassword,
  signInWithPopup,
  updateProfile,
  type Auth,
} from 'firebase/auth';
import { getAuthErrorMessage } from './authErrors';
import styles from './AuthPage.module.scss';

interface AuthPageProps {
  auth: Auth;
}

export function AuthPage({ auth }: AuthPageProps) {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  async function handleEmailSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setErrorMessage('');

    try {
      const normalizedEmail = email.trim();
      if (mode === 'signup') {
        const normalizedName = displayName.trim();
        if (normalizedName.length < 2 || normalizedName.length > 40) {
          setErrorMessage('이름은 2~40자로 입력해 주세요.');
          return;
        }
        const credential = await createUserWithEmailAndPassword(auth, normalizedEmail, password);
        await updateProfile(credential.user, { displayName: normalizedName });
      } else {
        await signInWithEmailAndPassword(auth, normalizedEmail, password);
      }
    } catch (error) {
      setErrorMessage(getAuthErrorMessage(error));
    } finally {
      setPending(false);
    }
  }

  async function handleGoogleSignIn() {
    if (pending) return;
    setPending(true);
    setErrorMessage('');

    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
    } catch (error) {
      if (error instanceof FirebaseError && error.code === 'auth/account-exists-with-different-credential') {
        const existingEmail = error.customData?.email;
        if (typeof existingEmail === 'string') setEmail(existingEmail);
        setMode('login');
      }
      setErrorMessage(getAuthErrorMessage(error));
    } finally {
      setPending(false);
    }
  }

  return (
    <main className={styles.page}>
      <div className={styles.intro}>
        <p className={styles.brand}>t<span>:</span>go</p>
        <p className={styles.eyebrow}>TASKGO WORKSPACE</p>
        <h1>대화가 업무가 되는 순간</h1>
        <p>팀의 대화, 업무와 일정을 하나의 공간에서 이어가세요.</p>
      </div>

      <section className={styles.card} aria-labelledby="auth-title">
        <div className={styles.modeTabs} aria-label="인증 방식">
          <button type="button" aria-pressed={mode === 'login'} onClick={() => { setMode('login'); setErrorMessage(''); }}>로그인</button>
          <button type="button" aria-pressed={mode === 'signup'} onClick={() => { setMode('signup'); setErrorMessage(''); }}>회원가입</button>
        </div>
        <h2 id="auth-title">{mode === 'login' ? '다시 만나서 반가워요' : '새 계정 만들기'}</h2>
        <p className={styles.helper}>이메일·비밀번호 또는 Google 계정으로 계속할 수 있습니다.</p>

        <form onSubmit={handleEmailSubmit} className={styles.form}>
          {mode === 'signup' && <><label htmlFor="auth-name">이름</label><input id="auth-name" name="name" type="text" autoComplete="name" minLength={2} maxLength={40} required value={displayName} onChange={(event) => setDisplayName(event.target.value)} disabled={pending} placeholder="팀에서 사용할 이름" /></>}
          <label htmlFor="auth-email">이메일</label>
          <input id="auth-email" name="email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} disabled={pending} />
          <label htmlFor="auth-password">비밀번호</label>
          <input id="auth-password" name="password" type="password" autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} minLength={mode === 'signup' ? 6 : undefined} required value={password} onChange={(event) => setPassword(event.target.value)} disabled={pending} />
          {errorMessage && <p className={styles.error} role="alert">{errorMessage}</p>}
          <button className={styles.primaryButton} type="submit" disabled={pending}>{pending ? '처리 중…' : mode === 'login' ? '이메일로 로그인' : '가입하기'}</button>
        </form>

        <div className={styles.divider}><span>또는</span></div>
        <button className={styles.secondaryButton} type="button" onClick={handleGoogleSignIn} disabled={pending}>Google 계정으로 계속하기</button>
        <p className={styles.note}>가입 후 바로 워크스페이스를 만들 수 있습니다. 멤버 초대 메일은 워크스페이스 관리에서 보냅니다.</p>
      </section>
    </main>
  );
}
