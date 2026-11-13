import assert from 'node:assert/strict';
import { buildCalendarWeeks, koreanDateKey, visibleEventRows } from '../src/features/tasks/calendarLayout.ts';

function item(id, createdAt, dueDate, status = 'ACCEPTED') {
  return { id, title: id, status, createdAt: new Date(createdAt), dueDate: new Date(dueDate) };
}

assert.equal(koreanDateKey(new Date('2026-11-12T15:30:00.000Z')), '2026-11-13');
const weeks = buildCalendarWeeks(2026, 11, [
  item('cross-week', '2026-11-12T15:30:00.000Z', '2026-11-16T10:00:00.000Z', 'REQUESTED'),
  item('cross-month', '2026-10-30T02:00:00.000Z', '2026-11-02T11:00:00.000Z'),
]);
assert.equal(weeks.length, 5);
assert.deepEqual(weeks[0].days.slice(0, 2).map((day) => day.items.map((entry) => entry.id)), [
  ['cross-month'], ['cross-month'],
]);
const fridaySegment = weeks[1].bars.find((bar) => bar.item.id === 'cross-week');
const mondaySegment = weeks[2].bars.find((bar) => bar.item.id === 'cross-week');
assert.deepEqual([fridaySegment.startDay, fridaySegment.endDay, fridaySegment.startsHere, fridaySegment.endsHere], [5, 6, true, false]);
assert.deepEqual([mondaySegment.startDay, mondaySegment.endDay, mondaySegment.startsHere, mondaySegment.endsHere], [0, 1, false, true]);
assert.equal(weeks[1].days[4].items.length, 0);
assert.equal(weeks[2].days[2].items.length, 0);

const crowded = buildCalendarWeeks(2026, 11, Array.from({ length: 6 }, (_, index) =>
  item(`task-${index}`, '2026-11-16T01:00:00.000Z', '2026-11-17T01:00:00.000Z')));
const monday = crowded[2].days[1];
assert.equal(monday.items.length, 6);
assert.equal(monday.overflowCount, 6 - visibleEventRows);
assert.deepEqual(crowded[2].bars.map((bar) => bar.lane), [0, 1, 2]);
assert.equal(crowded[2].days[3].overflowCount, 0);

const clearing = buildCalendarWeeks(2026, 11, [
  ...Array.from({ length: 3 }, (_, index) => item(`earlier-${index}`, '2026-11-15T01:00:00.000Z', '2026-11-16T10:00:00.000Z')),
  item('later', '2026-11-16T01:00:00.000Z', '2026-11-18T10:00:00.000Z'),
]);
assert.equal(clearing[2].days[1].overflowCount, 1);
assert.equal(clearing[2].days[2].overflowCount, 0);
assert.deepEqual(clearing[2].bars.filter((bar) => bar.item.id === 'later').map((bar) => [bar.startDay, bar.endDay]), [[2, 3]]);

console.log('PASS: Korean dates, multiweek and month edges, shared lanes, and daily overflow.');
