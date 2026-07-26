import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildMonitoringIssues, isStalePublishing, minutesSince, monitoringSeverity } from './monitoring';

const base = {
  nowIso: '2026-07-26T18:30:00.000Z',
  pendingApprovals: 0,
  reconcilePublications: 0,
  stalePublishingPublications: 0,
  dueSchedules: 0,
  failedSchedules: 0,
  failedReviewRequests: 0,
  staleMetricsClients: 0,
  inactiveDeliveryClients: 0,
};

test('minutesSince returns whole elapsed minutes and ignores invalid input', () => {
  assert.equal(minutesSince('2026-07-26T18:00:20.000Z', base.nowIso), 29);
  assert.equal(minutesSince('not-a-date', base.nowIso), null);
  assert.equal(minutesSince(null, base.nowIso), null);
});

test('isStalePublishing uses a thirty minute default threshold', () => {
  assert.equal(isStalePublishing('2026-07-26T18:01:00.000Z', base.nowIso), false);
  assert.equal(isStalePublishing('2026-07-26T18:00:00.000Z', base.nowIso), true);
  assert.equal(isStalePublishing('2026-07-26T17:59:59.000Z', base.nowIso), true);
});

test('monitoringSeverity escalates critical delivery failures before warnings', () => {
  assert.equal(monitoringSeverity(base), 'ok');
  assert.equal(monitoringSeverity({ ...base, dueSchedules: 1 }), 'warning');
  assert.equal(monitoringSeverity({ ...base, dueSchedules: 1, reconcilePublications: 1 }), 'critical');
});

test('buildMonitoringIssues returns operator-facing issues with anchors', () => {
  const issues = buildMonitoringIssues({
    ...base,
    reconcilePublications: 2,
    failedReviewRequests: 1,
    staleMetricsClients: 3,
  });

  assert.deepEqual(
    issues.map((issue) => issue.severity),
    ['critical', 'critical', 'warning'],
  );
  assert.equal(issues[0].href, '#publication-checkpoints');
  assert.match(issues[1].detail, /1 review request failed delivery/);
  assert.match(issues[2].detail, /3 clients have no fresh metrics/);
});
