import assert from 'node:assert/strict';
import test from 'node:test';

import {
  decidePublicationClaim,
  isPublicationRunComplete,
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
