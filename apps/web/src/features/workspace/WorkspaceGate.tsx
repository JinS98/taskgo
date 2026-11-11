import { useEffect, useRef, useState, type FormEvent } from 'react';
import { collection, onSnapshot, type Firestore } from 'firebase/firestore';
import type { Auth, User } from 'firebase/auth';
import type { Functions } from 'firebase/functions';
import { useSearchParams } from 'react-router';
import App from '../../App';
import { AccountMenu } from '../auth/AccountMenu';
import { useWorkspaceNavigationStore } from '../../store/useWorkspaceNavigationStore';
import { callWorkspace, createWorkspace, workspaceCreationError, workspaceError } from './workspaceApi';
import styles from './WorkspaceGate.module.scss';

interface Membership { workspaceId: string; name: string; role: 'owner' | 'member' }
interface Invite { inviteId: string; email: string; status: string; expiresAt: string }
interface Member { uid: string; email: string; role: 'owner' | 'member' }

function PickerMark() {
  return <svg className={styles.pickerMark} aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m5 7.5 5 5 5-5" /></svg>;
}

export function WorkspaceGate({ auth, user, db, functions, onRefresh }: { auth: Auth; user: User; db: Firestore; functions: Functions; onRefresh: () => Promise<void> }) {
  const [params, setParams] = useSearchParams();
  const selectedWorkspaceIdRef = useRef('');
  const pickerRef = useRef<HTMLDivElement>(null);
  const pickerButtonRef = useRef<HTMLButtonElement>(null);
  const activeView = useWorkspaceNavigationStore((state) => state.activeView);
  const setView = useWorkspaceNavigationStore((state) => state.setView);
  const [workspaces, setWorkspaces] = useState<Membership[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [inviteActionError, setInviteActionError] = useState('');
  const [pending, setPending] = useState(false);
  const [name, setName] = useState('');
  const [createdWorkspaceId, setCreatedWorkspaceId] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [members, setMembers] = useState<Member[]>([]);
  const [membersWorkspaceId, setMembersWorkspaceId] = useState('');
  const [membersError, setMembersError] = useState('');
  const [invites, setInvites] = useState<Invite[]>([]);
  const [invitesWorkspaceId, setInvitesWorkspaceId] = useState('');
  const [invitesError, setInvitesError] = useState('');
  const [localLink, setLocalLink] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => onSnapshot(collection(db, 'users', user.uid, 'workspaces'), (snapshot) => {
    setWorkspaces(snapshot.docs.map((doc) => doc.data() as Membership));
    setReady(true);
  }, () => { setError('워크스페이스 목록을 불러오지 못했습니다.'); setCreatedWorkspaceId(null); setReady(true); }), [db, user.uid]);

  const selected = workspaces.find(({ workspaceId }) => workspaceId === params.get('workspaceId')) ?? workspaces[0];

  useEffect(() => { selectedWorkspaceIdRef.current = selected?.workspaceId ?? ''; }, [selected?.workspaceId]);

  useEffect(() => {
    if (!pickerOpen) return;
    const closeOnPointerDown = (event: PointerEvent) => {
      if (!pickerRef.current?.contains(event.target as Node)) setPickerOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setPickerOpen(false); pickerButtonRef.current?.focus(); }
    };
    document.addEventListener('pointerdown', closeOnPointerDown);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnPointerDown);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [pickerOpen]);

  useEffect(() => {
    if (ready && selected?.role !== 'owner' && activeView === 'workspace') setView('chat');
  }, [activeView, ready, selected?.role, setView]);

  useEffect(() => {
    if (activeView !== 'workspace' || selected?.role !== 'owner') return;
    return onSnapshot(collection(db, 'workspaces', selected.workspaceId, 'members'), (snapshot) => {
      setMembers(snapshot.docs.map((doc) => doc.data() as Member).sort((a, b) => a.role === b.role ? a.email.localeCompare(b.email) : a.role === 'owner' ? -1 : 1));
      setMembersWorkspaceId(selected.workspaceId);
      setMembersError('');
    }, () => { setMembersWorkspaceId(selected.workspaceId); setMembersError('멤버 목록을 불러오지 못했습니다.'); });
  }, [activeView, db, selected?.role, selected?.workspaceId]);

  useEffect(() => {
    if (activeView !== 'workspace' || selected?.role !== 'owner') return;
    let active = true;
    callWorkspace<{ invites: Invite[] }>(auth, functions, 'listInvites', { workspaceId: selected.workspaceId })
      .then(({ invites }) => { if (active) { setInvites(invites); setInvitesWorkspaceId(selected.workspaceId); setInvitesError(''); } })
      .catch((cause) => { if (active) { setInvitesWorkspaceId(selected.workspaceId); setInvitesError(workspaceError(cause)); } });
    return () => { active = false; };
  }, [activeView, auth, functions, selected?.role, selected?.workspaceId]);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setPending(true); setError('');
    try {
      const result = await createWorkspace(auth, db, name);
      setCreatedWorkspaceId(result.workspaceId);
      setParams({ workspaceId: result.workspaceId });
      setInvitesWorkspaceId('');
      setMembersWorkspaceId('');
      setInvitesError('');
      setMembersError('');
      setName('');
    } catch (cause) { setError(workspaceCreationError(cause)); }
    finally { setPending(false); }
  }

  async function invite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || pending) return;
    setPending(true); setInviteActionError(''); setInvitesError(''); setLocalLink('');
    try {
      const result = await callWorkspace<{ inviteId: string; link?: string }>(auth, functions, 'inviteMember', { workspaceId: selected.workspaceId, email });
      setEmail('');
      const localUrl = result.link ? new URL(result.link) : null;
      setLocalLink(localUrl ? `${window.location.origin}${localUrl.pathname}${localUrl.search}` : '초대 메일을 보냈습니다.');
      try {
        const next = await callWorkspace<{ invites: Invite[] }>(auth, functions, 'listInvites', { workspaceId: selected.workspaceId });
        setInvites(next.invites);
        setInvitesWorkspaceId(selected.workspaceId);
      } catch (cause) { setInvitesError(workspaceError(cause)); }
    } catch (cause) { setInviteActionError(workspaceError(cause)); }
    finally { setPending(false); }
  }

  async function revoke(inviteId: string) {
    if (!selected || pending) return;
    setPending(true); setInviteActionError('');
    try {
      await callWorkspace(auth, functions, 'revokeInvite', { inviteId });
      setInvites((current) => current.map((item) => item.inviteId === inviteId ? { ...item, status: 'revoked' } : item));
    } catch (cause) { setInviteActionError(workspaceError(cause)); }
    finally { setPending(false); }
  }

  async function refreshInvites() {
    if (!selected || selected.role !== 'owner') return;
    const workspaceId = selected.workspaceId;
    setInvitesWorkspaceId('');
    setInvitesError('');
    try {
      const result = await callWorkspace<{ invites: Invite[] }>(auth, functions, 'listInvites', { workspaceId });
      if (selectedWorkspaceIdRef.current === workspaceId) setInvites(result.invites);
    } catch (cause) { if (selectedWorkspaceIdRef.current === workspaceId) setInvitesError(workspaceError(cause)); }
    finally { if (selectedWorkspaceIdRef.current === workspaceId) setInvitesWorkspaceId(workspaceId); }
  }

  function switchWorkspace(workspaceId: string) {
    setPickerOpen(false);
    if (workspaceId === selected?.workspaceId) return;
    setLocalLink('');
    setError('');
    setInviteActionError('');
    setInvitesError('');
    setMembersError('');
    setInvitesWorkspaceId('');
    setMembersWorkspaceId('');
    setParams({ workspaceId });
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
      <App workspaceId={selected.workspaceId} workspaceName={selected.name} userId={user.uid} senderName={user.email ?? '나'} canManageWorkspace={selected.role === 'owner'} accountControls={<>
        <div className={styles.workspacePicker} ref={pickerRef}>
          <button ref={pickerButtonRef} type="button" aria-label="워크스페이스 선택" aria-expanded={pickerOpen} aria-controls="workspace-options" onClick={() => setPickerOpen((open) => !open)}>
            <span className={styles.pickerIcon} aria-hidden="true">{selected.name.charAt(0).toUpperCase()}</span>
            <span className={styles.pickerName}>{selected.name}</span>
            <PickerMark />
          </button>
          {pickerOpen && <div id="workspace-options" className={styles.pickerOptions} role="group" aria-label="워크스페이스 목록">
            {workspaces.map((item) => <button type="button" key={item.workspaceId} className={item.workspaceId === selected.workspaceId ? styles.selectedOption : ''} aria-current={item.workspaceId === selected.workspaceId ? 'true' : undefined} onClick={() => switchWorkspace(item.workspaceId)}>
              <span className={styles.pickerIcon} aria-hidden="true">{item.name.charAt(0).toUpperCase()}</span>
              <span>{item.name}</span>
            </button>)}
          </div>}
        </div>
        <AccountMenu auth={auth} user={user} onRefresh={onRefresh} />
      </>} workspaceManagement={selected.role === 'owner' && <div className={styles.management}>
        <div className={styles.managementHeading}><p className={styles.eyebrow}>WORKSPACE</p><h1>{selected.name} 관리</h1><p>멤버와 초대 현황을 확인하고 새 멤버를 초대하세요.</p></div>
        <div className={styles.managementGrid}>
          <section className={styles.managementCard} aria-labelledby="invite-title"><div className={styles.cardHeading}><h2 id="invite-title">멤버 초대</h2></div><p className={styles.helper}>이메일 주소로 초대 링크를 보냅니다. 상대방은 같은 주소로 로그인해 수락할 수 있습니다.</p>
            <form className={styles.form} onSubmit={invite}><label htmlFor="invite-email">이메일 주소</label><input id="invite-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required disabled={pending} placeholder="name@example.com" /><button type="submit" disabled={pending}>{pending ? '처리 중…' : '초대 메일 보내기'}</button></form>
            {localLink && <p className={styles.localLink} role="status">{localLink.startsWith('http') ? <a href={localLink}>로컬 초대 링크</a> : localLink}</p>}
            {inviteActionError && <p className={styles.error} role="alert">{inviteActionError}</p>}
          </section>
          <section className={styles.managementCard} aria-labelledby="create-title"><div className={styles.cardHeading}><h2 id="create-title">새 워크스페이스</h2></div><p className={styles.helper}>별도의 팀 공간을 만들고 관리합니다.</p><form className={styles.form} onSubmit={create}><label htmlFor="new-workspace-name">워크스페이스 이름</label><input id="new-workspace-name" value={name} onChange={(event) => setName(event.target.value)} minLength={2} maxLength={80} required disabled={pending} placeholder="새 워크스페이스 이름" /><button type="submit" disabled={pending}>새 공간 만들기</button></form>{error && <p className={styles.error} role="alert">{error}</p>}</section>
          <section className={`${styles.managementCard} ${styles.wideCard}`} aria-labelledby="invites-title"><div className={styles.cardHeading}><h2 id="invites-title">초대 현황</h2><div className={styles.cardActions}><span>{invitesWorkspaceId === selected.workspaceId ? invites.length : 0}건</span><button type="button" onClick={refreshInvites} disabled={invitesWorkspaceId !== selected.workspaceId}>새로고침</button></div></div>
            {invitesError && <p className={styles.error} role="alert">{invitesError}</p>}
            {!invitesError && (invitesWorkspaceId !== selected.workspaceId ? <p className={styles.empty}>초대 현황을 불러오는 중입니다…</p> : invites.length ? <ul className={styles.invites}>{invites.map((item) => <li key={item.inviteId}><span>{item.email}<small>{item.status === 'pending' ? '대기 중' : item.status === 'accepted' ? '수락됨' : '철회됨'} · 만료 {new Date(item.expiresAt).toLocaleDateString('ko-KR')}</small></span>{item.status === 'pending' && <button type="button" disabled={pending} onClick={() => revoke(item.inviteId)}>초대 철회</button>}</li>)}</ul> : <p className={styles.empty}>아직 보낸 초대가 없습니다.</p>)}
          </section>
          <section className={`${styles.managementCard} ${styles.wideCard}`} aria-labelledby="members-title"><div className={styles.cardHeading}><h2 id="members-title">워크스페이스 멤버</h2><span>{membersWorkspaceId === selected.workspaceId ? members.length : 0}명</span></div>
            {membersError && <p className={styles.error} role="alert">{membersError}</p>}
            {!membersError && (membersWorkspaceId === selected.workspaceId ? <ul className={styles.members}>{members.map((member) => <li key={member.uid}><span className={styles.memberAvatar} aria-hidden="true">{member.email.charAt(0).toUpperCase()}</span><span className={styles.memberIdentity}>{member.email}<small>{member.role === 'owner' ? '워크스페이스 장' : '멤버'}</small></span></li>)}</ul> : <p className={styles.empty}>멤버를 불러오는 중입니다…</p>)}
          </section>
        </div>
      </div>} />
      {createdWorkspaceId === selected.workspaceId && <div className={styles.createdNotice} role="status">워크스페이스를 만들었습니다. 멤버 초대는 워크스페이스 관리에서 진행하세요.<button type="button" onClick={() => setCreatedWorkspaceId(null)}>닫기</button></div>}
    </div>
  );
}
