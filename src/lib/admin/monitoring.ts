export type MonitoringSeverity = 'ok' | 'warning' | 'critical';

export interface MonitoringInputs {
  nowIso: string;
  pendingApprovals: number;
  reconcilePublications: number;
  stalePublishingPublications: number;
  dueSchedules: number;
  failedSchedules: number;
  failedReviewRequests: number;
  staleMetricsClients: number;
  inactiveDeliveryClients: number;
  // How many monitoring queries failed to load. Every other figure here counts only what
  // was successfully read, so without this a data-access outage would look like a clean
  // bill of health. Optional for callers that cannot fail (pure inputs in tests).
  dataErrors?: number;
}

export interface MonitoringIssue {
  severity: Exclude<MonitoringSeverity, 'ok'>;
  title: string;
  detail: string;
  href?: string;
}

export function minutesSince(value: string | null | undefined, nowIso: string): number | null {
  if (!value) return null;
  const then = Date.parse(value);
  const now = Date.parse(nowIso);
  if (!Number.isFinite(then) || !Number.isFinite(now)) return null;
  return Math.max(0, Math.floor((now - then) / 60_000));
}

export function isStalePublishing(
  updatedOrClaimedAt: string | null | undefined,
  nowIso: string,
  thresholdMinutes = 30,
): boolean {
  const age = minutesSince(updatedOrClaimedAt, nowIso);
  return age !== null && age >= thresholdMinutes;
}

export function monitoringSeverity(input: MonitoringInputs): MonitoringSeverity {
  // A blind monitor is the most dangerous state: the counts below are all "0" simply
  // because the queries behind them failed, so report critical rather than "operational".
  if ((input.dataErrors ?? 0) > 0) return 'critical';

  if (
    input.reconcilePublications > 0 ||
    input.stalePublishingPublications > 0 ||
    input.failedSchedules > 0 ||
    input.failedReviewRequests > 0
  ) {
    return 'critical';
  }

  if (
    input.dueSchedules > 0 ||
    input.pendingApprovals >= 10 ||
    input.staleMetricsClients > 0 ||
    input.inactiveDeliveryClients > 0
  ) {
    return 'warning';
  }

  return 'ok';
}

export function buildMonitoringIssues(input: MonitoringInputs): MonitoringIssue[] {
  const issues: MonitoringIssue[] = [];

  // Emitted first, and deliberately an *issue* rather than a silent flag: the alert cron
  // skips sending when there are no issues, so a data outage must surface here to be seen.
  const dataErrors = input.dataErrors ?? 0;
  if (dataErrors > 0) {
    issues.push({
      severity: 'critical',
      title: 'Monitoring data is incomplete',
      detail: `${dataErrors} monitoring quer${dataErrors === 1 ? 'y' : 'ies'} failed to load, so the figures below understate the real state. Treat this dashboard as unreliable until it clears.`,
      href: '#data-errors',
    });
  }

  if (input.reconcilePublications > 0) {
    issues.push({
      severity: 'critical',
      title: 'Publication reconciliation required',
      detail: `${input.reconcilePublications} publication checkpoint${plural(input.reconcilePublications)} need an operator decision before retrying.`,
      href: '#publication-checkpoints',
    });
  }

  if (input.stalePublishingPublications > 0) {
    issues.push({
      severity: 'critical',
      title: 'Publishing checkpoint appears stuck',
      detail: `${input.stalePublishingPublications} publication checkpoint${plural(input.stalePublishingPublications)} have been in publishing for at least 30 minutes.`,
      href: '#publication-checkpoints',
    });
  }

  if (input.failedSchedules > 0) {
    issues.push({
      severity: 'critical',
      title: 'Scheduled publishing failures',
      detail: `${input.failedSchedules} scheduled publish row${plural(input.failedSchedules)} failed and should be inspected.`,
      href: '#schedules',
    });
  }

  if (input.failedReviewRequests > 0) {
    issues.push({
      severity: 'critical',
      title: 'Review request delivery failures',
      detail: `${input.failedReviewRequests} review request${plural(input.failedReviewRequests)} failed delivery.`,
      href: '#review-requests',
    });
  }

  if (input.dueSchedules > 0) {
    issues.push({
      severity: 'warning',
      title: 'Publish schedule is due',
      detail: `${input.dueSchedules} approved schedule${plural(input.dueSchedules)} are due now or overdue.`,
      href: '#schedules',
    });
  }

  if (input.pendingApprovals >= 10) {
    issues.push({
      severity: 'warning',
      title: 'Approval queue is backing up',
      detail: `${input.pendingApprovals} draft${plural(input.pendingApprovals)} are awaiting review.`,
      href: '#approvals',
    });
  }

  if (input.staleMetricsClients > 0) {
    issues.push({
      severity: 'warning',
      title: 'Metrics refresh is stale',
      detail: `${input.staleMetricsClients} client${plural(input.staleMetricsClients)} have no fresh metrics in the last 24 hours.`,
      href: '#metrics',
    });
  }

  if (input.inactiveDeliveryClients > 0) {
    issues.push({
      severity: 'warning',
      title: 'Delivery paused by billing',
      detail: `${input.inactiveDeliveryClients} client${plural(input.inactiveDeliveryClients)} have delivery blocked by subscription state.`,
      href: '#clients',
    });
  }

  return issues;
}

function plural(count: number) {
  return count === 1 ? '' : 's';
}
