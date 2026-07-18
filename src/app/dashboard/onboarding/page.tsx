import Link from 'next/link';
import { redirect } from 'next/navigation';
import { OnboardingWizard } from '@/components/dashboard/onboarding-wizard';
import { InviteLinkCreator } from '@/components/dashboard/invite-link-creator';
import { isAdminAuthenticated } from '@/lib/admin/auth';
import { loadOnboardingOperations } from '@/lib/admin/onboarding';
import { decideOnboardingSubmission, revokeOnboardingInvitation } from '../actions';

export const dynamic = 'force-dynamic';

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

export default async function OnboardingPage({ searchParams }: { searchParams?: { status?: string } }) {
  if (!isAdminAuthenticated()) redirect('/dashboard/login');
  const operations = await loadOnboardingOperations();

  return (
    <main className="min-h-screen bg-bg text-ink">
      <header className="border-b border-gold-border bg-bg/90 px-6 py-4">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
          <div>
            <Link href="/dashboard" className="font-bebas text-3xl tracking-wide text-ink">Forge</Link>
            <div className="font-mono text-[11px] uppercase tracking-wide text-muted">Client onboarding</div>
          </div>
          <Link href="/dashboard" className="border border-line-mid px-4 py-2 font-mono text-xs uppercase tracking-wide text-muted hover:text-ink">Dashboard</Link>
        </div>
      </header>
      <div className="mx-auto max-w-6xl px-6 py-10">
        <div className="mb-8 border-b border-gold-border pb-7">
          <div className="section-label">Verified intake</div>
          <h1 className="mt-4 font-serif text-4xl text-ink">Onboard a business from its real website</h1>
        </div>
        {searchParams?.status && (
          <div className={`mb-6 border p-4 font-mono text-xs ${searchParams.status.endsWith('error') || searchParams.status.endsWith('invalid') ? 'border-red-400/30 bg-red-500/10 text-red-100' : 'border-gold-border bg-gold-dim text-gold'}`}>
            {searchParams.status === 'submission-rejected' ? 'Submission rejected.' : searchParams.status === 'invalid' ? 'Complete all required operating fields.' : searchParams.status}
          </div>
        )}
        <InviteLinkCreator />

        <section className="border-b border-gold-border py-7">
          <div className="section-label">Recent invitations</div>
          <div className="mt-5 overflow-x-auto border border-line">
            <table className="w-full min-w-[720px] text-left">
              <thead className="border-b border-line bg-surface/50 font-mono text-[10px] uppercase tracking-wide text-muted-dark">
                <tr><th className="px-4 py-3">Business</th><th className="px-4 py-3">Recipient</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Expires</th><th className="px-4 py-3">Action</th></tr>
              </thead>
              <tbody className="divide-y divide-line font-mono text-xs">
                {operations.invitations.map((invitation) => {
                  const expired = new Date(invitation.expires_at).getTime() <= Date.now();
                  const status = invitation.completed_at ? 'completed' : invitation.revoked_at ? 'revoked' : expired ? 'expired' : 'active';
                  return (
                    <tr key={invitation.id}>
                      <td className="px-4 py-3 text-ink">{invitation.business_name}</td>
                      <td className="px-4 py-3 text-muted">{invitation.email ?? 'Not specified'}</td>
                      <td className="px-4 py-3 uppercase text-gold">{status}</td>
                      <td className="px-4 py-3 text-muted">{formatDate(invitation.expires_at)}</td>
                      <td className="px-4 py-3">
                        {status === 'active' ? (
                          <form action={revokeOnboardingInvitation}>
                            <input type="hidden" name="invitation_id" value={invitation.id} />
                            <button className="text-red-200 hover:text-red-100">Revoke</button>
                          </form>
                        ) : <span className="text-muted-dark">n/a</span>}
                      </td>
                    </tr>
                  );
                })}
                {operations.invitations.length === 0 && <tr><td colSpan={5} className="px-4 py-6 text-center text-muted-dark">No invitations created.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>

        <section className="py-10">
          <div className="section-label">Pending client submissions</div>
          {operations.errors.length > 0 && <p className="mt-4 font-mono text-xs text-red-200">{operations.errors.join(' ')}</p>}
          <div className="mt-6 space-y-5">
            {operations.submissions.filter((submission) => submission.status === 'pending').map((submission) => (
              <article key={submission.id} className="border border-gold-border bg-surface/50">
                <div className="flex flex-wrap items-start justify-between gap-4 border-b border-gold-border p-5">
                  <div>
                    <h2 className="font-serif text-2xl text-ink">{submission.name}</h2>
                    <a href={submission.website} target="_blank" rel="noreferrer" className="mt-2 block break-all font-mono text-xs text-gold hover:text-gold-soft">{submission.website}</a>
                  </div>
                  <div className="font-mono text-[10px] uppercase tracking-wide text-muted-dark">Submitted {formatDate(submission.submitted_at)}</div>
                </div>
                <dl className="grid gap-px bg-line sm:grid-cols-2 lg:grid-cols-3">
                  {[
                    ['Category', submission.industry],
                    ['Market', submission.geographic_market],
                    ['Audience', submission.audience],
                    ['Goal', submission.primary_goal],
                    ['CTA', submission.primary_cta],
                    ['Cadence', `${submission.posting_frequency} / ${submission.timezone}`],
                    ['Tone', submission.tone.join(', ')],
                    ['Services', submission.services.join(', ')],
                    ['Guardrails', submission.banned_phrases.join(', ') || 'None supplied'],
                  ].map(([label, value]) => (
                    <div key={label} className="bg-bg p-4">
                      <dt className="font-mono text-[10px] uppercase tracking-wide text-muted-dark">{label}</dt>
                      <dd className="mt-2 text-sm leading-6 text-ink">{value}</dd>
                    </div>
                  ))}
                </dl>
                <div className="p-5">
                  <div className="font-mono text-[10px] uppercase tracking-wide text-muted-dark">Verified business brief</div>
                  <p className="mt-3 text-sm leading-6 text-muted">{submission.about}</p>
                  <form action={decideOnboardingSubmission} className="mt-5 flex flex-wrap gap-3">
                    <input type="hidden" name="submission_id" value={submission.id} />
                    <button name="decision" value="approved" className="bg-gold px-5 py-3 font-mono text-xs uppercase tracking-wide text-bg hover:bg-gold-soft">Approve and create client</button>
                    <button name="decision" value="rejected" className="border border-red-400/40 px-5 py-3 font-mono text-xs uppercase tracking-wide text-red-100 hover:bg-red-500/10">Reject</button>
                  </form>
                </div>
              </article>
            ))}
            {operations.submissions.every((submission) => submission.status !== 'pending') && (
              <div className="border border-line px-5 py-8 text-center font-mono text-xs text-muted-dark">No pending submissions.</div>
            )}
          </div>
        </section>

        <div className="mb-7 border-t border-gold-border pt-10">
          <div className="section-label">Operator-created client</div>
          <p className="mt-3 text-sm leading-6 text-muted">Use this path when you are completing intake on the client&apos;s behalf.</p>
        </div>
        <OnboardingWizard />
      </div>
    </main>
  );
}
