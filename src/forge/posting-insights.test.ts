import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recommendPostTimes, type PublishedMetric } from './data/posting-insights-mapping';

function metric(published_at: string | null, likes: number): PublishedMetric {
  return { published_at, likes, comments: null, shares: null, saved: null, interactions: null };
}

test('recommendPostTimes returns [] without dated history', () => {
  assert.deepEqual(recommendPostTimes([], 'UTC'), []);
  assert.deepEqual(recommendPostTimes([metric(null, 100)], 'UTC'), []);
});

test('recommendPostTimes buckets by weekday/hour and ranks by average engagement', () => {
  // 2026-07-17 is a Friday. 18:00Z posts did far better than the Monday 09:00Z post.
  const slots = recommendPostTimes(
    [
      metric('2026-07-17T18:00:00Z', 100),
      metric('2026-07-24T18:00:00Z', 200), // same Fri 18:00 bucket
      metric('2026-07-20T09:00:00Z', 5), // Monday 09:00
    ],
    'UTC',
  );
  assert.equal(slots[0].label, 'Fri 18:00');
  assert.equal(slots[0].samples, 2);
  assert.equal(slots[0].avgScore, 150);
  assert.equal(slots[1].label, 'Mon 09:00');
});

test('recommendPostTimes computes the hour in the requested timezone', () => {
  // 18:00Z in America/New_York (EDT, UTC-4) is 14:00 local, on Friday.
  const slots = recommendPostTimes([metric('2026-07-17T18:00:00Z', 10)], 'America/New_York');
  assert.equal(slots[0].label, 'Fri 14:00');
  assert.equal(slots[0].hour, 14);
});
