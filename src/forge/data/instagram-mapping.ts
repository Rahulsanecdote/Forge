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
