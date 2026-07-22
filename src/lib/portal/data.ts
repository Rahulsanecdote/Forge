import 'server-only';
import { getAdminSupabase } from '@/lib/admin/data';
import {
  summarizeClientPerformance,
  type ClientPerformanceSummary,
  type MetricRowInput,
} from '@/forge/data/performance-summary-mapping';
import { parseSocialPostOutput } from '@/lib/admin/run-output';

// Read-only client-portal data. SECURITY: every query here is scoped to the verified
// `clientId` from the session cookie — this is the sole tenant boundary, so the
// client filter must never be dropped. Reads go through the service role (same
// posture as the operator portal); nothing here writes.

export interface PortalQueueItem {
  runId: string;
  status: 'pending' | 'approved' | 'rejected';
  platform: string | null;
  postCount: number;
  preview: string | null;
  requestedAt: string | null;
  decidedAt: string | null;
}

export interface PortalScheduleItem {
  runId: string;
  scheduledFor: string;
  status: string;
}

export interface PortalData {
  client: {
    id: string;
    slug: string;
    name: string;
    industry: string | null;
    timezone: string | null;
    postingFrequency: string | null;
  };
  queue: PortalQueueItem[];
  schedules: PortalScheduleItem[];
  performance: ClientPerformanceSummary | null;
}

interface ApprovalRow {
  run_id: string;
  status: 'pending' | 'approved' | 'rejected';
  requested_at: string | null;
  decided_at: string | null;
  tool_runs: { output: unknown } | { output: unknown }[] | null;
}

function runOutput(row: ApprovalRow): unknown {
  const run = Array.isArray(row.tool_runs) ? row.tool_runs[0] : row.tool_runs;
  return run?.output ?? null;
}

export async function loadClientPortal(clientId: string): Promise<PortalData | null> {
  const supabase = getAdminSupabase();

  const { data: client } = await supabase
    .from('clients')
    .select('id, slug, name, industry, timezone, posting_frequency')
    .eq('id', clientId)
    .maybeSingle();
  if (!client) return null;

  const { data: approvals } = await supabase
    .from('content_approvals')
    .select('run_id, status, requested_at, decided_at, tool_runs(output)')
    .eq('client_id', clientId)
    .order('requested_at', { ascending: false })
    .limit(30);

  const queue: PortalQueueItem[] = ((approvals ?? []) as ApprovalRow[]).map((row) => {
    const parsed = parseSocialPostOutput(runOutput(row));
    return {
      runId: row.run_id,
      status: row.status,
      platform: parsed?.platform ?? null,
      postCount: parsed?.posts.length ?? 0,
      preview: parsed?.posts[0]?.caption?.slice(0, 160) ?? null,
      requestedAt: row.requested_at,
      decidedAt: row.decided_at,
    };
  });

  const { data: schedules } = await supabase
    .from('content_schedules')
    .select('run_id, scheduled_for, status')
    .eq('client_id', clientId)
    .eq('status', 'pending')
    .order('scheduled_for', { ascending: true });

  const { data: metrics } = await supabase
    .from('content_metrics')
    .select(
      'platform, caption, permalink, likes, comments, shares, saved, reach, impressions, interactions, fetched_at',
    )
    .eq('client_id', clientId);

  return {
    client: {
      id: client.id,
      slug: client.slug,
      name: client.name,
      industry: client.industry ?? null,
      timezone: client.timezone ?? null,
      postingFrequency: client.posting_frequency ?? null,
    },
    queue,
    schedules: ((schedules ?? []) as Array<{ run_id: string; scheduled_for: string; status: string }>).map(
      (row) => ({ runId: row.run_id, scheduledFor: row.scheduled_for, status: row.status }),
    ),
    performance: summarizeClientPerformance((metrics ?? []) as MetricRowInput[]),
  };
}
