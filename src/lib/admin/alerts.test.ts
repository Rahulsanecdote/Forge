import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildMonitoringAlertPayload, sendMonitoringAlert } from './alerts';
import type { DashboardMonitoringData } from './data';

function data(overrides: Partial<DashboardMonitoringData> = {}): DashboardMonitoringData {
  return {
    capturedAt: '2026-07-26T20:00:00.000Z',
    health: 'critical',
    issues: [
      {
        severity: 'critical',
        title: 'Publication reconciliation required',
        detail: '1 checkpoint needs operator review.',
        href: '#publication-checkpoints',
      },
    ],
    stats: {
      pendingApprovals: 0,
      dueSchedules: 0,
      failedSchedules: 0,
      reconcilePublications: 1,
      stalePublishingPublications: 0,
      failedReviewRequests: 0,
      metricsRows: 0,
      clientsWithFreshMetrics: 0,
      inactiveDeliveryClients: 0,
    },
    pendingApprovals: [],
    publicationCheckpoints: [],
    scheduleIssues: [],
    reviewDeliveryIssues: [],
    metricClients: [],
    inactiveClients: [],
    errors: [],
    ...overrides,
  };
}

test('buildMonitoringAlertPayload creates a compact webhook body', () => {
  const payload = buildMonitoringAlertPayload(data());
  assert.equal(payload.app, 'forge');
  assert.equal(payload.kind, 'monitoring-alert');
  assert.equal(payload.dashboardPath, '/dashboard/monitoring');
  assert.match(payload.summary, /1 Forge monitoring issue/);
  assert.equal(payload.issues[0].title, 'Publication reconciliation required');
});

test('sendMonitoringAlert skips when unconfigured or clean', async () => {
  assert.deepEqual(await sendMonitoringAlert({ data: data(), webhookUrl: undefined }), {
    status: 'skipped-unconfigured',
    issueCount: 1,
  });

  assert.deepEqual(await sendMonitoringAlert({ data: data({ health: 'ok', issues: [] }), webhookUrl: 'https://example.com/hook' }), {
    status: 'skipped-clean',
    issueCount: 0,
  });
});

test('sendMonitoringAlert posts JSON to a configured webhook', async () => {
  const calls: Array<{ url: URL; init?: RequestInit }> = [];
  const result = await sendMonitoringAlert({
    data: data(),
    webhookUrl: 'https://example.com/hook',
    fetchImpl: async (url, init) => {
      calls.push({ url: url as URL, init });
      return new Response('', { status: 200 });
    },
  });

  assert.equal(result.status, 'sent');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url.toString(), 'https://example.com/hook');
  assert.equal(calls[0].init?.method, 'POST');
  const body = JSON.parse(String(calls[0].init?.body));
  assert.equal(body.severity, 'critical');
});

test('sendMonitoringAlert fails closed on bad urls and non-2xx responses', async () => {
  assert.equal((await sendMonitoringAlert({ data: data(), webhookUrl: 'ftp://example.com' })).status, 'failed');

  const result = await sendMonitoringAlert({
    data: data(),
    webhookUrl: 'https://example.com/hook',
    fetchImpl: async () => new Response('nope', { status: 500 }),
  });

  assert.equal(result.status, 'failed');
  assert.equal(result.httpStatus, 500);
});
