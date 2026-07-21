import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { z } from 'zod';
import { CopyButton } from '@/components/dashboard/copy-button';
import { decideContentApproval, publishApprovedContent, runClientTask } from '../../actions';
import { isAdminAuthenticated } from '@/lib/admin/auth';
import { getAdminSupabase, loadToolRunDetail } from '@/lib/admin/data';
import {
  findBannedPhraseViolations,
  formatRunPayload,
  parseKeywordResearchOutput,
  parseSocialPostOutput,
} from '@/lib/admin/run-output';

export const dynamic = 'force-dynamic';

const runIdSchema = z.string().uuid();

function formatDate(value: string | null) {
  if (!value) return 'n/a';
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function platformName(value: string | null) {
  if (!value) return 'Social';
  return value
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function metricText(value: number | null, options?: Intl.NumberFormatOptions) {
  if (value === null) return 'n/a';
  return new Intl.NumberFormat('en-US', options).format(value);
}

function opportunityClass(label: string) {
  if (label === 'high') return 'text-emerald-300';
  if (label === 'medium') return 'text-gold';
  if (label === 'low') return 'text-muted';
  return 'text-muted-dark';
}

function keywordClusterTask(cluster: {
  theme: string;
  intent: string;
  keywords: string[];
  contentAngle: string;
}) {
  const keywords = cluster.keywords.slice(0, 5).join(', ');
  return [
    'Write 3 Google Business Profile posts for this week and keep them on brand.',
    `Use this SEO cluster as the content brief: ${cluster.theme}.`,
    `Search intent: ${cluster.intent}.`,
    `Target keywords: ${keywords}.`,
    `Content angle: ${cluster.contentAngle}.`,
    'Do not stuff keywords; use them only where natural.',
  ].join(' ');
}

function socialPublishingPackage(posts: Array<{
  caption: string;
  hashtags: string[];
  imageDirection: string | null;
}>) {
  return posts
    .map((post, index) => {
      const blocks = [
        `Draft ${index + 1}`,
        '',
        post.caption,
        post.hashtags.length > 0 ? post.hashtags.join(' ') : '',
        post.imageDirection ? `Image direction: ${post.imageDirection}` : '',
      ];
      return blocks.filter(Boolean).join('\n');
    })
    .join('\n\n---\n\n');
}

function ApprovalStatus({ status }: { status?: string }) {
  if (!status) return null;

  const messages: Record<string, string> = {
    'approval-pending': 'Draft generated and queued for approval.',
    'approval-approved': 'Draft approved for the next publishing step.',
    'approval-rejected': 'Draft rejected. Generate a revised version before publishing.',
    'approval-blocked': 'Approval blocked by the current brand policy.',
    'approval-error': 'The approval decision could not be saved.',
    'approval-invalid': 'The approval decision was invalid.',
    'publish-complete': 'Published to Google Business. The approved posts are now live.',
    'publish-already': 'This run was already published to Google Business.',
    'publish-blocked': 'Not published — the draft contains a banned phrase. Revise and regenerate.',
    'publish-unsupported': 'Only approved Google Business posts can be published here.',
    'publish-unconfigured': 'Not published — configure a write-scoped Google token and account/location IDs first.',
    'publish-error': 'Publishing to Google Business failed. Check the Google write scope and server logs.',
    'publish-invalid': 'That publish request was invalid.',
  };
  const isError =
    status === 'approval-blocked' ||
    status === 'publish-blocked' ||
    status === 'publish-unsupported' ||
    status === 'publish-unconfigured' ||
    status.endsWith('error') ||
    status.endsWith('invalid');

  return (
    <div
      className={`mb-6 border p-4 font-mono text-xs ${
        isError
          ? 'border-red-400/30 bg-red-500/10 text-red-100'
          : 'border-gold-border bg-gold-dim text-gold'
      }`}
    >
      {messages[status] ?? status}
    </div>
  );
}

export default async function ToolRunDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ status?: string }>;
}) {
  if (!(await isAdminAuthenticated())) redirect('/dashboard/login');

  const { id } = await params;
  const query = await searchParams;
  const runId = runIdSchema.safeParse(id);
  if (!runId.success) notFound();

  const detail = await loadToolRunDetail(runId.data);
  if (!detail) notFound();

  const { run, client, approval, currentBannedPhrases, errors } = detail;
  const socialPosts = run.tool === 'create_social_posts' ? parseSocialPostOutput(run.output) : null;
  const keywordResearch = run.tool === 'research_keywords' ? parseKeywordResearchOutput(run.output) : null;
  const bannedPhraseViolations = findBannedPhraseViolations(run.output, currentBannedPhrases);

  const publishedReferences =
    socialPosts && approval?.status === 'approved'
      ? (
          (
            await getAdminSupabase()
              .from('forge_run_evidence')
              .select('reference')
              .eq('run_id', run.id)
              .eq('kind', 'published_url')
          ).data ?? []
        )
          .map((row: { reference: string | null }) => row.reference)
          .filter((reference): reference is string => Boolean(reference))
      : [];
  const isPublished = publishedReferences.length > 0;
  const publishTarget =
    socialPosts?.platform === 'google_business'
      ? 'Google Business'
      : socialPosts?.platform === 'facebook'
        ? 'Facebook'
        : null;

  return (
    <main className="min-h-screen bg-bg text-ink">
      <header className="border-b border-gold-border bg-bg/90 px-6 py-4">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-3 font-mono text-xs uppercase tracking-wide text-muted">
              <Link href="/dashboard" className="hover:text-gold">
                Dashboard
              </Link>
              <span className="text-muted-dark">/</span>
              {client ? (
                <Link href={`/dashboard/clients/${client.slug}`} className="hover:text-gold">
                  {client.name}
                </Link>
              ) : (
                <span>Run history</span>
              )}
            </div>
            <h1 className="mt-2 font-bebas text-4xl tracking-wide text-ink">Draft Preview</h1>
          </div>
          <div className="font-mono text-[11px] uppercase tracking-wide text-muted-dark">
            Run {run.id.slice(0, 8)}
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-6 py-10">
        <ApprovalStatus status={query?.status} />
        <section className="grid gap-6 border-b border-gold-border pb-8 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div>
            <div className="section-label">Generated Output</div>
            <h2 className="mt-4 max-w-3xl font-serif text-4xl text-ink">
              {socialPosts
                ? `${socialPosts.posts.length} generated drafts`
                : keywordResearch
                  ? 'Keyword research'
                  : 'Agent run detail'}
            </h2>
            <p className="mt-3 max-w-3xl font-sans text-sm leading-6 text-muted">
              {run.task ?? 'No task description was recorded for this run.'}
            </p>
          </div>

          <dl className="grid grid-cols-2 gap-x-4 gap-y-5 border border-gold-border bg-surface/60 p-5 font-mono text-xs">
            <div>
              <dt className="uppercase tracking-wide text-muted-dark">Tool</dt>
              <dd className="mt-1 break-words text-gold">{run.tool ?? 'n/a'}</dd>
            </div>
            <div>
              <dt className="uppercase tracking-wide text-muted-dark">Created</dt>
              <dd className="mt-1 text-ink">{formatDate(run.created_at)}</dd>
            </div>
            <div>
              <dt className="uppercase tracking-wide text-muted-dark">Client</dt>
              <dd className="mt-1 text-ink">{client?.name ?? 'Unassigned'}</dd>
            </div>
            <div>
              <dt className="uppercase tracking-wide text-muted-dark">
                {keywordResearch ? 'Data Source' : 'Platform'}
              </dt>
              <dd className="mt-1 text-ink">
                {keywordResearch
                  ? (keywordResearch.dataSource?.provider ?? 'n/a')
                  : platformName(socialPosts?.platform ?? null)}
              </dd>
            </div>
            <div>
              <dt className="uppercase tracking-wide text-muted-dark">
                {keywordResearch ? 'Configured' : 'Approval'}
              </dt>
              <dd className="mt-1 uppercase text-ink">
                {keywordResearch
                  ? (keywordResearch.dataSource?.configured ? 'yes' : 'no')
                  : (approval?.status ?? 'not queued')}
              </dd>
            </div>
          </dl>
        </section>

        {errors.length > 0 && (
          <div className="mt-6 border border-red-400/30 bg-red-500/10 p-4 font-mono text-xs text-red-100">
            {errors.join(' ')}
          </div>
        )}

        {bannedPhraseViolations.length > 0 && (
          <div className="mt-6 border border-red-400/40 bg-red-500/10 p-4 font-mono text-xs leading-6 text-red-100">
            Blocked by current brand policy. This historical draft contains prohibited language:{' '}
            {bannedPhraseViolations.join(', ')}. Revise or generate a new draft before publishing.
          </div>
        )}

        {approval?.status === 'pending' && (
          <form action={decideContentApproval} className="mt-6 border border-gold-border bg-surface/50 p-5">
            <input type="hidden" name="run_id" value={run.id} />
            <div className="font-mono text-xs uppercase tracking-wide text-muted">Approval Gate</div>
            <p className="mt-3 max-w-3xl font-sans text-sm leading-6 text-muted">
              Record the operator decision before this content can move to publishing.
            </p>
            <label className="mt-4 block">
              <span className="font-mono text-[11px] uppercase tracking-wide text-muted-dark">
                Decision notes
              </span>
              <textarea
                name="notes"
                rows={3}
                className="mt-2 w-full resize-y border border-gold-border bg-bg px-4 py-3 font-mono text-sm leading-6 text-ink outline-none focus:border-gold/60"
              />
            </label>
            <div className="mt-4 flex flex-wrap gap-3">
              <button
                name="decision"
                value="approved"
                disabled={bannedPhraseViolations.length > 0}
                className="bg-gold px-5 py-3 font-mono text-xs uppercase tracking-wide text-bg transition hover:bg-gold-soft disabled:cursor-not-allowed disabled:opacity-40"
              >
                Approve Draft
              </button>
              <button
                name="decision"
                value="rejected"
                className="border border-red-400/40 px-5 py-3 font-mono text-xs uppercase tracking-wide text-red-100 transition hover:bg-red-500/10"
              >
                Reject Draft
              </button>
            </div>
          </form>
        )}

        {approval && approval.status !== 'pending' && (
          <div className="mt-6 border border-gold-border bg-surface/50 p-5 font-mono text-xs text-muted">
            Decision: <span className="uppercase text-gold">{approval.status}</span>
            {approval.decided_at ? ` on ${formatDate(approval.decided_at)}` : ''}
            {approval.notes ? ` — ${approval.notes}` : ''}
          </div>
        )}

        {socialPosts &&
          approval?.status === 'approved' &&
          bannedPhraseViolations.length === 0 && (
            <section className="mt-6 border border-emerald-300/40 bg-emerald-500/10 p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="font-mono text-xs uppercase tracking-wide text-emerald-200">
                    Publishing Package
                  </div>
                  <p className="mt-3 max-w-3xl font-sans text-sm leading-6 text-muted">
                    {isPublished
                      ? `Published ${publishedReferences.length} post${publishedReferences.length === 1 ? '' : 's'}${publishTarget ? ` to ${publishTarget}` : ''}.`
                      : publishTarget
                        ? `Approved. Publish directly to ${publishTarget}, or copy the package to post elsewhere.`
                        : 'This draft passed the current brand-policy check and has an approval record. External publishing for this platform is still manual.'}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  {!isPublished && publishTarget && (
                    <form action={publishApprovedContent}>
                      <input type="hidden" name="run_id" value={run.id} />
                      <button className="bg-emerald-400/90 px-5 py-3 font-mono text-xs uppercase tracking-wide text-bg transition hover:bg-emerald-300">
                        Publish to {publishTarget}
                      </button>
                    </form>
                  )}
                  <CopyButton value={socialPublishingPackage(socialPosts.posts)} label="Copy package" />
                </div>
              </div>
              {isPublished && (
                <ul className="mt-4 space-y-1 font-mono text-[11px] text-emerald-100">
                  {publishedReferences.map((reference) => (
                    <li key={reference} className="break-all">
                      {reference.startsWith('http') ? (
                        <a href={reference} target="_blank" rel="noreferrer" className="underline hover:text-emerald-200">
                          {reference}
                        </a>
                      ) : (
                        reference
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

        {keywordResearch ? (
          <section className="mt-8 space-y-6" aria-label="Keyword research output">
            <div className="border border-gold-border bg-surface/50 p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="font-mono text-xs uppercase tracking-wide text-muted">
                    DataForSEO Metrics
                  </div>
                  <h3 className="mt-3 font-serif text-3xl text-ink">{keywordResearch.topic}</h3>
                </div>
                {keywordResearch.dataSource && (
                  <dl className="grid grid-cols-2 gap-x-5 gap-y-2 font-mono text-[11px] uppercase tracking-wide">
                    <div>
                      <dt className="text-muted-dark">Provider</dt>
                      <dd className="mt-1 text-gold">{keywordResearch.dataSource.provider}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-dark">Language</dt>
                      <dd className="mt-1 text-ink">{keywordResearch.dataSource.language}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-dark">Location</dt>
                      <dd className="mt-1 text-ink">{keywordResearch.dataSource.location}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-dark">Configured</dt>
                      <dd className="mt-1 text-ink">{keywordResearch.dataSource.configured ? 'yes' : 'no'}</dd>
                    </div>
                  </dl>
                )}
              </div>

              {(keywordResearch.dataSource?.warning || keywordResearch.note) && (
                <div className="mt-5 border border-gold-border bg-gold-dim p-4 font-mono text-xs leading-6 text-gold">
                  {keywordResearch.dataSource?.warning ?? keywordResearch.note}
                </div>
              )}

              {keywordResearch.metrics.length > 0 ? (
                <div className="mt-6 overflow-x-auto">
                  <p className="mb-4 font-sans text-sm leading-6 text-muted">
                    Start with rows marked high or medium that also match the client&apos;s product and
                    audience. Scores are directional and use only returned provider fields; they are
                    not a promise of ranking or revenue.
                  </p>
                  <table className="min-w-full border-collapse font-mono text-xs">
                    <thead className="border-b border-gold-border text-muted-dark">
                      <tr>
                        <th className="py-3 pr-4 text-left uppercase tracking-wide">Keyword</th>
                        <th className="px-4 py-3 text-right uppercase tracking-wide">Opportunity</th>
                        <th className="px-4 py-3 text-right uppercase tracking-wide">Volume</th>
                        <th className="px-4 py-3 text-right uppercase tracking-wide">Difficulty</th>
                        <th className="px-4 py-3 text-right uppercase tracking-wide">CPC</th>
                        <th className="px-4 py-3 text-right uppercase tracking-wide">Competition</th>
                        <th className="py-3 pl-4 text-left uppercase tracking-wide">Intent</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gold-border/70">
                      {keywordResearch.metrics.map((metric) => (
                        <tr key={metric.keyword}>
                          <td className="py-3 pr-4 text-ink">{metric.keyword}</td>
                          <td className={`px-4 py-3 text-right uppercase ${opportunityClass(metric.opportunityLabel)}`}>
                            {metric.opportunityScore === null
                              ? 'unknown'
                              : `${metric.opportunityScore} · ${metric.opportunityLabel}`}
                          </td>
                          <td className="px-4 py-3 text-right text-muted">
                            {metricText(metric.searchVolume)}
                          </td>
                          <td className="px-4 py-3 text-right text-muted">
                            {metricText(metric.keywordDifficulty)}
                          </td>
                          <td className="px-4 py-3 text-right text-muted">
                            {metricText(metric.cpc, { style: 'currency', currency: 'USD' })}
                          </td>
                          <td className="px-4 py-3 text-right text-muted">
                            {metric.competitionLevel ?? metricText(metric.competition)}
                          </td>
                          <td className="py-3 pl-4 text-gold">{metric.searchIntent ?? 'n/a'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="mt-5 font-sans text-sm leading-6 text-muted">
                  No provider metrics were returned for this run. The clusters below are still available.
                </p>
              )}
            </div>

            <div className="grid gap-5 lg:grid-cols-2">
              {keywordResearch.clusters.map((cluster, index) => (
                <article key={`${cluster.theme}-${index}`} className="border border-gold-border bg-surface/50 p-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="font-mono text-xs uppercase tracking-wide text-gold">
                      {cluster.intent}
                    </div>
                    <div className="font-mono text-[11px] uppercase tracking-wide text-muted-dark">
                      Cluster {String(index + 1).padStart(2, '0')}
                    </div>
                  </div>
                  <h3 className="mt-3 font-serif text-2xl text-ink">{cluster.theme}</h3>
                  <p className="mt-3 font-sans text-sm leading-6 text-muted">{cluster.contentAngle}</p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {cluster.keywords.map((keyword) => (
                      <span
                        key={keyword}
                        className="border border-gold-border px-2 py-1 font-mono text-xs text-gold-soft"
                      >
                        {keyword}
                      </span>
                    ))}
                  </div>
                  {client && (
                    <form action={runClientTask} className="mt-5">
                      <input type="hidden" name="slug" value={client.slug} />
                      <input type="hidden" name="task" value={keywordClusterTask(cluster)} />
                      <button className="border border-gold-border px-4 py-2 font-mono text-[11px] uppercase tracking-wide text-gold transition hover:bg-gold-dim">
                        Generate posts from cluster
                      </button>
                    </form>
                  )}
                </article>
              ))}
            </div>
          </section>
        ) : socialPosts && socialPosts.posts.length > 0 ? (
          <section className="mt-8 space-y-5" aria-label="Generated post drafts">
            {socialPosts.posts.map((post, index) => {
              const captionWithHashtags = [post.caption, post.hashtags.join(' ')].filter(Boolean).join('\n\n');
              return (
                <article key={`${run.id}-${index}`} className="border border-gold-border bg-surface/50">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gold-border px-5 py-4">
                    <div className="font-mono text-xs uppercase tracking-wide text-gold">
                      Draft {String(index + 1).padStart(2, '0')}
                    </div>
                    {bannedPhraseViolations.length === 0 ? (
                      <CopyButton value={captionWithHashtags} label="Copy post" />
                    ) : (
                      <span className="font-mono text-[11px] uppercase tracking-wide text-red-200">
                        Needs revision
                      </span>
                    )}
                  </div>
                  <div className="grid lg:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.65fr)]">
                    <div className="p-5 lg:border-r lg:border-gold-border">
                      <div className="font-mono text-[11px] uppercase tracking-wide text-muted-dark">
                        Caption
                      </div>
                      <p className="mt-4 whitespace-pre-wrap font-sans text-base leading-7 text-ink">
                        {post.caption}
                      </p>
                      <div className="mt-6 font-mono text-[11px] uppercase tracking-wide text-muted-dark">
                        Hashtags
                      </div>
                      {post.hashtags.length > 0 ? (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {post.hashtags.map((hashtag, hashtagIndex) => (
                            <span
                              key={`${hashtag}-${hashtagIndex}`}
                              className="border border-gold-border px-2 py-1 font-mono text-xs text-gold-soft"
                            >
                              {hashtag}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <p className="mt-3 font-mono text-xs text-muted-dark">No hashtags generated.</p>
                      )}
                    </div>
                    <div className="border-t border-gold-border bg-bg/40 p-5 lg:border-t-0">
                      <div className="font-mono text-[11px] uppercase tracking-wide text-muted-dark">
                        Image Direction
                      </div>
                      <p className="mt-4 font-sans text-sm leading-6 text-muted">
                        {post.imageDirection ?? 'No image direction generated.'}
                      </p>
                    </div>
                  </div>
                </article>
              );
            })}
          </section>
        ) : (
          <section className="mt-8 border border-gold-border bg-surface/50 p-5">
            <div className="font-mono text-xs uppercase tracking-wide text-muted">Recorded Output</div>
            <pre className="mt-4 max-h-[640px] overflow-auto whitespace-pre-wrap break-words bg-bg p-4 font-mono text-xs leading-6 text-muted">
              {formatRunPayload(run.output)}
            </pre>
          </section>
        )}

        <details className="mt-6 border border-gold-border bg-surface/30">
          <summary className="cursor-pointer px-5 py-4 font-mono text-xs uppercase tracking-wide text-muted hover:text-gold">
            Run Input
          </summary>
          <pre className="overflow-auto border-t border-gold-border bg-bg p-5 font-mono text-xs leading-6 text-muted">
            {formatRunPayload(run.input)}
          </pre>
        </details>
      </div>
    </main>
  );
}
