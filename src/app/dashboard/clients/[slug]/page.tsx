import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import {
  generateReviewRequests,
  logout,
  openBillingPortal,
  publishReviewReply,
  runClientTask,
  runKeywordResearch,
  setClientBilling,
  startClientSubscription,
  updateBrandVoice,
  updateClientProfile,
} from '../../actions';
import { isAdminAuthenticated } from '@/lib/admin/auth';
import { loadClientDetail, loadClientPerformance } from '@/lib/admin/data';
import { loadReviewRequestSummary, type ReviewRequestItem } from '@/lib/reviews/requests';
import { billingSummary, SUBSCRIPTION_STATUSES } from '@/lib/billing/entitlements';
import { PLANS } from '@/lib/billing/plans';
import { CopyButton } from '@/components/dashboard/copy-button';
import { clientPortalLoginKey } from '@/lib/portal/session';

export const dynamic = 'force-dynamic';

const compactNumber = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });

function platformLabel(value: string) {
  return value
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

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

function firstSentence(value: string | null | undefined) {
  return value?.split(/[.!?]/)[0]?.trim() || null;
}

function keywordTopicDefault({
  client,
  brandVoice,
}: Pick<NonNullable<Awaited<ReturnType<typeof loadClientDetail>>>, 'client' | 'brandVoice'>) {
  const about = firstSentence(brandVoice?.about);
  const audience = brandVoice?.audience?.trim();
  const cta = client.primary_cta?.trim();
  const market = client.geographic_market?.trim();
  const industry = client.industry?.trim();

  return [about ?? cta ?? industry ?? client.name, audience ?? market]
    .filter((value): value is string => Boolean(value))
    .join(' for ');
}

function StatusBanner({ status }: { status?: string }) {
  if (!status) return null;

  const messages: Record<string, string> = {
    'onboarding-complete': 'Client created from verified website findings. Review the profile and brand voice before the first run.',
    'profile-saved': 'Client profile saved.',
    'voice-saved': 'Brand voice saved.',
    'run-complete': 'Forge run completed and was logged.',
    'keyword-complete': 'Keyword research completed with DataForSEO metrics when credentials are configured.',
    'profile-invalid': 'Enter a valid profile name and lowercase URL slug.',
    'profile-error': 'Client profile could not be saved.',
    'voice-error': 'Brand voice could not be saved.',
    'run-error': 'Forge could not complete that run. Check provider keys and server logs.',
    'run-invalid': 'Enter a task before running Forge.',
    'keyword-error': 'Keyword research could not complete. Check provider keys and server logs.',
    'keyword-invalid': 'Enter a keyword topic before running research.',
    'reply-published': 'Reply published to Google. The review is now marked posted.',
    'reply-blocked': 'Reply not published — the draft contains a banned phrase. Edit the brand voice or draft and retry.',
    'reply-unconfigured': 'Reply not published — configure a write-scoped Google token and the account/location IDs first.',
    'reply-error': 'Reply could not be published. Check the Google write scope and server logs.',
    'reply-invalid': 'Select a drafted Google reply to publish.',
    'billing-saved': 'Billing updated.',
    'billing-checkout-started': 'Checkout opened. The subscription activates once payment completes (synced via Stripe webhook).',
    'billing-canceled': 'Checkout canceled — no subscription was started.',
    'billing-unconfigured': 'Stripe isn’t configured (or the plan has no price / the app URL is missing). Use the manual controls below, or set the STRIPE_* env vars.',
    'billing-no-customer': 'No Stripe customer yet for this client — start a subscription first.',
    'billing-error': 'The billing action failed. Check the Stripe keys and server logs.',
    'billing-invalid': 'That billing request was invalid.',
    'reviews-no-url': 'Add a Google review URL to this client before generating requests.',
    'reviews-no-names': 'Enter at least one customer name, or leave the field blank for a single generic link.',
    'reviews-error': 'Review requests could not be created. Check the server logs.',
    'reviews-invalid': 'Could not generate review requests — client is missing.',
  };

  // `reviews-created-<created>-<sent>` carries the batch + delivery counts.
  const createdMatch = status.match(/^reviews-created-(\d+)-(\d+)$/);
  let message = messages[status] ?? status;
  if (createdMatch) {
    const created = Number(createdMatch[1]);
    const sent = Number(createdMatch[2]);
    const remainder = created - sent;
    const sentPart = sent > 0 ? ` Sent ${sent} automatically.` : '';
    const manualPart =
      remainder > 0
        ? ` ${remainder} ${remainder === 1 ? 'link is' : 'links are'} ready to copy and send below.`
        : '';
    message = `Generated ${created} review request${created === 1 ? '' : 's'}.${sentPart}${manualPart}`;
  }

  const isError =
    status.endsWith('error') ||
    status.endsWith('invalid') ||
    status.endsWith('blocked') ||
    status.endsWith('unconfigured') ||
    status === 'reviews-no-url' ||
    status === 'reviews-no-names';

  return (
    <div
      className={`mt-6 border p-4 font-mono text-xs ${
        isError
          ? 'border-red-400/30 bg-red-500/10 text-red-100'
          : 'border-gold-border bg-gold-dim text-gold'
      }`}
    >
      {message}
    </div>
  );
}

function ReviewSendBadge({ item }: { item: ReviewRequestItem }) {
  const map: Record<ReviewRequestItem['sendStatus'], { label: string; className: string }> = {
    sent: { label: `Sent · ${item.channel}`, className: 'border-emerald-400/40 bg-emerald-500/10 text-emerald-200' },
    failed: { label: 'Send failed', className: 'border-red-400/40 bg-red-500/10 text-red-200' },
    pending: { label: 'Sending…', className: 'border-gold-border bg-gold-dim text-gold' },
    skipped: { label: 'Copy & send', className: 'border-gold-border bg-bg text-muted-dark' },
  };
  const badge = map[item.sendStatus];
  return (
    <span className={`border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide ${badge.className}`}>
      {badge.label}
    </span>
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
    <label className="flex min-w-0 flex-col gap-2">
      <span className="font-mono text-xs uppercase tracking-wide text-muted">{label}</span>
      <input
        name={name}
        type={type}
        defaultValue={defaultValue ?? ''}
        className="w-full min-w-0 border border-gold-border bg-bg px-4 py-3 font-mono text-sm text-ink outline-none transition placeholder:text-muted-dark focus:border-gold/60"
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
    <label className="flex min-w-0 flex-col gap-2">
      <span className="font-mono text-xs uppercase tracking-wide text-muted">{label}</span>
      <textarea
        name={name}
        rows={rows}
        defaultValue={defaultValue ?? ''}
        className="w-full min-w-0 resize-y border border-gold-border bg-bg px-4 py-3 font-mono text-sm leading-6 text-ink outline-none transition placeholder:text-muted-dark focus:border-gold/60"
      />
    </label>
  );
}

export default async function ClientDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<{ status?: string }>;
}) {
  if (!(await isAdminAuthenticated())) redirect('/dashboard/login');

  const { slug } = await params;
  const query = await searchParams;
  const detail = await loadClientDetail(slug);
  if (!detail) notFound();

  const { client, brandVoice, toolRuns, reviews, contentApprovals, errors } = detail;
  const performance = await loadClientPerformance(client.id);
  const reviewRequests = await loadReviewRequestSummary(client.id);
  const billing = billingSummary({
    subscriptionStatus: client.subscription_status,
    billingOverride: client.billing_override,
  });
  const portalKey = clientPortalLoginKey(client.id);
  const portalLink = portalKey
    ? `${(process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/$/, '')}/portal/login?c=${client.id}&k=${portalKey}`
    : null;

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
            <StatusBanner status={query?.status} />
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
              <Field
                label="Google Business Account ID"
                name="google_business_account_id"
                defaultValue={client.google_business_account_id}
              />
              <Field
                label="Google Business Location ID"
                name="google_business_location_id"
                defaultValue={client.google_business_location_id}
              />
              <div className="md:col-span-2">
                <Field
                  label="Google Review URL"
                  name="google_review_url"
                  defaultValue={client.google_review_url}
                />
              </div>
            </div>
            <button className="mt-5 bg-gold px-5 py-3 font-mono text-xs uppercase tracking-wide text-bg transition hover:bg-gold-soft">
              Save Profile
            </button>
          </form>

          <div className="space-y-6">
            <form action={runKeywordResearch} className="border border-gold-border bg-surface/50 p-5">
              <input type="hidden" name="slug" value={client.slug} />
              <div className="font-mono text-xs uppercase tracking-wide text-muted">
                Keyword Research / DataForSEO
              </div>
              <p className="mt-3 font-sans text-sm leading-6 text-muted">
                Run the keyword tool directly against customer buying intent. If DataForSEO env vars
                are present, this includes search volume, CPC, competition, intent, difficulty, and
                an opportunity score.
              </p>
              <div className="mt-5 grid gap-4 md:grid-cols-[minmax(0,1fr)_120px]">
                <Field
                  label="Topic"
                  name="topic"
                  defaultValue={keywordTopicDefault({ client, brandVoice })}
                />
                <Field label="Count" name="count" type="number" defaultValue={20} />
              </div>
              <div className="mt-4">
                <Field
                  label="Location"
                  name="location"
                  defaultValue={client.geographic_market}
                />
              </div>
              <button className="mt-5 bg-gold px-5 py-3 font-mono text-xs uppercase tracking-wide text-bg transition hover:bg-gold-soft">
                Run Keyword Research
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
          </div>
        </section>

        <section className="mt-6 border border-gold-border bg-surface/50 p-5" aria-label="Billing">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <div className="font-mono text-xs uppercase tracking-wide text-muted">Billing</div>
            <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-wide">
              <span
                className={`inline-block h-1.5 w-1.5 rounded-full ${billing.active ? 'bg-emerald-400' : 'bg-red-400'}`}
              />
              <span className={billing.active ? 'text-emerald-200' : 'text-red-200'}>{billing.label}</span>
            </div>
          </div>
          <p className="mt-3 max-w-3xl font-sans text-sm leading-6 text-muted">
            {billing.active
              ? 'This client is active — automated posting, scheduled publishing, and review sweeps run for them.'
              : 'Delivery is paused for this client: the weekly-content, scheduled-publish, and review-sweep jobs skip them and the Publish action is blocked until a subscription is active (or you set a comp override below).'}
          </p>

          <dl className="mt-4 grid grid-cols-2 gap-4 font-mono text-xs sm:grid-cols-4">
            <div>
              <dt className="text-muted-dark">Plan</dt>
              <dd className="mt-1 text-ink">{client.plan ? (PLANS[client.plan]?.name ?? client.plan) : 'n/a'}</dd>
            </div>
            <div>
              <dt className="text-muted-dark">Status</dt>
              <dd className="mt-1 text-ink">{client.subscription_status}</dd>
            </div>
            <div>
              <dt className="text-muted-dark">Renews / ends</dt>
              <dd className="mt-1 text-ink">
                {client.current_period_end ? formatDate(client.current_period_end) : 'n/a'}
              </dd>
            </div>
            <div>
              <dt className="text-muted-dark">Stripe customer</dt>
              <dd className="mt-1 truncate text-ink">{client.stripe_customer_id ?? 'none'}</dd>
            </div>
          </dl>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            {/* Only offer Checkout when there is no existing Stripe subscription — otherwise a
                second `mode=subscription` session would double-bill the same customer. Plan
                changes and reactivation go through the Billing Portal instead. */}
            {!client.stripe_subscription_id &&
              Object.values(PLANS).map((plan) => (
                <form action={startClientSubscription} key={plan.key}>
                  <input type="hidden" name="client_id" value={client.id} />
                  <input type="hidden" name="slug" value={client.slug} />
                  <input type="hidden" name="plan" value={plan.key} />
                  <button className="border border-gold-border px-4 py-2 font-mono text-[11px] uppercase tracking-wide text-gold transition hover:border-gold/60 hover:bg-gold-dim">
                    Start {plan.name} · ${plan.priceMonthly}/mo
                  </button>
                </form>
              ))}
            {client.stripe_customer_id && (
              <form action={openBillingPortal}>
                <input type="hidden" name="client_id" value={client.id} />
                <input type="hidden" name="slug" value={client.slug} />
                <button className="border border-gold-border px-4 py-2 font-mono text-[11px] uppercase tracking-wide text-muted transition hover:border-gold/60 hover:text-gold">
                  Manage billing (Stripe)
                </button>
              </form>
            )}
            {client.stripe_subscription_id && (
              <span className="font-mono text-[11px] text-muted-dark">
                Change or cancel the plan via Manage billing to avoid a duplicate subscription.
              </span>
            )}
          </div>

          <form action={setClientBilling} className="mt-6 border-t border-gold-border/60 pt-5">
            <input type="hidden" name="client_id" value={client.id} />
            <input type="hidden" name="slug" value={client.slug} />
            <div className="font-mono text-[11px] uppercase tracking-wide text-muted-dark">
              Manual controls (fallback / comps)
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-3">
              <label className="flex min-w-0 flex-col gap-2">
                <span className="font-mono text-xs uppercase tracking-wide text-muted">Plan</span>
                <select
                  name="plan"
                  defaultValue={client.plan ?? ''}
                  className="w-full border border-gold-border bg-bg px-4 py-3 font-mono text-sm text-ink outline-none focus:border-gold/60"
                >
                  <option value="">None</option>
                  {Object.values(PLANS).map((plan) => (
                    <option key={plan.key} value={plan.key}>
                      {plan.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex min-w-0 flex-col gap-2">
                <span className="font-mono text-xs uppercase tracking-wide text-muted">Subscription status</span>
                <select
                  name="subscription_status"
                  defaultValue={client.subscription_status}
                  className="w-full border border-gold-border bg-bg px-4 py-3 font-mono text-sm text-ink outline-none focus:border-gold/60"
                >
                  {SUBSCRIPTION_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-3 md:mt-8">
                <input
                  type="checkbox"
                  name="billing_override"
                  defaultChecked={client.billing_override}
                  className="h-4 w-4 accent-gold"
                />
                <span className="font-mono text-xs text-muted">Comp override (treat as active)</span>
              </label>
            </div>
            <button className="mt-4 border border-gold-border px-5 py-3 font-mono text-xs uppercase tracking-wide text-gold transition hover:border-gold/60 hover:bg-gold-dim">
              Save Billing
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

        {performance && (
          <section className="mt-6 border border-gold-border bg-surface/50 p-5" aria-label="Client performance">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <div className="font-mono text-xs uppercase tracking-wide text-muted">Performance</div>
              <div className="font-mono text-[11px] uppercase tracking-wide text-muted-dark">
                {performance.measuredPosts} measured post{performance.measuredPosts === 1 ? '' : 's'}
                {performance.lastFetchedAt ? ` · updated ${formatDate(performance.lastFetchedAt)}` : ''}
              </div>
            </div>

            <dl className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
              {[
                { label: 'Reach', value: performance.totals.reach },
                { label: 'Impressions', value: performance.totals.impressions },
                { label: 'Likes', value: performance.totals.likes },
                { label: 'Comments', value: performance.totals.comments },
                { label: 'Shares', value: performance.totals.shares },
              ].map((stat) => (
                <div key={stat.label} className="border border-gold-border bg-bg/40 p-4">
                  <dt className="font-mono text-[11px] uppercase tracking-wide text-muted-dark">{stat.label}</dt>
                  <dd className="mt-2 font-serif text-3xl text-ink">{compactNumber.format(stat.value)}</dd>
                </div>
              ))}
            </dl>

            {performance.byPlatform.length > 1 && (
              <div className="mt-4 flex flex-wrap gap-2 font-mono text-[11px] text-muted">
                {performance.byPlatform.map((p) => (
                  <span key={p.platform} className="border border-gold-border px-2 py-1">
                    {platformLabel(p.platform)}: {p.posts} post{p.posts === 1 ? '' : 's'} ·{' '}
                    {compactNumber.format(p.likes + p.comments + p.shares)} eng.
                  </span>
                ))}
              </div>
            )}

            {performance.topPosts.length > 0 && (
              <div className="mt-6">
                <div className="font-mono text-[11px] uppercase tracking-wide text-muted-dark">
                  Top posts by engagement
                </div>
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
              </div>
            )}
          </section>
        )}

        {portalLink && (
          <section className="mt-6 border border-gold-border bg-surface/50 p-5" aria-label="Client portal link">
            <div className="font-mono text-xs uppercase tracking-wide text-muted">Client Portal</div>
            <p className="mt-3 max-w-3xl font-sans text-sm leading-6 text-muted">
              Share this private link with {client.name} so they can review and{' '}
              <span className="text-ink">approve or reject their own drafts</span>, and track what&apos;s
              scheduled and how it&apos;s performing. Anyone with the link can act (no password);
              approvals still pass the banned-phrase check. Rotate{' '}
              <span className="font-mono text-gold">FORGE_PORTAL_SECRET</span> to revoke all
              outstanding links.
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <code className="max-w-full overflow-x-auto whitespace-nowrap border border-gold-border bg-bg px-3 py-2 font-mono text-[11px] text-muted">
                {portalLink}
              </code>
              <CopyButton value={portalLink} label="Copy link" />
            </div>
          </section>
        )}

        <section className="mt-6 border border-gold-border bg-surface/50 p-5" aria-label="Review generation">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <div className="font-mono text-xs uppercase tracking-wide text-muted">Review Generation</div>
            <div className="font-mono text-[11px] uppercase tracking-wide text-muted-dark">
              {reviewRequests.stats.sent} sent · {reviewRequests.stats.clicked}/{reviewRequests.stats.total} clicked
            </div>
          </div>
          <p className="mt-3 max-w-3xl font-sans text-sm leading-6 text-muted">
            Turn happy customers into Google reviews. Add each customer as{' '}
            <span className="font-mono text-ink">Name, email or phone</span> (one per line). When a
            delivery provider is configured, Forge <strong className="text-ink">sends the request
            for you</strong> — email via Resend, text via Twilio. Anyone without a contact (or when a
            provider isn&apos;t set up) becomes a ready-to-copy link. Clicking any link records the
            click and sends the customer straight to {client.name}&apos;s Google review page.
          </p>

          {!reviewRequests.reviewUrl && (
            <div className="mt-4 border border-amber-400/30 bg-amber-500/10 p-3 font-mono text-[11px] text-amber-100">
              Set a <span className="text-amber-50">Google Review URL</span> in the profile above
              before generating requests.
            </div>
          )}

          <form action={generateReviewRequests} className="mt-5">
            <input type="hidden" name="client_id" value={client.id} />
            <input type="hidden" name="slug" value={client.slug} />
            <TextArea
              label="Customers — name, email or phone (one per line)"
              name="customer_names"
              rows={4}
              defaultValue=""
            />
            <p className="mt-2 font-mono text-[11px] text-muted-dark">
              e.g. <span className="text-muted">Sarah Whitfield, sarah@example.com</span> ·{' '}
              <span className="text-muted">Marcus Bell, +12055551234</span> ·{' '}
              <span className="text-muted">Priya Nair</span> (link only)
            </p>
            <button
              disabled={!reviewRequests.reviewUrl}
              className="mt-4 bg-gold px-5 py-3 font-mono text-xs uppercase tracking-wide text-bg transition hover:bg-gold-soft disabled:cursor-not-allowed disabled:opacity-40"
            >
              Generate Review Requests
            </button>
          </form>

          {reviewRequests.items.length > 0 && (
            <ul className="mt-6 divide-y divide-gold-border/70 border-t border-gold-border/70">
              {reviewRequests.items.map((item) => (
                <li key={item.id} className="py-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs uppercase tracking-wide text-gold">
                        {item.customerName ?? 'Generic link'}
                      </span>
                      <ReviewSendBadge item={item} />
                    </div>
                    <div className="font-mono text-[11px] text-muted-dark">
                      {item.status === 'clicked'
                        ? `✓ clicked ${formatDate(item.clickedAt)}`
                        : `created ${formatDate(item.createdAt)}`}
                    </div>
                  </div>
                  {item.contact && (
                    <div className="mt-2 font-mono text-[11px] text-muted-dark">
                      {item.channel === 'email' ? '✉' : item.channel === 'sms' ? '☎' : '•'} {item.contact}
                      {item.sendStatus === 'failed' && item.deliveryError ? ` — ${item.deliveryError}` : ''}
                    </div>
                  )}
                  <p className="mt-3 border-l border-gold-border pl-3 font-sans text-sm leading-6 text-ink">
                    {item.message}
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    <code className="max-w-full overflow-x-auto whitespace-nowrap border border-gold-border bg-bg px-3 py-2 font-mono text-[11px] text-muted">
                      {item.link}
                    </code>
                    <CopyButton value={item.message} label="Copy message" />
                    <CopyButton value={item.link} label="Copy link" />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

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
                      {formatDate(review.reviewed_at ?? review.created_at)}
                    </div>
                  </div>
                  {review.external_review_id && (
                    <div className="mt-2 font-mono text-[11px] uppercase tracking-wide text-muted-dark">
                      Google review {review.external_review_id}
                    </div>
                  )}
                  <p className="mt-2 font-sans text-sm leading-6 text-muted">{review.text}</p>
                  {review.draft_reply && (
                    <p className="mt-3 border-l border-gold-border pl-3 font-sans text-sm leading-6 text-ink">
                      {review.draft_reply}
                    </p>
                  )}
                  {review.status === 'drafted' && review.draft_reply && (
                    <form action={publishReviewReply} className="mt-3">
                      <input type="hidden" name="slug" value={client.slug} />
                      <input type="hidden" name="review_id" value={review.id} />
                      <button className="border border-gold-border px-3 py-2 font-mono text-[11px] uppercase tracking-wide text-gold transition hover:border-gold/60 hover:bg-gold-dim">
                        Publish Reply to Google
                      </button>
                    </form>
                  )}
                  {review.status === 'posted' && (
                    <div className="mt-3 font-mono text-[11px] uppercase tracking-wide text-gold">
                      ✓ Reply published to Google
                    </div>
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
