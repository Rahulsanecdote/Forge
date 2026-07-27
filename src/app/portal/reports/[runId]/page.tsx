import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import type { Metadata } from 'next';
import { CopyButton } from '@/components/dashboard/copy-button';
import { PrintButton } from '@/components/portal/print-button';
import { formatDateTime } from '@/lib/admin/format';
import { formatReportPackage } from '@/lib/admin/run-output';
import { loadPortalReportDetail } from '@/lib/portal/data';
import { getPortalClientId } from '@/lib/portal/session';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Client Report',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

const runIdSchema = z.string().uuid();
const compactNumber = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });

function platformLabel(value: string) {
  return value
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function metric(value: number | null | undefined) {
  return compactNumber.format(value ?? 0);
}

function ReportSection({ title, items }: { title: string; items: string[] }) {
  return (
    <section className="border border-gold-border bg-surface/50 p-5 break-inside-avoid">
      <div className="font-mono text-xs uppercase tracking-wide text-gold">{title}</div>
      {items.length > 0 ? (
        <ul className="mt-4 space-y-3">
          {items.map((item, index) => (
            <li
              key={`${title}-${index}`}
              className="border-b border-gold-border/60 pb-3 font-sans text-sm leading-6 text-muted last:border-b-0 last:pb-0"
            >
              {item}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 font-mono text-xs text-muted-dark">No item recorded.</p>
      )}
    </section>
  );
}

function NoAccess() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-bg px-6 text-ink">
      <div className="w-full max-w-lg border border-gold-border bg-surface/70 p-8 text-center">
        <div className="section-label">Client Report</div>
        <h1 className="mt-4 font-serif text-3xl text-ink">Access needed</h1>
        <p className="mt-3 font-sans text-sm leading-6 text-muted">
          Open this report from your personal Forge portal link.
        </p>
      </div>
    </main>
  );
}

export default async function PortalReportPage({ params }: { params: Promise<{ runId: string }> }) {
  const clientId = await getPortalClientId();
  if (!clientId) return <NoAccess />;

  const { runId } = await params;
  const parsedRunId = runIdSchema.safeParse(runId);
  if (!parsedRunId.success) notFound();

  const detail = await loadPortalReportDetail(clientId, parsedRunId.data);
  if (!detail) notFound();

  const { client, report, performance } = detail;
  const packageText = formatReportPackage(report.report);
  const totalEngagement =
    (performance?.totals.likes ?? 0) +
    (performance?.totals.comments ?? 0) +
    (performance?.totals.shares ?? 0) +
    (performance?.totals.saved ?? 0);

  return (
    <main className="min-h-screen bg-bg text-ink">
      <header className="border-b border-gold-border bg-bg/90 px-6 py-4 print:border-b-neutral-300 print:bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-3 font-mono text-xs uppercase tracking-wide text-muted print:text-neutral-500">
              <Link href="/portal" className="hover:text-gold print:hidden">
                Portal
              </Link>
              <span className="text-muted-dark print:hidden">/</span>
              <span>{client.name}</span>
            </div>
            <h1 className="mt-2 font-bebas text-4xl tracking-wide text-ink print:text-neutral-950">
              Client Report
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-3 print:hidden">
            <CopyButton value={packageText} label="Copy report" />
            <a
              href={`/portal/reports/${report.runId}/export`}
              download
              className="border border-gold-border px-3 py-2 font-mono text-[11px] uppercase tracking-wide text-muted transition hover:border-gold/60 hover:text-gold"
            >
              Download .txt
            </a>
            <PrintButton />
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-6 py-10 print:max-w-none print:bg-white print:px-10 print:text-neutral-950">
        <section className="grid gap-6 border-b border-gold-border pb-8 print:border-b-neutral-300 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div>
            <div className="section-label print:text-neutral-500">Report Period</div>
            <h2 className="mt-4 max-w-3xl font-serif text-4xl text-ink print:text-neutral-950">
              {report.period}
            </h2>
            <p className="mt-4 max-w-4xl font-sans text-base leading-7 text-muted print:text-neutral-700">
              {report.report.executiveSummary}
            </p>
          </div>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-5 border border-gold-border bg-surface/60 p-5 font-mono text-xs print:border-neutral-300 print:bg-white">
            <div>
              <dt className="uppercase tracking-wide text-muted-dark print:text-neutral-500">Generated</dt>
              <dd className="mt-1 text-ink print:text-neutral-950">{formatDateTime(report.createdAt)}</dd>
            </div>
            <div>
              <dt className="uppercase tracking-wide text-muted-dark print:text-neutral-500">Client</dt>
              <dd className="mt-1 text-ink print:text-neutral-950">{client.name}</dd>
            </div>
            <div>
              <dt className="uppercase tracking-wide text-muted-dark print:text-neutral-500">Measured Posts</dt>
              <dd className="mt-1 text-ink print:text-neutral-950">{metric(performance?.measuredPosts)}</dd>
            </div>
            <div>
              <dt className="uppercase tracking-wide text-muted-dark print:text-neutral-500">Last Updated</dt>
              <dd className="mt-1 text-ink print:text-neutral-950">
                {formatDateTime(performance?.lastFetchedAt)}
              </dd>
            </div>
          </dl>
        </section>

        <section className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-label="Performance snapshot">
          {[
            { label: 'Reach', value: performance?.totals.reach },
            { label: 'Impressions', value: performance?.totals.impressions },
            { label: 'Engagement', value: totalEngagement },
            { label: 'Published Posts', value: performance?.totals.posts },
          ].map((stat) => (
            <div key={stat.label} className="border border-gold-border bg-surface/50 p-4 print:border-neutral-300 print:bg-white">
              <div className="font-mono text-[11px] uppercase tracking-wide text-muted-dark print:text-neutral-500">
                {stat.label}
              </div>
              <div className="mt-2 font-serif text-3xl text-ink print:text-neutral-950">{metric(stat.value)}</div>
            </div>
          ))}
        </section>

        <div className="mt-8 grid gap-5 lg:grid-cols-3">
          <ReportSection title="What's Working" items={report.report.whatsWorking} />
          <ReportSection title="Needs Attention" items={report.report.needsAttention} />
          <ReportSection title="Recommended Actions" items={report.report.recommendedActions} />
        </div>

        <section className="mt-8 grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]" aria-label="Evidence">
          <div className="border border-gold-border bg-surface/50 p-5 print:border-neutral-300 print:bg-white">
            <div className="font-mono text-xs uppercase tracking-wide text-muted print:text-neutral-500">
              Top Posts
            </div>
            {performance && performance.topPosts.length > 0 ? (
              <ul className="mt-4 space-y-3">
                {performance.topPosts.map((post, index) => (
                  <li key={`${post.caption}-${index}`} className="border-b border-gold-border/60 pb-3 last:border-b-0 print:border-neutral-200">
                    <div className="flex flex-wrap items-baseline justify-between gap-3">
                      <p className="min-w-0 flex-1 truncate font-sans text-sm text-ink print:text-neutral-950">
                        {post.permalink ? (
                          <a href={post.permalink} target="_blank" rel="noreferrer" className="text-gold underline print:text-neutral-950">
                            {post.caption}
                          </a>
                        ) : (
                          post.caption
                        )}
                      </p>
                      <span className="font-mono text-[11px] uppercase tracking-wide text-muted-dark print:text-neutral-500">
                        {platformLabel(post.platform)}
                      </span>
                    </div>
                    <div className="mt-2 font-mono text-[11px] text-muted-dark print:text-neutral-500">
                      {metric(post.likes)} likes · {metric(post.comments)} comments · score {metric(post.score)}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-4 font-sans text-sm leading-6 text-muted print:text-neutral-700">
                No measured top posts are available yet.
              </p>
            )}
          </div>

          <div className="border border-gold-border bg-surface/50 p-5 print:border-neutral-300 print:bg-white">
            <div className="font-mono text-xs uppercase tracking-wide text-muted print:text-neutral-500">
              Platform Breakdown
            </div>
            {performance && performance.byPlatform.length > 0 ? (
              <dl className="mt-4 space-y-4">
                {performance.byPlatform.map((row) => (
                  <div key={row.platform} className="border-b border-gold-border/60 pb-3 last:border-b-0 print:border-neutral-200">
                    <dt className="font-mono text-[11px] uppercase tracking-wide text-gold print:text-neutral-950">
                      {platformLabel(row.platform)}
                    </dt>
                    <dd className="mt-2 grid grid-cols-2 gap-2 font-mono text-[11px] text-muted print:text-neutral-700">
                      <span>{metric(row.posts)} posts</span>
                      <span>{metric(row.reach)} reach</span>
                      <span>{metric(row.impressions)} impressions</span>
                      <span>{metric(row.likes + row.comments + row.shares + row.saved)} engagement</span>
                    </dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="mt-4 font-sans text-sm leading-6 text-muted print:text-neutral-700">
                Platform metrics will appear after published content is measured.
              </p>
            )}
          </div>
        </section>

        <section className="mt-8 border border-gold-border bg-surface/40 p-5 print:border-neutral-300 print:bg-white" aria-label="Report source">
          <div className="font-mono text-xs uppercase tracking-wide text-muted print:text-neutral-500">Source Note</div>
          <p className="mt-3 font-sans text-sm leading-6 text-muted print:text-neutral-700">
            This report is generated from Forge&apos;s recorded drafts, publication history, and measured
            metrics. Missing values mean the connected platform did not return data for that field yet.
          </p>
        </section>
      </div>
    </main>
  );
}
