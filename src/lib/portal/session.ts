import 'server-only';
import { cookies } from 'next/headers';
import {
  portalLoginKey,
  portalSessionToken,
  verifyPortalLoginKey,
  verifyPortalSessionToken,
} from './token';

export const PORTAL_COOKIE = 'forge_portal';
export const PORTAL_COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

// The portal signs with a dedicated secret when set, otherwise falls back to the
// operator password so it works out of the box. Rotating either invalidates every
// outstanding portal link/session (the current, coarse revocation mechanism).
export function portalSecret(): string | null {
  return process.env.FORGE_PORTAL_SECRET || process.env.FORGE_ADMIN_PASSWORD || null;
}

export function isPortalConfigured(): boolean {
  return Boolean(portalSecret());
}

// Operator-facing: the unguessable key to embed in a client's portal login link.
export function clientPortalLoginKey(clientId: string): string | null {
  const secret = portalSecret();
  return secret ? portalLoginKey(clientId, secret) : null;
}

// Login route: verify the key from the link, returning the client id it grants.
export function verifyLoginKey(clientId: string | null, key: string | null): string | null {
  const secret = portalSecret();
  return secret ? verifyPortalLoginKey(clientId, key, secret) : null;
}

// Login route: the session cookie value to set for a verified client.
export function newSessionCookieValue(clientId: string): string | null {
  const secret = portalSecret();
  return secret ? portalSessionToken(clientId, secret) : null;
}

// Read the current portal client id from the (verified) session cookie, or null.
export async function getPortalClientId(): Promise<string | null> {
  const secret = portalSecret();
  if (!secret) return null;
  const token = (await cookies()).get(PORTAL_COOKIE)?.value;
  return verifyPortalSessionToken(token, secret);
}

export async function clearPortalSession(): Promise<void> {
  (await cookies()).delete(PORTAL_COOKIE);
}
