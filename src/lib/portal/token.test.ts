import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  portalLoginKey,
  portalSessionToken,
  verifyPortalLoginKey,
  verifyPortalSessionToken,
} from './token';

const secret = 'super-secret-portal-key';
const clientId = '8113b849-78ff-4cc4-86cc-d2cc9908a30d';

test('a login key round-trips and is client-bound', () => {
  const key = portalLoginKey(clientId, secret);
  assert.equal(verifyPortalLoginKey(clientId, key, secret), clientId);
  // Wrong client id must not verify against another client's key.
  assert.equal(verifyPortalLoginKey('00000000-0000-0000-0000-000000000000', key, secret), null);
  // Tampered key rejected.
  assert.equal(verifyPortalLoginKey(clientId, `${key}0`, secret), null);
  // Different secret rejected.
  assert.equal(verifyPortalLoginKey(clientId, key, 'other-secret'), null);
  assert.equal(verifyPortalLoginKey(null, key, secret), null);
  assert.equal(verifyPortalLoginKey(clientId, null, secret), null);
});

test('a session token round-trips and rejects forgery', () => {
  const token = portalSessionToken(clientId, secret);
  assert.equal(verifyPortalSessionToken(token, secret), clientId);
  assert.equal(verifyPortalSessionToken(token, 'other-secret'), null);
  assert.equal(verifyPortalSessionToken(null, secret), null);
  assert.equal(verifyPortalSessionToken('garbage', secret), null);
  assert.equal(verifyPortalSessionToken('v1.only-two', secret), null);
});

test('a forged session (swapped client id, kept hmac) is rejected', () => {
  const token = portalSessionToken(clientId, secret);
  const [version, , sig] = token.split('.');
  const forged = `${version}.11111111-1111-1111-1111-111111111111.${sig}`;
  assert.equal(verifyPortalSessionToken(forged, secret), null);
});

test('login key and session token are distinct (no cross-use)', () => {
  const key = portalLoginKey(clientId, secret);
  const session = portalSessionToken(clientId, secret);
  assert.notEqual(key, session);
  // The raw login key is not a valid session token.
  assert.equal(verifyPortalSessionToken(key, secret), null);
});
