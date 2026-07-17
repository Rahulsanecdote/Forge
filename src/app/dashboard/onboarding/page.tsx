import Link from 'next/link';
import { redirect } from 'next/navigation';
import { OnboardingWizard } from '@/components/dashboard/onboarding-wizard';
import { isAdminAuthenticated } from '@/lib/admin/auth';

export const dynamic = 'force-dynamic';

export default function OnboardingPage() {
  if (!isAdminAuthenticated()) redirect('/dashboard/login');

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
        <OnboardingWizard />
      </div>
    </main>
  );
}
