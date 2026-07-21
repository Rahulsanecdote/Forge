// Pure aggregation for the client-level performance dashboard — no env/network, so
// rolling content_metrics up per client stays unit-testable.
import { engagementScore } from './performance-memory-mapping';

export interface MetricRowInput {
  platform: string;
  caption: string | null;
  permalink: string | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  saved: number | null;
  reach: number | null;
  impressions: number | null;
  interactions: number | null;
  fetched_at: string | null;
}

export interface Totals {
  posts: number;
  likes: number;
  comments: number;
  shares: number;
  saved: number;
  reach: number;
  impressions: number;
}

export interface TopPost {
  platform: string;
  caption: string;
  permalink: string | null;
  score: number;
  likes: number | null;
  comments: number | null;
}

export interface ClientPerformanceSummary {
  measuredPosts: number;
  totals: Totals;
  byPlatform: Array<{ platform: string } & Totals>;
  topPosts: TopPost[];
  lastFetchedAt: string | null;
}

function num(value: number | null | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function emptyTotals(): Totals {
  return { posts: 0, likes: 0, comments: 0, shares: 0, saved: 0, reach: 0, impressions: 0 };
}

function addRow(totals: Totals, row: MetricRowInput): void {
  totals.posts += 1;
  totals.likes += num(row.likes);
  totals.comments += num(row.comments);
  totals.shares += num(row.shares);
  totals.saved += num(row.saved);
  totals.reach += num(row.reach);
  totals.impressions += num(row.impressions);
}

// Roll a client's per-post metric rows up into totals, a per-platform breakdown, and
// the top posts by engagement. Returns null when there are no rows to summarize.
export function summarizeClientPerformance(
  rows: MetricRowInput[],
  topN = 5,
): ClientPerformanceSummary | null {
  if (rows.length === 0) return null;

  const totals = emptyTotals();
  const platformTotals = new Map<string, Totals>();
  let lastFetchedAt: string | null = null;

  for (const row of rows) {
    addRow(totals, row);
    const key = row.platform;
    const pt = platformTotals.get(key) ?? emptyTotals();
    addRow(pt, row);
    platformTotals.set(key, pt);

    if (row.fetched_at && (!lastFetchedAt || row.fetched_at > lastFetchedAt)) {
      lastFetchedAt = row.fetched_at;
    }
  }

  const byPlatform = [...platformTotals.entries()]
    .map(([platform, t]) => ({ platform, ...t }))
    .sort((a, b) => b.posts - a.posts);

  const topPosts = rows
    .filter((row) => row.caption && row.caption.trim().length > 0)
    .map((row) => ({
      platform: row.platform,
      caption: row.caption as string,
      permalink: row.permalink,
      score: engagementScore(row),
      likes: row.likes,
      comments: row.comments,
    }))
    .filter((post) => post.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topN);

  return { measuredPosts: rows.length, totals, byPlatform, topPosts, lastFetchedAt };
}
