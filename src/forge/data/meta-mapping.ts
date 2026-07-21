// Pure helpers for Meta (Facebook Page) publishing — no env/network, so the
// publish path's parsing and URL building stay unit-testable.

export interface FacebookPostResult {
  id: string;
  url: string;
}

export function parseFacebookPostResponse(payload: unknown): { id: string } | null {
  if (!payload || typeof payload !== 'object') return null;
  const record = payload as { id?: unknown };
  if (typeof record.id !== 'string' || !record.id.trim()) return null;
  return { id: record.id };
}

// A Facebook feed post id is `{pageId}_{postId}`; the canonical permalink resolves
// from that composite id.
export function facebookPostUrl(id: string): string {
  return `https://www.facebook.com/${id}`;
}

// Compose the post body from the generated caption + hashtags (Facebook feed posts
// allow text-only content, unlike Instagram which requires media).
export function buildFacebookMessage(caption: string, hashtags: string[]): string {
  return [caption, hashtags.join(' ')].map((part) => part.trim()).filter(Boolean).join('\n\n');
}
