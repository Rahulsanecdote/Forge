#!/usr/bin/env node
// Repeatable LaunchOps smoke checks for a deployed Forge app.
// This intentionally avoids authenticated requests and live publishing.

import { config } from 'dotenv';

config({ path: '.env', quiet: true });
config({ path: '.env.local', override: true, quiet: true });

const appUrl = normalizeAppUrl(process.env.LAUNCH_SMOKE_APP_URL || process.env.NEXT_PUBLIC_APP_URL);
const runId = process.env.LAUNCH_SMOKE_RUN_ID;
const errors = [];
const checks = [];

if (!appUrl) {
  fail('Set LAUNCH_SMOKE_APP_URL or NEXT_PUBLIC_APP_URL to an absolute http(s) URL.');
} else {
  await checkRedirect('/', '/dashboard');
  await checkRedirect('/dashboard', '/dashboard/login');
  await checkRedirect('/dashboard/onboarding', '/dashboard/login');
  await checkOk('/marketing');

  if (runId) {
    await checkRedirect(`/dashboard/runs/${encodeURIComponent(runId)}`, '/dashboard/login');
  }
}

if (errors.length) {
  console.error('production smoke FAILED:');
  for (const error of errors) console.error(`  x ${error}`);
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      capturedAt: new Date().toISOString(),
      appUrl,
      checks,
    },
    null,
    2,
  ),
);

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

async function checkRedirect(path, expectedPathname) {
  const response = await request(path, { redirect: 'manual' });
  if (!response) return;

  const location = response.headers.get('location');
  const actualPathname = location ? new URL(location, appUrl).pathname : null;
  const ok = [301, 302, 303, 307, 308].includes(response.status) && actualPathname === expectedPathname;

  record(path, ok, {
    status: response.status,
    expected: expectedPathname,
    actual: actualPathname,
  });

  if (!ok) {
    fail(`${path} expected redirect to ${expectedPathname}, got ${response.status} ${location ?? '(no location)'}`);
  }
}

async function checkOk(path) {
  const response = await request(path, { redirect: 'follow' });
  if (!response) return;

  const text = await response.text();
  const leakedOperatorData = /FORGE_ADMIN_PASSWORD|service_role|content_approvals|tool_runs/i.test(text);
  const ok = response.status === 200 && !leakedOperatorData;

  record(path, ok, {
    status: response.status,
    leakedOperatorData,
  });

  if (!ok) {
    fail(`${path} expected a public 200 without operator internals, got ${response.status}`);
  }
}

async function request(path, init) {
  const url = `${appUrl}${path}`;
  try {
    return await fetch(url, init);
  } catch (error) {
    fail(`${path} request failed: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

function record(path, ok, details) {
  checks.push({ path, ok, ...details });
}

function fail(message) {
  errors.push(message);
}
