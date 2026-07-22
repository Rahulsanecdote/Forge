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
  'id, slug, name, industry, website, locations, geographic_market, primary_goal, primary_cta, timezone, posting_frequency, approval_mode, google_business_account_id, google_business_location_id, google_review_url, created_at';
const baseClientColumns =
  'id, slug, name, industry, website, locations, geographic_market, primary_goal, primary_cta, timezone, posting_frequency, approval_mode, created_at';
const reviewColumns =
  'id, author, rating, text, platform, status, draft_reply, needs_manager, external_review_id, reviewed_at, created_at';
const baseReviewColumns = 'id, author, rating, text, platform, status, draft_reply, needs_manager, created_at';

function isMissingGoogleBusinessColumns(error: Error) {
  return /google_business_|google_review_url|external_review_id|reviewed_at/i.test(error.message);
}

function normalizeClient(client: Partial<DashboardClient>): DashboardClient {
  return {
    ...(client as DashboardClient),
    google_business_account_id: client.google_business_account_id ?? null,
    google_business_location_id: client.google_business_location_id ?? null,
    google_review_url: client.google_review_url ?? null,
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
    .select('id, client_id, task, tool, input, output, created_at')
    .eq('id', id)
    .single();

  if (error || !run) return null;

  let client: DashboardToolRunDetail['client'] = null;
  let approval: DashboardContentApproval | null = null;
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
  }

  return {
    run: run as DashboardToolRun,
    client,
    approval,
    currentBannedPhrases,
    errors,
  };
}
