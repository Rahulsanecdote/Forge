import type { Metadata } from 'next';
import Link from 'next/link';
import { OnboardingWizard } from '@/components/dashboard/onboarding-wizard';
import { getAdminSupabase } from '@/lib/admin/data';
import { hashInvitationToken, invitationTokenSchema } from '@/lib/onboarding/invitations';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Client Onboarding',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

export default async function ClientOnboardingPage({
  params,
  searchParams,
}: {
  params: { token: string };
  searchParams?: { status?: string };
}) {
  const token = invitationTokenSchema.safeParse(params.token);
  const invitation = token.success
    ? await getAdminSupabase()
        .from('onboarding_invitations')
        .select('business_name, email, expires_at, completed_at, revoked_at')
        .eq('token_hash', hashInvitationToken(token.data))
        .maybeSingle()
    : null;
  const row = invitation?.data;
  const active = Boolean(
    row && !row.completed_at && !row.revoked_at && new Date(row.expires_at).getTime() > Date.now(),
  );

  if (!token.success || !active || !row) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-bg px-6 text-ink">
        <div className="w-full max-w-lg border border-gold-border bg-surface/70 p-8">
          <div className="section-label">Invitation unavailable</div>
          <h1 className="mt-5 font-serif text-3xl">This onboarding link is no longer active.</h1>
          <p className="mt-4 text-sm leading-6 text-muted">
            It may have expired, been completed, or been replaced. Ask your Forge contact for a new link.
          </p>
          <Link href="/" className="mt-7 inline-block border border-line-mid px-4 py-3 font-mono text-xs uppercase tracking-wide text-muted hover:text-ink">Forge home</Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-bg text-ink">
      <header className="border-b border-gold-border bg-bg/90 px-6 py-4">
        <div className="mx-auto max-w-6xl">
          <Link href="/" className="font-bebas text-3xl tracking-wide text-ink">Forge</Link>
          <div className="font-mono text-[11px] uppercase tracking-wide text-muted">Secure client intake</div>
        </div>
      </header>
      <div className="mx-auto max-w-6xl px-6 py-10">
        <div className="mb-8 border-b border-gold-border pb-7">
          <div className="section-label">Invitation / {row.business_name}</div>
          <h1 className="mt-4 font-serif text-4xl">Configure your marketing brief</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-muted">
            Your answers are submitted to Forge for review. This form does not publish content or connect accounts.
          </p>
        </div>
        {searchParams?.status && (
          <div className="mb-6 border border-red-400/30 bg-red-500/10 p-4 font-mono text-xs text-red-100">
            {searchParams.status === 'invalid'
              ? 'Complete every required field and choose at least one tone and service.'
              : 'This invitation could not be submitted. Ask your Forge contact for a new link.'}
          </div>
        )}
        <OnboardingWizard invitationToken={token.data} initialName={row.business_name} />
      </div>
    </main>
  );
}
