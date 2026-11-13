import { useEffect, useRef, useState } from 'react';
import { collection, onSnapshot, query, Timestamp, where, type Firestore } from 'firebase/firestore';
import type { TaskRecord } from '@taskgo/contracts/task';
import { buildCalendarWeeks, koreanDateKey, visibleEventRows, type CalendarDay } from './calendarLayout';
import styles from './TaskCalendarPanel.module.scss';

type CalendarTask = TaskRecord<Timestamp> & { id: string };
type CalendarFilter = 'team' | 'mine' | 'review';
const filters: { id: CalendarFilter; label: string }[] = [
  { id: 'team', label: '팀 전체 일정' },
  { id: 'mine', label: '내 담당 업무' },
  { id: 'review', label: '내가 검수할 업무' },
];
const weekdayLabels = ['일', '월', '화', '수', '목', '금', '토'];
const dateTime = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', dateStyle: 'medium', timeStyle: 'short' });

export function TaskCalendarPanel({ db, workspaceId, viewerId }: { db: Firestore; workspaceId: string; viewerId: string }) {
  const todayKey = koreanDateKey(new Date());
  const [todayYear, todayMonth] = todayKey.split('-').map(Number);
  const [month, setMonth] = useState({ year: todayYear, month: todayMonth });
  const [filter, setFilter] = useState<CalendarFilter>('team');
  const [snapshotState, setSnapshotState] = useState<{ workspaceId: string; tasks: CalendarTask[]; error: string } | null>(null);
  const [openDay, setOpenDay] = useState<{ day: CalendarDay; left: number; top: number } | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => onSnapshot(query(collection(db, 'tasks'), where('workspaceId', '==', workspaceId)), (snapshot) => {
    setSnapshotState({ workspaceId, tasks: snapshot.docs.map((item) => ({ ...item.data() as TaskRecord<Timestamp>, id: item.id })), error: '' });
  }, () => setSnapshotState({ workspaceId, tasks: [], error: '일정을 불러오지 못했습니다. 연결 상태를 확인해 주세요.' })), [db, workspaceId]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (openDay && dialog && !dialog.open) dialog.showModal();
    return () => { if (dialog?.open) dialog.close(); };
  }, [openDay]);

  const loading = snapshotState?.workspaceId !== workspaceId;
  const tasks = loading ? [] : snapshotState?.tasks ?? [];
  const error = loading ? '' : snapshotState?.error ?? '';
  const visibleTasks = tasks.filter((task) => task.status !== 'DECLINED' && (filter === 'team' || filter === 'mine' && task.assigneeId === viewerId || filter === 'review' && task.reviewRequired && task.requesterId === viewerId));
  const weeks = buildCalendarWeeks(month.year, month.month, visibleTasks
    .filter((task) => task.dueDate instanceof Timestamp)
    .map((task) => ({
      id: task.id, title: task.title, status: task.status,
      createdAt: task.createdAt instanceof Timestamp ? task.createdAt.toDate() : task.dueDate.toDate(),
      dueDate: task.dueDate.toDate(),
    })));

  function moveMonth(offset: number) {
    const next = new Date(Date.UTC(month.year, month.month - 1 + offset, 1));
    setMonth({ year: next.getUTCFullYear(), month: next.getUTCMonth() + 1 });
    setOpenDay(null);
  }

  function showDay(day: CalendarDay, button: HTMLButtonElement) {
    const anchor = button.getBoundingClientRect();
    const width = Math.min(320, window.innerWidth - 24);
    const left = Math.max(12, Math.min(anchor.left, window.innerWidth - width - 12));
    const top = anchor.bottom + 8 + 380 <= window.innerHeight
      ? anchor.bottom + 8 : Math.max(12, anchor.top - 388);
    setOpenDay({ day, left, top });
  }

  return <section className={styles.calendarView} aria-labelledby="calendar-title">
    <div className={styles.heading}><p className={styles.eyebrow}>SCHEDULE</p><h1 id="calendar-title">캘린더</h1><p>업무 요청일부터 마감일까지 팀 일정을 한눈에 확인하세요.</p></div>
    <div className={styles.controls}>
      <div className={styles.monthControl}><button type="button" aria-label="이전 달" onClick={() => moveMonth(-1)}>‹</button><strong aria-live="polite">{month.year}년 {month.month}월</strong><button type="button" aria-label="다음 달" onClick={() => moveMonth(1)}>›</button></div>
      <div className={styles.filters} aria-label="일정 필터">{filters.map((item) => <button key={item.id} type="button" aria-pressed={filter === item.id} className={filter === item.id ? styles.selected : ''} onClick={() => { setFilter(item.id); setOpenDay(null); }}>{item.label}</button>)}</div>
    </div>
    {error && <p role="alert" className={styles.error}>{error}</p>}
    {loading && <p role="status" className={styles.loading}>일정을 불러오는 중…</p>}
    <div className={styles.calendarOuter}><div className={styles.calendar} role="grid" aria-label={`${month.year}년 ${month.month}월 업무 일정`}>
      {weekdayLabels.map((label) => <div className={styles.weekday} role="columnheader" key={label}>{label}</div>)}
      {weeks.map((week) => <div className={styles.week} role="row" key={week.days[0].key}>
        {week.days.map((day) => <div className={`${styles.day} ${day.month !== month.month ? styles.other : ''}`} role="gridcell" aria-label={`${day.year}년 ${day.month}월 ${day.day}일, 업무 ${day.items.length}개`} key={day.key}>
          <span className={day.key === todayKey ? styles.today : styles.dayNumber}>{day.day}</span>
          <span className={styles.visuallyHidden}>{day.items.map((item) => item.title).join(', ')}</span>
          {day.overflowCount > 0 && <button type="button" className={styles.more} aria-label={`${day.month}월 ${day.day}일 업무 ${day.items.length}개 모두 보기`} onClick={(event) => showDay(day, event.currentTarget)}>+{day.overflowCount}개 더보기</button>}
        </div>)}
        <div className={styles.eventRows} aria-hidden="true">
          {week.bars.filter((bar) => bar.lane < visibleEventRows).map((bar) => <span key={bar.item.id}
            className={`${styles.event} ${bar.item.status === 'REQUESTED' ? styles.pending : ''} ${bar.startsHere ? styles.eventStart : ''} ${bar.endsHere ? styles.eventEnd : ''}`}
            style={{ gridColumn: `${bar.startDay + 1} / span ${bar.endDay - bar.startDay + 1}`, gridRow: bar.lane + 1 }}
            title={`${bar.item.title} · ${dateTime.format(bar.item.createdAt)} ~ ${dateTime.format(bar.item.dueDate)}`}>{bar.item.title}</span>)}
        </div>
      </div>)}
    </div></div>
    <div className={styles.legend}><span>확정된 업무</span><span className={styles.pendingKey}>요청 대기 업무</span></div>
    {filter === 'review' && <p className={styles.note}>현재는 검수가 필요한 업무의 요청일~마감일을 표시합니다. 검수 기한은 근무시간 계산 기능과 함께 추가됩니다.</p>}
    {openDay && <dialog ref={dialogRef} className={styles.dayDialog} style={{ left: openDay.left, top: openDay.top }} aria-labelledby="calendar-day-title" onCancel={() => setOpenDay(null)} onClick={(event) => { if (event.target === event.currentTarget) setOpenDay(null); }}>
      <div className={styles.dialogHeading}><div><small>{weekdayLabels[new Date(Date.UTC(openDay.day.year, openDay.day.month - 1, openDay.day.day)).getUTCDay()]}</small><h2 id="calendar-day-title">{openDay.day.month}월 {openDay.day.day}일</h2><p>업무 {openDay.day.items.length}개</p></div><button type="button" aria-label="일정 목록 닫기" onClick={() => setOpenDay(null)}>×</button></div>
      <ul className={styles.dayTaskList}>{openDay.day.items.map((item) => <li key={item.id} className={item.status === 'REQUESTED' ? styles.pendingTask : ''}><strong>{item.title}</strong><span>{item.status === 'REQUESTED' ? '요청 대기' : '확정 업무'}</span><small>{dateTime.format(item.createdAt)} ~ {dateTime.format(item.dueDate)}</small></li>)}</ul>
    </dialog>}
  </section>;
}
