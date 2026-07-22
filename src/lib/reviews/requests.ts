import 'server-only';
import { randomBytes } from 'node:crypto';
import { getAdminSupabase } from '@/lib/admin/data';
import { buildReviewRequestMessage } from './request-message';

// Review-generation data layer. An operator generates click-tracked review-request
// links for a client's customers; each link redirects to the client's public Google
// review URL and records the click. Service-role reads/writes (operator surface).

export const MAX_REVIEW_REQUESTS_PER_BATCH = 100;

export interface ReviewRequestItem {
  id: string;
  customerName: string | null;
  status: 'created' | 'clicked';
  link: string;
  message: string;
  createdAt: string | null;
  clickedAt: string | null;
}

export interface ReviewRequestSummary {
  items: ReviewRequestItem[];
  stats: { total: number; clicked: number };
  reviewUrl: string | null;
}

export type CreateReviewRequestsResult =
  | { ok: true; created: number }
  | { ok: false; code: 'no_url' | 'no_names' | 'error' };

function appBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/$/, '');
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

// Create one review request per customer name. Fails closed when the client has no
// Google review URL configured (nowhere to send people) or the name list is empty.
export async function createReviewRequests(
  clientId: string,
  names: string[],
): Promise<CreateReviewRequestsResult> {
  const cleaned = names.map((n) => n.trim()).filter(Boolean).slice(0, MAX_REVIEW_REQUESTS_PER_BATCH);
  // Allow a single anonymous request (no name) so an operator can mint a generic link.
  const entries = cleaned.length > 0 ? cleaned : names.length === 0 ? [] : [''];
  if (entries.length === 0 && names.length > 0) return { ok: false, code: 'no_names' };

  const client = await loadReviewClient(clientId);
  const reviewUrl = client?.google_review_url?.trim();
  if (!client || !reviewUrl) return { ok: false, code: 'no_url' };

  const rows = (entries.length > 0 ? entries : ['']).map((name) => ({
    client_id: clientId,
    customer_name: name || null,
    token: newToken(),
    target_url: reviewUrl,
    status: 'created' as const,
  }));

  const { error } = await getAdminSupabase().from('review_requests').insert(rows);
  if (error) return { ok: false, code: 'error' };
  return { ok: true, created: rows.length };
}

export async function loadReviewRequestSummary(clientId: string): Promise<ReviewRequestSummary> {
  const client = await loadReviewClient(clientId);
  const { data } = await getAdminSupabase()
    .from('review_requests')
    .select('id, customer_name, token, status, created_at, clicked_at')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })
    .limit(50);

  const rows = (data ?? []) as Array<{
    id: string;
    customer_name: string | null;
    token: string;
    status: 'created' | 'clicked';
    created_at: string | null;
    clicked_at: string | null;
  }>;

  const businessName = client?.name ?? 'us';
  const items: ReviewRequestItem[] = rows.map((row) => {
    const link = reviewLink(row.token);
    return {
      id: row.id,
      customerName: row.customer_name,
      status: row.status,
      link,
      message: buildReviewRequestMessage({ businessName, reviewUrl: link, customerName: row.customer_name }),
      createdAt: row.created_at,
      clickedAt: row.clicked_at,
    };
  });

  return {
    items,
    stats: { total: items.length, clicked: items.filter((i) => i.status === 'clicked').length },
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
