import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parsePortalSessionClientId,
  portalClientSecret,
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

test('bumping the per-client key version revokes only that client (login key + session)', () => {
  const v1 = portalClientSecret(secret, clientId, 1);
  const v2 = portalClientSecret(secret, clientId, 2);
  assert.notEqual(v1, v2);

  // A link/session issued under version 1 no longer verifies once the version is bumped.
  const keyV1 = portalLoginKey(clientId, v1);
  const sessionV1 = portalSessionToken(clientId, v1);
  assert.equal(verifyPortalLoginKey(clientId, keyV1, v1), clientId);
  assert.equal(verifyPortalLoginKey(clientId, keyV1, v2), null);
  assert.equal(verifyPortalSessionToken(sessionV1, v1), clientId);
  assert.equal(verifyPortalSessionToken(sessionV1, v2), null);

  // Another client's derived secret is independent — revoking one doesn't touch the other.
  const other = '00000000-0000-0000-0000-000000000000';
  assert.notEqual(portalClientSecret(secret, other, 1), v1);
});

test('parsePortalSessionClientId extracts the id without verifying, and rejects junk', () => {
  const token = portalSessionToken(clientId, portalClientSecret(secret, clientId, 1));
  assert.equal(parsePortalSessionClientId(token), clientId);
  assert.equal(parsePortalSessionClientId('v1.only-two'), null);
  assert.equal(parsePortalSessionClientId('v2.abc.sig'), null); // wrong version prefix
  assert.equal(parsePortalSessionClientId(null), null);
});
