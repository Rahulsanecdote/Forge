import { test } from 'node:test';
import assert from 'node:assert/strict';
import { engagementScore, formatPerformanceExample } from './data/performance-memory-mapping';

test('engagementScore weights component signals and treats nulls as zero', () => {
  assert.equal(
    engagementScore({ likes: 10, comments: 2, shares: 1, saved: 3, interactions: null }),
    10 + 2 * 2 + 1 * 3 + 3 * 2,
  );
  assert.equal(engagementScore({ likes: null, comments: null, shares: null, saved: null, interactions: null }), 0);
});

test('engagementScore prefers the platform interactions total when it is larger', () => {
  const m = { likes: 5, comments: 1, shares: 0, saved: 0, interactions: 90 };
  assert.equal(engagementScore(m), 90);
  const componentsWin = { likes: 50, comments: 20, shares: 10, saved: 5, interactions: 3 };
  assert.equal(engagementScore(componentsWin), 50 + 20 * 2 + 10 * 3 + 5 * 2);
});

test('formatPerformanceExample renders a compact, trimmed summary', () => {
  assert.equal(
    formatPerformanceExample({
      platform: 'instagram',
      caption: '  Cold brew   season\nis here  ',
      likes: 320,
      comments: 45,
      shares: 12,
      saved: null,
    }),
    'instagram · 320 likes, 45 comments, 12 shares — "Cold brew season is here"',
  );

  const noStats = formatPerformanceExample({
    platform: 'google_business',
    caption: 'Grand opening this weekend',
    likes: 0,
    comments: null,
    shares: null,
    saved: null,
  });
  assert.equal(noStats, 'google business · engagement recorded — "Grand opening this weekend"');

  const long = formatPerformanceExample({
    platform: 'facebook',
    caption: 'x'.repeat(300),
    likes: 1,
    comments: null,
    shares: null,
    saved: null,
  });
  // 160-char cap on the caption, plus the wrapping quotes.
  assert.equal(long.endsWith(`${'x'.repeat(160)}"`), true);
});
