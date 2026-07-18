import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { logout, runClientTask, updateBrandVoice, updateClientProfile } from '../../actions';
import { isAdminAuthenticated } from '@/lib/admin/auth';
import { loadClientDetail } from '@/lib/admin/data';

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

function listText(values: string[] | null | undefined) {
  return (values ?? []).join('\n');
}

function StatusBanner({ status }: { status?: string }) {
  if (!status) return null;

  const messages: Record<string, string> = {
    'onboarding-complete': 'Client created from verified website findings. Review the profile and brand voice before the first run.',
    'profile-saved': 'Client profile saved.',
    'voice-saved': 'Brand voice saved.',
    'run-complete': 'Forge run completed and was logged.',
    'profile-invalid': 'Enter a valid profile name and lowercase URL slug.',
    'profile-error': 'Client profile could not be saved.',
    'voice-error': 'Brand voice could not be saved.',
    'run-error': 'Forge could not complete that run. Check provider keys and server logs.',
    'run-invalid': 'Enter a task before running Forge.',
  };

  const isError = status.endsWith('error') || status.endsWith('invalid');

  return (
    <div
      className={`mt-6 border p-4 font-mono text-xs ${
        isError
          ? 'border-red-400/30 bg-red-500/10 text-red-100'
          : 'border-gold-border bg-gold-dim text-gold'
      }`}
    >
      {messages[status] ?? status}
    </div>
  );
}

function Field({
  label,
  name,
  defaultValue,
  type = 'text',
}: {
  label: string;
  name: string;
  defaultValue?: string | number | null;
  type?: string;
}) {
  return (
    <label className="flex flex-col gap-2">
      <span className="font-mono text-xs uppercase tracking-wide text-muted">{label}</span>
      <input
        name={name}
        type={type}
        defaultValue={defaultValue ?? ''}
        className="border border-gold-border bg-bg px-4 py-3 font-mono text-sm text-ink outline-none transition placeholder:text-muted-dark focus:border-gold/60"
      />
    </label>
  );
}

function TextArea({
  label,
  name,
  defaultValue,
  rows = 5,
}: {
  label: string;
  name: string;
  defaultValue?: string | null;
  rows?: number;
}) {
  return (
    <label className="flex flex-col gap-2">
      <span className="font-mono text-xs uppercase tracking-wide text-muted">{label}</span>
      <textarea
        name={name}
        rows={rows}
        defaultValue={defaultValue ?? ''}
        className="resize-y border border-gold-border bg-bg px-4 py-3 font-mono text-sm leading-6 text-ink outline-none transition placeholder:text-muted-dark focus:border-gold/60"
      />
    </label>
  );
}

export default async function ClientDetailPage({
  params,
  searchParams,
}: {
  params: { slug: string };
  searchParams?: { status?: string };
}) {
  if (!isAdminAuthenticated()) redirect('/dashboard/login');

  const detail = await loadClientDetail(params.slug);
  if (!detail) notFound();

  const { client, brandVoice, toolRuns, reviews, contentApprovals, errors } = detail;

  return (
    <main className="min-h-screen bg-bg text-ink">
      <header className="border-b border-gold-border bg-bg/90 px-6 py-4">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
          <div>
            <Link href="/dashboard" className="font-mono text-xs uppercase tracking-wide text-muted hover:text-gold">
              Dashboard
            </Link>
            <h1 className="mt-2 font-bebas text-4xl tracking-wide text-ink">{client.name}</h1>
          </div>
          <form action={logout}>
            <button className="border border-gold-border px-4 py-2 font-mono text-xs uppercase tracking-wide text-muted transition hover:border-gold/60 hover:text-gold">
              Sign Out
            </button>
          </form>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-6 py-10">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <section>
            <div className="section-label">Client Command</div>
            <h2 className="mt-4 font-serif text-4xl text-ink">Brand voice and agent runs</h2>
            <p className="mt-3 max-w-2xl font-sans text-sm leading-6 text-muted">
              Keep the business profile current, tune the writing constraints, then run Forge
              against a concrete marketing task.
            </p>
            <StatusBanner status={searchParams?.status} />
            {errors.length > 0 && (
              <div className="mt-6 border border-red-400/30 bg-red-500/10 p-4">
                <div className="font-mono text-xs uppercase tracking-wide text-red-200">
                  Data Access Issues
                </div>
                <ul className="mt-2 space-y-1 font-mono text-xs text-red-100">
                  {errors.map((error) => (
                    <li key={error}>{error}</li>
                  ))}
                </ul>
              </div>
            )}
          </section>

          <aside className="border border-gold-border bg-surface/60 p-5">
            <div className="font-mono text-xs uppercase tracking-wide text-muted">Client Snapshot</div>
            <dl className="mt-4 space-y-3 font-mono text-xs">
              <div>
                <dt className="text-muted-dark">Slug</dt>
                <dd className="mt-1 text-ink">{client.slug}</dd>
              </div>
              <div>
                <dt className="text-muted-dark">Industry</dt>
                <dd className="mt-1 text-ink">{client.industry ?? 'n/a'}</dd>
              </div>
              <div>
                <dt className="text-muted-dark">Locations</dt>
                <dd className="mt-1 text-ink">{client.locations ?? 1}</dd>
              </div>
              <div>
                <dt className="text-muted-dark">Approval</dt>
                <dd className="mt-1 text-ink">{client.approval_mode}</dd>
              </div>
              <div>
                <dt className="text-muted-dark">Cadence</dt>
                <dd className="mt-1 text-ink">{client.posting_frequency ?? 'n/a'}</dd>
              </div>
              <div>
                <dt className="text-muted-dark">Created</dt>
                <dd className="mt-1 text-ink">{formatDate(client.created_at)}</dd>
              </div>
            </dl>
          </aside>
        </div>

        <section className="mt-8 grid gap-6 xl:grid-cols-2">
          <form action={updateClientProfile} className="border border-gold-border bg-surface/50 p-5">
            <input type="hidden" name="client_id" value={client.id} />
            <input type="hidden" name="current_slug" value={client.slug} />
            <div className="font-mono text-xs uppercase tracking-wide text-muted">Profile</div>
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <Field label="Name" name="name" defaultValue={client.name} />
              <Field label="Slug" name="slug" defaultValue={client.slug} />
              <Field label="Industry" name="industry" defaultValue={client.industry} />
              <Field label="Website" name="website" defaultValue={client.website} />
              <Field label="Locations" name="locations" type="number" defaultValue={client.locations ?? 1} />
              <Field label="Geographic Market" name="geographic_market" defaultValue={client.geographic_market} />
              <Field label="Timezone" name="timezone" defaultValue={client.timezone} />
              <Field label="Primary Goal" name="primary_goal" defaultValue={client.primary_goal} />
              <Field label="Primary CTA" name="primary_cta" defaultValue={client.primary_cta} />
              <Field label="Posting Frequency" name="posting_frequency" defaultValue={client.posting_frequency} />
              <Field label="Approval Mode" name="approval_mode" defaultValue={client.approval_mode} />
            </div>
            <button className="mt-5 bg-gold px-5 py-3 font-mono text-xs uppercase tracking-wide text-bg transition hover:bg-gold-soft">
              Save Profile
            </button>
          </form>

          <form action={runClientTask} className="border border-gold-border bg-surface/50 p-5">
            <input type="hidden" name="slug" value={client.slug} />
            <div className="font-mono text-xs uppercase tracking-wide text-muted">Run Forge</div>
            <TextArea
              label="Task"
              name="task"
              rows={8}
              defaultValue="Write 3 Google Business Profile posts for this week and keep them on brand."
            />
            <button className="mt-5 bg-gold px-5 py-3 font-mono text-xs uppercase tracking-wide text-bg transition hover:bg-gold-soft">
              Run Agent
            </button>
          </form>
        </section>

        <form action={updateBrandVoice} className="mt-6 border border-gold-border bg-surface/50 p-5">
          <input type="hidden" name="client_id" value={client.id} />
          <input type="hidden" name="slug" value={client.slug} />
          <div className="font-mono text-xs uppercase tracking-wide text-muted">Brand Voice</div>
          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            <TextArea label="Tone" name="tone" defaultValue={listText(brandVoice?.tone)} />
            <TextArea label="Audience" name="audience" defaultValue={brandVoice?.audience} />
            <TextArea label="About" name="about" defaultValue={brandVoice?.about} rows={7} />
            <TextArea label="Always Do" name="dos" defaultValue={listText(brandVoice?.dos)} rows={7} />
            <TextArea label="Never Do" name="donts" defaultValue={listText(brandVoice?.donts)} rows={7} />
            <TextArea
              label="Banned Phrases"
              name="banned_phrases"
              defaultValue={listText(brandVoice?.banned_phrases)}
              rows={7}
            />
            <div className="lg:col-span-2">
              <TextArea
                label="Sample Posts"
                name="sample_posts"
                defaultValue={listText(brandVoice?.sample_posts)}
                rows={8}
              />
            </div>
          </div>
          <button className="mt-5 bg-gold px-5 py-3 font-mono text-xs uppercase tracking-wide text-bg transition hover:bg-gold-soft">
            Save Brand Voice
          </button>
        </form>

        <section className="mt-6 grid gap-6 xl:grid-cols-3">
          <div className="border border-gold-border bg-surface/50">
            <div className="border-b border-gold-border px-4 py-3 font-mono text-xs uppercase tracking-wide text-muted">
              Content Approvals
            </div>
            <div className="divide-y divide-gold-border/70">
              {contentApprovals.length === 0 && (
                <div className="px-4 py-6 text-center font-mono text-xs text-muted-dark">
                  No content awaiting decisions.
                </div>
              )}
              {contentApprovals.map((approval) => (
                <Link
                  key={approval.id}
                  href={`/dashboard/runs/${approval.run_id}`}
                  className="group block px-4 py-4 transition hover:bg-gold-dim"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="font-mono text-xs uppercase tracking-wide text-gold">
                      {approval.status}
                    </div>
                    <div className="font-mono text-[11px] text-muted-dark">
                      {formatDate(approval.requested_at)}
                    </div>
                  </div>
                  <div className="mt-3 font-mono text-[11px] uppercase tracking-wide text-muted-dark transition group-hover:text-gold">
                    Review draft {approval.run_id.slice(0, 8)}
                  </div>
                </Link>
              ))}
            </div>
          </div>

          <div className="border border-gold-border bg-surface/50">
            <div className="border-b border-gold-border px-4 py-3 font-mono text-xs uppercase tracking-wide text-muted">
              Recent Runs
            </div>
            <div className="divide-y divide-gold-border/70">
              {toolRuns.length === 0 && (
                <div className="px-4 py-6 text-center font-mono text-xs text-muted-dark">
                  No runs yet.
                </div>
              )}
              {toolRuns.map((run) => (
                <Link
                  key={run.id}
                  href={`/dashboard/runs/${run.id}`}
                  className="group block px-4 py-4 transition hover:bg-gold-dim"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="font-mono text-xs uppercase tracking-wide text-gold">
                      {run.tool ?? 'agent run'}
                    </div>
                    <div className="font-mono text-[11px] text-muted-dark">
                      {formatDate(run.created_at)}
                    </div>
                  </div>
                  <p className="mt-2 font-sans text-sm leading-6 text-muted">{run.task ?? 'n/a'}</p>
                  <div className="mt-3 font-mono text-[11px] uppercase tracking-wide text-muted-dark transition group-hover:text-gold">
                    View draft
                  </div>
                </Link>
              ))}
            </div>
          </div>

          <div className="border border-gold-border bg-surface/50">
            <div className="border-b border-gold-border px-4 py-3 font-mono text-xs uppercase tracking-wide text-muted">
              Review Queue
            </div>
            <div className="divide-y divide-gold-border/70">
              {reviews.length === 0 && (
                <div className="px-4 py-6 text-center font-mono text-xs text-muted-dark">
                  No reviews queued.
                </div>
              )}
              {reviews.map((review) => (
                <div key={review.id} className="px-4 py-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="font-mono text-xs uppercase tracking-wide text-gold">
                      {review.author ?? 'Customer'} · {review.rating}/5 · {review.status}
                    </div>
                    <div className="font-mono text-[11px] text-muted-dark">
                      {formatDate(review.created_at)}
                    </div>
                  </div>
                  <p className="mt-2 font-sans text-sm leading-6 text-muted">{review.text}</p>
                  {review.draft_reply && (
                    <p className="mt-3 border-l border-gold-border pl-3 font-sans text-sm leading-6 text-ink">
                      {review.draft_reply}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
