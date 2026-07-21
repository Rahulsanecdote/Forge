import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeFacebookMetrics,
  normalizeInstagramMetrics,
  parseGraphInsightValue,
  parseSummaryCount,
  publishedExternalId,
} from './data/analytics-mapping';

test('parseGraphInsightValue reads a named metric from a Graph insights payload', () => {
  const insights = {
    data: [
      { name: 'reach', values: [{ value: 1200 }] },
      { name: 'saved', values: [{ value: 34 }] },
    ],
  };
  assert.equal(parseGraphInsightValue(insights, 'reach'), 1200);
  assert.equal(parseGraphInsightValue(insights, 'saved'), 34);
  assert.equal(parseGraphInsightValue(insights, 'missing'), null);
  assert.equal(parseGraphInsightValue(null, 'reach'), null);
});

test('parseSummaryCount reads a Graph edge summary total', () => {
  assert.equal(parseSummaryCount({ summary: { total_count: 9 } }), 9);
  assert.equal(parseSummaryCount({ data: [] }), null);
  assert.equal(parseSummaryCount(null), null);
});

test('normalizeInstagramMetrics combines media fields with insights', () => {
  const fields = { like_count: 42, comments_count: 7, permalink: 'https://instagram.com/p/x' };
  const insights = {
    data: [
      { name: 'reach', values: [{ value: 900 }] },
      { name: 'total_interactions', values: [{ value: 60 }] },
      { name: 'saved', values: [{ value: 11 }] },
    ],
  };
  const metrics = normalizeInstagramMetrics(fields, insights);
  assert.equal(metrics.likes, 42);
  assert.equal(metrics.comments, 7);
  assert.equal(metrics.reach, 900);
  assert.equal(metrics.interactions, 60);
  assert.equal(metrics.saved, 11);
  assert.equal(metrics.impressions, null); // not returned → stays null
});

test('normalizeFacebookMetrics reads summaries, shares, and insights', () => {
  const fields = {
    likes: { summary: { total_count: 15 } },
    comments: { summary: { total_count: 3 } },
    shares: { count: 4 },
  };
  const insights = {
    data: [
      { name: 'post_impressions', values: [{ value: 2000 }] },
      { name: 'post_impressions_unique', values: [{ value: 1500 }] },
      { name: 'post_engaged_users', values: [{ value: 120 }] },
    ],
  };
  const metrics = normalizeFacebookMetrics(fields, insights);
  assert.equal(metrics.likes, 15);
  assert.equal(metrics.comments, 3);
  assert.equal(metrics.shares, 4);
  assert.equal(metrics.impressions, 2000);
  assert.equal(metrics.reach, 1500);
  assert.equal(metrics.interactions, 120);
  assert.equal(metrics.saved, null);
});

test('publishedExternalId extracts the id by platform', () => {
  assert.equal(publishedExternalId('instagram', { mediaId: '178001', url: 'x' }), '178001');
  assert.equal(publishedExternalId('facebook', { id: '99_100', url: 'x' }), '99_100');
  assert.equal(publishedExternalId('instagram', { id: 'wrong-key' }), null);
  assert.equal(publishedExternalId('google_business', { name: 'foo' }), null);
  assert.equal(publishedExternalId('facebook', null), null);
});
