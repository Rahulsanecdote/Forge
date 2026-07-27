#!/usr/bin/env node
// Creates a real-client performance report proof run for LaunchOps verification.
// This is an operator script: it reads production data via service-role, calls the
// configured model through `generate_report`, and writes durable run/evidence/audit rows.

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { summarizeClientPerformance, type MetricRowInput } from '../src/forge/data/performance-summary-mapping';
import type { ClientContext } from '../src/forge/types';

config({ path: '.env', quiet: true });
config({ path: '.env.local', override: true, quiet: true });

const DEFAULT_AGENT_KEY = 'default';
const appUrl = normalizeAppUrl(process.env.LAUNCH_SMOKE_APP_URL || process.env.NEXT_PUBLIC_APP_URL);
const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const requestedSlug = process.env.LAUNCH_REPORT_CLIENT_SLUG?.trim();
const period = process.env.LAUNCH_REPORT_PERIOD?.trim() || currentReportPeriod();
const highlights = listEnv('LAUNCH_REPORT_HIGHLIGHTS');

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error('Set SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false },
});
const [{ resolveModel }, { generateReport }] = await Promise.all([
  import('../src/forge/model'),
  import('../src/forge/tools/generate-report'),
]);

const authority = await loadAuthority();
const { client, brandVoice, metricRows } = await loadMeasuredClient();
const performance = summarizeClientPerformance(metricRows);

if (!performance) {
  throw new Error(`Client "${client.slug}" has no usable measured content_metrics rows.`);
}

const input = {
  period,
  metrics: reportMetricsFromPerformance(performance),
  highlights: highlights.length
    ? highlights
    : [
        `Measured ${performance.measuredPosts} published post${performance.measuredPosts === 1 ? '' : 's'}.`,
        `Latest metrics were refreshed ${performance.lastFetchedAt ?? 'recently'}.`,
      ],
};
const task = `Generate a performance report for ${period} using only provided metrics and highlights.`;
const startedAt = new Date().toISOString();
const context = clientContext(client, brandVoice);

const { data: run, error: runError } = await supabase
  .from('tool_runs')
  .insert({
    agent_id: authority.agentId,
    client_id: client.id,
    task,
    tool: generateReport.name,
    input,
    status: 'running',
    started_at: startedAt,
  })
  .select('id')
  .single();

if (runError || !run) {
  throw new Error(`Could not create report proof run: ${runError?.message ?? 'missing run id'}`);
}

try {
  const output = await generateReport.execute(input, {
    client: context,
    model: resolveModel(),
  });

  const completedAt = new Date().toISOString();
  await must(
    supabase
      .from('tool_runs')
      .update({ output, status: 'succeeded', completed_at: completedAt, error: null })
      .eq('id', run.id),
    'persist report output',
  );

  await must(
    supabase.from('forge_run_evidence').insert({
      run_id: run.id,
      kind: 'report',
      description: 'LaunchOps real-client performance report proof generated from measured content_metrics.',
      payload: output,
    }),
    'record report evidence',
  );

  await must(
    supabase.from('forge_run_audits').insert({
      run_id: run.id,
      status: 'succeeded',
      summary: 'launch:report-proof:create completed and produced durable report evidence.',
      findings: [],
    }),
    'record report audit',
  );

  console.log(
    JSON.stringify(
      {
        capturedAt: completedAt,
        appUrl,
        runId: run.id,
        client: {
          name: client.name,
          slug: client.slug,
          industry: client.industry,
          website: client.website,
        },
        period,
        measuredPosts: performance.measuredPosts,
        storedMetricRows: metricRows.length,
        verifyCommand: `LAUNCH_REPORT_RUN_ID=${run.id} npm run launch:report-proof`,
        dashboardRunUrl: appUrl ? `${appUrl}/dashboard/runs/${encodeURIComponent(run.id)}` : null,
      },
      null,
      2,
    ),
  );
} catch (error) {
  await supabase
    .from('tool_runs')
    .update({
      status: 'failed',
      completed_at: new Date().toISOString(),
      error: error instanceof Error ? error.message.slice(0, 2000) : String(error).slice(0, 2000),
    })
    .eq('id', run.id);
  throw error;
}

async function loadAuthority() {
  const { data: agent, error: agentError } = await supabase
    .from('forge_agents')
    .select('id, key, status')
    .eq('key', DEFAULT_AGENT_KEY)
    .single();
  if (agentError || !agent || agent.status !== 'active') {
    throw new Error(`Default agent is not active: ${agentError?.message ?? agent?.status ?? 'missing'}`);
  }

  const { data: permission, error: permissionError } = await supabase
    .from('forge_agent_tool_permissions')
    .select('permission_level, allowed, forge_tools!inner(name, required_permission, requires_approval, verification_gates)')
    .eq('agent_id', agent.id)
    .eq('tool_name', generateReport.name)
    .single();
  if (permissionError || !permission?.allowed) {
    throw new Error(`Default agent cannot run ${generateReport.name}: ${permissionError?.message ?? 'not allowed'}`);
  }

  const tool = Array.isArray(permission.forge_tools)
    ? permission.forge_tools[0]
    : permission.forge_tools;
  if (tool?.requires_approval || (Array.isArray(tool?.verification_gates) && tool.verification_gates.length > 0)) {
    throw new Error(`${generateReport.name} has unresolved authority gates; use the dashboard approval path instead.`);
  }

  return { agentId: agent.id };
}

async function loadMeasuredClient() {
  const client = requestedSlug ? await loadClientBySlug(requestedSlug) : await loadLatestMeasuredClient();
  if (!client) {
    throw new Error(
      requestedSlug
        ? `No client found for LAUNCH_REPORT_CLIENT_SLUG=${requestedSlug}.`
        : 'No client with measured content_metrics rows was found.',
    );
  }

  const [{ data: brandVoice }, { data: metrics, error: metricsError }] = await Promise.all([
    supabase
      .from('brand_voices')
      .select('tone, about, audience, dos, donts, sample_posts, banned_phrases')
      .eq('client_id', client.id)
      .maybeSingle(),
    supabase
      .from('content_metrics')
      .select('platform, caption, permalink, likes, comments, shares, saved, reach, impressions, interactions, fetched_at')
      .eq('client_id', client.id),
  ]);

  if (metricsError) throw new Error(`Could not load content metrics: ${metricsError.message}`);

  return {
    client,
    brandVoice,
    metricRows: (metrics ?? []) as MetricRowInput[],
  };
}

async function loadClientBySlug(slug: string) {
  const { data, error } = await supabase
    .from('clients')
    .select(
      'id, slug, name, industry, website, locations, geographic_market, primary_goal, primary_cta, google_business_account_id, google_business_location_id, subscription_status, billing_override',
    )
    .eq('slug', slug)
    .maybeSingle();
  if (error) throw new Error(`Could not load client ${slug}: ${error.message}`);
  return data;
}

async function loadLatestMeasuredClient() {
  const { data: metrics, error } = await supabase
    .from('content_metrics')
    .select('client_id, fetched_at')
    .not('client_id', 'is', null)
    .order('fetched_at', { ascending: false })
    .limit(100);
  if (error) throw new Error(`Could not find measured clients: ${error.message}`);

  const clientId = metrics?.find((row) => row.client_id)?.client_id;
  if (!clientId) return null;

  const { data, error: clientError } = await supabase
    .from('clients')
    .select(
      'id, slug, name, industry, website, locations, geographic_market, primary_goal, primary_cta, google_business_account_id, google_business_location_id, subscription_status, billing_override',
    )
    .eq('id', clientId)
    .single();
  if (clientError) throw new Error(`Could not load measured client ${clientId}: ${clientError.message}`);
  return data;
}

function clientContext(client: Record<string, any>, brandVoice: Record<string, any> | null): ClientContext {
  return {
    id: client.id,
    slug: client.slug,
    name: client.name,
    industry: client.industry ?? null,
    website: client.website ?? null,
    locations: client.locations ?? 1,
    geographicMarket: client.geographic_market ?? null,
    primaryGoal: client.primary_goal ?? null,
    primaryCta: client.primary_cta ?? null,
    googleBusinessAccountId: client.google_business_account_id ?? null,
    googleBusinessLocationId: client.google_business_location_id ?? null,
    subscriptionStatus: client.subscription_status ?? null,
    billingOverride: client.billing_override ?? null,
    brandVoice: {
      tone: brandVoice?.tone ?? [],
      about: brandVoice?.about ?? '',
      audience: brandVoice?.audience ?? '',
      dos: brandVoice?.dos ?? [],
      donts: brandVoice?.donts ?? [],
      samplePosts: brandVoice?.sample_posts ?? [],
      bannedPhrases: brandVoice?.banned_phrases ?? [],
    },
  };
}

function reportMetricsFromPerformance(performance: NonNullable<ReturnType<typeof summarizeClientPerformance>>) {
  const metrics = [
    { name: 'Measured posts', value: String(performance.measuredPosts) },
    { name: 'Total reach', value: String(performance.totals.reach) },
    { name: 'Total impressions', value: String(performance.totals.impressions) },
    { name: 'Likes', value: String(performance.totals.likes) },
    { name: 'Comments', value: String(performance.totals.comments) },
    { name: 'Shares', value: String(performance.totals.shares) },
    { name: 'Saves', value: String(performance.totals.saved) },
  ];

  for (const platform of performance.byPlatform.slice(0, 3)) {
    metrics.push({
      name: `${platform.platform} posts measured`,
      value: `${platform.posts} posts, ${platform.reach} reach, ${platform.likes + platform.comments + platform.shares} engagements`,
    });
  }

  return metrics;
}

async function must<T extends { error: unknown }>(query: PromiseLike<T>, action: string) {
  const result = await query;
  if (result.error) {
    const error = result.error as { message?: string };
    throw new Error(`Could not ${action}: ${error.message ?? String(result.error)}`);
  }
}

function currentReportPeriod() {
  return new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'America/New_York' }).format(
    new Date(),
  );
}

function listEnv(key: string) {
  return (process.env[key] ?? '')
    .split(/\r?\n|;/)
    .map((value) => value.trim())
    .filter(Boolean);
}

function normalizeAppUrl(value: string | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    url.pathname = '';
    url.search = '';
    url.hash = '';
    return url.toString().replace(/\/$/, '');
  } catch {
    return null;
  }
}
