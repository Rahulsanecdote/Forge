import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatDateTime } from './format';

test('formatDateTime formats without a timezone', () => {
  const out = formatDateTime('2026-07-22T19:00:00.000Z');
  assert.equal(typeof out, 'string');
  assert.ok(out.length > 0);
  assert.notEqual(out, 'n/a');
});

test('formatDateTime formats in a given IANA zone without throwing', () => {
  // Regression: combining dateStyle/timeStyle with timeZoneName throws a TypeError.
  // This must render the pending-schedule time in the client zone without crashing.
  const out = formatDateTime('2026-07-22T19:00:00.000Z', 'America/New_York');
  assert.equal(typeof out, 'string');
  assert.ok(out.length > 0);
  // 19:00Z is 15:00 (3:00 PM) in EDT.
  assert.match(out, /3:00\s?PM/i);
});

test('formatDateTime handles other zones', () => {
  const out = formatDateTime('2026-07-22T00:00:00.000Z', 'Asia/Kolkata');
  assert.match(out, /5:30\s?AM/i); // UTC+5:30
});

test('formatDateTime returns n/a for empty or invalid input', () => {
  assert.equal(formatDateTime(null), 'n/a');
  assert.equal(formatDateTime(''), 'n/a');
  assert.equal(formatDateTime('not-a-date', 'America/New_York'), 'n/a');
});
