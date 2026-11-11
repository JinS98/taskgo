import { useEffect, useState, type FormEvent } from 'react';
import { collection, onSnapshot, type Firestore } from 'firebase/firestore';
import type { Auth, User } from 'firebase/auth';
import type { Functions } from 'firebase/functions';
import { useSearchParams } from 'react-router';
import App from '../../App';
import { AccountMenu } from '../auth/AccountMenu';
import { callWorkspace, createWorkspace, workspaceCreationError, workspaceError } from './workspaceApi';
import styles from './WorkspaceGate.module.scss';

interface Membership { workspaceId: string; name: string; role: 'owner' | 'member' }
interface Invite { inviteId: string; email: string; status: string; expiresAt: string }

export function WorkspaceGate({ auth, user, db, functions, onRefresh }: { auth: Auth; user: User; db: Firestore; functions: Functions; onRefresh: () => Promise<void> }) {
  const [params, setParams] = useSearchParams();
  const [workspaces, setWorkspaces] = useState<Membership[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [name, setName] = useState('');
  const [createdWorkspaceId, setCreatedWorkspaceId] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [panelOpen, setPanelOpen] = useState(false);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [localLink, setLocalLink] = useState('');

  useEffect(() => onSnapshot(collection(db, 'users', user.uid, 'workspaces'), (snapshot) => {
    setWorkspaces(snapshot.docs.map((doc) => doc.data() as Membership));
    setReady(true);
  }, () => { setError('워크스페이스 목록을 불러오지 못했습니다.'); setCreatedWorkspaceId(null); setReady(true); }), [db, user.uid]);

  const selected = workspaces.find(({ workspaceId }) => workspaceId === params.get('workspaceId')) ?? workspaces[0];

  useEffect(() => {
    if (!panelOpen || selected?.role !== 'owner') return;
    let active = true;
    callWorkspace<{ invites: Invite[] }>(auth, functions, 'listInvites', { workspaceId: selected.workspaceId })
      .then(({ invites }) => { if (active) setInvites(invites); })
      .catch((cause) => { if (active) setError(workspaceError(cause)); });
    return () => { active = false; };
  }, [auth, functions, panelOpen, selected?.role, selected?.workspaceId]);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setPending(true); setError('');
    try {
      const result = await createWorkspace(auth, db, name);
      setCreatedWorkspaceId(result.workspaceId);
      setParams({ workspaceId: result.workspaceId });
      setName('');
    } catch (cause) { setError(workspaceCreationError(cause)); }
    finally { setPending(false); }
  }

  async function invite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || pending) return;
    setPending(true); setError(''); setLocalLink('');
    try {
      const result = await callWorkspace<{ inviteId: string; link?: string }>(auth, functions, 'inviteMember', { workspaceId: selected.workspaceId, email });
      setEmail('');
      const localUrl = result.link ? new URL(result.link) : null;
      setLocalLink(localUrl ? `${window.location.origin}${localUrl.pathname}${localUrl.search}` : '초대 메일을 보냈습니다.');
      const next = await callWorkspace<{ invites: Invite[] }>(auth, functions, 'listInvites', { workspaceId: selected.workspaceId });
      setInvites(next.invites);
    } catch (cause) { setError(workspaceError(cause)); }
    finally { setPending(false); }
  }

  async function revoke(inviteId: string) {
    if (!selected || pending) return;
    setPending(true); setError('');
    try {
      await callWorkspace(auth, functions, 'revokeInvite', { inviteId });
      setInvites((current) => current.map((item) => item.inviteId === inviteId ? { ...item, status: 'revoked' } : item));
    } catch (cause) { setError(workspaceError(cause)); }
    finally { setPending(false); }
  }

  if (!ready) return <div className={styles.loading} role="status">워크스페이스를 불러오는 중입니다…</div>;
  if (!selected && createdWorkspaceId) return <div className={styles.loading} role="status">워크스페이스를 준비하는 중입니다…</div>;

  if (!selected) return (
    <main className={styles.page}>
      <section className={styles.card}>
        <p className={styles.eyebrow}>TASKGO WORKSPACE</p>
        <h1>워크스페이스 만들기</h1>
        <p>팀의 공간을 만들면 워크스페이스 장이 됩니다.</p>
        <form onSubmit={create} className={styles.form}>
          <label htmlFor="workspace-name">워크스페이스 이름</label>
          <input id="workspace-name" value={name} onChange={(event) => setName(event.target.value)} minLength={2} maxLength={80} required disabled={pending} />
          <button type="submit" disabled={pending}>{pending ? '만드는 중…' : '만들기'}</button>
        </form>
        {error && <p className={styles.error} role="alert">{error}</p>}
        <AccountMenu auth={auth} user={user} onRefresh={onRefresh} />
      </section>
    </main>
  );

  return (
    <div className={styles.shell}>
      <App accountControls={<><button className={styles.workspaceButton} type="button" onClick={() => setPanelOpen((open) => !open)} aria-expanded={panelOpen}>{selected.name}</button><AccountMenu auth={auth} user={user} onRefresh={onRefresh} /></>} />
      {createdWorkspaceId === selected.workspaceId && <div className={styles.createdNotice} role="status">워크스페이스를 만들었습니다. 멤버 초대는 워크스페이스 메뉴에서 따로 진행하세요.<button type="button" onClick={() => setCreatedWorkspaceId(null)}>닫기</button></div>}
      {panelOpen && <aside className={styles.panel} aria-label="워크스페이스 관리">
        <h2>워크스페이스</h2>
        <label htmlFor="workspace-select">현재 공간</label>
        <select id="workspace-select" value={selected.workspaceId} onChange={(event) => { setLocalLink(''); setInvites([]); setError(''); setParams({ workspaceId: event.target.value }); }}>
          {workspaces.map((item) => <option value={item.workspaceId} key={item.workspaceId}>{item.name}</option>)}
        </select>
        <form className={styles.form} onSubmit={create}>
          <label htmlFor="new-workspace-name">새 워크스페이스</label>
          <input id="new-workspace-name" value={name} onChange={(event) => setName(event.target.value)} minLength={2} maxLength={80} required disabled={pending} />
          <button type="submit" disabled={pending}>새 공간 만들기</button>
        </form>
        {selected.role === 'owner' && <>
          <h3>멤버 초대</h3>
          <form className={styles.form} onSubmit={invite}>
            <label htmlFor="invite-email">Gmail 주소</label>
            <input id="invite-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required disabled={pending} />
            <button type="submit" disabled={pending}>초대 메일 보내기</button>
          </form>
          {localLink && <p className={styles.localLink} role="status">{localLink.startsWith('http') ? <a href={localLink}>로컬 초대 링크</a> : localLink}</p>}
          <h3>초대 내역</h3>
          <ul className={styles.invites}>{invites.map((item) => <li key={item.inviteId}><span>{item.email}<small>{item.status} · {new Date(item.expiresAt).toLocaleDateString('ko-KR')}</small></span>{item.status === 'pending' && <button type="button" disabled={pending} onClick={() => revoke(item.inviteId)}>철회</button>}</li>)}</ul>
        </>}
        {error && <p className={styles.error} role="alert">{error}</p>}
        <button className={styles.textButton} type="button" onClick={() => setPanelOpen(false)}>닫기</button>
      </aside>}
    </div>
  );
}
