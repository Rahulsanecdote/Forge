import 'server-only';
import { cookies } from 'next/headers';
import { getAdminSupabase } from '@/lib/admin/data';
import {
  parsePortalSessionClientId,
  portalClientSecret,
  portalLoginKey,
  portalSessionToken,
  verifyPortalLoginKey,
  verifyPortalSessionToken,
} from './token';

export const PORTAL_COOKIE = 'forge_portal';
export const PORTAL_COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

// The portal signs with a dedicated secret when set, otherwise falls back to the
// operator password so it works out of the box. Rotating either invalidates every
// outstanding portal link/session (the global kill switch); per-client revocation is
// layered on top via each client's `portal_key_version`.
export function portalSecret(): string | null {
  return process.env.FORGE_PORTAL_SECRET || process.env.FORGE_ADMIN_PASSWORD || null;
}

export function isPortalConfigured(): boolean {
  return Boolean(portalSecret());
}

// The client's current portal key version — the per-client half of the signing secret.
// Bumping it (via the operator's Revoke action) invalidates that client's links/sessions.
// Missing client → null (no access). Pre-migration (column absent) → 1, so the portal
// keeps working until the migration is applied.
async function loadPortalKeyVersion(clientId: string): Promise<number | null> {
  try {
    const { data, error } = await getAdminSupabase()
      .from('clients')
      .select('portal_key_version')
      .eq('id', clientId)
      .maybeSingle();
    if (error) return /portal_key_version/i.test(error.message) ? 1 : null;
    if (!data) return null;
    return (data as { portal_key_version?: number }).portal_key_version ?? 1;
  } catch {
    return null;
  }
}

// The version-derived signing secret for a client, or null when the portal is
// unconfigured or the client can't be resolved.
async function clientSecret(clientId: string): Promise<string | null> {
  const secret = portalSecret();
  if (!secret) return null;
  const version = await loadPortalKeyVersion(clientId);
  if (version === null) return null;
  return portalClientSecret(secret, clientId, version);
}

// Operator-facing: the unguessable key to embed in a client's portal login link.
export async function clientPortalLoginKey(clientId: string): Promise<string | null> {
  const secret = await clientSecret(clientId);
  return secret ? portalLoginKey(clientId, secret) : null;
}

// Login route: verify the key from the link, returning the client id it grants.
export async function verifyLoginKey(
  clientId: string | null,
  key: string | null,
): Promise<string | null> {
  if (!clientId) return null;
  const secret = await clientSecret(clientId);
  return secret ? verifyPortalLoginKey(clientId, key, secret) : null;
}

// Login route: the session cookie value to set for a verified client.
export async function newSessionCookieValue(clientId: string): Promise<string | null> {
  const secret = await clientSecret(clientId);
  return secret ? portalSessionToken(clientId, secret) : null;
}

// Read the current portal client id from the (verified) session cookie, or null. The
// client id is parsed from the cookie first (unverified) only to load that client's key
// version; the HMAC is then verified against the version-derived secret, so a revoked
// (version-bumped) session no longer validates.
export async function getPortalClientId(): Promise<string | null> {
  const token = (await cookies()).get(PORTAL_COOKIE)?.value;
  const clientId = parsePortalSessionClientId(token);
  if (!clientId) return null;
  const secret = await clientSecret(clientId);
  return secret ? verifyPortalSessionToken(token, secret) : null;
}

export async function clearPortalSession(): Promise<void> {
  (await cookies()).delete(PORTAL_COOKIE);
}
