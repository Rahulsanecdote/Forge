import 'server-only';
import { getAdminSupabase } from '@/lib/admin/data';
import { normalizeContact, optOutKey } from './contact';
import type { ReviewChannel } from './recipients';

// Suppression-list data layer (service role). One opt-out suppresses a (channel, contact)
// across every client this Forge instance sends for.

export type OptOutReason = 'email_unsubscribe' | 'sms_stop' | 'manual';

// Return the set of optOutKey()s that are suppressed, for the given (channel, contact)
// pairs — so a caller can filter a batch before sending.
export async function loadSuppressed(
  pairs: Array<{ channel: ReviewChannel; contact: string }>,
): Promise<Set<string>> {
  const relevant = pairs.filter((p) => p.channel === 'email' || p.channel === 'sms');
  if (relevant.length === 0) return new Set();

  const contacts = Array.from(new Set(relevant.map((p) => normalizeContact(p.channel, p.contact))));
  const { data, error } = await getAdminSupabase()
    .from('review_optouts')
    .select('channel, contact')
    .in('contact', contacts);
  // Fail closed: if we can't read the suppression list we must not assume "no opt-outs".
  // The caller treats a throw as "couldn't verify" and skips the send rather than risking
  // contacting someone who opted out.
  if (error) throw new Error(`Could not load opt-outs: ${error.message}`);

  const suppressed = new Set<string>();
  for (const row of (data ?? []) as Array<{ channel: ReviewChannel; contact: string }>) {
    suppressed.add(`${row.channel}|${row.contact}`);
  }
  return suppressed;
}

// Idempotently record an opt-out (unique on channel+contact).
export async function recordOptOut(
  channel: ReviewChannel,
  contact: string,
  reason: OptOutReason,
): Promise<boolean> {
  if (channel !== 'email' && channel !== 'sms') return false;
  const normalized = normalizeContact(channel, contact);
  if (!normalized) return false;
  const { error } = await getAdminSupabase()
    .from('review_optouts')
    .upsert({ channel, contact: normalized, reason }, { onConflict: 'channel,contact' });
  return !error;
}

export interface OptOutByTokenResult {
  ok: boolean;
  businessName: string | null;
}

// Resolve a review-request token to its (channel, contact) and record the opt-out. Used by
// the email unsubscribe link. Manual requests (no deliverable contact) can't be opted out.
export async function optOutByToken(token: string): Promise<OptOutByTokenResult> {
  if (!token || token.length > 128) return { ok: false, businessName: null };
  const { data } = await getAdminSupabase()
    .from('review_requests')
    .select('channel, contact, clients(name)')
    .eq('token', token)
    .maybeSingle();

  const row = data as
    | { channel: ReviewChannel; contact: string | null; clients: { name: string } | { name: string }[] | null }
    | null;
  if (!row || !row.contact || (row.channel !== 'email' && row.channel !== 'sms')) {
    return { ok: false, businessName: null };
  }
  const clientRel = Array.isArray(row.clients) ? row.clients[0] : row.clients;
  const ok = await recordOptOut(row.channel, row.contact, 'email_unsubscribe');
  return { ok, businessName: clientRel?.name ?? null };
}

export { optOutKey };
