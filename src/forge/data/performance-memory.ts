import { supabase } from '../../supabase';
import { engagementScore, formatPerformanceExample } from './performance-memory-mapping';

// Performance memory: rank a client's past posts by the engagement they actually
// earned, and surface the best as model-facing guidance so new content learns from
// what worked. Reads from content_metrics (populated by the metrics refresh).

interface MetricRow {
  platform: string;
  caption: string | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  saved: number | null;
  interactions: number | null;
}

// Load a client's top-performing past posts as summary lines for the generator.
// Best-effort: returns [] on any error or when no scored, captioned posts exist, so
// content generation never breaks on missing performance data.
export async function loadTopPerformingPosts(clientId: string, limit = 3): Promise<string[]> {
  const { data, error } = await supabase
    .from('content_metrics')
    .select('platform, caption, likes, comments, shares, saved, interactions')
    .eq('client_id', clientId)
    .not('caption', 'is', null);
  if (error || !data) return [];

  return (data as MetricRow[])
    .filter((row) => row.caption && row.caption.trim().length > 0)
    .map((row) => ({ row, score: engagementScore(row) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ row }) =>
      formatPerformanceExample({
        platform: row.platform,
        caption: row.caption as string,
        likes: row.likes,
        comments: row.comments,
        shares: row.shares,
        saved: row.saved,
      }),
    );
}
