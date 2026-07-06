'use client';

import { useState } from 'react';

type Status = 'idle' | 'loading' | 'success' | 'error';

/**
 * Waitlist / early-access capture form.
 * Posts to /api/leads (server route → Supabase).
 *
 * variant:
 *  - 'inline'  → compact single-row (hero, CTA sections)
 *  - 'stacked' → label + full-width (contact page)
 */
export default function WaitlistForm({
  source = 'website',
  variant = 'inline',
  cta = 'Get Early Access',
}: {
  source?: string;
  variant?: 'inline' | 'stacked';
  cta?: string;
}) {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [msg, setMsg] = useState('');

  async function submit() {
    const value = email.trim();
    if (!value || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      setStatus('error');
      setMsg('Enter a valid email address.');
      return;
    }

    setStatus('loading');
    setMsg('');

    try {
      const res = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: value,
          source,
          referrer: typeof document !== 'undefined' ? document.referrer : null,
          user_agent: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 200) : null,
        }),
      });

      if (res.ok) {
        setStatus('success');
        setEmail('');
      } else {
        setStatus('error');
        setMsg('Something went wrong. Try again.');
      }
    } catch {
      setStatus('error');
      setMsg('Network error. Please try again.');
    }
  }

  if (status === 'success') {
    return (
      <div className="flex items-center gap-3 rounded-sm border border-gold-border bg-gold-dim px-5 py-4">
        <span className="text-gold">◆</span>
        <div>
          <div className="font-serif text-lg text-ink">You&apos;re in the forge.</div>
          <div className="font-mono text-[11px] tracking-wide text-muted">
            We&apos;ll reach out when early access opens.
          </div>
        </div>
      </div>
    );
  }

  const isStacked = variant === 'stacked';

  return (
    <div className={isStacked ? 'w-full' : 'w-full max-w-md'}>
      <div
        className={`flex overflow-hidden rounded-sm border border-gold-border bg-surface/60 backdrop-blur-sm transition focus-within:border-gold/50 focus-within:ring-2 focus-within:ring-gold/10 ${
          isStacked ? 'flex-col sm:flex-row' : 'flex-row'
        }`}
      >
        <input
          type="email"
          value={email}
          onChange={(e) => { setEmail(e.target.value); if (status === 'error') setStatus('idle'); }}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          placeholder="your@email.com"
          autoComplete="email"
          className="min-w-0 flex-1 bg-transparent px-5 py-4 font-mono text-sm text-ink outline-none placeholder:text-muted-dark"
        />
        <button
          onClick={submit}
          disabled={status === 'loading'}
          className="shrink-0 bg-gold px-6 py-4 font-mono text-xs uppercase tracking-wide text-bg transition hover:bg-gold-soft disabled:opacity-50"
        >
          {status === 'loading' ? 'Sending…' : cta}
        </button>
      </div>
      {status === 'error' && (
        <p className="mt-2 font-mono text-[11px] tracking-wide text-red-400">{msg}</p>
      )}
    </div>
  );
}
