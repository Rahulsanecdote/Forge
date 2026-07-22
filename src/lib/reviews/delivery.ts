import 'server-only';
import { env } from '@/env';
import { buildReviewRequestSubject } from './request-message';
import type { ReviewChannel } from './recipients';

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
}

function boundError(value: unknown): string {
  const text = value instanceof Error ? value.message : String(value);
  return text.length > 300 ? `${text.slice(0, 300)}...` : text;
}

async function readErrorBody(response: Response): Promise<string> {
  const text = await response.text().catch(() => '');
  return text.length > 300 ? `${text.slice(0, 300)}...` : text;
}

async function sendEmail(to: string, businessName: string, message: string): Promise<DeliveryResult> {
  const apiKey = env.RESEND_API_KEY?.trim();
  const from = env.FORGE_REVIEW_FROM_EMAIL?.trim();
  if (!apiKey || !from) {
    return { status: 'skipped', error: 'Email not configured (RESEND_API_KEY / FORGE_REVIEW_FROM_EMAIL).' };
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        from,
        to: [to],
        subject: buildReviewRequestSubject(businessName),
        text: message,
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
  const sid = env.TWILIO_ACCOUNT_SID?.trim();
  const token = env.TWILIO_AUTH_TOKEN?.trim();
  const from = env.TWILIO_FROM_NUMBER?.trim();
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
  if (input.channel === 'email') return sendEmail(contact, input.businessName, input.message);
  if (input.channel === 'sms') return sendSms(contact, input.message);
  return { status: 'skipped' };
}
