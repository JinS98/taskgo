import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { Auth } from 'firebase/auth';
import type { Functions } from 'firebase/functions';
import type { CreateTaskRequest, TaskSourceType } from '@taskgo/contracts/task';
import { createTask, suggestTask, taskCreationError, taskSuggestionError, type TaskSuggestionResult } from './createTaskApi';
import styles from './TaskCreateDialog.module.scss';

const estimateOptions = [15, 30, 45, 60, 90, 120, 180, 240, 360, 480];

function localDateTime(date: Date): string {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
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
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const [dueLocal, setDueLocal] = useState('');
  const [estimatedMinutes, setEstimatedMinutes] = useState('');
  const [reviewRequired, setReviewRequired] = useState(false);
  const [reviewDays, setReviewDays] = useState('2');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [suggestionPending, setSuggestionPending] = useState(false);
  const [suggestionError, setSuggestionError] = useState('');
  const [suggestions, setSuggestions] = useState<TaskSuggestionResult | null>(null);
  const assignees = Object.keys(memberEmails).sort((a, b) => (memberNames[a] || a).localeCompare(memberNames[b] || b));
  const assigneeName = (uid: string) => memberNames[uid] || `팀원-${uid.slice(0, 4).toUpperCase()}`;
  const selfAssigned = assigneeId === viewerId;

  useEffect(() => {
    const dialog = dialogRef.current;
    dialog?.showModal();
    titleRef.current?.focus();
    return () => { if (dialog?.open) dialog.close(); };
  }, []);

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
    if (!Number.isFinite(dueMillis) || dueMillis <= Date.now()) { setError('미래의 마감 날짜와 시간을 선택해 주세요.'); return; }
    if (!memberEmails[assigneeId]) { setError('워크스페이스 멤버를 담당자로 선택해 주세요.'); return; }
    setPending(true);
    setError('');
    const request: CreateTaskRequest = {
      workspaceId,
      sourceMessageId,
      title: trimmedTitle,
      description: description.trim() || null,
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

  return <dialog ref={dialogRef} className={styles.dialog} aria-labelledby="task-dialog-title" onCancel={(event) => { event.preventDefault(); if (!pending) onClose(); }}>
    <div className={styles.header}>
      <div><p className={styles.eyebrow}>MESSAGE TO TASK</p><h2 id="task-dialog-title">업무 요청 만들기</h2></div>
      <button type="button" className={styles.close} aria-label="업무 요청 닫기" disabled={pending} onClick={onClose}>×</button>
    </div>
    <div className={styles.scrollArea}>
    <div className={styles.source}>
      <strong>원본 {sourceKind === 'dm' ? 'DM' : '채널'} 메시지</strong>
      <p>{sourceContent}</p>
      <small>원문은 업무에 복사되지 않습니다. 업무 제목과 담당·마감은 워크스페이스 전체에 공개됩니다.</small>
    </div>
    <div className={styles.suggestionPanel}>
      <div className={styles.suggestionIntro}>
        <div><strong>업무 제목 초안</strong><p>선택한 메시지의 대화 문맥을 참고해 초안을 만듭니다. 선택 후 제목을 수정할 수 있습니다.</p><p>AI가 설정된 경우 같은 채널·DM의 메시지 최대 8개가 OpenAI API로 전송됩니다.</p></div>
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
      <label className={styles.field}>업무 제목<input ref={titleRef} value={title} onChange={(event) => setTitle(event.target.value)} maxLength={160} required placeholder="팀에 공개할 업무 제목" /></label>
      <div className={styles.row}>
        <label className={styles.field}>담당자<select value={assigneeId} onChange={(event) => setAssigneeId(event.target.value)} required><option value="">담당자를 선택하세요</option>{assignees.map((uid) => <option key={uid} value={uid}>{assigneeName(uid)}{assignees.some((other) => other !== uid && assigneeName(other) === assigneeName(uid)) ? ` · ${uid.slice(0, 4).toUpperCase()}` : ''}</option>)}</select></label>
        <label className={styles.field}>마감 날짜·시간<input type="datetime-local" value={dueLocal} onChange={(event) => setDueLocal(event.target.value)} min={localDateTime(new Date())} required /></label>
      </div>
      {selfAssigned && <p className={styles.selfAssignedHint}>본인을 담당자로 선택하면 수락 상태로 바로 시작합니다.</p>}
      <label className={styles.field}>설명<textarea value={description} onChange={(event) => setDescription(event.target.value)} maxLength={2000} rows={3} placeholder="업무에 필요한 내용을 적어 주세요" /></label>
      <label className={`${styles.field} ${styles.estimateField}`}>예상 작업 시간<select value={estimatedMinutes} onChange={(event) => setEstimatedMinutes(event.target.value)}><option value="">선택 안 함</option>{estimateOptions.map((minutes) => <option key={minutes} value={minutes}>{minutes < 60 ? `${minutes}분` : `${minutes / 60}시간`}</option>)}</select></label>
      <div className={styles.reviewSection}>
        <label className={styles.check}><input type="checkbox" aria-label="완료 후 검수 요청" checked={reviewRequired} onChange={(event) => setReviewRequired(event.target.checked)} /><span><strong>완료 후 검수 요청</strong><small>업무가 완료되면 검수자에게 확인을 요청합니다.</small></span></label>
        <div className={styles.reviewOption}>{reviewRequired ? <label className={styles.field}>검수 기간<select value={reviewDays} onChange={(event) => setReviewDays(event.target.value)}>{Array.from({ length: 10 }, (_, index) => index + 1).map((days) => <option key={days} value={days}>{days}근무일</option>)}</select></label> : <span className={styles.reviewHint}>필요한 경우 검수 기간을 선택할 수 있습니다.</span>}</div>
      </div>
    </form>
    </div>
    <div className={styles.footer}>
      {error && <p className={styles.error} role="alert">{error}</p>}
      <div className={styles.actions}><button type="button" className={styles.cancel} disabled={pending} onClick={onClose}>취소</button><button type="submit" form="task-create-form" aria-label={selfAssigned ? '본인 담당 업무 저장' : '업무 요청 저장'} className={styles.submit} disabled={pending || assignees.length === 0}>{pending ? '저장 중…' : selfAssigned ? '업무 만들기' : '요청하기'}</button></div>
    </div>
  </dialog>;
}
