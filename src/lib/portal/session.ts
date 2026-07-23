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

// The signing secret used to mint NEW keys/sessions for a client (always the current
// version-derived secret), plus the set of secrets accepted when VERIFYING. To avoid
// logging everyone out on the first deploy of per-client versioning, links/sessions signed
// with the pre-versioning raw secret stay valid while the client is still at version 1;
// once the client is explicitly revoked (version > 1) only the derived secret is accepted.
async function clientSecrets(clientId: string): Promise<{ sign: string; verify: string[] } | null> {
  const secret = portalSecret();
  if (!secret) return null;
  const version = await loadPortalKeyVersion(clientId);
  if (version === null) return null;
  const derived = portalClientSecret(secret, clientId, version);
  return { sign: derived, verify: version === 1 ? [derived, secret] : [derived] };
}

// Operator-facing: the unguessable key to embed in a client's portal login link.
export async function clientPortalLoginKey(clientId: string): Promise<string | null> {
  const secrets = await clientSecrets(clientId);
  return secrets ? portalLoginKey(clientId, secrets.sign) : null;
}

// Login route: verify the key from the link, returning the client id it grants.
export async function verifyLoginKey(
  clientId: string | null,
  key: string | null,
): Promise<string | null> {
  if (!clientId) return null;
  const secrets = await clientSecrets(clientId);
  if (!secrets) return null;
  for (const secret of secrets.verify) {
    if (verifyPortalLoginKey(clientId, key, secret)) return clientId;
  }
  return null;
}

// Login route: the session cookie value to set for a verified client.
export async function newSessionCookieValue(clientId: string): Promise<string | null> {
  const secrets = await clientSecrets(clientId);
  return secrets ? portalSessionToken(clientId, secrets.sign) : null;
}

// Read the current portal client id from the (verified) session cookie, or null. The
// client id is parsed from the cookie first (unverified) only to load that client's key
// version; the HMAC is then verified against the version-derived secret (and, at version 1,
// the legacy raw secret), so a revoked (version-bumped) session no longer validates.
export async function getPortalClientId(): Promise<string | null> {
  const token = (await cookies()).get(PORTAL_COOKIE)?.value;
  const clientId = parsePortalSessionClientId(token);
  if (!clientId) return null;
  const secrets = await clientSecrets(clientId);
  if (!secrets) return null;
  for (const secret of secrets.verify) {
    if (verifyPortalSessionToken(token, secret) === clientId) return clientId;
  }
  return null;
}

export async function clearPortalSession(): Promise<void> {
  (await cookies()).delete(PORTAL_COOKIE);
}
