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
