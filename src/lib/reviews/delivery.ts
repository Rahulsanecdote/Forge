import 'server-only';
import { buildReviewRequestSubject } from './request-message';
import type { ReviewChannel } from './recipients';

// Read provider config from process.env directly (lazy), matching the Supabase layer.
// Importing the validated `@/env` object here would eagerly evaluate that module during
// Next's build-time page-data collection, where it hard-exits without SUPABASE_* set.
function optionalEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value || undefined;
}

// Review-request delivery. Sends a review-request message to one customer over the
// channel implied by their contact — email via Resend, SMS via Twilio. Both providers
// are optional: when the matching env is missing (or the channel is 'manual') we return
// `skipped` so the request row is still created and the operator can send the link by
// hand. Provider errors are caught and returned as `failed` with a bounded reason — a
// send never throws, so one bad address can't sink a whole batch.

export type DeliveryStatus = 'sent' | 'failed' | 'skipped';

export interface DeliveryResult {
  status: DeliveryStatus;
  error?: string;
}

export interface DeliverInput {
  channel: ReviewChannel;
  contact: string | null;
  businessName: string;
  message: string;
  unsubscribeUrl?: string;
}

function boundError(value: unknown): string {
  const text = value instanceof Error ? value.message : String(value);
  return text.length > 300 ? `${text.slice(0, 300)}...` : text;
}

async function readErrorBody(response: Response): Promise<string> {
  const text = await response.text().catch(() => '');
  return text.length > 300 ? `${text.slice(0, 300)}...` : text;
}

async function sendEmail(
  to: string,
  businessName: string,
  message: string,
  unsubscribeUrl?: string,
): Promise<DeliveryResult> {
  const apiKey = optionalEnv('RESEND_API_KEY');
  const from = optionalEnv('FORGE_REVIEW_FROM_EMAIL');
  if (!apiKey || !from) {
    return { status: 'skipped', error: 'Email not configured (RESEND_API_KEY / FORGE_REVIEW_FROM_EMAIL).' };
  }

  // One-click unsubscribe (RFC 8058) in addition to the in-body link, so Gmail/Apple Mail
  // surface a native Unsubscribe control.
  const headers = unsubscribeUrl
    ? { 'List-Unsubscribe': `<${unsubscribeUrl}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' }
    : undefined;

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        from,
        to: [to],
        subject: buildReviewRequestSubject(businessName),
        text: message,
        ...(headers ? { headers } : {}),
      }),
    });
    if (!response.ok) {
      return { status: 'failed', error: `Resend ${response.status}: ${await readErrorBody(response)}` };
    }
    return { status: 'sent' };
  } catch (error) {
    return { status: 'failed', error: boundError(error) };
  }
}

async function sendSms(to: string, message: string): Promise<DeliveryResult> {
  const sid = optionalEnv('TWILIO_ACCOUNT_SID');
  const token = optionalEnv('TWILIO_AUTH_TOKEN');
  const from = optionalEnv('TWILIO_FROM_NUMBER');
  if (!sid || !token || !from) {
    return { status: 'skipped', error: 'SMS not configured (TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_FROM_NUMBER).' };
  }

  try {
    const body = new URLSearchParams({ To: to, From: from, Body: message });
    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`,
      {
        method: 'POST',
        headers: {
          authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`,
          'content-type': 'application/x-www-form-urlencoded',
        },
        body,
      },
    );
    if (!response.ok) {
      return { status: 'failed', error: `Twilio ${response.status}: ${await readErrorBody(response)}` };
    }
    return { status: 'sent' };
  } catch (error) {
    return { status: 'failed', error: boundError(error) };
  }
}

export async function deliverReviewRequest(input: DeliverInput): Promise<DeliveryResult> {
  const contact = input.contact?.trim();
  if (input.channel === 'manual' || !contact) {
    return { status: 'skipped' };
  }
  if (input.channel === 'email') {
    return sendEmail(contact, input.businessName, input.message, input.unsubscribeUrl);
  }
  if (input.channel === 'sms') return sendSms(contact, input.message);
  return { status: 'skipped' };
}
