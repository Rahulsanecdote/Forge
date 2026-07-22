import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRecipients, normalizePhone } from './recipients';

test('parses name + email into an email recipient', () => {
  const [r] = parseRecipients('Sarah Whitfield, sarah@example.com');
  assert.equal(r.name, 'Sarah Whitfield');
  assert.equal(r.contact, 'sarah@example.com');
  assert.equal(r.channel, 'email');
});

test('parses name + phone into an sms recipient with a normalized number', () => {
  const [r] = parseRecipients('Marcus Bell, +1 (205) 555-1234');
  assert.equal(r.name, 'Marcus Bell');
  assert.equal(r.contact, '+12055551234');
  assert.equal(r.channel, 'sms');
});

test('a name with no contact is a manual recipient', () => {
  const [r] = parseRecipients('Priya Nair');
  assert.equal(r.name, 'Priya Nair');
  assert.equal(r.contact, null);
  assert.equal(r.channel, 'manual');
});

test('handles contact-first order and a bare email', () => {
  const [first, second] = parseRecipients('jordan@shop.com, Jordan Lee\nlee@x.io');
  assert.equal(first.name, 'Jordan Lee');
  assert.equal(first.contact, 'jordan@shop.com');
  assert.equal(first.channel, 'email');
  assert.equal(second.name, null);
  assert.equal(second.contact, 'lee@x.io');
  assert.equal(second.channel, 'email');
});

test('skips blank lines and preserves order', () => {
  const rs = parseRecipients('A, a@x.com\n\n   \nB');
  assert.equal(rs.length, 2);
  assert.equal(rs[0].name, 'A');
  assert.equal(rs[1].name, 'B');
});

test('does not mistake a short number-containing name for a phone', () => {
  const [r] = parseRecipients('Room 12 Cafe');
  assert.equal(r.channel, 'manual');
  assert.equal(r.name, 'Room 12 Cafe');
});

test('normalizePhone keeps a leading + and strips separators', () => {
  assert.equal(normalizePhone('+1 (205) 555-1234'), '+12055551234');
  assert.equal(normalizePhone('205.555.1234'), '2055551234');
});
