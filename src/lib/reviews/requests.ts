import 'server-only';
import { randomBytes } from 'node:crypto';
import { getAdminSupabase } from '@/lib/admin/data';
import { buildReviewRequestMessage } from './request-message';
import { deliverReviewRequest } from './delivery';
import type { ReviewChannel, ReviewRecipient } from './recipients';

// Review-generation data layer. An operator generates click-tracked review-request
// links for a client's customers; each link redirects to the client's public Google
// review URL and records the click. When a customer's email/phone is supplied and a
// delivery provider is configured, Forge also sends the request for them (email/SMS),
// otherwise the request is created as a manual link to copy. Service-role reads/writes.

export const MAX_REVIEW_REQUESTS_PER_BATCH = 100;

export type SendStatus = 'pending' | 'sent' | 'failed' | 'skipped';

export interface ReviewRequestItem {
  id: string;
  customerName: string | null;
  status: 'created' | 'clicked';
  channel: ReviewChannel;
  contact: string | null;
  sendStatus: SendStatus;
  deliveryError: string | null;
  link: string;
  message: string;
  createdAt: string | null;
  clickedAt: string | null;
  sentAt: string | null;
}

export interface ReviewRequestSummary {
  items: ReviewRequestItem[];
  stats: { total: number; clicked: number; sent: number; manual: number };
  reviewUrl: string | null;
}

export type CreateReviewRequestsResult =
  | { ok: true; created: number; sent: number; failed: number; manual: number }
  | { ok: false; code: 'no_url' | 'no_names' | 'error' };

function appBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/$/, '');
}

// Automated delivery is only safe when the review link is a fully-qualified public URL —
// otherwise recipients receive an unresolvable `/r/<token>` and the row would be marked
// sent. When the base URL isn't absolute, we fall back to manual so the operator notices.
function hasAbsoluteAppUrl(): boolean {
  return /^https?:\/\//i.test(appBaseUrl());
}

function reviewLink(token: string): string {
  return `${appBaseUrl()}/r/${token}`;
}

function newToken(): string {
  return randomBytes(18).toString('base64url');
}

async function loadReviewClient(clientId: string) {
  const { data } = await getAdminSupabase()
    .from('clients')
    .select('id, name, google_review_url')
    .eq('id', clientId)
    .maybeSingle();
  return data as { id: string; name: string; google_review_url: string | null } | null;
}

// Create one review request per recipient, then best-effort deliver each one that has a
// contact + configured provider. Fails closed when the client has no Google review URL
// configured (nowhere to send people). An empty list mints a single generic manual link.
export async function createReviewRequests(
  clientId: string,
  recipients: ReviewRecipient[],
): Promise<CreateReviewRequestsResult> {
  const trimmed = recipients.slice(0, MAX_REVIEW_REQUESTS_PER_BATCH);
  // Allow a single anonymous request so an operator can mint a generic link.
  const entries: ReviewRecipient[] =
    trimmed.length > 0 ? trimmed : [{ name: null, contact: null, channel: 'manual' }];

  const client = await loadReviewClient(clientId);
  const reviewUrl = client?.google_review_url?.trim();
  if (!client || !reviewUrl) return { ok: false, code: 'no_url' };
  const businessName = client.name ?? 'us';

  const rows = entries.map((recipient) => {
    const token = newToken();
    return {
      client_id: clientId,
      customer_name: recipient.name,
      token,
      target_url: reviewUrl,
      status: 'created' as const,
      channel: recipient.channel,
      contact: recipient.contact,
      send_status: 'pending' as const,
      message: buildReviewRequestMessage({
        businessName,
        reviewUrl: reviewLink(token),
        customerName: recipient.name,
      }),
    };
  });

  // Persist the rows first (without the transient `message`) so the links exist even if
  // delivery fails midway.
  const inserted = rows.map(({ message: _message, ...row }) => row);
  const { error } = await getAdminSupabase().from('review_requests').insert(inserted);
  if (error) return { ok: false, code: 'error' };

  const canDeliver = hasAbsoluteAppUrl();
  let sent = 0;
  let failed = 0;
  let manual = 0;
  for (const row of rows) {
    if (row.channel === 'manual' || !row.contact || !canDeliver) {
      manual += 1;
      // Explain why an otherwise-deliverable request stayed manual, so the operator knows
      // to copy the link rather than assume it was sent.
      const skipReason =
        !canDeliver && row.channel !== 'manual' && row.contact
          ? 'App URL not configured (NEXT_PUBLIC_APP_URL) — copy the link and send manually.'
          : null;
      await getAdminSupabase()
        .from('review_requests')
        .update({ send_status: 'skipped', delivery_error: skipReason })
        .eq('token', row.token);
      continue;
    }
    const result = await deliverReviewRequest({
      channel: row.channel,
      contact: row.contact,
      businessName,
      message: row.message,
    });
    if (result.status === 'sent') sent += 1;
    else if (result.status === 'failed') failed += 1;
    else manual += 1;
    await getAdminSupabase()
      .from('review_requests')
      .update({
        send_status: result.status,
        sent_at: result.status === 'sent' ? new Date().toISOString() : null,
        delivery_error: result.error ?? null,
      })
      .eq('token', row.token);
  }

  return { ok: true, created: rows.length, sent, failed, manual };
}

export async function loadReviewRequestSummary(clientId: string): Promise<ReviewRequestSummary> {
  const client = await loadReviewClient(clientId);
  const { data } = await getAdminSupabase()
    .from('review_requests')
    .select('id, customer_name, token, status, channel, contact, send_status, delivery_error, created_at, clicked_at, sent_at')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })
    .limit(50);

  const rows = (data ?? []) as Array<{
    id: string;
    customer_name: string | null;
    token: string;
    status: 'created' | 'clicked';
    channel: ReviewChannel | null;
    contact: string | null;
    send_status: SendStatus | null;
    delivery_error: string | null;
    created_at: string | null;
    clicked_at: string | null;
    sent_at: string | null;
  }>;

  const businessName = client?.name ?? 'us';
  const items: ReviewRequestItem[] = rows.map((row) => {
    const link = reviewLink(row.token);
    return {
      id: row.id,
      customerName: row.customer_name,
      status: row.status,
      channel: row.channel ?? 'manual',
      contact: row.contact,
      sendStatus: row.send_status ?? 'skipped',
      deliveryError: row.delivery_error,
      link,
      message: buildReviewRequestMessage({ businessName, reviewUrl: link, customerName: row.customer_name }),
      createdAt: row.created_at,
      clickedAt: row.clicked_at,
      sentAt: row.sent_at,
    };
  });

  return {
    items,
    stats: {
      total: items.length,
      clicked: items.filter((i) => i.status === 'clicked').length,
      sent: items.filter((i) => i.sendStatus === 'sent').length,
      manual: items.filter((i) => i.sendStatus !== 'sent').length,
    },
    reviewUrl: client?.google_review_url ?? null,
  };
}

// Public redirect target: mark the request clicked (once) and return where to send the
// visitor (the client's Google review URL), or null for an unknown token.
export async function recordReviewRequestClick(token: string): Promise<string | null> {
  if (!token || token.length > 128) return null;
  const supabase = getAdminSupabase();
  const { data } = await supabase
    .from('review_requests')
    .select('id, target_url, status')
    .eq('token', token)
    .maybeSingle();
  const row = data as { id: string; target_url: string; status: string } | null;
  if (!row) return null;

  if (row.status !== 'clicked') {
    await supabase
      .from('review_requests')
      .update({ status: 'clicked', clicked_at: new Date().toISOString() })
      .eq('id', row.id)
      .eq('status', 'created');
  }
  return row.target_url;
}
