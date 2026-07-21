import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseScheduledFor, scheduleStatusForPublish } from './data/schedule-mapping';

const now = new Date('2026-07-21T12:00:00.000Z');

test('parseScheduledFor accepts a future time and returns a UTC ISO instant', () => {
  const result = parseScheduledFor('2026-07-21T13:00', now);
  assert.deepEqual(result, { ok: true, at: '2026-07-21T13:00:00.000Z' });
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
