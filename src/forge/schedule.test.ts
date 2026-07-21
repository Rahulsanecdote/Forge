import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseScheduledFor,
  resolveScheduleTimeZone,
  scheduleStatusForPublish,
} from './data/schedule-mapping';

const now = new Date('2026-07-21T12:00:00.000Z');

test('parseScheduledFor accepts a future time and returns a UTC ISO instant', () => {
  const result = parseScheduledFor('2026-07-21T13:00', now);
  assert.deepEqual(result, { ok: true, at: '2026-07-21T13:00:00.000Z' });
});

test('parseScheduledFor interprets the wall clock in the client timezone (DST-aware)', () => {
  // July → America/New_York is EDT (UTC-4): 13:00 local → 17:00Z.
  assert.deepEqual(parseScheduledFor('2026-07-21T13:00', now, 'America/New_York'), {
    ok: true,
    at: '2026-07-21T17:00:00.000Z',
  });

  // December → EST (UTC-5): 09:00 local → 14:00Z.
  const winter = new Date('2026-12-01T00:00:00.000Z');
  assert.deepEqual(parseScheduledFor('2026-12-15T09:00', winter, 'America/New_York'), {
    ok: true,
    at: '2026-12-15T14:00:00.000Z',
  });

  // A fixed-offset zone east of UTC: Asia/Kolkata is UTC+5:30.
  assert.deepEqual(parseScheduledFor('2026-07-22T00:00', now, 'Asia/Kolkata'), {
    ok: true,
    at: '2026-07-21T18:30:00.000Z',
  });
});

test('parseScheduledFor falls back to server-local parsing for an unknown timezone', () => {
  assert.deepEqual(
    parseScheduledFor('2026-07-21T13:00', now, 'Not/AZone'),
    parseScheduledFor('2026-07-21T13:00', now),
  );
});

test('resolveScheduleTimeZone keeps valid IANA zones and rejects the rest', () => {
  assert.equal(resolveScheduleTimeZone('America/New_York'), 'America/New_York');
  assert.equal(resolveScheduleTimeZone('  UTC  '), 'UTC');
  assert.equal(resolveScheduleTimeZone('Eastern'), null);
  assert.equal(resolveScheduleTimeZone(''), null);
  assert.equal(resolveScheduleTimeZone(null), null);
});

test('parseScheduledFor rejects empty and unparseable input as invalid', () => {
  assert.deepEqual(parseScheduledFor('', now), { ok: false, reason: 'invalid' });
  assert.deepEqual(parseScheduledFor('   ', now), { ok: false, reason: 'invalid' });
  assert.deepEqual(parseScheduledFor('not-a-date', now), { ok: false, reason: 'invalid' });
});

test('parseScheduledFor rejects a past or present time as past', () => {
  assert.deepEqual(parseScheduledFor('2026-07-21T11:59', now), { ok: false, reason: 'past' });
  assert.deepEqual(parseScheduledFor('2026-07-21T12:00:00.000Z', now), { ok: false, reason: 'past' });
});

test('scheduleStatusForPublish maps publish outcomes to a terminal schedule status', () => {
  assert.equal(scheduleStatusForPublish('publish-complete'), 'published');
  assert.equal(scheduleStatusForPublish('publish-already'), 'published');
  assert.equal(scheduleStatusForPublish('publish-error'), 'failed');
  assert.equal(scheduleStatusForPublish('publish-unconfigured'), 'failed');
  assert.equal(scheduleStatusForPublish('publish-missing-image'), 'failed');
});
