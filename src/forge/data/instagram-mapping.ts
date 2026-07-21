// Pure helpers for Instagram publishing — no env/network, so parsing and caption
// building stay unit-testable.

export interface InstagramPostResult {
  mediaId: string;
  url: string;
}

export function parseInstagramId(payload: unknown): { id: string } | null {
  if (!payload || typeof payload !== 'object') return null;
  const record = payload as { id?: unknown };
  if (typeof record.id !== 'string' || !record.id.trim()) return null;
  return { id: record.id };
}

export function parseInstagramPermalink(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null;
  const record = payload as { permalink?: unknown };
  return typeof record.permalink === 'string' && record.permalink.trim() ? record.permalink : null;
}

// Instagram captions allow ≤2200 chars and ≤30 hashtags; enforce both.
export function buildInstagramCaption(caption: string, hashtags: string[]): string {
  const tags = hashtags
    .map((tag) => tag.trim())
    .filter(Boolean)
    .slice(0, 30);
  return [caption.trim(), tags.join(' ')].filter(Boolean).join('\n\n').slice(0, 2200);
}

// An Instagram carousel holds 2–10 media items.
export const INSTAGRAM_CAROUSEL_MAX = 10;

// Decide how a post's images should be published: a single image, a carousel, or
// nothing (no usable image). More than the carousel maximum is capped to the first
// INSTAGRAM_CAROUSEL_MAX images.
export type InstagramMediaPlan =
  | { kind: 'none' }
  | { kind: 'single'; imageUrl: string }
  | { kind: 'carousel'; imageUrls: string[] };

export function planInstagramMedia(imageUrls: Array<string | null | undefined>): InstagramMediaPlan {
  const urls = imageUrls.filter((url): url is string => typeof url === 'string' && url.trim().length > 0);
  if (urls.length === 0) return { kind: 'none' };
  if (urls.length === 1) return { kind: 'single', imageUrl: urls[0] };
  return { kind: 'carousel', imageUrls: urls.slice(0, INSTAGRAM_CAROUSEL_MAX) };
}
