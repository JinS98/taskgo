import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, Timestamp, where, type Firestore } from 'firebase/firestore';
import type { TaskRecord } from '@taskgo/contracts/task';
import styles from './TaskCalendarPanel.module.scss';

type CalendarTask = TaskRecord<Timestamp> & { id: string };
type CalendarFilter = 'team' | 'mine' | 'review';
const filters: { id: CalendarFilter; label: string }[] = [
  { id: 'team', label: '팀 전체 일정' },
  { id: 'mine', label: '내 담당 업무' },
  { id: 'review', label: '내가 검수할 업무' },
];
const weekdayLabels = ['일', '월', '화', '수', '목', '금', '토'];

function koreanDateParts(date: Date): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Seoul', year: 'numeric', month: 'numeric', day: 'numeric' }).formatToParts(date);
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  return { year: value('year'), month: value('month'), day: value('day') };
}

function dateKey(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function TaskCalendarPanel({ db, workspaceId, viewerId }: { db: Firestore; workspaceId: string; viewerId: string }) {
  const today = koreanDateParts(new Date());
  const [month, setMonth] = useState({ year: today.year, month: today.month });
  const [filter, setFilter] = useState<CalendarFilter>('team');
  const [snapshotState, setSnapshotState] = useState<{ workspaceId: string; tasks: CalendarTask[]; error: string } | null>(null);

  useEffect(() => onSnapshot(query(collection(db, 'tasks'), where('workspaceId', '==', workspaceId)), (snapshot) => {
    setSnapshotState({ workspaceId, tasks: snapshot.docs.map((item) => ({ ...item.data() as TaskRecord<Timestamp>, id: item.id })), error: '' });
  }, () => setSnapshotState({ workspaceId, tasks: [], error: '일정을 불러오지 못했습니다. 연결 상태를 확인해 주세요.' })), [db, workspaceId]);

  const loading = snapshotState?.workspaceId !== workspaceId;
  const tasks = loading ? [] : snapshotState?.tasks ?? [];
  const error = loading ? '' : snapshotState?.error ?? '';
  const visibleTasks = tasks.filter((task) => task.status !== 'DECLINED' && (filter === 'team' || filter === 'mine' && task.assigneeId === viewerId || filter === 'review' && task.reviewRequired && task.requesterId === viewerId));
  const tasksByDate = new Map<string, CalendarTask[]>();
  for (const task of visibleTasks) {
    if (!(task.dueDate instanceof Timestamp)) continue;
    const due = koreanDateParts(task.dueDate.toDate());
    const key = dateKey(due.year, due.month, due.day);
    tasksByDate.set(key, [...tasksByDate.get(key) ?? [], task]);
  }
  const firstWeekday = new Date(Date.UTC(month.year, month.month - 1, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(month.year, month.month, 0)).getUTCDate();
  const cellCount = Math.ceil((firstWeekday + daysInMonth) / 7) * 7;
  const cells = Array.from({ length: cellCount }, (_, index) => {
    const date = new Date(Date.UTC(month.year, month.month - 1, index - firstWeekday + 1));
    return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
  });

  function moveMonth(offset: number) {
    const next = new Date(Date.UTC(month.year, month.month - 1 + offset, 1));
    setMonth({ year: next.getUTCFullYear(), month: next.getUTCMonth() + 1 });
  }

  return <section className={styles.calendarView} aria-labelledby="calendar-title">
    <div className={styles.heading}><p className={styles.eyebrow}>SCHEDULE</p><h1 id="calendar-title">캘린더</h1><p>팀의 업무 마감과 요청 대기 일정을 한눈에 확인하세요.</p></div>
    <div className={styles.controls}>
      <div className={styles.monthControl}><button type="button" aria-label="이전 달" onClick={() => moveMonth(-1)}>‹</button><strong aria-live="polite">{month.year}년 {month.month}월</strong><button type="button" aria-label="다음 달" onClick={() => moveMonth(1)}>›</button></div>
      <div className={styles.filters} aria-label="일정 필터">{filters.map((item) => <button key={item.id} type="button" aria-pressed={filter === item.id} className={filter === item.id ? styles.selected : ''} onClick={() => setFilter(item.id)}>{item.label}</button>)}</div>
    </div>
    {error && <p role="alert" className={styles.error}>{error}</p>}
    {loading && <p role="status" className={styles.loading}>일정을 불러오는 중…</p>}
    <div className={styles.calendarOuter}><div className={styles.calendar} role="grid" aria-label={`${month.year}년 ${month.month}월 업무 일정`}>
      {weekdayLabels.map((label) => <div className={styles.weekday} role="columnheader" key={label}>{label}</div>)}
      {cells.map((cell) => {
        const key = dateKey(cell.year, cell.month, cell.day);
        const otherMonth = cell.month !== month.month;
        const isToday = key === dateKey(today.year, today.month, today.day);
        return <div className={`${styles.day} ${otherMonth ? styles.other : ''}`} role="gridcell" aria-label={`${cell.year}년 ${cell.month}월 ${cell.day}일`} key={key}>
          <span className={isToday ? styles.today : styles.dayNumber}>{cell.day}</span>
          {(tasksByDate.get(key) ?? []).map((task) => <span key={task.id} className={`${styles.event} ${task.status === 'REQUESTED' ? styles.pending : ''}`} title={task.title} aria-label={`${task.title}, ${task.status === 'REQUESTED' ? '요청 대기' : '확정 업무'}`}>{task.title}</span>)}
        </div>;
      })}
    </div></div>
    <div className={styles.legend}><span>확정된 업무</span><span className={styles.pendingKey}>요청 대기 업무</span></div>
    {filter === 'review' && <p className={styles.note}>현재는 검수가 필요한 업무의 마감일을 표시합니다. 검수 기한은 근무시간 계산 기능과 함께 추가됩니다.</p>}
  </section>;
}
