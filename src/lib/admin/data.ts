import 'server-only';
import { createClient } from '@supabase/supabase-js';

export interface DashboardClient {
  id: string;
  slug: string;
  name: string;
  industry: string | null;
  website: string | null;
  locations: number | null;
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
  created_at: string | null;
}

export interface DashboardClientDetail {
  client: DashboardClient;
  brandVoice: DashboardBrandVoice | null;
  toolRuns: DashboardToolRun[];
  reviews: DashboardReview[];
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
      .select('id, slug, name, industry, website, locations, created_at')
      .order('created_at', { ascending: false })
      .limit(8),
  ).catch((error: Error) => {
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
    .select('id, slug, name, industry, website, locations, created_at')
    .eq('slug', slug)
    .single();

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
      .select('id, author, rating, text, platform, status, draft_reply, needs_manager, created_at')
      .eq('client_id', client.id)
      .order('created_at', { ascending: false })
      .limit(12),
  ).catch((reviewError: Error) => {
    errors.push(`reviews: ${reviewError.message}`);
    return [];
  });

  return {
    client: client as DashboardClient,
    brandVoice,
    toolRuns,
    reviews,
    errors,
  };
}
