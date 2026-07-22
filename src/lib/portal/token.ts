import { createHmac, timingSafeEqual } from 'node:crypto';

// Pure HMAC helpers for the read-only client portal. No env/IO, so the token logic
// is unit-testable. The portal reuses Forge's custom-cookie auth model (like the
// operator portal): a client's identity is bound with an HMAC over a server secret,
// so a session cookie or login key cannot be forged or guessed.

const SESSION_VERSION = 'v1';

function hmacHex(secret: string, message: string): string {
  return createHmac('sha256', secret).update(message).digest('hex');
}

function safeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a), Buffer.from(b));
  } catch {
    return false;
  }
}

// The unguessable key placed in a client's portal login link. An operator shares
// `/portal/login?c=<clientId>&k=<key>`; possession of the link grants read-only
// access to exactly that client.
export function portalLoginKey(clientId: string, secret: string): string {
  return hmacHex(secret, `forge-portal-key:${clientId}`);
}

export function verifyPortalLoginKey(
  clientId: string | null | undefined,
  key: string | null | undefined,
  secret: string,
): string | null {
  if (!clientId || !key) return null;
  return safeEqualHex(key, portalLoginKey(clientId, secret)) ? clientId : null;
}

// The session cookie value: `v1.<clientId>.<hmac>`. Client ids are UUIDs (no dots),
// so the three-part split is unambiguous.
export function portalSessionToken(clientId: string, secret: string): string {
  return `${SESSION_VERSION}.${clientId}.${hmacHex(secret, `forge-portal-session:${clientId}`)}`;
}

export function verifyPortalSessionToken(
  token: string | null | undefined,
  secret: string,
): string | null {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== SESSION_VERSION) return null;
  const clientId = parts[1];
  if (!clientId) return null;
  const expected = hmacHex(secret, `forge-portal-session:${clientId}`);
  return safeEqualHex(parts[2], expected) ? clientId : null;
}
