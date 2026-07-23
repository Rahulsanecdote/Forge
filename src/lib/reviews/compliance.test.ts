import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeContact, optOutKey } from './contact';
import { appendEmailFooter, appendSmsOptOut } from './request-message';
import { expectedTwilioSignature, verifyTwilioSignature, isStopKeyword } from './twilio-signature';

test('normalizeContact lowercases email and E.164-normalizes phone', () => {
  assert.equal(normalizeContact('email', '  Sam@Example.COM '), 'sam@example.com');
  assert.equal(normalizeContact('sms', '+1 (205) 555-1234'), '+12055551234');
});

test('optOutKey is stable across formatting differences', () => {
  assert.equal(optOutKey('email', 'A@B.com'), optOutKey('email', 'a@b.com '));
  assert.equal(optOutKey('sms', '+1 205 555 1234'), optOutKey('sms', '+12055551234'));
});

test('appendSmsOptOut adds a STOP disclosure', () => {
  assert.match(appendSmsOptOut('Please review us: https://x/r/abc'), /Reply STOP to opt out\.$/);
});

test('appendEmailFooter includes an unsubscribe link and, when set, the mailing address', () => {
  const withAddr = appendEmailFooter('Body here', {
    businessName: 'Unchained Coffee',
    unsubscribeUrl: 'https://x/u/tok',
    mailingAddress: '123 Main St, Trussville AL',
  });
  assert.match(withAddr, /Unsubscribe: https:\/\/x\/u\/tok/);
  assert.match(withAddr, /Unchained Coffee/);
  assert.match(withAddr, /123 Main St, Trussville AL/);

  const noAddr = appendEmailFooter('Body', {
    businessName: 'Acme',
    unsubscribeUrl: 'https://x/u/t',
  });
  assert.match(noAddr, /Unsubscribe: https:\/\/x\/u\/t/);
  assert.doesNotMatch(noAddr, /Main St/);
});

test('isStopKeyword recognizes the standard opt-out words, first-word only', () => {
  for (const w of ['STOP', 'stop', 'Unsubscribe', 'cancel', 'QUIT', 'end']) {
    assert.equal(isStopKeyword(w), true, w);
  }
  assert.equal(isStopKeyword('stop please'), true);
  assert.equal(isStopKeyword('please stop'), false); // must be the first word
  assert.equal(isStopKeyword('thanks!'), false);
});

test('verifyTwilioSignature matches a signature built the Twilio way and rejects tampering', () => {
  const token = 'test_auth_token';
  const url = 'https://forge.app/api/twilio/inbound';
  const params = { From: '+12055551234', Body: 'STOP', To: '+13334445555' };
  const sig = expectedTwilioSignature(token, url, params);

  assert.equal(verifyTwilioSignature(token, url, params, sig), true);
  assert.equal(verifyTwilioSignature(token, url, { ...params, Body: 'START' }, sig), false);
  assert.equal(verifyTwilioSignature('wrong_token', url, params, sig), false);
  assert.equal(verifyTwilioSignature(token, url, params, null), false);
});
