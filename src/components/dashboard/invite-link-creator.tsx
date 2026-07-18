'use client';

import { useState } from 'react';

interface InvitationResult {
  link: string;
  expiresAt: string;
}

export function InviteLinkCreator() {
  const [businessName, setBusinessName] = useState('');
  const [email, setEmail] = useState('');
  const [result, setResult] = useState<InvitationResult | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'error' | 'copied'>('idle');

  async function createLink() {
    if (!businessName.trim()) return;
    setStatus('loading');
    setResult(null);
    try {
      const response = await fetch('/dashboard/api/onboarding/invitations', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ businessName, email }),
      });
      const payload = await response.json() as InvitationResult & { error?: string };
      if (!response.ok || !payload.link) throw new Error(payload.error ?? 'Could not create link.');
      setResult(payload);
      setStatus('idle');
    } catch {
      setStatus('error');
    }
  }

  async function copyLink() {
    if (!result) return;
    await navigator.clipboard.writeText(result.link);
    setStatus('copied');
  }

  return (
    <section className="border-y border-gold-border py-7">
      <div className="section-label">Client invitation</div>
      <div className="mt-5 grid gap-4 md:grid-cols-[1fr_1fr_auto] md:items-end">
        <label>
          <span className="font-mono text-[11px] uppercase tracking-wide text-muted">Business name</span>
          <input value={businessName} onChange={(event) => setBusinessName(event.target.value)} className="mt-2 w-full border border-line-mid bg-bg px-4 py-3 text-sm text-ink outline-none focus:border-gold/60" placeholder="Client business" />
        </label>
        <label>
          <span className="font-mono text-[11px] uppercase tracking-wide text-muted">Client email / optional</span>
          <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" className="mt-2 w-full border border-line-mid bg-bg px-4 py-3 text-sm text-ink outline-none focus:border-gold/60" placeholder="client@example.com" />
        </label>
        <button type="button" onClick={createLink} disabled={!businessName.trim() || status === 'loading'} className="h-12 bg-gold px-5 font-mono text-xs uppercase tracking-wide text-bg hover:bg-gold-soft disabled:cursor-not-allowed disabled:opacity-40">
          {status === 'loading' ? 'Creating...' : 'Create link'}
        </button>
      </div>
      {status === 'error' && <p className="mt-4 font-mono text-xs text-red-200">The invitation could not be created.</p>}
      {result && (
        <div className="mt-5 border border-emerald-400/30 bg-emerald-400/5 p-4">
          <div className="font-mono text-[10px] uppercase tracking-wide text-emerald-300">One-time link / expires in 72 hours</div>
          <div className="mt-3 flex flex-col gap-3 sm:flex-row">
            <input readOnly value={result.link} className="min-w-0 flex-1 border border-line-mid bg-bg px-3 py-2 font-mono text-xs text-ink" />
            <button type="button" onClick={copyLink} className="border border-emerald-400/30 px-4 py-2 font-mono text-xs uppercase tracking-wide text-emerald-200">
              {status === 'copied' ? 'Copied' : 'Copy link'}
            </button>
          </div>
          <p className="mt-3 font-mono text-[10px] leading-5 text-muted-dark">This plaintext token is shown once. Create a new invitation if it is lost.</p>
        </div>
      )}
    </section>
  );
}
