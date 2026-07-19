import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Onboarding Submitted',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

export default function OnboardingCompletePage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-bg px-6 text-ink">
      <div className="w-full max-w-xl border border-gold-border bg-surface/70 p-8 text-center">
        <div className="font-mono text-xs uppercase tracking-wide text-emerald-300">Submission received</div>
        <h1 className="mt-5 font-serif text-4xl">Your brief is ready for review.</h1>
        <p className="mx-auto mt-4 max-w-md text-sm leading-6 text-muted">
          Forge will review the business facts, guardrails, and operating goals before any automation is activated.
        </p>
        <Link href="/marketing" className="mt-8 inline-block border border-line-mid px-4 py-3 font-mono text-xs uppercase tracking-wide text-muted hover:text-ink">Forge site</Link>
      </div>
    </main>
  );
}
