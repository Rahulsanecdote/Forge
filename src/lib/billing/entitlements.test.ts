import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isDeliveryActive, mapStripeStatus, billingSummary } from './entitlements';

test('active and trialing entitle delivery; failing states do not', () => {
  assert.equal(isDeliveryActive({ subscriptionStatus: 'active' }), true);
  assert.equal(isDeliveryActive({ subscriptionStatus: 'trialing' }), true);
  assert.equal(isDeliveryActive({ subscriptionStatus: 'past_due' }), false);
  assert.equal(isDeliveryActive({ subscriptionStatus: 'canceled' }), false);
  assert.equal(isDeliveryActive({ subscriptionStatus: 'inactive' }), false);
  assert.equal(isDeliveryActive({ subscriptionStatus: null }), false);
});

test('operator override entitles delivery regardless of status', () => {
  assert.equal(isDeliveryActive({ subscriptionStatus: 'canceled', billingOverride: true }), true);
  assert.equal(isDeliveryActive({ subscriptionStatus: null, billingOverride: true }), true);
});

test('mapStripeStatus normalizes Stripe values, collapsing unpaid to past_due', () => {
  assert.equal(mapStripeStatus('active'), 'active');
  assert.equal(mapStripeStatus('trialing'), 'trialing');
  assert.equal(mapStripeStatus('unpaid'), 'past_due');
  assert.equal(mapStripeStatus('past_due'), 'past_due');
  assert.equal(mapStripeStatus('incomplete_expired'), 'incomplete');
  assert.equal(mapStripeStatus('something_new'), 'inactive');
});

test('billingSummary labels a comped client distinctly and reports active', () => {
  const comped = billingSummary({ subscriptionStatus: 'canceled', billingOverride: true });
  assert.equal(comped.active, true);
  assert.equal(comped.comped, true);
  assert.match(comped.label, /Comped/);

  const pastDue = billingSummary({ subscriptionStatus: 'past_due' });
  assert.equal(pastDue.active, false);
  assert.equal(pastDue.status, 'past_due');
  assert.equal(pastDue.label, 'Past due');

  const unknown = billingSummary({ subscriptionStatus: 'garbage' });
  assert.equal(unknown.status, 'inactive');
});
