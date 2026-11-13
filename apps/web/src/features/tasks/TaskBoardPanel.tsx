import { useEffect, useState } from 'react';
import type { Auth } from 'firebase/auth';
import { collection, onSnapshot, query, Timestamp, where, type Firestore } from 'firebase/firestore';
import type { Functions } from 'firebase/functions';
import type { TaskEventRecord, TaskRecord, TaskRequestAction, TaskStatus } from '@taskgo/contracts/task';
import { respondTask, taskResponseError } from './taskResponseApi';
import styles from './TaskBoardPanel.module.scss';

type BoardTask = TaskRecord<Timestamp> & { id: string };
type BoardEvent = TaskEventRecord<Timestamp> & { id: string };
type Filter = 'all' | 'requested' | 'active' | 'finished';
const filters: { id: Filter; label: string }[] = [
  { id: 'all', label: '전체' }, { id: 'requested', label: '요청 대기' },
  { id: 'active', label: '수락·진행' }, { id: 'finished', label: '완료·거절' },
];
const statusLabels: Record<TaskStatus, string> = {
  REQUESTED: '요청 대기', ACCEPTED: '수락됨', IN_PROGRESS: '진행 중',
  REVIEW_PENDING: '검수 대기', REWORK: '재작업', DECLINED: '거절됨', DONE: '완료',
};
const eventLabels: Record<TaskRequestAction, string> = {
  accept: '업무 요청 수락', decline: '업무 요청 거절', startProgress: '업무 진행 시작',
  proposeDueDate: '마감 변경 제안', approveDueDate: '마감 변경 승인', rejectDueDate: '마감 변경 거절',
  submitForReview: '검수 요청 제출',
};

function formatDate(value: Timestamp | null): string {
  return value ? new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium', timeStyle: 'short' }).format(value.toDate()) : '';
}

function localDateTime(date: Date): string {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

function TaskHistory({ db, task, memberEmails }: { db: Firestore; task: BoardTask; memberEmails: Record<string, string> }) {
  const [state, setState] = useState<{ events: BoardEvent[]; error: string } | null>(null);

  useEffect(() => onSnapshot(query(collection(db, 'taskEvents'), where('taskId', '==', task.id)), (snapshot) => {
    const events = snapshot.docs.map((item) => ({ ...item.data() as TaskEventRecord<Timestamp>, id: item.id }));
    events.sort((a, b) => a.createdAt.toMillis() - b.createdAt.toMillis() || a.id.localeCompare(b.id));
    setState({ events, error: '' });
  }, () => setState({ events: [], error: '업무 이력을 불러오지 못했습니다.' })), [db, task.id]);

  return <div className={styles.history}>
    <strong>업무 이력</strong>
    {state === null && <p role="status">이력을 불러오는 중…</p>}
    {state?.error && <p role="alert">{state.error}</p>}
    {state && !state.error && <ol>
      <li><span>업무 요청 생성</span><small>{memberEmails[task.requesterId] ?? '요청자'} · {formatDate(task.createdAt)}</small></li>
      {state.events.map((event) => <li key={event.id}>
        <span>{eventLabels[event.action] ?? event.action}</span>
        <small>{memberEmails[event.actorId] ?? '멤버'} · {formatDate(event.createdAt)}</small>
        {event.action === 'proposeDueDate' && event.metadata.proposedDueDate && <small>제안 {formatDate(Timestamp.fromDate(new Date(event.metadata.proposedDueDate)))}</small>}
        {event.action === 'approveDueDate' && event.metadata.dueDate && <small>확정 {formatDate(Timestamp.fromDate(new Date(event.metadata.dueDate)))}</small>}
        {event.action === 'submitForReview' && event.metadata.reviewWorkingDays && <small>검수 기간 {event.metadata.reviewWorkingDays}근무일 · {event.metadata.reviewCycle}회차</small>}
      </li>)}
    </ol>}
  </div>;
}

function TaskCard({ task, auth, db, functions, viewerId, memberEmails, onNotice }: {
  task: BoardTask; auth: Auth; db: Firestore; functions: Functions; viewerId: string;
  memberEmails: Record<string, string>; onNotice: (message: string) => void;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [dueLocal, setDueLocal] = useState('');
  const [showProposal, setShowProposal] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const isAssignee = task.assigneeId === viewerId;
  const isRequester = task.requesterId === viewerId;
  const requested = task.status === 'REQUESTED';
  const negotiable = requested || task.status === 'ACCEPTED' || task.status === 'IN_PROGRESS';

  async function act(action: TaskRequestAction, proposedDueDate?: string) {
    if (pending) return;
    setPending(true);
    setError('');
    try {
      await respondTask(auth, functions, { taskId: task.id, action, ...(proposedDueDate ? { proposedDueDate } : {}) });
      setShowProposal(false);
      setDueLocal('');
      onNotice({ accept: '업무 요청을 수락했습니다.', decline: '업무 요청을 거절했습니다.', startProgress: '업무 진행을 시작했습니다.', proposeDueDate: '마감 변경을 제안했습니다.', approveDueDate: '제안한 마감일을 승인했습니다.', rejectDueDate: '마감 변경 제안을 거절했습니다.', submitForReview: '검수를 요청했습니다.' }[action]);
    } catch (cause) {
      setError(taskResponseError(cause));
    } finally {
      setPending(false);
    }
  }

  function propose() {
    const millis = Date.parse(dueLocal);
    if (!Number.isFinite(millis) || millis <= Date.now()) { setError('미래의 마감 날짜와 시간을 선택해 주세요.'); return; }
    void act('proposeDueDate', new Date(millis).toISOString());
  }

  return <article className={styles.card}>
    <div className={styles.cardTop}><span className={`${styles.status} ${task.status === 'REQUESTED' ? styles.requested : ''}`}>{statusLabels[task.status]}</span><span className={styles.due}>마감 {formatDate(task.dueDate)}</span></div>
    <h2>{task.title}</h2>
    {task.description && <p className={styles.description}>{task.description}</p>}
    <div className={styles.meta}><span>요청 {memberEmails[task.requesterId] ?? '멤버'}</span><span>담당 {memberEmails[task.assigneeId] ?? '멤버'}</span>{task.estimatedMinutes && <span>예상 {task.estimatedMinutes}분</span>}{task.reviewRequired && <span>검수 {task.reviewWorkingDays}근무일</span>}</div>
    {task.proposedDueDate && <div className={styles.proposal}><strong>제안된 마감</strong><span>{formatDate(task.proposedDueDate)}</span><small>요청자가 승인하기 전까지 기존 마감일이 유지됩니다.</small></div>}
    {task.status === 'REVIEW_PENDING' && <div className={styles.reviewInfo}><strong>검수 요청됨</strong><span>{isRequester ? '담당자가 검수를 요청했습니다.' : '요청자의 검수를 기다리는 중입니다.'}</span><small>{task.reviewSubmittedAt && `제출 ${formatDate(task.reviewSubmittedAt)} · `}검수 기간 {task.reviewWorkingDays}근무일</small></div>}
    {isAssignee && negotiable && <div className={styles.actions}>
      {requested && !task.proposedDueDate && <button type="button" className={styles.primary} disabled={pending} onClick={() => void act('accept')}>수락</button>}
      {task.status === 'ACCEPTED' && <button type="button" className={styles.primary} disabled={pending} onClick={() => void act('startProgress')}>진행 시작</button>}
      {task.status === 'IN_PROGRESS' && task.reviewRequired && !task.proposedDueDate && <button type="button" className={styles.primary} disabled={pending} onClick={() => void act('submitForReview')}>검수 요청</button>}
      {!task.proposedDueDate && <button type="button" disabled={pending} onClick={() => setShowProposal((value) => !value)}>마감 변경 제안</button>}
      {requested && <button type="button" className={styles.danger} disabled={pending} onClick={() => void act('decline')}>{task.proposedDueDate ? '요청 거절' : '거절'}</button>}
      {task.proposedDueDate && <span className={styles.waiting}>요청자의 마감 변경 응답을 기다리는 중</span>}
    </div>}
    {negotiable && isRequester && task.proposedDueDate && <div className={styles.actions}>
      <button type="button" className={styles.primary} disabled={pending} onClick={() => void act('approveDueDate')}>변경 승인</button>
      <button type="button" disabled={pending} onClick={() => void act('rejectDueDate')}>변경 거절</button>
    </div>}
    {showProposal && negotiable && isAssignee && !task.proposedDueDate && <div className={styles.proposeForm}>
      <label>새 마감 날짜·시간<input type="datetime-local" value={dueLocal} min={localDateTime(new Date())} onChange={(event) => setDueLocal(event.target.value)} /></label>
      <button type="button" className={styles.primary} disabled={pending || !dueLocal} onClick={propose}>제안 보내기</button>
    </div>}
    <button type="button" className={styles.historyToggle} aria-expanded={showHistory} onClick={() => setShowHistory((value) => !value)}>{showHistory ? '이력 닫기' : '이력 보기'}</button>
    {showHistory && <TaskHistory db={db} task={task} memberEmails={memberEmails} />}
    {error && <p className={styles.error} role="alert">{error}</p>}
  </article>;
}

export function TaskBoardPanel({ auth, db, functions, workspaceId, viewerId, memberEmails }: {
  auth: Auth; db: Firestore; functions: Functions; workspaceId: string;
  viewerId: string; memberEmails: Record<string, string>;
}) {
  const [snapshotState, setSnapshotState] = useState<{ workspaceId: string; tasks: BoardTask[]; error: string } | null>(null);
  const [notice, setNotice] = useState('');
  const [filter, setFilter] = useState<Filter>('all');

  useEffect(() => {
    return onSnapshot(query(collection(db, 'tasks'), where('workspaceId', '==', workspaceId)), (snapshot) => {
      setSnapshotState({ workspaceId, tasks: snapshot.docs.map((item) => ({ ...item.data() as TaskRecord<Timestamp>, id: item.id })).sort((a, b) => a.dueDate.toMillis() - b.dueDate.toMillis()), error: '' });
    }, () => { setSnapshotState({ workspaceId, tasks: [], error: '업무 목록을 불러오지 못했습니다. 연결 상태를 확인해 주세요.' }); });
  }, [db, workspaceId]);

  const loading = snapshotState?.workspaceId !== workspaceId;
  const tasks = loading ? [] : snapshotState?.tasks ?? [];
  const error = loading ? '' : snapshotState?.error ?? '';
  const columns: { id: Filter; label: string; tasks: BoardTask[] }[] = [
    { id: 'requested', label: '요청 대기', tasks: tasks.filter((task) => task.status === 'REQUESTED') },
    { id: 'active', label: '수락·진행', tasks: tasks.filter((task) => !['REQUESTED', 'DECLINED', 'DONE'].includes(task.status)) },
    { id: 'finished', label: '완료·거절', tasks: tasks.filter((task) => task.status === 'DONE' || task.status === 'DECLINED') },
  ];
  const visibleColumns = filter === 'all' ? columns : columns.filter((column) => column.id === filter);
  return <section className={styles.board} aria-labelledby="board-title">
    <div className={styles.heading}><div><p className={styles.eyebrow}>TASK BOARD</p><h1 id="board-title">업무 보드</h1><p>대화에서 요청한 업무를 확인하고 담당자와 마감일을 확정하세요.</p></div><span className={styles.count}>{tasks.length}개 업무</span></div>
    <div className={styles.filters} aria-label="업무 상태 필터">{filters.map((item) => <button key={item.id} type="button" aria-pressed={filter === item.id} className={filter === item.id ? styles.selected : ''} onClick={() => setFilter(item.id)}>{item.label}</button>)}</div>
    {notice && <p className={styles.notice} role="status">{notice}</p>}
    {error && <p className={styles.error} role="alert">{error}</p>}
    {loading ? <p className={styles.empty}>업무를 불러오는 중…</p> : tasks.length === 0 ? <p className={styles.empty}>아직 업무 요청이 없습니다. 채팅 메시지에서 업무를 만들어 보세요.</p> : <div className={styles.columns}>{visibleColumns.map((column) => <section className={styles.column} key={column.id} aria-label={column.label}><div className={styles.columnHeading}><h2>{column.label}</h2><span>{column.tasks.length}</span></div>{column.tasks.length ? column.tasks.map((task) => <TaskCard key={task.id} task={task} auth={auth} db={db} functions={functions} viewerId={viewerId} memberEmails={memberEmails} onNotice={setNotice} />) : <p className={styles.columnEmpty}>이 상태의 업무가 없습니다.</p>}</section>)}</div>}
  </section>;
}
