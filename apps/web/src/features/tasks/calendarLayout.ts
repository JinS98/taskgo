export const visibleEventRows = 3;

export interface CalendarItem {
  id: string;
  title: string;
  status: string;
  createdAt: Date;
  dueDate: Date;
}

export interface CalendarDay {
  key: string;
  year: number;
  month: number;
  day: number;
  items: CalendarItem[];
  overflowCount: number;
}

export interface CalendarBar {
  item: CalendarItem;
  startDay: number;
  endDay: number;
  lane: number;
  startsHere: boolean;
  endsHere: boolean;
}

export interface CalendarWeek {
  days: CalendarDay[];
  bars: CalendarBar[];
}

export function koreanDateKey(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  return `${value('year')}-${value('month')}-${value('day')}`;
}

function utcDateKey(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function buildCalendarWeeks(year: number, month: number, items: CalendarItem[]): CalendarWeek[] {
  const firstWeekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const cellCount = Math.ceil((firstWeekday + daysInMonth) / 7) * 7;
  const cells = Array.from({ length: cellCount }, (_, index) => {
    const date = new Date(Date.UTC(year, month - 1, index - firstWeekday + 1));
    const cellYear = date.getUTCFullYear();
    const cellMonth = date.getUTCMonth() + 1;
    const day = date.getUTCDate();
    return { key: utcDateKey(cellYear, cellMonth, day), year: cellYear, month: cellMonth, day };
  });
  const ranges = items.filter((item) => Number.isFinite(item.createdAt.getTime()) && Number.isFinite(item.dueDate.getTime()))
    .map((item) => {
      const due = koreanDateKey(item.dueDate);
      const created = koreanDateKey(item.createdAt);
      return { item, start: created <= due ? created : due, end: due };
    });

  return Array.from({ length: cellCount / 7 }, (_, weekIndex) => {
    const weekCells = cells.slice(weekIndex * 7, weekIndex * 7 + 7);
    const firstKey = weekCells[0].key;
    const lastKey = weekCells[6].key;
    const overlapping = ranges.filter((range) => range.start <= lastKey && range.end >= firstKey)
      .map((range) => ({
        ...range,
        startDay: Math.max(0, weekCells.findIndex((cell) => cell.key >= range.start)),
        endDay: Math.min(6, weekCells.map((cell) => cell.key <= range.end).lastIndexOf(true)),
      }))
      .sort((a, b) => a.startDay - b.startDay || b.endDay - a.endDay || a.item.id.localeCompare(b.item.id));
    const bars: CalendarBar[] = [];
    const days: CalendarDay[] = [];
    let previous: (typeof overlapping[number] | null)[] = Array(visibleEventRows).fill(null);
    const currentBars: (CalendarBar | null)[] = Array(visibleEventRows).fill(null);
    for (let dayIndex = 0; dayIndex < 7; dayIndex += 1) {
      const active = overlapping.filter((range) => range.startDay <= dayIndex && range.endDay >= dayIndex);
      const slots: (typeof overlapping[number] | null)[] = Array(visibleEventRows).fill(null);
      for (let lane = 0; lane < visibleEventRows; lane += 1) {
        const ongoing = previous[lane];
        if (ongoing && active.includes(ongoing)) slots[lane] = ongoing;
      }
      const remaining = active.filter((range) => !slots.includes(range));
      for (let lane = 0; lane < visibleEventRows; lane += 1) {
        if (!slots[lane]) slots[lane] = remaining.shift() ?? null;
        const range = slots[lane];
        if (!range) { currentBars[lane] = null; continue; }
        const current = currentBars[lane];
        if (current?.item.id === range.item.id) {
          current.endDay = dayIndex;
        } else {
          const bar: CalendarBar = {
            item: range.item, startDay: dayIndex, endDay: dayIndex, lane,
            startsHere: dayIndex > 0 || range.start >= firstKey,
            endsHere: false,
          };
          bars.push(bar);
          currentBars[lane] = bar;
        }
      }
      days.push({
        ...weekCells[dayIndex],
        items: active.map((range) => range.item),
        overflowCount: Math.max(0, active.length - visibleEventRows),
      });
      previous = slots;
    }
    for (const bar of bars) bar.endsHere = bar.endDay < 6 || koreanDateKey(bar.item.dueDate) <= lastKey;
    return { days, bars };
  });
}
