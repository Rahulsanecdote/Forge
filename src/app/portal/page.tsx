import { getPortalClientId } from '@/lib/portal/session';
import { loadClientPortal } from '@/lib/portal/data';
import { formatDateTime } from '@/lib/admin/format';
import { resolveScheduleTimeZone } from '@/forge/data/schedule-mapping';
import type { Metadata } from 'next';
import { decidePortalContent, portalLogout } from './actions';

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

function DecisionBanner({ status }: { status?: string }) {
  if (!status) return null;
  const messages: Record<string, string> = {
    'decision-approved': 'Approved — thanks! Your operator will schedule and publish this.',
    'decision-rejected': 'Rejected. Your operator will revise or replace this draft.',
    'decision-blocked': 'Could not approve — this draft contains a phrase on your do-not-use list. Your operator will revise it.',
    'decision-not_found': 'That draft is no longer awaiting a decision.',
    'decision-error': 'Something went wrong saving your decision. Please try again.',
    'decision-invalid': 'That request was invalid.',
  };
  const isError = status !== 'decision-approved' && status !== 'decision-rejected';
  return (
    <div
      className={`mb-6 border p-4 font-mono text-xs ${
        isError ? 'border-red-400/30 bg-red-500/10 text-red-100' : 'border-gold-border bg-gold-dim text-gold'
      }`}
    >
      {messages[status] ?? status}
    </div>
  );
}

function NoAccess() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-bg px-6 text-ink">
      <div className="w-full max-w-lg border border-gold-border bg-surface/70 p-8 text-center">
        <div className="section-label">Client Portal</div>
        <h1 className="mt-4 font-serif text-3xl text-ink">Access needed</h1>
        <p className="mt-3 font-sans text-sm leading-6 text-muted">
          Ask your Forge operator for your personal portal link to review and approve your
          content.
        </p>
      </div>
    </main>
  );
}

export default async function ClientPortalPage({
  searchParams,
}: {
  searchParams?: Promise<{ status?: string }>;
}) {
  const clientId = await getPortalClientId();
  if (!clientId) return <NoAccess />;

  const data = await loadClientPortal(clientId);
  if (!data) return <NoAccess />;

  const query = await searchParams;
  const { client, queue, schedules, performance } = data;
  const zone = resolveScheduleTimeZone(client.timezone) ?? 'UTC';
  const pending = queue.filter((item) => item.status === 'pending');
  const decided = queue.filter((item) => item.status !== 'pending');
  const pendingCount = pending.length;

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
        <DecisionBanner status={query?.status} />
        <div className="section-label">Overview</div>
        <p className="mt-3 max-w-2xl font-sans text-sm leading-6 text-muted">
          Review and approve your content, and track what&apos;s scheduled and how it&apos;s
          performing. Approve a draft to greenlight it; your Forge operator schedules and
          publishes everything you approve.
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

        <section className="mt-8" aria-label="Awaiting your approval">
          <div className="font-mono text-xs uppercase tracking-wide text-muted">Awaiting your approval</div>
          {pending.length === 0 ? (
            <p className="mt-3 font-sans text-sm leading-6 text-muted">
              Nothing needs your review right now.
            </p>
          ) : (
            <ul className="mt-3 space-y-4">
              {pending.map((item) => (
                <li key={item.runId} className="border border-gold-border bg-surface/40 p-5">
                  <div className="flex flex-wrap items-center justify-between gap-3 font-mono text-[11px] uppercase tracking-wide">
                    <span className="text-muted-dark">
                      {platformLabel(item.platform)} · {item.postCount} post{item.postCount === 1 ? '' : 's'}
                    </span>
                    <span className="text-gold">Awaiting review</span>
                  </div>

                  <ol className="mt-4 space-y-4">
                    {item.posts.map((post, index) => (
                      <li key={index} className="border-l border-gold-border pl-4">
                        {item.posts.length > 1 && (
                          <div className="font-mono text-[10px] uppercase tracking-wide text-muted-dark">
                            Post {index + 1}
                          </div>
                        )}
                        <p className="mt-1 whitespace-pre-wrap font-sans text-sm leading-6 text-ink">{post.caption}</p>
                        {post.hashtags.length > 0 && (
                          <p className="mt-2 font-mono text-[11px] text-gold">{post.hashtags.join(' ')}</p>
                        )}
                        {post.imageUrls.length > 0 && (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {post.imageUrls.map((url) => (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                key={url}
                                src={url}
                                alt="Post creative"
                                className="h-28 w-28 rounded border border-gold-border object-cover"
                              />
                            ))}
                          </div>
                        )}
                      </li>
                    ))}
                  </ol>

                  <div className="mt-4 flex flex-wrap items-center gap-3">
                    <form action={decidePortalContent}>
                      <input type="hidden" name="run_id" value={item.runId} />
                      <input type="hidden" name="decision" value="approved" />
                      <button className="bg-gold px-5 py-2.5 font-mono text-xs uppercase tracking-wide text-bg transition hover:bg-gold-soft">
                        Approve
                      </button>
                    </form>
                    <form action={decidePortalContent}>
                      <input type="hidden" name="run_id" value={item.runId} />
                      <input type="hidden" name="decision" value="rejected" />
                      <button className="border border-gold-border px-5 py-2.5 font-mono text-xs uppercase tracking-wide text-muted transition hover:border-red-400/50 hover:text-red-200">
                        Reject
                      </button>
                    </form>
                    <span className="font-mono text-[11px] text-muted-dark">
                      Requested {formatDateTime(item.requestedAt)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {decided.length > 0 && (
          <section className="mt-8" aria-label="Content history">
            <div className="font-mono text-xs uppercase tracking-wide text-muted">History</div>
            <ul className="mt-3 space-y-3">
              {decided.map((item) => (
                <li key={item.runId} className="border border-gold-border bg-surface/40 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3 font-mono text-[11px] uppercase tracking-wide">
                    <span className="text-muted-dark">
                      {platformLabel(item.platform)} · {item.postCount} post{item.postCount === 1 ? '' : 's'}
                    </span>
                    <span className={statusClass(item.status)}>{item.status}</span>
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
          </section>
        )}

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
