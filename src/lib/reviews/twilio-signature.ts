import { createHmac, timingSafeEqual } from 'node:crypto';

// Twilio request-signature verification. Pure (no server-only/env) so it's unit-testable.
// Twilio signs webhooks as: base64( HMAC-SHA1( authToken, fullUrl + concat(sortedParams) ) )
// where params are the POST body fields sorted by key, each appended as `${key}${value}`.
// See Twilio "Validating Signatures".
export function expectedTwilioSignature(
  authToken: string,
  url: string,
  params: Record<string, string>,
): string {
  const sorted = Object.keys(params).sort();
  let data = url;
  for (const key of sorted) data += key + params[key];
  return createHmac('sha1', authToken).update(Buffer.from(data, 'utf-8')).digest('base64');
}

export function verifyTwilioSignature(
  authToken: string,
  url: string,
  params: Record<string, string>,
  signature: string | null,
): boolean {
  if (!signature) return false;
  const expected = expectedTwilioSignature(authToken, url, params);
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}

// Twilio-recognized opt-out keywords (first word of the inbound body, case-insensitive).
const STOP_WORDS = new Set(['stop', 'stopall', 'unsubscribe', 'cancel', 'end', 'quit']);

export function isStopKeyword(body: string): boolean {
  const first = body.trim().toLowerCase().split(/\s+/)[0] ?? '';
  return STOP_WORDS.has(first);
}
