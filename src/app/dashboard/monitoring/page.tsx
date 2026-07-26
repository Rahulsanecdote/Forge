import Link from 'next/link';
import { redirect } from 'next/navigation';
import { logout } from '../actions';
import { isAdminAuthenticated } from '@/lib/admin/auth';
import { loadMonitoringData, type MonitoringRow } from '@/lib/admin/data';
import { formatDateTime } from '@/lib/admin/format';
import type { MonitoringSeverity } from '@/lib/admin/monitoring';

export const dynamic = 'force-dynamic';

const HEALTH_STYLE: Record<MonitoringSeverity, { label: string; border: string; text: string; bg: string }> = {
  ok: {
    label: 'Operational',
    border: 'border-emerald-400/40',
    text: 'text-emerald-200',
    bg: 'bg-emerald-500/10',
  },
  warning: {
    label: 'Needs Attention',
    border: 'border-gold-border',
    text: 'text-gold',
    bg: 'bg-gold-dim',
  },
  critical: {
    label: 'Operator Required',
    border: 'border-red-400/40',
    text: 'text-red-100',
    bg: 'bg-red-500/10',
  },
};

const ROW_STYLE: Record<MonitoringRow['severity'], string> = {
  info: 'text-muted',
  warning: 'text-gold',
  critical: 'text-red-100',
};

function Stat({ label, value, tone = 'gold' }: { label: string; value: number; tone?: 'gold' | 'green' | 'red' }) {
  const toneClass = tone === 'green' ? 'text-emerald-300' : tone === 'red' ? 'text-red-200' : 'text-gold';
  return (
    <div className="border border-gold-border bg-surface/60 p-5">
      <div className="font-mono text-xs uppercase tracking-wide text-muted">{label}</div>
      <div className={`mt-3 font-bebas text-5xl ${toneClass}`}>{value}</div>
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return <div className="px-4 py-8 text-center font-mono text-xs text-muted-dark">{label}</div>;
}

function RowList({ rows, empty }: { rows: MonitoringRow[]; empty: string }) {
  return (
    <div className="divide-y divide-gold-border/70">
      {rows.length === 0 && <EmptyState label={empty} />}
      {rows.map((row) => {
        const body = (
          <>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <div className="font-mono text-xs text-ink">{row.title}</div>
                <div className="mt-1 max-w-3xl font-sans text-sm leading-6 text-muted">{row.detail}</div>
              </div>
              <div className={`font-mono text-[11px] uppercase tracking-wide ${ROW_STYLE[row.severity]}`}>
                {row.status}
              </div>
            </div>
            <div className="mt-2 flex flex-wrap gap-3 font-mono text-[10px] uppercase tracking-wide text-muted-dark">
              <span>{formatDateTime(row.timestamp)}</span>
              {row.ageMinutes !== null && <span>{row.ageMinutes}m old</span>}
            </div>
          </>
        );

        return row.href ? (
          <Link key={row.id} href={row.href} className="block px-4 py-4 transition hover:bg-gold-dim">
            {body}
          </Link>
        ) : (
          <div key={row.id} className="px-4 py-4">
            {body}
          </div>
        );
      })}
    </div>
  );
}

export default async function MonitoringPage() {
  if (!(await isAdminAuthenticated())) redirect('/dashboard/login');

  const data = await loadMonitoringData();
  const health = HEALTH_STYLE[data.health];

  return (
    <main className="min-h-screen bg-bg text-ink">
      <header className="border-b border-gold-border bg-bg/90 px-6 py-4">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
          <div>
            <Link href="/dashboard" className="font-mono text-xs uppercase tracking-wide text-muted hover:text-gold">
              Dashboard
            </Link>
            <h1 className="mt-2 font-bebas text-4xl tracking-wide text-ink">Operations Monitoring</h1>
          </div>
          <form action={logout}>
            <button className="border border-gold-border px-4 py-2 font-mono text-xs uppercase tracking-wide text-muted transition hover:border-gold/60 hover:text-gold">
              Sign Out
            </button>
          </form>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-6 py-8">
        <section className={`border ${health.border} ${health.bg} p-5`}>
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
            <div>
              <div className={`font-mono text-xs uppercase tracking-wide ${health.text}`}>{health.label}</div>
              <h2 className="mt-3 font-serif text-3xl text-ink">Delivery health and proof queue</h2>
              <p className="mt-2 max-w-3xl font-sans text-sm leading-6 text-muted">
                A server-side cockpit over approvals, schedules, publication checkpoints, review delivery,
                billing gates, and post metrics. It does not call external publishing APIs.
              </p>
            </div>
            <div className="font-mono text-[11px] uppercase tracking-wide text-muted">
              Captured {formatDateTime(data.capturedAt)}
            </div>
          </div>
        </section>

        {data.errors.length > 0 && (
          <div className="mt-6 border border-red-400/30 bg-red-500/10 p-4">
            <div className="font-mono text-xs uppercase tracking-wide text-red-200">Data Access Issues</div>
            <ul className="mt-2 space-y-1 font-mono text-xs text-red-100">
              {data.errors.map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          </div>
        )}

        <section className="mt-6 grid gap-4 md:grid-cols-3 xl:grid-cols-6">
          <Stat label="Pending Approvals" value={data.stats.pendingApprovals} />
          <Stat label="Due Schedules" value={data.stats.dueSchedules} tone={data.stats.dueSchedules > 0 ? 'red' : 'green'} />
          <Stat label="Reconcile" value={data.stats.reconcilePublications} tone={data.stats.reconcilePublications > 0 ? 'red' : 'green'} />
          <Stat label="Failed Reviews" value={data.stats.failedReviewRequests} tone={data.stats.failedReviewRequests > 0 ? 'red' : 'green'} />
          <Stat label="Metric Rows" value={data.stats.metricsRows} tone="green" />
          <Stat label="Delivery Blocked" value={data.stats.inactiveDeliveryClients} tone={data.stats.inactiveDeliveryClients > 0 ? 'red' : 'green'} />
        </section>

        <section className="mt-6 border border-gold-border bg-surface/50">
          <div className="border-b border-gold-border px-4 py-3 font-mono text-xs uppercase tracking-wide text-muted">
            Active Issues
          </div>
          {data.issues.length === 0 ? (
            <EmptyState label="No active monitoring issues." />
          ) : (
            <div className="divide-y divide-gold-border/70">
              {data.issues.map((issue) => (
                <a key={issue.title} href={issue.href ?? '#'} className="block px-4 py-4 transition hover:bg-gold-dim">
                  <div className={`font-mono text-[11px] uppercase tracking-wide ${issue.severity === 'critical' ? 'text-red-100' : 'text-gold'}`}>
                    {issue.severity}
                  </div>
                  <div className="mt-1 font-mono text-sm text-ink">{issue.title}</div>
                  <div className="mt-1 font-sans text-sm leading-6 text-muted">{issue.detail}</div>
                </a>
              ))}
            </div>
          )}
        </section>

        <div className="mt-6 grid gap-6 xl:grid-cols-2">
          <section id="publication-checkpoints" className="border border-gold-border bg-surface/50">
            <div className="border-b border-gold-border px-4 py-3 font-mono text-xs uppercase tracking-wide text-muted">
              Publication Checkpoints
            </div>
            <RowList rows={data.publicationCheckpoints} empty="No publishing or reconciliation checkpoints open." />
          </section>

          <section id="schedules" className="border border-gold-border bg-surface/50">
            <div className="border-b border-gold-border px-4 py-3 font-mono text-xs uppercase tracking-wide text-muted">
              Schedule Exceptions
            </div>
            <RowList rows={data.scheduleIssues} empty="No due, stuck, or failed schedules." />
          </section>

          <section id="review-requests" className="border border-gold-border bg-surface/50">
            <div className="border-b border-gold-border px-4 py-3 font-mono text-xs uppercase tracking-wide text-muted">
              Review Delivery Exceptions
            </div>
            <RowList rows={data.reviewDeliveryIssues} empty="No pending or failed review-request delivery rows." />
          </section>

          <section id="approvals" className="border border-gold-border bg-surface/50">
            <div className="border-b border-gold-border px-4 py-3 font-mono text-xs uppercase tracking-wide text-muted">
              Approval Backlog
            </div>
            <RowList rows={data.pendingApprovals} empty="No drafts awaiting approval." />
          </section>
        </div>

        <section id="metrics" className="mt-6 border border-gold-border bg-surface/50">
          <div className="border-b border-gold-border px-4 py-3 font-mono text-xs uppercase tracking-wide text-muted">
            Metrics Freshness
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left">
              <thead className="font-mono text-[11px] uppercase tracking-wide text-muted-dark">
                <tr>
                  <th className="px-4 py-3 font-normal">Client</th>
                  <th className="px-4 py-3 font-normal">Rows</th>
                  <th className="px-4 py-3 font-normal">Interactions</th>
                  <th className="px-4 py-3 font-normal">Latest Refresh</th>
                  <th className="px-4 py-3 font-normal">State</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gold-border/70 font-mono text-xs text-muted">
                {data.metricClients.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-muted-dark">
                      No post metrics captured yet.
                    </td>
                  </tr>
                )}
                {data.metricClients.map((client) => (
                  <tr key={client.id}>
                    <td className="px-4 py-3">
                      <Link href={`/dashboard/clients/${client.slug}`} className="text-ink transition hover:text-gold">
                        {client.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3">{client.rowCount}</td>
                    <td className="px-4 py-3">{client.totalInteractions}</td>
                    <td className="px-4 py-3">{formatDateTime(client.latestFetchedAt)}</td>
                    <td className={`px-4 py-3 uppercase ${client.stale ? 'text-gold' : 'text-emerald-300'}`}>
                      {client.stale ? 'stale' : 'fresh'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section id="clients" className="mt-6 border border-gold-border bg-surface/50">
          <div className="border-b border-gold-border px-4 py-3 font-mono text-xs uppercase tracking-wide text-muted">
            Billing Delivery Gates
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left">
              <thead className="font-mono text-[11px] uppercase tracking-wide text-muted-dark">
                <tr>
                  <th className="px-4 py-3 font-normal">Client</th>
                  <th className="px-4 py-3 font-normal">Plan</th>
                  <th className="px-4 py-3 font-normal">Subscription</th>
                  <th className="px-4 py-3 font-normal">Override</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gold-border/70 font-mono text-xs text-muted">
                {data.inactiveClients.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-muted-dark">
                      No clients are blocked by billing.
                    </td>
                  </tr>
                )}
                {data.inactiveClients.map((client) => (
                  <tr key={client.id}>
                    <td className="px-4 py-3">
                      <Link href={`/dashboard/clients/${client.slug}`} className="text-ink transition hover:text-gold">
                        {client.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3">{client.plan ?? 'n/a'}</td>
                    <td className="px-4 py-3 text-red-100">{client.subscriptionStatus}</td>
                    <td className="px-4 py-3">{client.billingOverride ? 'yes' : 'no'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
