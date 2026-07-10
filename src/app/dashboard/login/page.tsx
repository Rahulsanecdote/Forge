import Link from 'next/link';
import { redirect } from 'next/navigation';
import { login } from '../actions';
import { isAdminAuthenticated, isAdminConfigured } from '@/lib/admin/auth';

export const dynamic = 'force-dynamic';

export default function DashboardLogin({
  searchParams,
}: {
  searchParams?: { error?: string };
}) {
  if (isAdminAuthenticated()) redirect('/dashboard');

  const configured = isAdminConfigured();

  return (
    <main className="min-h-screen bg-bg px-6 py-8 text-ink">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-md flex-col justify-center">
        <Link href="/" className="font-mono text-xs uppercase tracking-wide text-muted hover:text-gold">
          Forge
        </Link>

        <div className="mt-8 border border-gold-border bg-surface/70 p-6">
          <div className="section-label">Operator Portal</div>
          <h1 className="mt-4 font-serif text-3xl text-ink">Sign in to command center</h1>
          <p className="mt-3 font-sans text-sm leading-6 text-muted">
            Protected single-operator access for leads, clients, and agent run history.
          </p>

          {!configured && (
            <div className="mt-6 border border-red-400/30 bg-red-500/10 p-4 font-mono text-xs leading-5 text-red-200">
              Set FORGE_ADMIN_PASSWORD in your local or production environment before using the
              portal.
            </div>
          )}

          {searchParams?.error === 'invalid' && (
            <div className="mt-6 border border-red-400/30 bg-red-500/10 p-4 font-mono text-xs leading-5 text-red-200">
              Invalid admin password.
            </div>
          )}

          <form action={login} className="mt-6 flex flex-col gap-4">
            <label className="flex flex-col gap-2">
              <span className="font-mono text-xs uppercase tracking-wide text-muted">Password</span>
              <input
                name="password"
                type="password"
                autoComplete="current-password"
                disabled={!configured}
                className="border border-gold-border bg-bg px-4 py-3 font-mono text-sm text-ink outline-none transition placeholder:text-muted-dark focus:border-gold/60 disabled:cursor-not-allowed disabled:opacity-50"
                placeholder="FORGE_ADMIN_PASSWORD"
              />
            </label>
            <button
              type="submit"
              disabled={!configured}
              className="bg-gold px-5 py-3 font-mono text-xs uppercase tracking-wide text-bg transition hover:bg-gold-soft disabled:cursor-not-allowed disabled:opacity-50"
            >
              Enter Dashboard
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
