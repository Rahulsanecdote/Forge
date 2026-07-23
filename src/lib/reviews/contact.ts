import { normalizePhone } from './recipients';
import type { ReviewChannel } from './recipients';

// Pure contact normalization so the suppression list keys consistently regardless of how
// an address was typed. Email → trimmed + lowercased; SMS → E.164-ish digits (reusing the
// recipient parser's normalizer). No env/IO so it's unit-testable.

export function normalizeContact(channel: ReviewChannel, contact: string): string {
  const trimmed = contact.trim();
  if (channel === 'email') return trimmed.toLowerCase();
  if (channel === 'sms') return normalizePhone(trimmed);
  return trimmed;
}

// Stable key for a (channel, contact) pair — used to dedupe against the suppression set.
export function optOutKey(channel: ReviewChannel, contact: string): string {
  return `${channel}|${normalizeContact(channel, contact)}`;
}
