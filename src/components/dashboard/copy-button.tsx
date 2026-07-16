'use client';

import { useState } from 'react';

export function CopyButton({ value, label = 'Copy caption' }: { value: string; label?: string }) {
  const [status, setStatus] = useState<'idle' | 'copied' | 'failed'>('idle');

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setStatus('copied');
    } catch {
      setStatus('failed');
    }
    window.setTimeout(() => setStatus('idle'), 1600);
  }

  return (
    <button
      type="button"
      onClick={copy}
      aria-live="polite"
      className="border border-gold-border px-3 py-2 font-mono text-[11px] uppercase tracking-wide text-muted transition hover:border-gold/60 hover:text-gold"
    >
      {status === 'copied' ? 'Copied' : status === 'failed' ? 'Copy failed' : label}
    </button>
  );
}
