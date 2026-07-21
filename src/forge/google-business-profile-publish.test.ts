import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildReviewReplyResourceName,
  evaluateReplyPublishable,
  parseReviewReplyResponse,
} from './data/google-business-profile-mapping';

test('buildReviewReplyResourceName prefers a valid stored resource name', () => {
  assert.equal(
    buildReviewReplyResourceName({
      externalReviewName: 'accounts/111/locations/222/reviews/abc',
      accountId: null,
      locationId: null,
      externalReviewId: null,
    }),
    'accounts/111/locations/222/reviews/abc',
  );
});

test('buildReviewReplyResourceName reconstructs from config + id when the name is absent', () => {
  assert.equal(
    buildReviewReplyResourceName({
      externalReviewName: null,
      accountId: 'accounts/111',
      locationId: 'locations/222',
      externalReviewId: 'abc',
    }),
    'accounts/111/locations/222/reviews/abc',
  );
});

test('buildReviewReplyResourceName returns null when it cannot form a valid name', () => {
  assert.equal(
    buildReviewReplyResourceName({ externalReviewName: 'not-a-resource', accountId: null, locationId: null, externalReviewId: 'abc' }),
    null,
  );
});

test('parseReviewReplyResponse extracts comment + updateTime and rejects malformed payloads', () => {
  assert.deepEqual(parseReviewReplyResponse({ comment: 'Thanks!', updateTime: '2026-01-01T00:00:00Z' }), {
    comment: 'Thanks!',
    updateTime: '2026-01-01T00:00:00Z',
  });
  assert.deepEqual(parseReviewReplyResponse({ comment: 'Thanks!' }), { comment: 'Thanks!', updateTime: null });
  assert.equal(parseReviewReplyResponse({}), null);
  assert.equal(parseReviewReplyResponse(null), null);
});

test('evaluateReplyPublishable fails closed on every disqualifying condition', () => {
  assert.equal(evaluateReplyPublishable({ platform: 'yelp', status: 'drafted', draftReply: 'ok', bannedPhrases: [] }).ok, false);
  assert.equal(evaluateReplyPublishable({ platform: 'google', status: 'new', draftReply: 'ok', bannedPhrases: [] }).ok, false);
  assert.equal(evaluateReplyPublishable({ platform: 'google', status: 'drafted', draftReply: '   ', bannedPhrases: [] }).ok, false);

  const banned = evaluateReplyPublishable({
    platform: 'google',
    status: 'drafted',
    draftReply: 'We are a game-changer',
    bannedPhrases: ['game-changer'],
  });
  assert.equal(banned.ok, false);
  assert.equal(banned.ok === false && banned.code, 'compliance');
});

test('evaluateReplyPublishable accepts a clean drafted Google reply', () => {
  assert.deepEqual(
    evaluateReplyPublishable({
      platform: 'google',
      status: 'drafted',
      draftReply: 'Thanks so much for visiting — we appreciate it!',
      bannedPhrases: ['game-changer'],
    }),
    { ok: true },
  );
});
