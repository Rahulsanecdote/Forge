import { recordOptOut } from '@/lib/reviews/optouts';
import { isStopKeyword, verifyTwilioSignature } from '@/lib/reviews/twilio-signature';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Twilio inbound-SMS webhook. Twilio already blocks a number that replies STOP at the
// carrier level; this syncs that opt-out into our own suppression list so the pre-send
// check also skips it. Verifies the Twilio signature (fail closed). Env-gated on the auth
// token. Returns empty TwiML so Twilio sends no auto-reply from here.

const EMPTY_TWIML = '<?xml version="1.0" encoding="UTF-8"?><Response></Response>';

function twiml(): Response {
  return new Response(EMPTY_TWIML, { status: 200, headers: { 'content-type': 'text/xml' } });
}

export async function POST(request: Request) {
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  if (!authToken) return new Response('SMS not configured.', { status: 503 });

  const raw = await request.text();
  const params: Record<string, string> = {};
  for (const [key, value] of new URLSearchParams(raw)) params[key] = value;

  // Twilio signs against the exact URL it was configured to call — the canonical public
  // app URL, not the internal proxied one.
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/$/, '');
  const url = base ? `${base}/api/twilio/inbound` : request.url;

  if (!verifyTwilioSignature(authToken, url, params, request.headers.get('x-twilio-signature'))) {
    return new Response('Invalid signature.', { status: 403 });
  }

  const from = params.From ?? '';
  const body = params.Body ?? '';
  if (from && isStopKeyword(body)) {
    await recordOptOut('sms', from, 'sms_stop');
  }
  return twiml();
}
