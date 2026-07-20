import 'server-only';
import { createClient } from '@supabase/supabase-js';

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
  client: Pick<DashboardClient, 'id' | 'slug' | 'name'> | null;
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
  'id, slug, name, industry, website, locations, geographic_market, primary_goal, primary_cta, timezone, posting_frequency, approval_mode, google_business_account_id, google_business_location_id, created_at';
const baseClientColumns =
  'id, slug, name, industry, website, locations, geographic_market, primary_goal, primary_cta, timezone, posting_frequency, approval_mode, created_at';
const reviewColumns =
  'id, author, rating, text, platform, status, draft_reply, needs_manager, external_review_id, reviewed_at, created_at';
const baseReviewColumns = 'id, author, rating, text, platform, status, draft_reply, needs_manager, created_at';

function isMissingGoogleBusinessColumns(error: Error) {
  return /google_business_|external_review_id|reviewed_at/i.test(error.message);
}

function normalizeClient(client: Partial<DashboardClient>): DashboardClient {
  return {
    ...(client as DashboardClient),
    google_business_account_id: client.google_business_account_id ?? null,
    google_business_location_id: client.google_business_location_id ?? null,
  };
}

function normalizeReview(review: Partial<DashboardReview>): DashboardReview {
  return {
    ...(review as DashboardReview),
    external_review_id: review.external_review_id ?? null,
    reviewed_at: review.reviewed_at ?? null,
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

  return { clients, leads, toolRuns, errors };
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
      .select('id, slug, name')
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
