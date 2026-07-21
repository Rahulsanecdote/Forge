import { env } from '../../env';
import { supabase } from '../../supabase';
import { loadClient } from '../clients';
import type { ClientContext } from '../types';
import {
  buildLocalPostBody,
  buildReviewReplyResourceName,
  evaluateReplyPublishable,
  googleReviewToInsertRow,
  normalizeGoogleBusinessResourceId,
  parseLocalPostResponse,
  parseReviewReplyResponse,
  type GoogleBusinessProfileReview,
  type GoogleLocalPostResult,
  type GoogleReviewReply,
  type ReviewInsertRow,
} from './google-business-profile-mapping';

interface GoogleBusinessProfileConfig {
  accountId: string;
  locationId: string;
}

interface ImportReviewsResult {
  client: string;
  configured: boolean;
  fetched: number;
  imported: number;
  skippedExisting: number;
  skippedInvalid: number;
  reason?: string;
}

interface GoogleReviewsListResponse {
  reviews?: GoogleBusinessProfileReview[];
  nextPageToken?: string;
}

function resolveGoogleBusinessProfileConfig(client: ClientContext): GoogleBusinessProfileConfig | null {
  const accountId = normalizeGoogleBusinessResourceId(
    client.googleBusinessAccountId ?? env.GOOGLE_BUSINESS_PROFILE_ACCOUNT_ID,
    'accounts',
  );
  const locationId = normalizeGoogleBusinessResourceId(
    client.googleBusinessLocationId ?? env.GOOGLE_BUSINESS_PROFILE_LOCATION_ID,
    'locations',
  );

  if (!accountId || !locationId) return null;
  return { accountId, locationId };
}

async function readErrorBody(response: Response) {
  const text = await response.text().catch(() => '');
  return text.length > 600 ? `${text.slice(0, 600)}...` : text;
}

async function resolveGoogleAccessToken(): Promise<{ token: string } | { reason: string }> {
  if (env.GOOGLE_BUSINESS_PROFILE_ACCESS_TOKEN) {
    return { token: env.GOOGLE_BUSINESS_PROFILE_ACCESS_TOKEN };
  }

  const refreshToken = env.GOOGLE_BUSINESS_PROFILE_REFRESH_TOKEN;
  const clientId = env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = env.GOOGLE_OAUTH_CLIENT_SECRET;
  if (!refreshToken || !clientId || !clientSecret) {
    return {
      reason:
        'Missing GOOGLE_BUSINESS_PROFILE_ACCESS_TOKEN or GOOGLE_BUSINESS_PROFILE_REFRESH_TOKEN + GOOGLE_OAUTH_CLIENT_ID + GOOGLE_OAUTH_CLIENT_SECRET.',
    };
  }

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  const payload = (await response.json().catch(() => null)) as { access_token?: unknown; error?: unknown } | null;
  if (!response.ok) {
    throw new Error(
      `Google OAuth token refresh failed (${response.status}): ${JSON.stringify(payload ?? {}).slice(0, 600)}`,
    );
  }
  if (typeof payload?.access_token !== 'string' || !payload.access_token.trim()) {
    throw new Error('Google OAuth token refresh succeeded without returning an access_token.');
  }

  return { token: payload.access_token };
}

export async function fetchGoogleBusinessProfileReviews(input: {
  accountId: string;
  locationId: string;
  accessToken: string;
  pageSize?: number;
  maxPages?: number;
}): Promise<GoogleBusinessProfileReview[]> {
  const reviews: GoogleBusinessProfileReview[] = [];
  let pageToken: string | undefined;
  const pageSize = input.pageSize ?? 50;
  const maxPages = input.maxPages ?? 5;

  for (let page = 0; page < maxPages; page += 1) {
    const url = new URL(
      `https://mybusiness.googleapis.com/v4/accounts/${encodeURIComponent(input.accountId)}/locations/${encodeURIComponent(input.locationId)}/reviews`,
    );
    url.searchParams.set('pageSize', String(pageSize));
    url.searchParams.set('orderBy', 'updateTime desc');
    if (pageToken) url.searchParams.set('pageToken', pageToken);

    const response = await fetch(url, {
      headers: { authorization: `Bearer ${input.accessToken}` },
    });

    if (!response.ok) {
      throw new Error(`Google Business Profile reviews fetch failed (${response.status}): ${await readErrorBody(response)}`);
    }

    const payload = (await response.json()) as GoogleReviewsListResponse;
    reviews.push(...(payload.reviews ?? []));
    pageToken = payload.nextPageToken;
    if (!pageToken) break;
  }

  return reviews;
}

async function existingExternalReviewIds(clientId: string, externalReviewIds: string[]) {
  if (externalReviewIds.length === 0) return new Set<string>();

  const { data, error } = await supabase
    .from('reviews')
    .select('external_review_id')
    .eq('client_id', clientId)
    .eq('platform', 'google')
    .in('external_review_id', externalReviewIds);

  if (error) throw error;

  return new Set(
    ((data ?? []) as Array<{ external_review_id: string | null }>)
      .map((row) => row.external_review_id)
      .filter((id): id is string => Boolean(id)),
  );
}

export async function importGoogleBusinessProfileReviewsForClient(client: ClientContext): Promise<ImportReviewsResult> {
  const config = resolveGoogleBusinessProfileConfig(client);
  if (!config) {
    return {
      client: client.slug,
      configured: false,
      fetched: 0,
      imported: 0,
      skippedExisting: 0,
      skippedInvalid: 0,
      reason: 'Missing Google Business Profile account/location IDs.',
    };
  }

  const access = await resolveGoogleAccessToken();
  if ('reason' in access) {
    return {
      client: client.slug,
      configured: false,
      fetched: 0,
      imported: 0,
      skippedExisting: 0,
      skippedInvalid: 0,
      reason: access.reason,
    };
  }

  const fetched = await fetchGoogleBusinessProfileReviews({
    ...config,
    accessToken: access.token,
  });
  const rows = fetched
    .map((review) => googleReviewToInsertRow(client.id, review))
    .filter((row): row is ReviewInsertRow => Boolean(row));

  const existing = await existingExternalReviewIds(
    client.id,
    rows.map((row) => row.external_review_id),
  );
  const toInsert = rows.filter((row) => !existing.has(row.external_review_id));

  if (toInsert.length > 0) {
    const { error } = await supabase.from('reviews').insert(toInsert);
    if (error) throw error;
  }

  return {
    client: client.slug,
    configured: true,
    fetched: fetched.length,
    imported: toInsert.length,
    skippedExisting: rows.length - toInsert.length,
    skippedInvalid: fetched.length - rows.length,
  };
}

// --- Publishing drafted replies back to Google Business Profile -------------

export interface DraftedGoogleReply {
  id: string;
  author: string;
  rating: number;
  draft_reply: string | null;
}

export type PublishReviewReplyResult =
  | { published: true; reviewId: string; status: 'posted'; reference: string; comment: string }
  | { published: false; reviewId: string; code: string; reason: string };

export async function listDraftedGoogleReplies(clientId: string): Promise<DraftedGoogleReply[]> {
  const { data, error } = await supabase
    .from('reviews')
    .select('id, author, rating, draft_reply')
    .eq('client_id', clientId)
    .eq('platform', 'google')
    .eq('status', 'drafted')
    .order('reviewed_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as DraftedGoogleReply[];
}

// PUT the operator-approved reply onto the Google review. Reuses the same v4 API base
// and access-token resolution as review import; requires a write-scoped token.
export async function putGoogleBusinessProfileReviewReply(input: {
  reviewResourceName: string;
  comment: string;
  accessToken: string;
}): Promise<GoogleReviewReply> {
  const response = await fetch(`https://mybusiness.googleapis.com/v4/${input.reviewResourceName}/reply`, {
    method: 'PUT',
    headers: { authorization: `Bearer ${input.accessToken}`, 'content-type': 'application/json' },
    body: JSON.stringify({ comment: input.comment }),
  });

  if (!response.ok) {
    throw new Error(`Google Business Profile reply failed (${response.status}): ${await readErrorBody(response)}`);
  }

  const reply = parseReviewReplyResponse(await response.json().catch(() => null));
  if (!reply) {
    throw new Error('Google Business Profile reply succeeded without returning a comment.');
  }
  return reply;
}

// Publish a single drafted reply. Fails closed on every gap — missing review/client,
// wrong status, empty reply, banned-phrase compliance, or missing Google credentials —
// and only marks the review `posted` after Google accepts the reply.
export async function publishDraftedReviewReply(reviewId: string): Promise<PublishReviewReplyResult> {
  const { data: review, error } = await supabase
    .from('reviews')
    .select('id, client_id, platform, status, draft_reply, external_review_id, external_review_name, metadata')
    .eq('id', reviewId)
    .maybeSingle();
  if (error) throw error;
  if (!review) return { published: false, reviewId, code: 'not_found', reason: `Review ${reviewId} not found.` };

  const { data: clientRow, error: clientErr } = await supabase
    .from('clients')
    .select('slug')
    .eq('id', review.client_id)
    .maybeSingle();
  if (clientErr) throw clientErr;
  if (!clientRow) return { published: false, reviewId, code: 'not_found', reason: `Client for review ${reviewId} not found.` };

  const client = await loadClient(clientRow.slug);

  const gate = evaluateReplyPublishable({
    platform: review.platform,
    status: review.status,
    draftReply: review.draft_reply,
    bannedPhrases: client.brandVoice.bannedPhrases,
  });
  if (!gate.ok) return { published: false, reviewId, code: gate.code, reason: gate.reason };

  const config = resolveGoogleBusinessProfileConfig(client);
  const resourceName = buildReviewReplyResourceName({
    externalReviewName: review.external_review_name,
    accountId: config?.accountId ?? null,
    locationId: config?.locationId ?? null,
    externalReviewId: review.external_review_id,
  });
  if (!resourceName) {
    return {
      published: false,
      reviewId,
      code: 'unconfigured',
      reason: 'Missing review resource name and Google Business Profile account/location IDs.',
    };
  }

  const access = await resolveGoogleAccessToken();
  if ('reason' in access) return { published: false, reviewId, code: 'unconfigured', reason: access.reason };

  const comment = (review.draft_reply ?? '').trim();
  const reply = await putGoogleBusinessProfileReviewReply({
    reviewResourceName: resourceName,
    comment,
    accessToken: access.token,
  });

  const existingMetadata =
    review.metadata && typeof review.metadata === 'object' ? (review.metadata as Record<string, unknown>) : {};
  const { error: updateErr } = await supabase
    .from('reviews')
    .update({
      status: 'posted',
      metadata: {
        ...existingMetadata,
        published_reply: { reference: resourceName, comment: reply.comment, published_at: reply.updateTime },
      },
    })
    .eq('id', reviewId);
  if (updateErr) throw updateErr;

  return { published: true, reviewId, status: 'posted', reference: resourceName, comment: reply.comment };
}

// --- Publishing approved social posts as Google Business local posts ---------

export type PublishLocalPostsResult =
  | { published: true; posts: GoogleLocalPostResult[] }
  | { published: false; code: 'unconfigured' | 'no_posts'; reason: string };

export async function createGoogleBusinessLocalPost(input: {
  accountId: string;
  locationId: string;
  accessToken: string;
  summary: string;
  callToActionUrl?: string | null;
}): Promise<GoogleLocalPostResult> {
  const response = await fetch(
    `https://mybusiness.googleapis.com/v4/accounts/${encodeURIComponent(input.accountId)}/locations/${encodeURIComponent(input.locationId)}/localPosts`,
    {
      method: 'POST',
      headers: { authorization: `Bearer ${input.accessToken}`, 'content-type': 'application/json' },
      body: JSON.stringify(buildLocalPostBody({ summary: input.summary, callToActionUrl: input.callToActionUrl })),
    },
  );

  if (!response.ok) {
    throw new Error(`Google Business Profile local post failed (${response.status}): ${await readErrorBody(response)}`);
  }

  const post = parseLocalPostResponse(await response.json().catch(() => null));
  if (!post) {
    throw new Error('Google Business Profile local post succeeded without returning a resource name.');
  }
  return post;
}

// Publish each approved post summary as a Google Business local post. Fails closed on
// missing config/credentials; throws if Google rejects a post so the caller records no
// false success. Posts already created before a mid-batch failure remain on Google.
export async function publishApprovedSocialPostsToGoogle(input: {
  client: ClientContext;
  summaries: string[];
}): Promise<PublishLocalPostsResult> {
  const summaries = input.summaries.map((summary) => summary.trim()).filter(Boolean);
  if (summaries.length === 0) {
    return { published: false, code: 'no_posts', reason: 'No approved post content to publish.' };
  }

  const config = resolveGoogleBusinessProfileConfig(input.client);
  if (!config) {
    return { published: false, code: 'unconfigured', reason: 'Missing Google Business Profile account/location IDs.' };
  }

  const access = await resolveGoogleAccessToken();
  if ('reason' in access) return { published: false, code: 'unconfigured', reason: access.reason };

  const posts: GoogleLocalPostResult[] = [];
  for (const summary of summaries) {
    posts.push(
      await createGoogleBusinessLocalPost({
        accountId: config.accountId,
        locationId: config.locationId,
        accessToken: access.token,
        summary,
        callToActionUrl: input.client.website,
      }),
    );
  }
  return { published: true, posts };
}
