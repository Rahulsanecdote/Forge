import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { constructWebhookEvent } from './webhook-signature';

const secret = 'whsec_test_secret';
const body = JSON.stringify({ id: 'evt_1', type: 'customer.subscription.updated' });
const t = 1_700_000_000;

function sign(payload: string, at: number, key = secret): string {
  const sig = createHmac('sha256', key).update(`${at}.${payload}`).digest('hex');
  return `t=${at},v1=${sig}`;
}

test('accepts a correctly-signed, in-tolerance event', () => {
  const event = constructWebhookEvent(body, sign(body, t), secret, 300, t);
  assert.equal((event as { id: string })?.id, 'evt_1');
});

test('rejects a tampered body', () => {
  assert.equal(constructWebhookEvent(`${body} `, sign(body, t), secret, 300, t), null);
});

test('rejects a wrong secret', () => {
  assert.equal(constructWebhookEvent(body, sign(body, t, 'whsec_other'), secret, 300, t), null);
});

test('rejects a timestamp outside tolerance', () => {
  assert.equal(constructWebhookEvent(body, sign(body, t), secret, 300, t + 1000), null);
});

test('rejects a missing or malformed signature header', () => {
  assert.equal(constructWebhookEvent(body, null, secret, 300, t), null);
  assert.equal(constructWebhookEvent(body, 'garbage', secret, 300, t), null);
});
