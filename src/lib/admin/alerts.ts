import type { DashboardMonitoringData } from '@/lib/admin/data';
import type { MonitoringIssue, MonitoringSeverity } from '@/lib/admin/monitoring';

export type MonitoringAlertStatus = 'sent' | 'skipped-unconfigured' | 'skipped-clean' | 'failed';

export interface MonitoringAlertPayload {
  app: 'forge';
  kind: 'monitoring-alert';
  severity: MonitoringSeverity;
  capturedAt: string;
  summary: string;
  dashboardPath: '/dashboard/monitoring';
  stats: DashboardMonitoringData['stats'];
  issues: MonitoringIssue[];
}

export interface MonitoringAlertResult {
  status: MonitoringAlertStatus;
  issueCount: number;
  httpStatus?: number;
  error?: string;
}

export function buildMonitoringAlertPayload(data: DashboardMonitoringData): MonitoringAlertPayload {
  return {
    app: 'forge',
    kind: 'monitoring-alert',
    severity: data.health,
    capturedAt: data.capturedAt,
    summary:
      data.issues.length === 0
        ? 'Forge monitoring is operational.'
        : `${data.issues.length} Forge monitoring issue${data.issues.length === 1 ? '' : 's'} need attention.`,
    dashboardPath: '/dashboard/monitoring',
    stats: data.stats,
    issues: data.issues,
  };
}

export async function sendMonitoringAlert(input: {
  data: DashboardMonitoringData;
  webhookUrl?: string | null;
  fetchImpl?: typeof fetch;
}): Promise<MonitoringAlertResult> {
  const issueCount = input.data.issues.length;
  if (!input.webhookUrl) return { status: 'skipped-unconfigured', issueCount };
  if (issueCount === 0) return { status: 'skipped-clean', issueCount };

  let url: URL;
  try {
    url = new URL(input.webhookUrl);
  } catch {
    return { status: 'failed', issueCount, error: 'FORGE_ALERT_WEBHOOK_URL is not a valid URL.' };
  }

  if (!['https:', 'http:'].includes(url.protocol)) {
    return { status: 'failed', issueCount, error: 'FORGE_ALERT_WEBHOOK_URL must be http or https.' };
  }

  try {
    const response = await (input.fetchImpl ?? fetch)(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(buildMonitoringAlertPayload(input.data)),
    });

    if (!response.ok) {
      return {
        status: 'failed',
        issueCount,
        httpStatus: response.status,
        error: `Webhook returned HTTP ${response.status}.`,
      };
    }

    return { status: 'sent', issueCount, httpStatus: response.status };
  } catch (error) {
    return {
      status: 'failed',
      issueCount,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
