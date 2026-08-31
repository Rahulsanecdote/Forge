import assert from 'node:assert/strict';
import test from 'node:test';

import {
  decidePublicationClaim,
  isPublicationRunComplete,
  needsPublicationReconciliation,
  STALE_PUBLISHING_MINUTES,
  type PublicationClaimState,
} from './data/publication-checkpoint-policy';

function claim(overrides: Partial<PublicationClaimState>): PublicationClaimState {
  return {
    publication_status: 'publishing',
    publication_claimed: true,
    ...overrides,
  };
}

test('a newly claimed checkpoint may call the provider', () => {
  assert.equal(decidePublicationClaim(claim({})), 'publish');
});

test('a published checkpoint is skipped on retry', () => {
  assert.equal(
    decidePublicationClaim(
      claim({
        publication_status: 'published',
        publication_claimed: false,
      }),
    ),
    'skip',
  );
});

test('an existing publishing checkpoint blocks an ambiguous retry', () => {
  assert.equal(
    decidePublicationClaim(claim({ publication_claimed: false })),
    'reconcile',
  );
});

test('a reconciliation checkpoint remains fail closed', () => {
  assert.equal(
    decidePublicationClaim(
      claim({
        publication_status: 'reconcile',
        publication_claimed: false,
      }),
    ),
    'reconcile',
  );
});

const now = '2026-08-08T12:00:00.000Z';

test('a reconcile checkpoint always needs an operator decision', () => {
  assert.equal(
    needsPublicationReconciliation({ status: 'reconcile', updated_at: now }, now),
    true,
  );
});

test('a fresh publishing claim is left alone', () => {
  assert.equal(
    needsPublicationReconciliation(
      { status: 'publishing', updated_at: '2026-08-08T11:45:00.000Z' },
      now,
    ),
    false,
  );
});

test('a publishing claim abandoned past the threshold needs an operator decision', () => {
  assert.equal(
    needsPublicationReconciliation(
      { status: 'publishing', updated_at: '2026-08-08T11:30:00.000Z' },
      now,
    ),
    true,
  );
  assert.equal(STALE_PUBLISHING_MINUTES, 30);
});

test('claimed_at stands in when a claim was never updated', () => {
  assert.equal(
    needsPublicationReconciliation(
      { status: 'publishing', claimed_at: '2026-08-08T10:00:00.000Z', updated_at: null },
      now,
    ),
    true,
  );
});

test('a published checkpoint never enters the reconciliation queue', () => {
  assert.equal(
    needsPublicationReconciliation(
      { status: 'published', updated_at: '2026-01-01T00:00:00.000Z' },
      now,
    ),
    false,
  );
});

test('an unparseable or missing timestamp fails closed and stays out of the queue', () => {
  assert.equal(
    needsPublicationReconciliation({ status: 'publishing', updated_at: 'not-a-date' }, now),
    false,
  );
  assert.equal(needsPublicationReconciliation({ status: 'publishing' }, now), false);
});

test('a multi-post run remains resumable after only one post is published', () => {
  assert.equal(
    isPublicationRunComplete({
      postCount: 3,
      checkpoints: [{ post_index: 0, status: 'published' }],
      evidencePayloads: [{ postIndex: 0 }],
    }),
    false,
  );
});

test('a run is complete only when every post checkpoint is published', () => {
  assert.equal(
    isPublicationRunComplete({
      postCount: 2,
      checkpoints: [
        { post_index: 0, status: 'published' },
        { post_index: 1, status: 'published' },
      ],
      evidencePayloads: [{ postIndex: 0 }, { postIndex: 1 }],
    }),
    true,
  );
});

test('legacy whole-run evidence preserves historical completion behavior', () => {
  assert.equal(
    isPublicationRunComplete({
      postCount: 3,
      checkpoints: [],
      evidencePayloads: [{}],
    }),
    true,
  );
});
