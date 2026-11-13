import { useState, type FormEvent } from 'react';
import type { Auth } from 'firebase/auth';
import { signOutAndReset } from './authActions';
import type { UserProfile } from './userProfile';
import styles from './AuthPage.module.scss';

export function ProfileSetupPage({ auth, profile, onSave }: { auth: Auth; profile: UserProfile; onSave: (name: string) => Promise<void> }) {
  const [name, setName] = useState(profile.displayName);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError('');
    try {
      await onSave(name);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '이름을 저장하지 못했습니다. 다시 시도해 주세요.');
    } finally {
      setPending(false);
    }
  }

  return <main className={styles.page}>
    <div className={styles.intro}><p className={styles.brand}>t<span>:</span>go</p><p className={styles.eyebrow}>TASKGO WORKSPACE</p><h1>팀에서 사용할 이름을 정해 주세요</h1><p>이 이름이 채팅과 업무 담당자, 멤버 목록에 표시됩니다.</p></div>
    <section className={styles.card} aria-labelledby="profile-title">
      <p className={styles.eyebrow}>FIRST STEP</p>
      <h2 id="profile-title">이름 등록</h2>
      <p className={styles.helper}>처음 한 번만 설정합니다. 나중에 계정 메뉴에서 언제든 바꿀 수 있습니다.</p>
      <form className={styles.form} onSubmit={submit}>
        <label htmlFor="profile-name">이름</label>
        <input id="profile-name" name="name" autoComplete="name" minLength={2} maxLength={40} required value={name} onChange={(event) => setName(event.target.value)} disabled={pending} />
        {error && <p className={styles.error} role="alert">{error}</p>}
        <button className={styles.primaryButton} type="submit" disabled={pending}>{pending ? '저장 중…' : '이 이름으로 시작하기'}</button>
      </form>
      <button className={styles.textButton} type="button" disabled={pending} onClick={() => void signOutAndReset(auth)}>다른 계정으로 로그인</button>
    </section>
  </main>;
}
