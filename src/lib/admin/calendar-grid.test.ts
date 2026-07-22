import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildMonthGrid,
  entryLocalDate,
  monthMeta,
  monthRangeIso,
  type CalendarEntry,
} from './calendar-grid';

function entry(over: Partial<CalendarEntry>): CalendarEntry {
  return {
    id: 'e',
    runId: 'r',
    clientName: 'Acme',
    clientSlug: 'acme',
    title: 'Post',
    status: 'scheduled',
    at: '2026-07-15T15:00:00.000Z',
    timezone: 'UTC',
    ...over,
  };
}

test('entryLocalDate uses the client timezone (evening ET rolls to the ET date)', () => {
  // 2026-07-16T01:30Z is 2026-07-15 21:30 in America/New_York.
  assert.equal(entryLocalDate('2026-07-16T01:30:00Z', 'America/New_York'), '2026-07-15');
  assert.equal(entryLocalDate('2026-07-16T01:30:00Z', 'UTC'), '2026-07-16');
});

test('entryLocalDate falls back to UTC for an invalid timezone', () => {
  assert.equal(entryLocalDate('2026-07-16T01:30:00Z', 'Not/AZone'), '2026-07-16');
});

test('monthMeta parses the param and computes prev/next', () => {
  const meta = monthMeta('2026-07', '2026-07-22T12:00:00Z');
  assert.equal(meta.year, 2026);
  assert.equal(meta.month, 6);
  assert.equal(meta.label, 'July 2026');
  assert.equal(meta.prevParam, '2026-06');
  assert.equal(meta.nextParam, '2026-08');
});

test('monthMeta wraps year boundaries and falls back to today', () => {
  assert.equal(monthMeta('2026-12', '2026-07-22T12:00:00Z').nextParam, '2027-01');
  assert.equal(monthMeta('2026-01', '2026-07-22T12:00:00Z').prevParam, '2025-12');
  const fallback = monthMeta(undefined, '2026-07-22T12:00:00Z');
  assert.equal(fallback.param, '2026-07');
  assert.equal(monthMeta('garbage', '2026-07-22T12:00:00Z').param, '2026-07');
});

test('buildMonthGrid lays out whole Sunday-started weeks and flags the current day', () => {
  const weeks = buildMonthGrid({ year: 2026, month: 6, entries: [], today: '2026-07-22' });
  // Every row is a full week.
  for (const week of weeks) assert.equal(week.length, 7);
  // First cell is a Sunday; July 1 2026 is a Wednesday, so the grid starts on Jun 28.
  assert.equal(weeks[0][0].date, '2026-06-28');
  assert.equal(weeks[0][0].inMonth, false);
  const today = weeks.flat().find((d) => d.isToday);
  assert.equal(today?.date, '2026-07-22');
  assert.equal(today?.inMonth, true);
});

test('buildMonthGrid buckets entries onto their local day, sorted by time', () => {
  const weeks = buildMonthGrid({
    year: 2026,
    month: 6,
    today: '2026-07-22',
    entries: [
      entry({ id: 'late', at: '2026-07-15T20:00:00Z' }),
      entry({ id: 'early', at: '2026-07-15T09:00:00Z' }),
      entry({ id: 'etnight', at: '2026-07-16T01:30:00Z', timezone: 'America/New_York' }),
    ],
  });
  const day15 = weeks.flat().find((d) => d.date === '2026-07-15');
  // Both UTC-15 entries plus the ET-night one that rolls back to the 15th.
  assert.deepEqual(
    day15?.entries.map((e) => e.id),
    ['early', 'late', 'etnight'],
  );
});

test('monthRangeIso pads the month by a week on each side', () => {
  const { startIso, endIso } = monthRangeIso(2026, 6);
  assert.equal(startIso, '2026-06-24T00:00:00.000Z');
  assert.equal(endIso, '2026-08-08T00:00:00.000Z');
});
