#!/usr/bin/env node
// Refreshes post-publish Meta metrics needed by the real-client report proof.
// Set LAUNCH_METRICS_RUN_ID for one run, or omit it to scan recent published runs.

import { config } from 'dotenv';

config({ path: '.env', quiet: true });
config({ path: '.env.local', override: true, quiet: true });

const runId = process.env.LAUNCH_METRICS_RUN_ID?.trim();
const lookbackDays = parsePositiveInt(process.env.LAUNCH_METRICS_LOOKBACK_DAYS, 90);
const limit = parsePositiveInt(process.env.LAUNCH_METRICS_LIMIT, 25);

if (runId && !isUuid(runId)) {
  throw new Error('LAUNCH_METRICS_RUN_ID must be a UUID. Omit it to refresh recent published runs.');
}

const { refreshRunMetrics, loadRecentlyPublishedRunIds } = await import('../src/forge/data/analytics');
const runIds = runId
  ? [runId]
  : await loadRecentlyPublishedRunIds(new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000).toISOString(), limit);

if (runIds.length === 0) {
  console.log(
    JSON.stringify(
      {
        capturedAt: new Date().toISOString(),
        refreshed: 0,
        message:
          'No recent published Instagram/Facebook runs were found. Publish or reconcile a Meta social-post run first, then rerun metrics refresh.',
      },
      null,
      2,
    ),
  );
  process.exit(0);
}

const results = [];
for (const id of runIds) {
  const result = await refreshRunMetrics(id);
  results.push({ runId: id, ...result });
}

console.log(
  JSON.stringify(
    {
      capturedAt: new Date().toISOString(),
      scanned: runIds.length,
      refreshed: results.filter((result) => result.refreshed).reduce((sum, result) => sum + result.count, 0),
      results,
    },
    null,
    2,
  ),
);

function parsePositiveInt(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
