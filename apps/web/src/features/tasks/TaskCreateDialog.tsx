import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { Auth } from 'firebase/auth';
import type { Functions } from 'firebase/functions';
import type { CreateTaskRequest, TaskSourceType } from '@taskgo/contracts/task';
import { createTask, suggestTask, taskCreationError, taskSuggestionError, type TaskSuggestionResult } from './createTaskApi';
import styles from './TaskCreateDialog.module.scss';

const estimateOptions = [15, 30, 45, 60, 90, 120, 180, 240, 360, 480];
const weekdayNames = ['일', '월', '화', '수', '목', '금', '토'];
const timeOptions = Array.from({ length: 25 }, (_, index) => {
  const hour = 9 + Math.floor(index / 2);
  const minute = index % 2 === 0 ? '00' : '30';
  return { value: `${String(hour).padStart(2, '0')}:${minute}`, label: `${hour < 12 ? '오전' : '오후'} ${hour <= 12 ? hour : hour - 12}:${minute}` };
});

function localDateTime(date: Date): string {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

function monthCells(year: number, month: number): Date[] {
  const firstWeekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const dayCount = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const count = Math.ceil((firstWeekday + dayCount) / 7) * 7;
  return Array.from({ length: count }, (_, index) => new Date(Date.UTC(year, month - 1, index - firstWeekday + 1)));
}

function dateKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

export function TaskCreateDialog({ auth, functions, workspaceId, sourceMessageId, sourceContent, sourceKind, viewerId, memberEmails, memberNames, onClose, onCreated }: {
  auth: Auth;
  functions: Functions;
  workspaceId: string;
  sourceMessageId: string;
  sourceContent: string;
  sourceKind: TaskSourceType;
  viewerId: string;
  memberEmails: Record<string, string>;
  memberNames: Record<string, string>;
  onClose: () => void;
  onCreated: (selfAssigned: boolean) => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const dueButtonRef = useRef<HTMLButtonElement>(null);
  const pickerRef = useRef<HTMLDivElement>(null);
  const timeGridRef = useRef<HTMLDivElement>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [requesterId, setRequesterId] = useState(viewerId);
  const [assigneeId, setAssigneeId] = useState('');
  const [dueLocal, setDueLocal] = useState('');
  const [duePickerOpen, setDuePickerOpen] = useState(false);
  const [pickerDate, setPickerDate] = useState('');
  const [pickerMonth, setPickerMonth] = useState({ year: 0, month: 0 });
  const [pickerNow, setPickerNow] = useState(() => new Date());
  const [pickerPosition, setPickerPosition] = useState({ top: 0, left: 0, width: 0 });
  const [estimatedMinutes, setEstimatedMinutes] = useState('');
  const [reviewDays, setReviewDays] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [suggestionPending, setSuggestionPending] = useState(false);
  const [suggestionError, setSuggestionError] = useState('');
  const [suggestions, setSuggestions] = useState<TaskSuggestionResult | null>(null);
  const assignees = Array.from(new Set([...Object.keys(memberEmails), viewerId])).sort((a, b) => (memberNames[a] || a).localeCompare(memberNames[b] || b));
  const assigneeName = (uid: string) => memberNames[uid] || `팀원-${uid.slice(0, 4).toUpperCase()}`;
  const memberOption = (uid: string) => `${assigneeName(uid)}${uid === viewerId ? ' (나)' : ''}${assignees.some((other) => other !== uid && assigneeName(other) === assigneeName(uid)) ? ` · ${uid.slice(0, 4).toUpperCase()}` : ''}`;
  const selfAssigned = assigneeId === viewerId;
  const reviewRequired = reviewDays !== '';

  useEffect(() => {
    const dialog = dialogRef.current;
    dialog?.showModal();
    titleRef.current?.focus();
    return () => { if (dialog?.open) dialog.close(); };
  }, []);

  useEffect(() => {
    if (!duePickerOpen) return;
    const dialog = dialogRef.current;
    const closeOnOutside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!pickerRef.current?.contains(target) && !dueButtonRef.current?.contains(target)) setDuePickerOpen(false);
    };
    dialog?.addEventListener('pointerdown', closeOnOutside);
    return () => dialog?.removeEventListener('pointerdown', closeOnOutside);
  }, [duePickerOpen]);

  useEffect(() => {
    if (!duePickerOpen || !timeGridRef.current) return;
    const grid = timeGridRef.current;
    const firstAvailable = grid.querySelector<HTMLButtonElement>('button:not(:disabled)');
    grid.scrollTop = pickerDate === localDateTime(pickerNow).slice(0, 10) && firstAvailable
      ? firstAvailable.getBoundingClientRect().top - grid.getBoundingClientRect().top + grid.scrollTop
      : 0;
  }, [duePickerOpen, pickerDate, pickerNow]);

  function toggleDuePicker() {
    if (duePickerOpen) { setDuePickerOpen(false); return; }
    const now = new Date();
    const today = localDateTime(now).slice(0, 10);
    let selected = dueLocal.slice(0, 10) || today;
    if (!dueLocal && new Date(`${today}T21:00`).getTime() <= now.getTime()) {
      selected = localDateTime(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)).slice(0, 10);
    }
    const [year, month] = selected.split('-').map(Number);
    const dialog = dialogRef.current?.getBoundingClientRect();
    const button = dueButtonRef.current?.getBoundingClientRect();
    if (!dialog || !button) return;
    const width = Math.min(500, dialog.width - 24);
    const left = Math.max(12, Math.min(button.left - dialog.left, dialog.width - width - 12));
    const below = dialog.bottom - button.bottom;
    const top = below >= 370 ? button.bottom - dialog.top + 6 : Math.max(12, button.top - dialog.top - 366);
    setPickerNow(now);
    setPickerDate(selected);
    setPickerMonth({ year, month });
    setPickerPosition({ top, left, width });
    setDuePickerOpen(true);
  }

  function movePickerMonth(offset: number) {
    const next = new Date(Date.UTC(pickerMonth.year, pickerMonth.month - 1 + offset, 1));
    setPickerMonth({ year: next.getUTCFullYear(), month: next.getUTCMonth() + 1 });
  }

  const todayKey = localDateTime(pickerNow).slice(0, 10);
  const dueDisplay = dueLocal
    ? new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(dueLocal))
    : '날짜와 시간을 선택하세요';

  async function requestSuggestions() {
    if (suggestionPending || pending) return;
    setSuggestionPending(true);
    setSuggestionError('');
    try {
      setSuggestions(await suggestTask(auth, functions, { workspaceId, sourceMessageId }));
    } catch (cause) {
      setSuggestionError(taskSuggestionError(cause));
    } finally {
      setSuggestionPending(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const trimmedTitle = title.trim();
    const dueMillis = Date.parse(dueLocal);
    if (trimmedTitle.length < 2 || trimmedTitle.length > 160) { setError('업무 제목은 2~160자로 입력해 주세요.'); return; }
    if (!Number.isFinite(dueMillis) || dueMillis <= new Date().getTime()) { setError('미래의 마감 날짜와 시간을 선택해 주세요.'); return; }
    if (!assignees.includes(requesterId)) { setError('워크스페이스 멤버를 요청자로 선택해 주세요.'); return; }
    if (!assignees.includes(assigneeId)) { setError('워크스페이스 멤버를 담당자로 선택해 주세요.'); return; }
    setPending(true);
    setError('');
    const request: CreateTaskRequest = {
      workspaceId,
      sourceMessageId,
      title: trimmedTitle,
      description: description.trim() || null,
      requesterId,
      assigneeId,
      dueDate: new Date(dueMillis).toISOString(),
      estimatedMinutes: estimatedMinutes ? Number(estimatedMinutes) : null,
      reviewRequired,
      reviewWorkingDays: reviewRequired ? Number(reviewDays) : null,
    };
    try {
      await createTask(auth, functions, request);
      onCreated(selfAssigned);
    } catch (cause) {
      setError(taskCreationError(cause));
    } finally {
      setPending(false);
    }
  }

  return <dialog ref={dialogRef} className={styles.dialog} aria-labelledby="task-dialog-title" onCancel={(event) => { event.preventDefault(); if (duePickerOpen) setDuePickerOpen(false); else if (!pending) onClose(); }} onClick={(event) => {
    if (pending || event.target !== event.currentTarget) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) onClose();
  }}>
    <div className={styles.header}>
      <div><p className={styles.eyebrow}>채팅에서 업무로</p><h2 id="task-dialog-title">업무 요청 만들기</h2></div>
      <button type="button" className={styles.close} aria-label="업무 요청 닫기" disabled={pending} onClick={onClose}>×</button>
    </div>
    <div className={styles.scrollArea}>
    <div className={styles.source}>
      <strong>원본 {sourceKind === 'dm' ? 'DM' : '채널'} 메시지</strong>
      <p>{sourceContent}</p>
      <small>원문은 업무에 복사되지 않습니다. 업무 정보는 워크스페이스 멤버에게 공개됩니다.</small>
    </div>
    <div className={styles.suggestionPanel}>
      <div className={styles.suggestionIntro}>
        <div><strong>제목 초안</strong><p>대화 내용을 참고해 제목을 제안합니다. 필요하면 직접 수정하세요.</p><p>AI가 설정된 경우 같은 대화의 메시지 최대 8개가 OpenAI API로 전송됩니다.</p></div>
        <button type="button" disabled={suggestionPending || pending} onClick={() => void requestSuggestions()}>{suggestionPending ? '만드는 중…' : '초안 제안받기'}</button>
      </div>
      {suggestionError && <p className={styles.error} role="alert">{suggestionError}</p>}
      {suggestions && <div className={styles.suggestionList}>
        {suggestions.demo && <p className={styles.demoNotice}>로컬 문장 기반 초안입니다. AI 생성 결과는 아닙니다.</p>}
        {!suggestions.demo && <p className={styles.demoNotice}>AI가 제안한 제목입니다. 공개 업무로 저장하기 전에 내용을 확인해 주세요.</p>}
        {suggestions.candidates.map((candidate, index) => <button type="button" key={`${candidate.title}-${index}`} className={styles.candidate} disabled={pending} onClick={() => { setTitle(candidate.title); titleRef.current?.focus(); }}>
          <span>{candidate.title}</span><small>{candidate.reason}</small>
        </button>)}
      </div>}
    </div>
    <form id="task-create-form" className={styles.form} onSubmit={(event) => void submit(event)}>
      <label className={styles.field}><span>업무 제목</span><input ref={titleRef} value={title} onChange={(event) => setTitle(event.target.value)} maxLength={160} required placeholder="업무 제목을 입력하세요" /></label>
      <label className={styles.field}><span>요청자</span><select value={requesterId} onChange={(event) => setRequesterId(event.target.value)} required>{assignees.map((uid) => <option key={uid} value={uid}>{memberOption(uid)}</option>)}</select></label>
      {requesterId !== viewerId && <p className={styles.fieldHint}>선택한 요청자가 마감 변경과 검수를 확인합니다. 실제 생성자는 이력에 남습니다.</p>}
      <label className={styles.field}><span>담당자</span><select value={assigneeId} onChange={(event) => setAssigneeId(event.target.value)} required><option value="">담당자를 선택하세요</option>{assignees.map((uid) => <option key={uid} value={uid}>{memberOption(uid)}</option>)}</select></label>
      {selfAssigned && <p className={styles.fieldHint}>본인을 담당자로 선택하면 수락 상태로 바로 시작합니다.</p>}
      <div className={styles.field}><span id="due-label">마감 날짜·시간</span><button ref={dueButtonRef} type="button" className={`${styles.dueTrigger} ${dueLocal ? styles.dueSelected : ''}`} aria-labelledby="due-label due-value" aria-expanded={duePickerOpen} aria-haspopup="dialog" onClick={toggleDuePicker}><span id="due-value">{dueDisplay}</span><svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4.5" width="14" height="12" rx="2" /><path d="M6.5 2.5v4M13.5 2.5v4M3 8.5h14" /></svg></button></div>
      <label className={`${styles.field} ${styles.descriptionField}`}><span>설명</span><textarea value={description} onChange={(event) => setDescription(event.target.value)} maxLength={2000} rows={3} placeholder="업무에 필요한 내용을 적어 주세요" /></label>
      <label className={styles.field}><span>예상 작업 시간</span><select value={estimatedMinutes} onChange={(event) => setEstimatedMinutes(event.target.value)}><option value="">선택 안 함</option>{estimateOptions.map((minutes) => <option key={minutes} value={minutes}>{minutes < 60 ? `${minutes}분` : `${minutes / 60}시간`}</option>)}</select></label>
      <label className={styles.field}><span>완료 후 검수</span><select value={reviewDays} onChange={(event) => setReviewDays(event.target.value)}><option value="">선택 안 함</option>{Array.from({ length: 10 }, (_, index) => index + 1).map((days) => <option key={days} value={days}>{days}근무일</option>)}</select></label>
    </form>
    </div>
    <div className={styles.footer}>
      {error && <p className={styles.error} role="alert">{error}</p>}
      <div className={styles.actions}><button type="button" className={styles.cancel} disabled={pending} onClick={onClose}>취소</button><button type="submit" form="task-create-form" aria-label={selfAssigned ? '본인 담당 업무 저장' : '업무 요청 저장'} className={styles.submit} disabled={pending || assignees.length === 0}>{pending ? '저장 중…' : selfAssigned ? '업무 만들기' : '요청하기'}</button></div>
    </div>
    {duePickerOpen && <div ref={pickerRef} className={styles.duePopover} role="dialog" aria-label="마감 날짜와 시간 선택" style={{ top: pickerPosition.top, left: pickerPosition.left, width: pickerPosition.width }}>
      <div className={styles.pickerCalendar}>
        <div className={styles.pickerMonth}><strong>{pickerMonth.year}년 {pickerMonth.month}월</strong><div><button type="button" aria-label="이전 달" onClick={() => movePickerMonth(-1)}>‹</button><button type="button" aria-label="다음 달" onClick={() => movePickerMonth(1)}>›</button></div></div>
        <div className={styles.pickerWeekdays}>{weekdayNames.map((day, index) => <span key={index}>{day}</span>)}</div>
        <div className={styles.pickerDays}>{monthCells(pickerMonth.year, pickerMonth.month).map((day) => {
          const key = dateKey(day);
          const inMonth = day.getUTCMonth() + 1 === pickerMonth.month;
          const unavailable = !inMonth || key < todayKey || (key === todayKey && pickerNow.getHours() >= 21);
          return <button type="button" key={key} aria-label={`${day.getUTCFullYear()}년 ${day.getUTCMonth() + 1}월 ${day.getUTCDate()}일`} aria-pressed={pickerDate === key} className={`${styles.pickerDay} ${pickerDate === key ? styles.pickerDaySelected : ''} ${key === todayKey ? styles.pickerToday : ''}`} disabled={unavailable} onClick={() => setPickerDate(key)}>{day.getUTCDate()}</button>;
        })}</div>
        <p className={styles.pickerDateHint}>{pickerDate ? `${Number(pickerDate.slice(5, 7))}월 ${Number(pickerDate.slice(8, 10))}일` : '날짜를 선택하세요'}</p>
      </div>
      <div className={styles.pickerTimes}><strong>시간 선택</strong><p>오전 9시부터 오후 9시까지 · 30분 간격</p><div ref={timeGridRef} className={styles.timeGrid}>{timeOptions.map((slot) => <button type="button" key={slot.value} disabled={!pickerDate || new Date(`${pickerDate}T${slot.value}`).getTime() <= pickerNow.getTime()} className={dueLocal === `${pickerDate}T${slot.value}` ? styles.timeSelected : ''} onClick={() => { setDueLocal(`${pickerDate}T${slot.value}`); setDuePickerOpen(false); dueButtonRef.current?.focus(); }}>{slot.label}</button>)}</div></div>
    </div>}
  </dialog>;
}
