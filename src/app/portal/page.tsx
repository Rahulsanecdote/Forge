import { getPortalClientId } from '@/lib/portal/session';
import { loadClientPortal } from '@/lib/portal/data';
import { formatDateTime } from '@/lib/admin/format';
import { resolveScheduleTimeZone } from '@/forge/data/schedule-mapping';
import type { Metadata } from 'next';
import { portalLogout } from './actions';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Client Portal',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

const compactNumber = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });

function platformLabel(value: string | null) {
  if (!value) return 'Social';
  return value
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function statusClass(status: string) {
  if (status === 'approved') return 'text-emerald-300';
  if (status === 'rejected') return 'text-red-300';
  return 'text-gold';
}

function NoAccess() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-bg px-6 text-ink">
      <div className="w-full max-w-lg border border-gold-border bg-surface/70 p-8 text-center">
        <div className="section-label">Client Portal</div>
        <h1 className="mt-4 font-serif text-3xl text-ink">Access needed</h1>
        <p className="mt-3 font-sans text-sm leading-6 text-muted">
          This portal is view-only for your business. Ask your Forge operator for your
          personal portal link to sign in.
        </p>
      </div>
    </main>
  );
}

export default async function ClientPortalPage() {
  const clientId = await getPortalClientId();
  if (!clientId) return <NoAccess />;

  const data = await loadClientPortal(clientId);
  if (!data) return <NoAccess />;

  const { client, queue, schedules, performance } = data;
  const zone = resolveScheduleTimeZone(client.timezone) ?? 'UTC';
  const pendingCount = queue.filter((item) => item.status === 'pending').length;

  return (
    <main className="min-h-screen bg-bg text-ink">
      <header className="border-b border-gold-border bg-bg/90 px-6 py-4">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4">
          <div>
            <div className="font-mono text-xs uppercase tracking-wide text-muted">Client Portal</div>
            <h1 className="mt-1 font-bebas text-3xl tracking-wide text-ink">{client.name}</h1>
          </div>
          <form action={portalLogout}>
            <button className="border border-gold-border px-4 py-2 font-mono text-xs uppercase tracking-wide text-muted transition hover:border-gold/60 hover:text-gold">
              Sign Out
            </button>
          </form>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-6 py-10">
        <div className="section-label">Overview</div>
        <p className="mt-3 max-w-2xl font-sans text-sm leading-6 text-muted">
          A read-only view of your content pipeline and results. Drafting, approval, and
          publishing are handled by your Forge operator — reach out to them to make changes.
        </p>

        <dl className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[
            { label: 'Awaiting review', value: pendingCount },
            { label: 'Scheduled', value: schedules.length },
            { label: 'Measured posts', value: performance?.measuredPosts ?? 0 },
            { label: 'Total reach', value: performance?.totals.reach ?? 0 },
          ].map((stat) => (
            <div key={stat.label} className="border border-gold-border bg-surface/50 p-4">
              <dt className="font-mono text-[11px] uppercase tracking-wide text-muted-dark">{stat.label}</dt>
              <dd className="mt-2 font-serif text-3xl text-ink">{compactNumber.format(stat.value)}</dd>
            </div>
          ))}
        </dl>

        {schedules.length > 0 && (
          <section className="mt-8" aria-label="Scheduled posts">
            <div className="font-mono text-xs uppercase tracking-wide text-muted">Scheduled to publish</div>
            <ul className="mt-3 space-y-2">
              {schedules.map((schedule) => (
                <li
                  key={schedule.runId}
                  className="flex items-center justify-between border border-gold-border bg-surface/40 px-4 py-3 font-mono text-xs"
                >
                  <span className="text-ink">{formatDateTime(schedule.scheduledFor, zone)}</span>
                  <span className="uppercase tracking-wide text-gold">{zone}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="mt-8" aria-label="Content pipeline">
          <div className="font-mono text-xs uppercase tracking-wide text-muted">Content pipeline</div>
          {queue.length === 0 ? (
            <p className="mt-3 font-sans text-sm leading-6 text-muted">No content yet.</p>
          ) : (
            <ul className="mt-3 space-y-3">
              {queue.map((item) => (
                <li key={item.runId} className="border border-gold-border bg-surface/40 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3 font-mono text-[11px] uppercase tracking-wide">
                    <span className="text-muted-dark">
                      {platformLabel(item.platform)} · {item.postCount} post{item.postCount === 1 ? '' : 's'}
                    </span>
                    <span className={statusClass(item.status)}>
                      {item.status === 'pending' ? 'Awaiting review' : item.status}
                    </span>
                  </div>
                  {item.preview && (
                    <p className="mt-3 font-sans text-sm leading-6 text-ink">{item.preview}…</p>
                  )}
                  <div className="mt-2 font-mono text-[11px] text-muted-dark">
                    Requested {formatDateTime(item.requestedAt)}
                    {item.decidedAt ? ` · decided ${formatDateTime(item.decidedAt)}` : ''}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {performance && performance.topPosts.length > 0 && (
          <section className="mt-8" aria-label="Top posts">
            <div className="font-mono text-xs uppercase tracking-wide text-muted">Top posts by engagement</div>
            <ul className="mt-3 space-y-2">
              {performance.topPosts.map((post, index) => (
                <li
                  key={`${post.permalink ?? post.caption}-${index}`}
                  className="flex flex-wrap items-baseline justify-between gap-3 border-b border-gold-border/60 pb-2 font-mono text-xs"
                >
                  <span className="min-w-0 flex-1 truncate text-ink">
                    {post.permalink ? (
                      <a href={post.permalink} target="_blank" rel="noreferrer" className="text-gold hover:text-gold-soft">
                        {post.caption}
                      </a>
                    ) : (
                      post.caption
                    )}
                  </span>
                  <span className="text-muted-dark">
                    {platformLabel(post.platform)} · {compactNumber.format(post.likes ?? 0)} likes ·{' '}
                    {compactNumber.format(post.comments ?? 0)} comments
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </main>
  );
}
