import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summarizeClientPerformance, type MetricRowInput } from './data/performance-summary-mapping';

function row(overrides: Partial<MetricRowInput>): MetricRowInput {
  return {
    platform: 'instagram',
    caption: 'A post',
    permalink: null,
    likes: null,
    comments: null,
    shares: null,
    saved: null,
    reach: null,
    impressions: null,
    interactions: null,
    fetched_at: null,
    ...overrides,
  };
}

test('summarizeClientPerformance returns null with no rows', () => {
  assert.equal(summarizeClientPerformance([]), null);
});

test('summarizeClientPerformance totals metrics and tracks the latest fetch', () => {
  const summary = summarizeClientPerformance([
    row({ platform: 'instagram', likes: 10, comments: 2, reach: 100, fetched_at: '2026-07-20T00:00:00Z' }),
    row({ platform: 'instagram', likes: 5, shares: 1, reach: 50, fetched_at: '2026-07-21T00:00:00Z' }),
    row({ platform: 'facebook', likes: 3, comments: 1, reach: 20, fetched_at: '2026-07-19T00:00:00Z' }),
  ]);
  assert.ok(summary);
  assert.equal(summary.measuredPosts, 3);
  assert.equal(summary.totals.likes, 18);
  assert.equal(summary.totals.comments, 3);
  assert.equal(summary.totals.shares, 1);
  assert.equal(summary.totals.reach, 170);
  assert.equal(summary.lastFetchedAt, '2026-07-21T00:00:00Z');
});

test('summarizeClientPerformance breaks totals down per platform, busiest first', () => {
  const summary = summarizeClientPerformance([
    row({ platform: 'instagram', likes: 10 }),
    row({ platform: 'instagram', likes: 5 }),
    row({ platform: 'facebook', likes: 3 }),
  ]);
  assert.ok(summary);
  assert.equal(summary.byPlatform[0].platform, 'instagram');
  assert.equal(summary.byPlatform[0].posts, 2);
  assert.equal(summary.byPlatform[0].likes, 15);
  assert.equal(summary.byPlatform[1].platform, 'facebook');
  assert.equal(summary.byPlatform[1].posts, 1);
});

test('summarizeClientPerformance ranks captioned posts by engagement and drops blanks', () => {
  const summary = summarizeClientPerformance([
    row({ caption: 'low', likes: 1 }),
    row({ caption: 'high', likes: 100, comments: 20 }),
    row({ caption: '   ', likes: 999 }), // blank caption → excluded from top posts
    row({ caption: 'zero', likes: 0, comments: 0 }), // score 0 → excluded
  ]);
  assert.ok(summary);
  assert.equal(summary.topPosts[0].caption, 'high');
  assert.equal(summary.topPosts[1].caption, 'low');
  assert.equal(summary.topPosts.length, 2);
});
