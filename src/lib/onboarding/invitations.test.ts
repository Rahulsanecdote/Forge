import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createInvitationToken,
  hashInvitationToken,
  invitationTokenSchema,
  submissionFromFormData,
} from './invitations';

test('invitation tokens are URL-safe, random, and stored as hashes', () => {
  const first = createInvitationToken();
  const second = createInvitationToken();

  assert.equal(invitationTokenSchema.safeParse(first).success, true);
  assert.notEqual(first, second);
  assert.match(hashInvitationToken(first), /^[a-f0-9]{64}$/);
  assert.notEqual(hashInvitationToken(first), first);
});

test('requires a complete supervised-automation brief', () => {
  const form = new FormData();
  Object.entries({
    name: 'Unchained Coffee',
    website: 'https://unchainedcoffee.com',
    industry: 'Coffee Shop',
    locations: '1',
    about: 'Direct-trade specialty coffee.',
    audience: 'Home coffee enthusiasts.',
    geographic_market: 'United States',
    primary_goal: 'Increase online orders',
    primary_cta: 'Shop coffee',
    timezone: 'America/New_York',
    posting_frequency: '3 posts per week',
    tone: 'direct\npremium',
    services: 'Whole bean coffee\nSubscriptions',
    banned_phrases: 'best in the world',
  }).forEach(([key, value]) => form.set(key, value));

  const parsed = submissionFromFormData(form);
  assert.equal(parsed.success, true);
  if (parsed.success) assert.deepEqual(parsed.data.services, ['Whole bean coffee', 'Subscriptions']);

  form.delete('primary_goal');
  assert.equal(submissionFromFormData(form).success, false);
});
