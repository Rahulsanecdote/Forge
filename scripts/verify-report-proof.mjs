#!/usr/bin/env node
// LaunchOps proof gate for real-client performance reports.
// Verifies a production `generate_report` run has measured inputs, structured output,
// durable report evidence, and audit evidence. It does not call any model provider.

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

config({ path: '.env', quiet: true });
config({ path: '.env.local', override: true, quiet: true });

const runId = process.env.LAUNCH_REPORT_RUN_ID;
const appUrl = normalizeAppUrl(process.env.LAUNCH_SMOKE_APP_URL || process.env.NEXT_PUBLIC_APP_URL);
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const errors = [];

if (!runId || !isUuid(runId)) {
  fail('Set LAUNCH_REPORT_RUN_ID to the production generate_report run UUID.');
}
if (!supabaseUrl || !serviceRoleKey) {
  fail('Set NEXT_PUBLIC_SUPABASE_URL/SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
}

let proof = null;

if (!errors.length) {
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  const { data: run, error: runError } = await supabase
    .from('tool_runs')
    .select('id, client_id, tool, task, input, output, status, started_at, completed_at')
    .eq('id', runId)
    .single();

  if (runError || !run) {
    fail(`Could not load tool run ${runId}: ${runError?.message ?? 'not found'}`);
  } else {
    proof = await verifyRun(supabase, run);
  }
}

if (errors.length) {
  console.error('report proof FAILED:');
  for (const error of errors) console.error(`  x ${error}`);
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      capturedAt: new Date().toISOString(),
      appUrl,
      reportRun: proof,
    },
    null,
    2,
  ),
);

async function verifyRun(supabase, run) {
  if (run.tool !== 'generate_report') fail(`Run ${run.id} is tool "${run.tool}", expected "generate_report".`);
  if (run.status !== 'succeeded') fail(`Run ${run.id} status is "${run.status}", expected "succeeded".`);
  if (!run.client_id) fail(`Run ${run.id} has no client_id.`);
  if (!run.completed_at) fail(`Run ${run.id} has no completed_at timestamp.`);

  const input = isRecord(run.input) ? run.input : {};
  const output = isRecord(run.output) ? run.output : {};
  const metrics = Array.isArray(input.metrics) ? input.metrics : [];
  const liveMetricNames = new Set([
    'Measured posts',
    'Total reach',
    'Total impressions',
    'Likes',
    'Comments',
    'Shares',
    'Saves',
  ]);
  const measuredInputCount = metrics.filter((metric) => {
    if (!isRecord(metric)) return false;
    return liveMetricNames.has(String(metric.name ?? ''));
  }).length;

  if (!input.period || typeof input.period !== 'string') fail(`Run ${run.id} input is missing a reporting period.`);
  if (measuredInputCount < 3) {
    fail(`Run ${run.id} does not include enough measured performance metrics in input.metrics.`);
  }
  verifyReportOutput(run.id, output);

  const [{ data: client, error: clientError }, { data: evidence, error: evidenceError }, { data: audits, error: auditError }, { data: metricRows, error: metricsError }] =
    await Promise.all([
      supabase.from('clients').select('id, name, slug, website, industry').eq('id', run.client_id).single(),
      supabase.from('forge_run_evidence').select('id, kind, description, created_at').eq('run_id', run.id).eq('kind', 'report'),
      supabase.from('forge_run_audits').select('id, status, summary, created_at').eq('run_id', run.id).eq('status', 'succeeded'),
      supabase.from('content_metrics').select('id, platform, fetched_at').eq('client_id', run.client_id).limit(25),
    ]);

  if (clientError || !client) fail(`Run ${run.id} client could not be loaded: ${clientError?.message ?? 'not found'}`);
  if (evidenceError) fail(`Run ${run.id} report evidence query failed: ${evidenceError.message}`);
  if (auditError) fail(`Run ${run.id} audit query failed: ${auditError.message}`);
  if (metricsError) fail(`Run ${run.id} content_metrics query failed: ${metricsError.message}`);
  if (!evidence || evidence.length === 0) fail(`Run ${run.id} has no forge_run_evidence row with kind=report.`);
  if (!audits || audits.length === 0) fail(`Run ${run.id} has no succeeded forge_run_audits row.`);
  if (!metricRows || metricRows.length === 0) fail(`Run ${run.id} client has no measured content_metrics rows.`);

  return {
    id: run.id,
    client: client
      ? {
          name: client.name,
          slug: client.slug,
          industry: client.industry,
          website: client.website,
        }
      : null,
    period: input.period,
    status: run.status,
    completedAt: run.completed_at,
    measuredInputCount,
    storedMetricRows: metricRows?.length ?? 0,
    reportEvidenceRows: evidence?.length ?? 0,
    auditRows: audits?.length ?? 0,
    dashboardRunUrl: appUrl ? `${appUrl}/dashboard/runs/${encodeURIComponent(run.id)}` : null,
  };
}

function verifyReportOutput(runId, output) {
  const requiredString = ['period', 'executive_summary'];
  for (const key of requiredString) {
    if (typeof output[key] !== 'string' || output[key].trim().length === 0) {
      fail(`Run ${runId} output.${key} is missing or empty.`);
    }
  }

  for (const key of ['whats_working', 'needs_attention', 'recommended_actions']) {
    if (!Array.isArray(output[key]) || output[key].length === 0) {
      fail(`Run ${runId} output.${key} must be a non-empty list.`);
    }
  }
}

function normalizeAppUrl(value) {
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

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value ?? '');
}

function isRecord(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function fail(message) {
  errors.push(message);
}
