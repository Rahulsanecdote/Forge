import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildReviewRequestMessage, buildReviewRequestSubject } from './request-message';

const url = 'https://forge.app/r/abc123';

test('includes business name, review url, and a first-name greeting', () => {
  const msg = buildReviewRequestMessage({
    businessName: 'Unchained Coffee',
    reviewUrl: url,
    customerName: 'Sam Rivera',
  });
  assert.match(msg, /^Hi Sam,/);
  assert.match(msg, /Unchained Coffee/);
  assert.ok(msg.includes(url));
});

test('falls back to a neutral greeting without a name', () => {
  const msg = buildReviewRequestMessage({ businessName: 'Acme', reviewUrl: url });
  assert.match(msg, /^Hi there,/);
  assert.match(msg, /Acme/);
  assert.ok(msg.includes(url));

  const blank = buildReviewRequestMessage({ businessName: 'Acme', reviewUrl: url, customerName: '   ' });
  assert.match(blank, /^Hi there,/);
});

test('uses only the first name from a full name', () => {
  const msg = buildReviewRequestMessage({
    businessName: 'Acme',
    reviewUrl: url,
    customerName: 'Dr. Jane Q. Public',
  });
  assert.match(msg, /^Hi Dr\.,/);
});

test('email subject names the business', () => {
  assert.equal(
    buildReviewRequestSubject('Unchained Coffee Co.'),
    'A quick favor — would you review Unchained Coffee Co.?',
  );
  assert.match(buildReviewRequestSubject('   '), /review us\?$/);
});
