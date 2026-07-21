import { env } from '../../env';
import { supabase } from '../../supabase';
import { parseSocialPostOutput } from '@/lib/admin/run-output';
import {
  emptyMetrics,
  normalizeFacebookMetrics,
  normalizeInstagramMetrics,
  publishedExternalId,
  type PostMetrics,
} from './analytics-mapping';

const DEFAULT_GRAPH_VERSION = 'v21.0';

type MetricsPlatform = 'instagram' | 'facebook';

export type RefreshMetricsResult =
  | { refreshed: true; count: number; platform: MetricsPlatform }
  | { refreshed: false; code: 'unconfigured' | 'unsupported' | 'no_posts' | 'error'; reason: string };

function graphVersion() {
  return env.META_GRAPH_VERSION?.trim() || DEFAULT_GRAPH_VERSION;
}

// Best-effort GET returning parsed JSON, or null on any failure. Insights endpoints
// reject metrics that don't apply to a given media type / API version, so callers
// must tolerate a null and fall back to whatever fields did resolve.
async function graphGet(url: string): Promise<unknown> {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    return await response.json().catch(() => null);
  } catch {
    return null;
  }
}

async function fetchInstagramMetrics(mediaId: string, accessToken: string): Promise<PostMetrics> {
  const base = `https://graph.facebook.com/${graphVersion()}/${encodeURIComponent(mediaId)}`;
  const token = encodeURIComponent(accessToken);
  const fields = await graphGet(`${base}?fields=like_count,comments_count,permalink&access_token=${token}`);
  const insights = await graphGet(
    `${base}/insights?metric=reach,saved,shares,total_interactions,views&access_token=${token}`,
  );
  return normalizeInstagramMetrics(fields, insights);
}

async function fetchFacebookMetrics(postId: string, accessToken: string): Promise<PostMetrics> {
  const base = `https://graph.facebook.com/${graphVersion()}/${encodeURIComponent(postId)}`;
  const token = encodeURIComponent(accessToken);
  const fields = await graphGet(
    `${base}?fields=permalink_url,shares,likes.summary(true),comments.summary(true)&access_token=${token}`,
  );
  const insights = await graphGet(
    `${base}/insights?metric=post_impressions,post_impressions_unique,post_engaged_users,post_video_views&access_token=${token}`,
  );
  return normalizeFacebookMetrics(fields, insights);
}

function permalinkFromPayload(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null;
  const url = (payload as { url?: unknown }).url;
  return typeof url === 'string' && url.trim() ? url : null;
}

// Refresh reach/engagement for every published post of a run and record it durably.
// For each published_url evidence row we fetch the platform metrics, upsert the
// latest snapshot into content_metrics, and append a `metric` evidence row for the
// audit trail. Meta channels only — Google Business has no per-post metrics API.
// Fails closed and never throws; every gap maps to a RefreshMetricsResult.
export async function refreshRunMetrics(runId: string): Promise<RefreshMetricsResult> {
  try {
    const { data: run } = await supabase
      .from('tool_runs')
      .select('id, client_id, tool, output')
      .eq('id', runId)
      .single();
    if (!run || run.tool !== 'create_social_posts') {
      return { refreshed: false, code: 'unsupported', reason: 'Not a social-post run.' };
    }

    const parsed = parseSocialPostOutput(run.output);
    if (!parsed || (parsed.platform !== 'instagram' && parsed.platform !== 'facebook')) {
      return {
        refreshed: false,
        code: 'unsupported',
        reason: 'Per-post metrics are only available for Instagram and Facebook.',
      };
    }
    const platform = parsed.platform;

    const accessToken = env.META_PAGE_ACCESS_TOKEN?.trim();
    if (!accessToken) {
      return { refreshed: false, code: 'unconfigured', reason: 'Missing META_PAGE_ACCESS_TOKEN.' };
    }

    // Ordered by insertion so each published_url row lines up with the post it came
    // from — publishing inserts one row per post in array order. That pairing lets us
    // store the caption alongside the metrics for performance memory.
    const { data: published } = await supabase
      .from('forge_run_evidence')
      .select('reference, payload, created_at')
      .eq('run_id', runId)
      .eq('kind', 'published_url')
      .order('created_at', { ascending: true });
    const rows = (published ?? []) as Array<{ reference: string | null; payload: unknown }>;
    if (rows.length === 0) {
      return { refreshed: false, code: 'no_posts', reason: 'This run has no published posts yet.' };
    }

    let count = 0;
    for (const [postIndex, row] of rows.entries()) {
      const externalId = publishedExternalId(platform, row.payload);
      if (!externalId) continue;
      const caption = parsed.posts[postIndex]?.caption ?? null;

      const metrics =
        platform === 'instagram'
          ? await fetchInstagramMetrics(externalId, accessToken)
          : await fetchFacebookMetrics(externalId, accessToken);
      const permalink = permalinkFromPayload(row.payload) ?? row.reference;

      await supabase.from('content_metrics').upsert(
        {
          run_id: runId,
          client_id: run.client_id,
          platform,
          external_id: externalId,
          post_index: postIndex,
          caption,
          permalink,
          likes: metrics.likes,
          comments: metrics.comments,
          shares: metrics.shares,
          saved: metrics.saved,
          reach: metrics.reach,
          impressions: metrics.impressions,
          video_views: metrics.videoViews,
          interactions: metrics.interactions,
          raw: metrics.raw,
          fetched_at: new Date().toISOString(),
        },
        { onConflict: 'run_id,platform,external_id' },
      );

      await supabase.from('forge_run_evidence').insert({
        run_id: runId,
        kind: 'metric',
        description: `Engagement snapshot for ${platform} post ${externalId}.`,
        reference: permalink,
        payload: {
          platform,
          external_id: externalId,
          likes: metrics.likes,
          comments: metrics.comments,
          shares: metrics.shares,
          saved: metrics.saved,
          reach: metrics.reach,
          impressions: metrics.impressions,
          video_views: metrics.videoViews,
          interactions: metrics.interactions,
        },
      });
      count += 1;
    }

    if (count === 0) {
      return { refreshed: false, code: 'no_posts', reason: 'No published posts had a resolvable id.' };
    }
    return { refreshed: true, count, platform };
  } catch (error) {
    console.error('[refreshRunMetrics]', error);
    return { refreshed: false, code: 'error', reason: 'Failed to refresh metrics.' };
  }
}

// Run ids that have published_url evidence recorded since `sinceIso`, most recent
// first — the working set for the metrics-refresh cron. Bounded so one cron tick
// can't fan out unboundedly.
export async function loadRecentlyPublishedRunIds(sinceIso: string, limit = 50): Promise<string[]> {
  const { data, error } = await supabase
    .from('forge_run_evidence')
    .select('run_id, created_at')
    .eq('kind', 'published_url')
    .gte('created_at', sinceIso)
    .order('created_at', { ascending: false });
  if (error) throw new Error(`Could not load recently published runs: ${error.message}`);

  const seen: string[] = [];
  for (const row of (data ?? []) as Array<{ run_id: string }>) {
    if (!seen.includes(row.run_id)) seen.push(row.run_id);
    if (seen.length >= limit) break;
  }
  return seen;
}
