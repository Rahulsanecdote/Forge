import { findBannedPhraseViolations } from '../compliance';

export interface GoogleBusinessProfileReview {
  name?: string;
  reviewId?: string;
  reviewer?: {
    displayName?: string;
    profilePhotoUrl?: string;
  };
  starRating?: string;
  comment?: string;
  createTime?: string;
  updateTime?: string;
  reviewReply?: unknown;
}

export interface ReviewInsertRow {
  client_id: string;
  author: string;
  rating: number;
  text: string;
  platform: 'google';
  status: 'new';
  external_review_id: string;
  external_review_name: string | null;
  reviewed_at: string | null;
  updated_at: string | null;
  reviewer_profile_photo_url: string | null;
  metadata: Record<string, unknown>;
}

const STAR_RATINGS: Record<string, number> = {
  ONE: 1,
  TWO: 2,
  THREE: 3,
  FOUR: 4,
  FIVE: 5,
};

export function googleStarRatingToNumber(value: string | undefined): number | null {
  if (!value) return null;
  return STAR_RATINGS[value] ?? null;
}

export function googleReviewExternalId(review: GoogleBusinessProfileReview): string | null {
  if (review.reviewId?.trim()) return review.reviewId.trim();
  const match = review.name?.match(/\/reviews\/([^/]+)$/);
  return match?.[1] ?? null;
}

export function normalizeGoogleBusinessResourceId(value: string | null | undefined, prefix: string): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  return trimmed.startsWith(`${prefix}/`) ? trimmed.slice(prefix.length + 1) : trimmed;
}

// --- Publishing drafted replies back to Google Business Profile -------------

export interface GoogleReviewReply {
  comment: string;
  updateTime: string | null;
}

export interface GoogleLocalPostResult {
  name: string;
  searchUrl: string | null;
}

// Build a STANDARD local-post body. `summary` is the post text (Google caps it at
// 1500 chars); an optional call-to-action URL adds a LEARN_MORE button.
export function buildLocalPostBody(input: {
  summary: string;
  callToActionUrl?: string | null;
  languageCode?: string;
}): Record<string, unknown> {
  const body: Record<string, unknown> = {
    languageCode: input.languageCode ?? 'en-US',
    summary: input.summary.slice(0, 1500),
    topicType: 'STANDARD',
  };
  const url = input.callToActionUrl?.trim();
  if (url) body.callToAction = { actionType: 'LEARN_MORE', url };
  return body;
}

export function parseLocalPostResponse(payload: unknown): GoogleLocalPostResult | null {
  if (!payload || typeof payload !== 'object') return null;
  const record = payload as { name?: unknown; searchUrl?: unknown };
  if (typeof record.name !== 'string' || !record.name.trim()) return null;
  return { name: record.name, searchUrl: typeof record.searchUrl === 'string' ? record.searchUrl : null };
}

export type ReplyPublishableResult =
  | { ok: true }
  | {
      ok: false;
      code: 'not_google' | 'not_drafted' | 'empty_reply' | 'compliance';
      reason: string;
      violations?: string[];
    };

// Pure gate that decides whether a drafted reply may be published. Kept side-effect
// free so the publish path's guardrails are unit-testable without DB or network.
export function evaluateReplyPublishable(input: {
  platform: string;
  status: string;
  draftReply: string | null | undefined;
  bannedPhrases: string[];
}): ReplyPublishableResult {
  if (input.platform !== 'google') {
    return { ok: false, code: 'not_google', reason: `Only Google reviews can be published; got platform "${input.platform}".` };
  }
  if (input.status !== 'drafted') {
    return { ok: false, code: 'not_drafted', reason: `Review status is "${input.status}", expected "drafted".` };
  }
  const reply = (input.draftReply ?? '').trim();
  if (!reply) {
    return { ok: false, code: 'empty_reply', reason: 'Review has no drafted reply to publish.' };
  }
  const violations = findBannedPhraseViolations(reply, input.bannedPhrases);
  if (violations.length > 0) {
    return { ok: false, code: 'compliance', reason: `Reply contains banned phrases: ${violations.join(', ')}.`, violations };
  }
  return { ok: true };
}

// Resolve the review's full resource name (accounts/*/locations/*/reviews/*) for the
// reply endpoint. Prefer the stored source name; otherwise reconstruct from config + id.
export function buildReviewReplyResourceName(input: {
  externalReviewName?: string | null;
  accountId?: string | null;
  locationId?: string | null;
  externalReviewId?: string | null;
}): string | null {
  const name = input.externalReviewName?.trim();
  if (name && /^accounts\/[^/]+\/locations\/[^/]+\/reviews\/[^/]+$/.test(name)) {
    return name;
  }
  const account = normalizeGoogleBusinessResourceId(input.accountId, 'accounts');
  const location = normalizeGoogleBusinessResourceId(input.locationId, 'locations');
  const reviewId = input.externalReviewId?.trim();
  if (account && location && reviewId) {
    return `accounts/${account}/locations/${location}/reviews/${reviewId}`;
  }
  return null;
}

export function parseReviewReplyResponse(payload: unknown): GoogleReviewReply | null {
  if (!payload || typeof payload !== 'object') return null;
  const record = payload as { comment?: unknown; updateTime?: unknown };
  if (typeof record.comment !== 'string') return null;
  return { comment: record.comment, updateTime: typeof record.updateTime === 'string' ? record.updateTime : null };
}

export function googleReviewToInsertRow(
  clientId: string,
  review: GoogleBusinessProfileReview,
): ReviewInsertRow | null {
  const rating = googleStarRatingToNumber(review.starRating);
  const externalReviewId = googleReviewExternalId(review);
  if (!rating || !externalReviewId) return null;

  const comment = review.comment?.trim();
  return {
    client_id: clientId,
    author: review.reviewer?.displayName?.trim() || 'Google reviewer',
    rating,
    text: comment || `${rating}-star Google review with no written comment.`,
    platform: 'google',
    status: 'new',
    external_review_id: externalReviewId,
    external_review_name: review.name ?? null,
    reviewed_at: review.createTime ?? null,
    updated_at: review.updateTime ?? null,
    reviewer_profile_photo_url: review.reviewer?.profilePhotoUrl ?? null,
    metadata: {
      source: 'google_business_profile',
      star_rating: review.starRating,
      has_owner_reply: Boolean(review.reviewReply),
    },
  };
}
