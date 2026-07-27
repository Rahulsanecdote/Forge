'use client';

export function PrintButton({ label = 'Print / PDF' }: { label?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="border border-gold-border px-3 py-2 font-mono text-[11px] uppercase tracking-wide text-muted transition hover:border-gold/60 hover:text-gold"
    >
      {label}
    </button>
  );
}
