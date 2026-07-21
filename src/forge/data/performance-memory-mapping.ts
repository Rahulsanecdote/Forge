// Pure helpers for performance memory — no env/network, so scoring and formatting
// stay unit-testable independent of the Supabase query in performance-memory.ts.

export interface PostEngagement {
  likes: number | null;
  comments: number | null;
  shares: number | null;
  saved: number | null;
  interactions: number | null;
}

function num(value: number | null | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

// A single engagement score from whatever a platform returned. Interactions (a
// platform-computed total) dominates when present; otherwise sum the component
// signals, weighting the higher-intent ones. Nulls count as 0.
export function engagementScore(m: PostEngagement): number {
  const components = num(m.likes) + num(m.comments) * 2 + num(m.shares) * 3 + num(m.saved) * 2;
  return Math.max(num(m.interactions), components);
}

// A compact, model-facing summary of a past post's performance. The caption is
// collapsed and trimmed so the prompt stays small.
export function formatPerformanceExample(input: {
  platform: string;
  caption: string;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  saved: number | null;
}): string {
  const parts: string[] = [];
  if (num(input.likes)) parts.push(`${input.likes} likes`);
  if (num(input.comments)) parts.push(`${input.comments} comments`);
  if (num(input.shares)) parts.push(`${input.shares} shares`);
  if (num(input.saved)) parts.push(`${input.saved} saves`);
  const stats = parts.length > 0 ? parts.join(', ') : 'engagement recorded';
  const caption = input.caption.replace(/\s+/g, ' ').trim().slice(0, 160);
  const platform = input.platform.replace(/_/g, ' ');
  return `${platform} · ${stats} — "${caption}"`;
}
