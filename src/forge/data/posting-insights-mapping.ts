// Pure helper for best-time-to-post insights — buckets a client's past posts by
// weekday/hour (in the client's timezone) and ranks buckets by average engagement.
// No env/network, so it stays unit-testable.
import { engagementScore, type PostEngagement } from './performance-memory-mapping';

export interface PublishedMetric extends PostEngagement {
  published_at: string | null;
}

export interface PostingSlot {
  label: string; // e.g. "Fri 18:00"
  weekday: string; // "Fri"
  hour: number; // 0–23
  avgScore: number;
  samples: number;
}

function bucketFor(iso: string, timeZone: string): { weekday: string; hour: number } | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      weekday: 'short',
      hour: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(date);
    const weekday = parts.find((p) => p.type === 'weekday')?.value;
    const hourRaw = parts.find((p) => p.type === 'hour')?.value;
    const hour = Number(hourRaw);
    if (!weekday || !Number.isInteger(hour)) return null;
    return { weekday, hour: hour % 24 };
  } catch {
    return null;
  }
}

// Rank the weekday/hour slots where a client's posts earned the most engagement on
// average. Times are computed in `timeZone`. Returns [] when there's no dated history.
export function recommendPostTimes(
  rows: PublishedMetric[],
  timeZone: string,
  limit = 3,
): PostingSlot[] {
  const buckets = new Map<string, { weekday: string; hour: number; sum: number; samples: number }>();

  for (const row of rows) {
    if (!row.published_at) continue;
    const bucket = bucketFor(row.published_at, timeZone);
    if (!bucket) continue;

    const key = `${bucket.weekday}-${bucket.hour}`;
    const entry = buckets.get(key) ?? { weekday: bucket.weekday, hour: bucket.hour, sum: 0, samples: 0 };
    entry.sum += engagementScore(row);
    entry.samples += 1;
    buckets.set(key, entry);
  }

  return [...buckets.values()]
    .map((entry) => ({
      label: `${entry.weekday} ${String(entry.hour).padStart(2, '0')}:00`,
      weekday: entry.weekday,
      hour: entry.hour,
      avgScore: entry.samples > 0 ? entry.sum / entry.samples : 0,
      samples: entry.samples,
    }))
    .sort((a, b) => b.avgScore - a.avgScore || b.samples - a.samples)
    .slice(0, limit);
}
