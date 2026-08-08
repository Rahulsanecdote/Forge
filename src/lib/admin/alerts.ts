import type { DashboardMonitoringData } from '@/lib/admin/data';
import type { MonitoringIssue, MonitoringSeverity } from '@/lib/admin/monitoring';
import { resolvesToPrivateAddress } from '@/lib/net/private-address';

// Refuse to hang the cron step on an unresponsive webhook.
const WEBHOOK_TIMEOUT_MS = 10_000;

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
  // Injectable so unit tests stay hermetic (no live DNS); production uses the real resolver.
  isPrivateHostImpl?: (hostname: string) => Promise<boolean>;
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

  // SSRF guard: the protocol check above only vets the string. Resolve the host and refuse
  // private/link-local targets (incl. 169.254.169.254 cloud metadata) before sending.
  if (await (input.isPrivateHostImpl ?? resolvesToPrivateAddress)(url.hostname)) {
    return {
      status: 'failed',
      issueCount,
      error: 'FORGE_ALERT_WEBHOOK_URL must resolve to a public address.',
    };
  }

  try {
    const response = await (input.fetchImpl ?? fetch)(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(buildMonitoringAlertPayload(input.data)),
      // Following a redirect would re-target the POST at a host that never passed the
      // checks above — the standard SSRF bypass. Treat any 3xx as a configuration error.
      redirect: 'manual',
      signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
    });

    if (response.status >= 300 && response.status < 400) {
      return {
        status: 'failed',
        issueCount,
        httpStatus: response.status,
        error: 'Webhook redirected; point FORGE_ALERT_WEBHOOK_URL at the final URL.',
      };
    }

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
