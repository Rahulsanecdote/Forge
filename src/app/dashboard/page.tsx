import Link from 'next/link';
import { redirect } from 'next/navigation';
import { logout } from './actions';
import { isAdminAuthenticated } from '@/lib/admin/auth';
import { loadDashboardData } from '@/lib/admin/data';

export const dynamic = 'force-dynamic';

function formatDate(value: string | null) {
  if (!value) return 'n/a';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

function EmptyRow({ label, colSpan }: { label: string; colSpan: number }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-4 py-6 text-center font-mono text-xs text-muted-dark">
        {label}
      </td>
    </tr>
  );
}

function statusClass(status: string) {
  if (status === 'pending') return 'text-gold';
  if (status === 'approved') return 'text-emerald-300';
  if (status === 'rejected') return 'text-red-200';
  return 'text-muted';
}

export default async function DashboardPage() {
  if (!(await isAdminAuthenticated())) redirect('/dashboard/login');

  const data = await loadDashboardData();
  const pendingApprovals = data.contentApprovals.filter((approval) => approval.status === 'pending').length;

  return (
    <main className="min-h-screen bg-bg text-ink">
      <header className="border-b border-gold-border bg-bg/90 px-6 py-4">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
          <div>
            <Link href="/dashboard" className="font-bebas text-3xl tracking-wide text-ink">
              Forge
            </Link>
            <div className="font-mono text-[11px] uppercase tracking-wide text-muted">
              Operator Dashboard
            </div>
          </div>
          <form action={logout}>
            <button className="border border-gold-border px-4 py-2 font-mono text-xs uppercase tracking-wide text-muted transition hover:border-gold/60 hover:text-gold">
              Sign Out
            </button>
          </form>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-6 py-10">
        <div className="mb-6 flex justify-end">
          <Link href="/dashboard/onboarding" className="bg-gold px-4 py-3 font-mono text-xs uppercase tracking-wide text-bg transition hover:bg-gold-soft">
            Onboard client
          </Link>
        </div>
        <div className="flex flex-col justify-between gap-4 border-b border-gold-border pb-8 md:flex-row md:items-end">
          <div>
            <div className="section-label">Live Control Plane</div>
            <h1 className="mt-4 font-serif text-4xl text-ink">Marketing agent operations</h1>
            <p className="mt-3 max-w-2xl font-sans text-sm leading-6 text-muted">
              Monitor incoming demand, client configuration, and recent Forge tool execution from
              one server-rendered surface.
            </p>
          </div>
          <div className="font-mono text-xs uppercase tracking-wide text-muted">
            Service-role reads stay server-side
          </div>
        </div>

        {data.errors.length > 0 && (
          <div className="mt-8 border border-red-400/30 bg-red-500/10 p-4">
            <div className="font-mono text-xs uppercase tracking-wide text-red-200">
              Data Access Issues
            </div>
            <ul className="mt-2 space-y-1 font-mono text-xs text-red-100">
              {data.errors.map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          </div>
        )}

        <section className="mt-8 grid gap-4 md:grid-cols-4">
          <div className="border border-gold-border bg-surface/60 p-5">
            <div className="font-mono text-xs uppercase tracking-wide text-muted">Clients</div>
            <div className="mt-3 font-bebas text-5xl text-gold">{data.clients.length}</div>
          </div>
          <div className="border border-gold-border bg-surface/60 p-5">
            <div className="font-mono text-xs uppercase tracking-wide text-muted">Recent Leads</div>
            <div className="mt-3 font-bebas text-5xl text-gold">{data.leads.length}</div>
          </div>
          <div className="border border-gold-border bg-surface/60 p-5">
            <div className="font-mono text-xs uppercase tracking-wide text-muted">Tool Runs</div>
            <div className="mt-3 font-bebas text-5xl text-gold">{data.toolRuns.length}</div>
          </div>
          <div className="border border-gold-border bg-surface/60 p-5">
            <div className="font-mono text-xs uppercase tracking-wide text-muted">Pending Approvals</div>
            <div className="mt-3 font-bebas text-5xl text-gold">{pendingApprovals}</div>
          </div>
        </section>

        <section className="mt-8 grid gap-6 xl:grid-cols-2">
          <div className="border border-gold-border bg-surface/50">
            <div className="border-b border-gold-border px-4 py-3 font-mono text-xs uppercase tracking-wide text-muted">
              Recent Leads
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-left">
                <thead className="font-mono text-[11px] uppercase tracking-wide text-muted-dark">
                  <tr>
                    <th className="px-4 py-3 font-normal">Email</th>
                    <th className="px-4 py-3 font-normal">Source</th>
                    <th className="px-4 py-3 font-normal">Created</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gold-border/70 font-mono text-xs text-muted">
                  {data.leads.length === 0 && <EmptyRow label="No leads yet." colSpan={3} />}
                  {data.leads.map((lead) => (
                    <tr key={lead.id}>
                      <td className="px-4 py-3 text-ink">{lead.email}</td>
                      <td className="px-4 py-3">{lead.source}</td>
                      <td className="px-4 py-3">{formatDate(lead.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="border border-gold-border bg-surface/50">
            <div className="border-b border-gold-border px-4 py-3 font-mono text-xs uppercase tracking-wide text-muted">
              Clients
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-left">
                <thead className="font-mono text-[11px] uppercase tracking-wide text-muted-dark">
                  <tr>
                    <th className="px-4 py-3 font-normal">Name</th>
                    <th className="px-4 py-3 font-normal">Slug</th>
                    <th className="px-4 py-3 font-normal">Industry</th>
                    <th className="px-4 py-3 font-normal">Locations</th>
                    <th className="px-4 py-3 font-normal">Open</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gold-border/70 font-mono text-xs text-muted">
                  {data.clients.length === 0 && <EmptyRow label="No clients configured." colSpan={5} />}
                  {data.clients.map((client) => (
                    <tr key={client.id}>
                      <td className="px-4 py-3 text-ink">{client.name}</td>
                      <td className="px-4 py-3">{client.slug}</td>
                      <td className="px-4 py-3">{client.industry ?? 'n/a'}</td>
                      <td className="px-4 py-3">{client.locations ?? 1}</td>
                      <td className="px-4 py-3">
                        <Link
                          href={`/dashboard/clients/${client.slug}`}
                          className="text-gold transition hover:text-gold-soft"
                        >
                          Manage
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <section className="mt-6 border border-gold-border bg-surface/50">
          <div className="border-b border-gold-border px-4 py-3 font-mono text-xs uppercase tracking-wide text-muted">
            Content Approval Queue
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-left">
              <thead className="font-mono text-[11px] uppercase tracking-wide text-muted-dark">
                <tr>
                  <th className="px-4 py-3 font-normal">Status</th>
                  <th className="px-4 py-3 font-normal">Client</th>
                  <th className="px-4 py-3 font-normal">Tool</th>
                  <th className="px-4 py-3 font-normal">Task</th>
                  <th className="px-4 py-3 font-normal">Requested</th>
                  <th className="px-4 py-3 font-normal">Open</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gold-border/70 font-mono text-xs text-muted">
                {data.contentApprovals.length === 0 && <EmptyRow label="No content decisions queued." colSpan={6} />}
                {data.contentApprovals.map((approval) => (
                  <tr key={approval.id}>
                    <td className={`px-4 py-3 uppercase ${statusClass(approval.status)}`}>
                      {approval.status}
                    </td>
                    <td className="px-4 py-3">
                      {approval.client_slug ? (
                        <Link
                          href={`/dashboard/clients/${approval.client_slug}`}
                          className="text-ink transition hover:text-gold"
                        >
                          {approval.client_name ?? approval.client_slug}
                        </Link>
                      ) : (
                        approval.client_name ?? approval.client_id
                      )}
                    </td>
                    <td className="px-4 py-3 text-ink">{approval.run_tool ?? 'n/a'}</td>
                    <td className="max-w-xl px-4 py-3">{approval.run_task ?? 'n/a'}</td>
                    <td className="px-4 py-3">{formatDate(approval.requested_at)}</td>
                    <td className="px-4 py-3">
                      <Link href={`/dashboard/runs/${approval.run_id}`} className="text-gold transition hover:text-gold-soft">
                        {approval.status === 'pending' ? 'Review' : 'Open'}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mt-6 border border-gold-border bg-surface/50">
          <div className="border-b border-gold-border px-4 py-3 font-mono text-xs uppercase tracking-wide text-muted">
            Recent Agent Tool Runs
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left">
              <thead className="font-mono text-[11px] uppercase tracking-wide text-muted-dark">
                <tr>
                  <th className="px-4 py-3 font-normal">Tool</th>
                  <th className="px-4 py-3 font-normal">Task</th>
                  <th className="px-4 py-3 font-normal">Client ID</th>
                  <th className="px-4 py-3 font-normal">Created</th>
                  <th className="px-4 py-3 font-normal">Open</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gold-border/70 font-mono text-xs text-muted">
                {data.toolRuns.length === 0 && <EmptyRow label="No tool runs yet." colSpan={5} />}
                {data.toolRuns.map((run) => (
                  <tr key={run.id}>
                    <td className="px-4 py-3 text-ink">
                      <Link href={`/dashboard/runs/${run.id}`} className="transition hover:text-gold">
                        {run.tool ?? 'n/a'}
                      </Link>
                    </td>
                    <td className="max-w-xl px-4 py-3">{run.task ?? 'n/a'}</td>
                    <td className="px-4 py-3">{run.client_id ?? 'n/a'}</td>
                    <td className="px-4 py-3">{formatDate(run.created_at)}</td>
                    <td className="px-4 py-3">
                      <Link href={`/dashboard/runs/${run.id}`} className="text-gold transition hover:text-gold-soft">
                        View draft
                      </Link>
                    </td>
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
