import { env } from '../../env';
import { supabase } from '../../supabase';
import type { ClientContext } from '../types';
import {
  googleReviewToInsertRow,
  normalizeGoogleBusinessResourceId,
  type GoogleBusinessProfileReview,
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
