import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { z } from 'zod';
import { CopyButton } from '@/components/dashboard/copy-button';
import { isAdminAuthenticated } from '@/lib/admin/auth';
import { loadToolRunDetail } from '@/lib/admin/data';
import { formatRunPayload, parseSocialPostOutput } from '@/lib/admin/run-output';

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

export default async function ToolRunDetailPage({ params }: { params: { id: string } }) {
  if (!isAdminAuthenticated()) redirect('/dashboard/login');

  const runId = runIdSchema.safeParse(params.id);
  if (!runId.success) notFound();

  const detail = await loadToolRunDetail(runId.data);
  if (!detail) notFound();

  const { run, client, errors } = detail;
  const socialPosts = run.tool === 'create_social_posts' ? parseSocialPostOutput(run.output) : null;

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
        <section className="grid gap-6 border-b border-gold-border pb-8 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div>
            <div className="section-label">Generated Output</div>
            <h2 className="mt-4 max-w-3xl font-serif text-4xl text-ink">
              {socialPosts ? `${socialPosts.posts.length} generated drafts` : 'Agent run detail'}
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
              <dt className="uppercase tracking-wide text-muted-dark">Platform</dt>
              <dd className="mt-1 text-ink">{platformName(socialPosts?.platform ?? null)}</dd>
            </div>
          </dl>
        </section>

        {errors.length > 0 && (
          <div className="mt-6 border border-red-400/30 bg-red-500/10 p-4 font-mono text-xs text-red-100">
            {errors.join(' ')}
          </div>
        )}

        {socialPosts && socialPosts.posts.length > 0 ? (
          <section className="mt-8 space-y-5" aria-label="Generated post drafts">
            {socialPosts.posts.map((post, index) => {
              const captionWithHashtags = [post.caption, post.hashtags.join(' ')].filter(Boolean).join('\n\n');
              return (
                <article key={`${run.id}-${index}`} className="border border-gold-border bg-surface/50">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gold-border px-5 py-4">
                    <div className="font-mono text-xs uppercase tracking-wide text-gold">
                      Draft {String(index + 1).padStart(2, '0')}
                    </div>
                    <CopyButton value={captionWithHashtags} label="Copy post" />
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
