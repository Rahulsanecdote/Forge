import assert from 'node:assert/strict';
import test from 'node:test';
import { parseCompetitorAnalysis } from './analyze-competitors';
import { parseReviewReplies } from './draft-review-responses';
import { parseReport } from './generate-report';
import { parseKeywordClusters } from './research-keywords';

test('review replies are mapped by stable review ID regardless of output order', () => {
  const replies = parseReviewReplies(
    JSON.stringify([
      { review_id: 'review-b', reply: 'Thank you, B.', needs_manager: false },
      { review_id: 'review-a', reply: 'Thank you, A.', needs_manager: false },
    ]),
    ['review-a', 'review-b'],
  );

  assert.equal(replies[0].review_id, 'review-b');
  assert.throws(
    () =>
      parseReviewReplies(
        JSON.stringify([
          { review_id: 'review-a', reply: 'One reply.', needs_manager: false },
          { review_id: 'review-a', reply: 'Duplicate reply.', needs_manager: false },
        ]),
        ['review-a', 'review-b'],
      ),
    /did not match/,
  );
});

test('keyword research rejects empty or malformed model output', () => {
  assert.throws(() => parseKeywordClusters('{"clusters": []}'), /invalid keyword cluster/);
  assert.deepEqual(
    parseKeywordClusters(
      JSON.stringify({
        clusters: [
          {
            theme: 'Coffee subscriptions',
            intent: 'transactional',
            keywords: ['coffee subscription'],
            content_angle: 'Compare delivery options.',
          },
        ],
      }),
    )[0].keywords,
    ['coffee subscription'],
  );
});

test('reports require the requested period and actionable content', () => {
  assert.throws(
    () =>
      parseReport(
        JSON.stringify({
          period: 'June 2026',
          executive_summary: 'Stable.',
          whats_working: [],
          needs_attention: [],
          recommended_actions: ['Measure conversions.'],
        }),
        'July 2026',
      ),
    /period did not match/,
  );
});

test('competitor analysis must cover each requested competitor exactly once', () => {
  const valid = {
    summary: 'Two distinct positions.',
    per_competitor: [
      { name: 'Alpha', likely_strengths: [], likely_gaps: [] },
      { name: 'Beta', likely_strengths: [], likely_gaps: [] },
    ],
    where_client_wins: [],
    opportunities: ['Own the local niche.'],
    recommended_positioning: 'Lead with traceability.',
  };
  assert.equal(parseCompetitorAnalysis(JSON.stringify(valid), ['Beta', 'Alpha']).per_competitor.length, 2);
  assert.throws(
    () => parseCompetitorAnalysis(JSON.stringify(valid), ['Alpha', 'Gamma']),
    /did not match/,
  );
});
