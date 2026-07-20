import assert from 'node:assert/strict';
import test from 'node:test';
import {
  googleReviewExternalId,
  googleReviewToInsertRow,
  googleStarRatingToNumber,
  normalizeGoogleBusinessResourceId,
} from './data/google-business-profile-mapping';

test('maps Google star ratings to numeric review ratings', () => {
  assert.equal(googleStarRatingToNumber('ONE'), 1);
  assert.equal(googleStarRatingToNumber('FIVE'), 5);
  assert.equal(googleStarRatingToNumber('STAR_RATING_UNSPECIFIED'), null);
});

test('normalizes Google Business resource ids from full resource names', () => {
  assert.equal(normalizeGoogleBusinessResourceId('accounts/123', 'accounts'), '123');
  assert.equal(normalizeGoogleBusinessResourceId('locations/456', 'locations'), '456');
  assert.equal(normalizeGoogleBusinessResourceId('789', 'accounts'), '789');
});

test('extracts review ids and maps GBP reviews into review rows', () => {
  const review = {
    name: 'accounts/123/locations/456/reviews/review-1',
    reviewer: { displayName: 'Alex' },
    starRating: 'FOUR',
    comment: 'Great espresso.',
    createTime: '2026-07-20T03:00:00Z',
    updateTime: '2026-07-20T03:01:00Z',
  };

  assert.equal(googleReviewExternalId(review), 'review-1');
  assert.deepEqual(googleReviewToInsertRow('client-id', review), {
    client_id: 'client-id',
    author: 'Alex',
    rating: 4,
    text: 'Great espresso.',
    platform: 'google',
    status: 'new',
    external_review_id: 'review-1',
    external_review_name: 'accounts/123/locations/456/reviews/review-1',
    reviewed_at: '2026-07-20T03:00:00Z',
    updated_at: '2026-07-20T03:01:00Z',
    reviewer_profile_photo_url: null,
    metadata: {
      source: 'google_business_profile',
      star_rating: 'FOUR',
      has_owner_reply: false,
    },
  });
});

test('keeps rating-only Google reviews importable without inventing review text', () => {
  const row = googleReviewToInsertRow('client-id', {
    reviewId: 'rating-only',
    starRating: 'FIVE',
  });

  assert.equal(row?.text, '5-star Google review with no written comment.');
});
