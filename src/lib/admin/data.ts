import 'server-only';
import { createClient } from '@supabase/supabase-js';
import {
  summarizeClientPerformance,
  type ClientPerformanceSummary,
  type MetricRowInput,
} from '@/forge/data/performance-summary-mapping';
import {
  recommendPostTimes,
  type PostingSlot,
  type PublishedMetric,
} from '@/forge/data/posting-insights-mapping';
import type { CalendarEntry, CalendarStatus } from '@/lib/admin/calendar-grid';
import {
  buildMonitoringIssues,
  isStalePublishing,
  minutesSince,
  monitoringSeverity,
  type MonitoringIssue,
  type MonitoringSeverity,
} from '@/lib/admin/monitoring';
import { isDeliveryActive } from '@/lib/billing/entitlements';

export type { ClientPerformanceSummary } from '@/forge/data/performance-summary-mapping';
export type { PostingSlot } from '@/forge/data/posting-insights-mapping';
export type { CalendarEntry } from '@/lib/admin/calendar-grid';

export interface DashboardClient {
  id: string;
  slug: string;
  name: string;
  industry: string | null;
  website: string | null;
  locations: number | null;
  geographic_market: string | null;
  primary_goal: string | null;
  primary_cta: string | null;
  timezone: string | null;
  posting_frequency: string | null;
  approval_mode: 'review';
  google_business_account_id: string | null;
  google_business_location_id: string | null;
  google_review_url: string | null;
  plan: string | null;
  subscription_status: string;
  billing_override: boolean;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  current_period_end: string | null;
  created_at: string | null;
}

export interface DashboardLead {
  id: string;
  email: string;
  source: string;
  created_at: string | null;
}

export interface DashboardToolRun {
  id: string;
  client_id: string | null;
  task: string | null;
  tool: string | null;
  input?: unknown;
  output?: unknown;
  model_usage?: unknown;
  created_at: string | null;
}

export interface DashboardData {
  clients: DashboardClient[];
  leads: DashboardLead[];
  toolRuns: DashboardToolRun[];
  contentApprovals: DashboardApprovalQueueItem[];
  errors: string[];
}

export interface DashboardBrandVoice {
  id: string;
  client_id: string;
  tone: string[] | null;
  about: string | null;
  audience: string | null;
  dos: string[] | null;
  donts: string[] | null;
  sample_posts: string[] | null;
  banned_phrases: string[] | null;
  created_at: string | null;
}

export interface DashboardReview {
  id: string;
  author: string | null;
  rating: number;
  text: string;
  platform: string | null;
  status: string;
  draft_reply: string | null;
  needs_manager: boolean | null;
  external_review_id: string | null;
  reviewed_at: string | null;
  created_at: string | null;
}

export interface DashboardContentApproval {
  id: string;
  run_id: string;
  client_id: string;
  status: 'pending' | 'approved' | 'rejected';
  notes: string | null;
  requested_at: string | null;
  decided_at: string | null;
}

export interface DashboardContentPublication {
  id: string;
  run_id: string;
  post_index: number;
  platform: 'google_business' | 'facebook' | 'instagram';
  status: 'publishing' | 'published' | 'reconcile';
  reference: string | null;
  last_error: string | null;
  claimed_at: string | null;
  published_at: string | null;
  updated_at: string | null;
}

export interface DashboardApprovalQueueItem extends DashboardContentApproval {
  client_name: string | null;
  client_slug: string | null;
  run_tool: string | null;
  run_task: string | null;
  run_created_at: string | null;
}

export interface DashboardClientDetail {
  client: DashboardClient;
  brandVoice: DashboardBrandVoice | null;
  toolRuns: DashboardToolRun[];
  reviews: DashboardReview[];
  contentApprovals: DashboardContentApproval[];
  errors: string[];
}

export interface DashboardToolRunDetail {
  run: DashboardToolRun;
  client: Pick<DashboardClient, 'id' | 'slug' | 'name' | 'timezone'> | null;
  approval: DashboardContentApproval | null;
  publications: DashboardContentPublication[];
  currentBannedPhrases: string[];
  errors: string[];
}

export function getAdminSupabase() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for the dashboard.');
  }

  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false },
  });
}

const clientColumns =
  'id, slug, name, industry, website, locations, geographic_market, primary_goal, primary_cta, timezone, posting_frequency, approval_mode, google_business_account_id, google_business_location_id, google_review_url, plan, subscription_status, billing_override, stripe_customer_id, stripe_subscription_id, current_period_end, created_at';
const baseClientColumns =
  'id, slug, name, industry, website, locations, geographic_market, primary_goal, primary_cta, timezone, posting_frequency, approval_mode, created_at';
const reviewColumns =
  'id, author, rating, text, platform, status, draft_reply, needs_manager, external_review_id, reviewed_at, created_at';
const baseReviewColumns = 'id, author, rating, text, platform, status, draft_reply, needs_manager, created_at';

function isMissingGoogleBusinessColumns(error: Error) {
  return /google_business_|google_review_url|external_review_id|reviewed_at|subscription_status|billing_override|stripe_|current_period_end|\bplan\b/i.test(
    error.message,
  );
}

function normalizeClient(client: Partial<DashboardClient>): DashboardClient {
  return {
    ...(client as DashboardClient),
    google_business_account_id: client.google_business_account_id ?? null,
    google_business_location_id: client.google_business_location_id ?? null,
    google_review_url: client.google_review_url ?? null,
    plan: client.plan ?? null,
    subscription_status: client.subscription_status ?? 'inactive',
    billing_override: client.billing_override ?? false,
    stripe_customer_id: client.stripe_customer_id ?? null,
    stripe_subscription_id: client.stripe_subscription_id ?? null,
    current_period_end: client.current_period_end ?? null,
  };
}

function normalizeReview(review: Partial<DashboardReview>): DashboardReview {
  return {
    ...(review as DashboardReview),
    external_review_id: review.external_review_id ?? null,
    reviewed_at: review.reviewed_at ?? null,
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function relationRecord(value: unknown): Record<string, unknown> | null {
  if (Array.isArray(value)) return asRecord(value[0]);
  return asRecord(value);
}

function normalizeApprovalQueueItem(
  row: DashboardContentApproval & Record<string, unknown>,
): DashboardApprovalQueueItem {
  const client = relationRecord(row.clients);
  const run = relationRecord(row.tool_runs);

  return {
    id: row.id,
    run_id: row.run_id,
    client_id: row.client_id,
    status: row.status,
    notes: row.notes,
    requested_at: row.requested_at,
    decided_at: row.decided_at,
    client_name: asString(client?.name),
    client_slug: asString(client?.slug),
    run_tool: asString(run?.tool),
    run_task: asString(run?.task),
    run_created_at: asString(run?.created_at),
  };
}

async function safeQuery<T>(query: PromiseLike<{ data: unknown; error: { message: string } | null }>) {
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as T[];
}

export async function loadDashboardData(): Promise<DashboardData> {
  const supabase = getAdminSupabase();
  const errors: string[] = [];

  const clients = await safeQuery<DashboardClient>(
    supabase
      .from('clients')
      .select(clientColumns)
      .order('created_at', { ascending: false })
      .limit(8),
  )
    .catch((error: Error) => {
      if (!isMissingGoogleBusinessColumns(error)) throw error;
      return safeQuery<DashboardClient>(
        supabase
          .from('clients')
          .select(baseClientColumns)
          .order('created_at', { ascending: false })
          .limit(8),
      ).then((rows) => rows.map(normalizeClient));
    })
    .catch((error: Error) => {
    errors.push(`clients: ${error.message}`);
    return [];
  });

  const leads = await safeQuery<DashboardLead>(
    supabase
      .from('leads')
      .select('id, email, source, created_at')
      .order('created_at', { ascending: false })
      .limit(8),
  ).catch((error: Error) => {
    errors.push(`leads: ${error.message}`);
    return [];
  });

  const toolRuns = await safeQuery<DashboardToolRun>(
    supabase
      .from('tool_runs')
      .select('id, client_id, task, tool, created_at')
      .order('created_at', { ascending: false })
      .limit(8),
  ).catch((error: Error) => {
    errors.push(`tool_runs: ${error.message}`);
    return [];
  });

  const contentApprovals = await safeQuery<DashboardContentApproval & Record<string, unknown>>(
    supabase
      .from('content_approvals')
      .select(
        'id, run_id, client_id, status, notes, requested_at, decided_at, clients(name, slug), tool_runs(task, tool, created_at)',
      )
      .order('requested_at', { ascending: false })
      .limit(12),
  )
    .then((rows) => rows.map(normalizeApprovalQueueItem))
    .catch((approvalError: Error) => {
      errors.push(`content_approvals: ${approvalError.message}`);
      return [];
    });

  return { clients, leads, toolRuns, contentApprovals, errors };
}

export interface ContentCalendarData {
  entries: CalendarEntry[];
  pendingApprovals: DashboardApprovalQueueItem[];
  errors: string[];
}

export interface MonitoringRow {
  id: string;
  title: string;
  detail: string;
  href: string | null;
  status: string;
  timestamp: string | null;
  ageMinutes: number | null;
  severity: 'info' | 'warning' | 'critical';
}

export interface MonitoringMetricClient {
  id: string;
  name: string;
  slug: string;
  latestFetchedAt: string | null;
  totalInteractions: number;
  rowCount: number;
  stale: boolean;
}

export interface MonitoringClientGate {
  id: string;
  name: string;
  slug: string;
  plan: string | null;
  subscriptionStatus: string;
  billingOverride: boolean;
}

export interface DashboardMonitoringData {
  capturedAt: string;
  health: MonitoringSeverity;
  issues: MonitoringIssue[];
  stats: {
    pendingApprovals: number;
    dueSchedules: number;
    failedSchedules: number;
    reconcilePublications: number;
    stalePublishingPublications: number;
    failedReviewRequests: number;
    metricsRows: number;
    clientsWithFreshMetrics: number;
    inactiveDeliveryClients: number;
  };
  pendingApprovals: MonitoringRow[];
  publicationCheckpoints: MonitoringRow[];
  scheduleIssues: MonitoringRow[];
  reviewDeliveryIssues: MonitoringRow[];
  metricClients: MonitoringMetricClient[];
  inactiveClients: MonitoringClientGate[];
  errors: string[];
}

const SCHEDULE_STATUS_TO_CALENDAR: Record<string, CalendarStatus> = {
  pending: 'scheduled',
  publishing: 'publishing',
  published: 'published',
  failed: 'failed',
  canceled: 'canceled',
};

function normalizeCalendarEntry(row: Record<string, unknown>): CalendarEntry {
  const client = relationRecord(row.clients);
  const run = relationRecord(row.tool_runs);
  const status = SCHEDULE_STATUS_TO_CALENDAR[String(row.status ?? '')] ?? 'scheduled';
  return {
    id: String(row.id),
    runId: String(row.run_id),
    clientName: asString(client?.name),
    clientSlug: asString(client?.slug),
    title: asString(run?.task) ?? asString(run?.tool),
    status,
    at: String(row.scheduled_for),
    timezone: asString(client?.timezone),
  };
}

// Scheduled/published posts across all clients within [startIso, endIso), plus the pending
// approval queue (dateless, "needs a decision"). Anchored on `scheduled_for` so every post
// lands on the day it was meant to go out. Degrades to empty with a recorded error when the
// content_schedules table is absent, so the cockpit renders before that migration is applied.
export async function loadContentCalendar(startIso: string, endIso: string): Promise<ContentCalendarData> {
  const supabase = getAdminSupabase();
  const errors: string[] = [];

  const entries = await safeQuery<Record<string, unknown>>(
    supabase
      .from('content_schedules')
      .select('id, run_id, status, scheduled_for, published_at, clients(name, slug, timezone), tool_runs(task, tool)')
      .gte('scheduled_for', startIso)
      .lt('scheduled_for', endIso)
      .order('scheduled_for', { ascending: true })
      .limit(500),
  )
    .then((rows) => rows.map(normalizeCalendarEntry))
    .catch((error: Error) => {
      errors.push(`content_schedules: ${error.message}`);
      return [];
    });

  const pendingApprovals = await safeQuery<DashboardContentApproval & Record<string, unknown>>(
    supabase
      .from('content_approvals')
      .select('id, run_id, client_id, status, notes, requested_at, decided_at, clients(name, slug), tool_runs(task, tool, created_at)')
      .eq('status', 'pending')
      .order('requested_at', { ascending: true })
      .limit(50),
  )
    .then((rows) => rows.map(normalizeApprovalQueueItem))
    .catch((error: Error) => {
      errors.push(`content_approvals: ${error.message}`);
      return [];
    });

  return { entries, pendingApprovals, errors };
}

export async function loadMonitoringData(now = new Date()): Promise<DashboardMonitoringData> {
  const supabase = getAdminSupabase();
  const errors: string[] = [];
  const nowIso = now.toISOString();
  const staleMetricCutoffMs = now.getTime() - 24 * 60 * 60 * 1000;

  const pendingApprovals = await safeQuery<DashboardContentApproval & Record<string, unknown>>(
    supabase
      .from('content_approvals')
      .select('id, run_id, client_id, status, requested_at, clients(name, slug), tool_runs(task, tool)')
      .eq('status', 'pending')
      .order('requested_at', { ascending: true })
      .limit(25),
  )
    .then((rows) =>
      rows.map((row) => {
        const client = relationRecord(row.clients);
        const run = relationRecord(row.tool_runs);
        return {
          id: row.id,
          title: asString(client?.name) ?? 'Client',
          detail: asString(run?.task) ?? asString(run?.tool) ?? 'Draft awaiting operator decision',
          href: `/dashboard/runs/${row.run_id}`,
          status: row.status,
          timestamp: row.requested_at,
          ageMinutes: minutesSince(row.requested_at, nowIso),
          severity: 'info' as const,
        };
      }),
    )
    .catch((error: Error) => {
      errors.push(`content_approvals: ${error.message}`);
      return [];
    });

  const publicationCheckpoints = await safeQuery<Record<string, unknown>>(
    supabase
      .from('content_publications')
      .select('id, run_id, post_index, platform, status, last_error, claimed_at, updated_at, clients(name, slug)')
      .in('status', ['publishing', 'reconcile'])
      .order('updated_at', { ascending: true })
      .limit(50),
  )
    .then((rows) =>
      rows.map((row) => {
        const client = relationRecord(row.clients);
        const status = String(row.status ?? '');
        const timestamp = asString(row.updated_at) ?? asString(row.claimed_at);
        const stale = status === 'publishing' && isStalePublishing(timestamp, nowIso);
        return {
          id: String(row.id),
          title: `${asString(client?.name) ?? 'Client'} · post ${Number(row.post_index ?? 0) + 1}`,
          detail:
            asString(row.last_error) ??
            `${String(row.platform ?? 'platform')} checkpoint is ${status}.`,
          href: `/dashboard/runs/${String(row.run_id)}`,
          status,
          timestamp,
          ageMinutes: minutesSince(timestamp, nowIso),
          severity: status === 'reconcile' || stale ? ('critical' as const) : ('warning' as const),
        };
      }),
    )
    .catch((error: Error) => {
      errors.push(`content_publications: ${error.message}`);
      return [];
    });

  const scheduleIssues = await safeQuery<Record<string, unknown>>(
    supabase
      .from('content_schedules')
      .select('id, run_id, status, scheduled_for, last_error, updated_at, clients(name, slug), tool_runs(task, tool)')
      .in('status', ['pending', 'publishing', 'failed'])
      .order('scheduled_for', { ascending: true })
      .limit(50),
  )
    .then((rows) =>
      rows
        .filter((row) => {
          const status = String(row.status ?? '');
          if (status === 'failed') return true;
          if (status === 'publishing') return isStalePublishing(asString(row.updated_at), nowIso);
          return Date.parse(String(row.scheduled_for ?? '')) <= now.getTime();
        })
        .map((row) => {
          const client = relationRecord(row.clients);
          const run = relationRecord(row.tool_runs);
          const status = String(row.status ?? '');
          const due = Date.parse(String(row.scheduled_for ?? '')) <= now.getTime();
          return {
            id: String(row.id),
            title: asString(client?.name) ?? 'Client',
            detail:
              asString(row.last_error) ??
              asString(run?.task) ??
              (due ? 'Scheduled publish is due or overdue.' : 'Scheduled publish is in progress.'),
            href: `/dashboard/runs/${String(row.run_id)}`,
            status,
            timestamp: asString(row.scheduled_for),
            ageMinutes: minutesSince(asString(row.scheduled_for), nowIso),
            severity: status === 'failed' || status === 'publishing' ? ('critical' as const) : ('warning' as const),
          };
        }),
    )
    .catch((error: Error) => {
      errors.push(`content_schedules: ${error.message}`);
      return [];
    });

  const reviewDeliveryIssues = await safeQuery<Record<string, unknown>>(
    supabase
      .from('review_requests')
      .select('id, client_id, customer_name, channel, send_status, status, created_at, clicked_at, delivery_error, clients(name, slug)')
      .in('send_status', ['failed', 'pending'])
      .order('created_at', { ascending: false })
      .limit(50),
  )
    .then((rows) =>
      rows.map((row) => {
        const client = relationRecord(row.clients);
        const sendStatus = String(row.send_status ?? '');
        return {
          id: String(row.id),
          title: asString(client?.name) ?? 'Client',
          detail:
            asString(row.delivery_error) ??
            `${asString(row.customer_name) ?? 'Customer'} review request is ${sendStatus} by ${String(row.channel ?? 'manual')}.`,
          href: asString(client?.slug) ? `/dashboard/clients/${asString(client?.slug)}` : null,
          status: sendStatus,
          timestamp: asString(row.created_at),
          ageMinutes: minutesSince(asString(row.created_at), nowIso),
          severity: sendStatus === 'failed' ? ('critical' as const) : ('warning' as const),
        };
      }),
    )
    .catch((error: Error) => {
      errors.push(`review_requests: ${error.message}`);
      return [];
    });

  const clients = await safeQuery<DashboardClient>(
    supabase.from('clients').select(clientColumns).order('created_at', { ascending: false }).limit(500),
  )
    .then((rows) => rows.map(normalizeClient))
    .catch((error: Error) => {
      errors.push(`clients: ${error.message}`);
      return [];
    });

  const inactiveClients = clients
    .filter((client) =>
      !isDeliveryActive({
        subscriptionStatus: client.subscription_status,
        billingOverride: client.billing_override,
      }),
    )
    .map((client) => ({
      id: client.id,
      name: client.name,
      slug: client.slug,
      plan: client.plan,
      subscriptionStatus: client.subscription_status,
      billingOverride: client.billing_override,
    }));

  const metrics = await safeQuery<Record<string, unknown>>(
    supabase
      .from('content_metrics')
      .select('id, client_id, platform, interactions, fetched_at, clients(name, slug)')
      .order('fetched_at', { ascending: false })
      .limit(500),
  ).catch((error: Error) => {
    errors.push(`content_metrics: ${error.message}`);
    return [];
  });

  const metricByClient = new Map<string, MonitoringMetricClient>();
  for (const row of metrics) {
    const clientId = asString(row.client_id);
    if (!clientId) continue;
    const client = relationRecord(row.clients);
    const fetchedAt = asString(row.fetched_at);
    const existing = metricByClient.get(clientId);
    const interactions = typeof row.interactions === 'number' ? row.interactions : 0;
    const latestFetchedAt =
      !existing?.latestFetchedAt || (fetchedAt && Date.parse(fetchedAt) > Date.parse(existing.latestFetchedAt))
        ? fetchedAt
        : existing.latestFetchedAt;

    metricByClient.set(clientId, {
      id: clientId,
      name: asString(client?.name) ?? 'Client',
      slug: asString(client?.slug) ?? clientId,
      latestFetchedAt,
      totalInteractions: (existing?.totalInteractions ?? 0) + interactions,
      rowCount: (existing?.rowCount ?? 0) + 1,
      stale: latestFetchedAt ? Date.parse(latestFetchedAt) < staleMetricCutoffMs : true,
    });
  }

  const metricClients = [...metricByClient.values()].sort((a, b) => {
    if (a.stale !== b.stale) return a.stale ? -1 : 1;
    return (Date.parse(b.latestFetchedAt ?? '') || 0) - (Date.parse(a.latestFetchedAt ?? '') || 0);
  });

  const stats = {
    pendingApprovals: pendingApprovals.length,
    dueSchedules: scheduleIssues.filter((row) => row.status === 'pending').length,
    failedSchedules: scheduleIssues.filter((row) => row.status === 'failed').length,
    reconcilePublications: publicationCheckpoints.filter((row) => row.status === 'reconcile').length,
    stalePublishingPublications: publicationCheckpoints.filter(
      (row) => row.status === 'publishing' && row.severity === 'critical',
    ).length,
    failedReviewRequests: reviewDeliveryIssues.filter((row) => row.status === 'failed').length,
    metricsRows: metrics.length,
    clientsWithFreshMetrics: metricClients.filter((client) => !client.stale).length,
    inactiveDeliveryClients: inactiveClients.length,
  };

  const monitoringInput = {
    nowIso,
    pendingApprovals: stats.pendingApprovals,
    reconcilePublications: stats.reconcilePublications,
    stalePublishingPublications: stats.stalePublishingPublications,
    dueSchedules: stats.dueSchedules,
    failedSchedules: stats.failedSchedules,
    failedReviewRequests: stats.failedReviewRequests,
    staleMetricsClients: metricClients.filter((client) => client.stale).length,
    inactiveDeliveryClients: stats.inactiveDeliveryClients,
  };

  return {
    capturedAt: nowIso,
    health: monitoringSeverity(monitoringInput),
    issues: buildMonitoringIssues(monitoringInput),
    stats,
    pendingApprovals,
    publicationCheckpoints,
    scheduleIssues,
    reviewDeliveryIssues,
    metricClients,
    inactiveClients,
    errors,
  };
}

export async function loadClientDetail(slug: string): Promise<DashboardClientDetail | null> {
  const supabase = getAdminSupabase();
  const errors: string[] = [];

  const { data: client, error } = await supabase
    .from('clients')
    .select(clientColumns)
    .eq('slug', slug)
    .single()
    .then(async (result) => {
      if (!result.error || !isMissingGoogleBusinessColumns(new Error(result.error.message))) {
        return result;
      }
      const fallback = await supabase.from('clients').select(baseClientColumns).eq('slug', slug).single();
      return {
        ...fallback,
        data: fallback.data ? normalizeClient(fallback.data as Partial<DashboardClient>) : fallback.data,
      };
    });

  if (error || !client) return null;

  const brandVoice = await supabase
    .from('brand_voices')
    .select('id, client_id, tone, about, audience, dos, donts, sample_posts, banned_phrases, created_at')
    .eq('client_id', client.id)
    .single()
    .then(({ data, error: voiceError }) => {
      if (voiceError && voiceError.code !== 'PGRST116') errors.push(`brand_voices: ${voiceError.message}`);
      return (data ?? null) as DashboardBrandVoice | null;
    });

  const toolRuns = await safeQuery<DashboardToolRun>(
    supabase
      .from('tool_runs')
      .select('id, client_id, task, tool, input, output, created_at')
      .eq('client_id', client.id)
      .order('created_at', { ascending: false })
      .limit(12),
  ).catch((toolRunError: Error) => {
    errors.push(`tool_runs: ${toolRunError.message}`);
    return [];
  });

  const reviews = await safeQuery<DashboardReview>(
    supabase
      .from('reviews')
      .select(reviewColumns)
      .eq('client_id', client.id)
      .order('created_at', { ascending: false })
      .limit(12),
  )
    .catch((reviewError: Error) => {
      if (!isMissingGoogleBusinessColumns(reviewError)) throw reviewError;
      return safeQuery<DashboardReview>(
        supabase
          .from('reviews')
          .select(baseReviewColumns)
          .eq('client_id', client.id)
          .order('created_at', { ascending: false })
          .limit(12),
      ).then((rows) => rows.map(normalizeReview));
    })
    .catch((reviewError: Error) => {
    errors.push(`reviews: ${reviewError.message}`);
    return [];
  });

  const contentApprovals = await safeQuery<DashboardContentApproval>(
    supabase
      .from('content_approvals')
      .select('id, run_id, client_id, status, notes, requested_at, decided_at')
      .eq('client_id', client.id)
      .order('requested_at', { ascending: false })
      .limit(12),
  ).catch((approvalError: Error) => {
    errors.push(`content_approvals: ${approvalError.message}`);
    return [];
  });

  return {
    client: normalizeClient(client as Partial<DashboardClient>),
    brandVoice,
    toolRuns,
    reviews,
    contentApprovals,
    errors,
  };
}

// Roll a client's post-publish metrics up for the client dashboard. Best-effort:
// returns null when there's no metrics data yet (or the table isn't migrated), so the
// page can simply omit the performance section.
export async function loadClientPerformance(clientId: string): Promise<ClientPerformanceSummary | null> {
  const { data, error } = await getAdminSupabase()
    .from('content_metrics')
    .select(
      'platform, caption, permalink, likes, comments, shares, saved, reach, impressions, interactions, fetched_at',
    )
    .eq('client_id', clientId);
  if (error || !data) return null;
  return summarizeClientPerformance(data as MetricRowInput[]);
}

// Best weekday/hour slots to publish for a client, ranked by average engagement of
// past posts (computed in `timeZone`). Best-effort: [] when there's no dated history.
export async function loadClientPostingInsights(
  clientId: string,
  timeZone: string,
): Promise<PostingSlot[]> {
  const { data, error } = await getAdminSupabase()
    .from('content_metrics')
    .select('published_at, likes, comments, shares, saved, interactions')
    .eq('client_id', clientId)
    .not('published_at', 'is', null);
  if (error || !data) return [];
  return recommendPostTimes(data as PublishedMetric[], timeZone);
}

export async function loadToolRunDetail(id: string): Promise<DashboardToolRunDetail | null> {
  const supabase = getAdminSupabase();
  const errors: string[] = [];

  const { data: run, error } = await supabase
    .from('tool_runs')
    .select('id, client_id, task, tool, input, output, model_usage, created_at')
    .eq('id', id)
    .single();

  if (error || !run) return null;

  let client: DashboardToolRunDetail['client'] = null;
  let approval: DashboardContentApproval | null = null;
  let publications: DashboardContentPublication[] = [];
  let currentBannedPhrases: string[] = [];
  if (run.client_id) {
    const { data: clientData, error: clientError } = await supabase
      .from('clients')
      .select('id, slug, name, timezone')
      .eq('id', run.client_id)
      .single();

    if (clientError && clientError.code !== 'PGRST116') {
      errors.push(`client: ${clientError.message}`);
    }
    client = (clientData ?? null) as DashboardToolRunDetail['client'];

    const { data: brandVoiceData, error: brandVoiceError } = await supabase
      .from('brand_voices')
      .select('banned_phrases')
      .eq('client_id', run.client_id)
      .single();

    if (brandVoiceError && brandVoiceError.code !== 'PGRST116') {
      errors.push(`brand_voices: ${brandVoiceError.message}`);
    }
    currentBannedPhrases = Array.isArray(brandVoiceData?.banned_phrases)
      ? brandVoiceData.banned_phrases.filter(
          (phrase): phrase is string => typeof phrase === 'string' && phrase.trim().length > 0,
        )
      : [];

    const { data: approvalData, error: approvalError } = await supabase
      .from('content_approvals')
      .select('id, run_id, client_id, status, notes, requested_at, decided_at')
      .eq('run_id', run.id)
      .maybeSingle();

    if (approvalError) errors.push(`content_approvals: ${approvalError.message}`);
    approval = (approvalData ?? null) as DashboardContentApproval | null;

    const { data: publicationData, error: publicationError } = await supabase
      .from('content_publications')
      .select(
        'id, run_id, post_index, platform, status, reference, last_error, claimed_at, published_at, updated_at',
      )
      .eq('run_id', run.id)
      .order('post_index', { ascending: true });

    if (publicationError) errors.push(`content_publications: ${publicationError.message}`);
    publications = (publicationData ?? []) as DashboardContentPublication[];
  }

  return {
    run: run as DashboardToolRun,
    client,
    approval,
    publications,
    currentBannedPhrases,
    errors,
  };
}
