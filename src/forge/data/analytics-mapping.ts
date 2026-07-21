// Pure helpers for post-publish analytics — no env/network, so parsing the Meta
// Graph responses stays unit-testable.

// Normalized engagement snapshot for one published post. Any field the platform
// doesn't return (varies by media type and Graph API version) stays null.
export interface PostMetrics {
  likes: number | null;
  comments: number | null;
  shares: number | null;
  saved: number | null;
  reach: number | null;
  impressions: number | null;
  videoViews: number | null;
  interactions: number | null;
  raw: unknown;
}

export function emptyMetrics(raw: unknown): PostMetrics {
  return {
    likes: null,
    comments: null,
    shares: null,
    saved: null,
    reach: null,
    impressions: null,
    videoViews: null,
    interactions: null,
    raw,
  };
}

// Coerce a Graph value to a non-negative integer, or null when absent/unusable.
export function parseMetricNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return null;
}

// A Graph insights response is { data: [{ name, values: [{ value }] }, ...] }.
// Return the first value for a named metric, or null.
export function parseGraphInsightValue(payload: unknown, metric: string): number | null {
  if (!payload || typeof payload !== 'object') return null;
  const data = (payload as { data?: unknown }).data;
  if (!Array.isArray(data)) return null;
  for (const entry of data) {
    if (!entry || typeof entry !== 'object') continue;
    if ((entry as { name?: unknown }).name !== metric) continue;
    const values = (entry as { values?: unknown }).values;
    if (Array.isArray(values) && values[0] && typeof values[0] === 'object') {
      return parseMetricNumber((values[0] as { value?: unknown }).value);
    }
  }
  return null;
}

// A Graph edge summary is { summary: { total_count } }. Return the count, or null.
export function parseSummaryCount(node: unknown): number | null {
  if (!node || typeof node !== 'object') return null;
  const summary = (node as { summary?: unknown }).summary;
  if (!summary || typeof summary !== 'object') return null;
  return parseMetricNumber((summary as { total_count?: unknown }).total_count);
}

// Instagram: media fields ({ like_count, comments_count, permalink }) + best-effort
// insights ({ data:[{name:'reach'|'saved'|'shares'|'total_interactions'|'views', ...}] }).
export function normalizeInstagramMetrics(fields: unknown, insights: unknown): PostMetrics {
  const f = (fields && typeof fields === 'object' ? fields : {}) as Record<string, unknown>;
  return {
    likes: parseMetricNumber(f.like_count),
    comments: parseMetricNumber(f.comments_count),
    shares: parseGraphInsightValue(insights, 'shares'),
    saved: parseGraphInsightValue(insights, 'saved'),
    reach: parseGraphInsightValue(insights, 'reach'),
    impressions: parseGraphInsightValue(insights, 'impressions'),
    videoViews: parseGraphInsightValue(insights, 'views'),
    interactions: parseGraphInsightValue(insights, 'total_interactions'),
    raw: { fields, insights },
  };
}

// Facebook: post fields ({ shares:{count}, likes.summary, comments.summary }) +
// best-effort insights ({ data:[{name:'post_impressions'|'post_impressions_unique'|
// 'post_engaged_users', ...}] }).
export function normalizeFacebookMetrics(fields: unknown, insights: unknown): PostMetrics {
  const f = (fields && typeof fields === 'object' ? fields : {}) as Record<string, unknown>;
  const shares = f.shares && typeof f.shares === 'object'
    ? parseMetricNumber((f.shares as { count?: unknown }).count)
    : null;
  return {
    likes: parseSummaryCount(f.likes),
    comments: parseSummaryCount(f.comments),
    shares,
    saved: null,
    reach: parseGraphInsightValue(insights, 'post_impressions_unique'),
    impressions: parseGraphInsightValue(insights, 'post_impressions'),
    videoViews: parseGraphInsightValue(insights, 'post_video_views'),
    interactions: parseGraphInsightValue(insights, 'post_engaged_users'),
    raw: { fields, insights },
  };
}

// Extract the external post id from a published_url evidence payload, keyed by the
// run's platform. Instagram stores { mediaId }, Facebook stores { id }.
export function publishedExternalId(
  platform: string,
  payload: unknown,
): string | null {
  if (!payload || typeof payload !== 'object') return null;
  const record = payload as Record<string, unknown>;
  const raw = platform === 'instagram' ? record.mediaId : platform === 'facebook' ? record.id : null;
  return typeof raw === 'string' && raw.trim() ? raw : null;
}
