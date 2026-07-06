import Link from 'next/link';
import { tiers } from '@/lib/site-config';

export default function PricingCards() {
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {tiers.map((t) => (
        <div
          key={t.key}
          className={`relative flex flex-col rounded-sm border p-8 transition-colors ${
            t.featured
              ? 'border-gold-border bg-gradient-to-b from-gold-dim to-surface'
              : 'border-line bg-surface hover:border-line-mid'
          }`}
        >
          {/* Featured ribbon */}
          {t.featured && (
            <div className="absolute -top-px left-1/2 -translate-x-1/2 rounded-b-sm bg-gold px-4 py-1 font-mono text-[10px] uppercase tracking-label text-bg">
              Most Popular
            </div>
          )}

          {/* Tier name */}
          <div className="mb-1 font-mono text-[11px] uppercase tracking-label text-muted">
            {t.best}
          </div>
          <div className="font-bebas text-4xl tracking-wide text-ink">{t.name}</div>

          {/* Price */}
          <div className="mt-4 flex items-baseline gap-1">
            <span className={`font-bebas text-6xl leading-none ${t.featured ? 'text-gold' : 'text-ink'}`}>
              ${t.price.toLocaleString()}
            </span>
            <span className="font-mono text-sm text-muted">{t.cadence}</span>
          </div>

          <p className="mt-4 min-h-[48px] font-mono text-[12px] leading-relaxed text-muted">
            {t.tagline}
          </p>

          {/* Divider */}
          <div className="my-6 h-px bg-line" />

          {/* Features */}
          <ul className="flex flex-1 flex-col gap-3">
            {t.features.map((f) => (
              <li key={f} className="flex items-start gap-3 font-mono text-[12px] text-muted">
                <span className={`mt-0.5 shrink-0 ${t.featured ? 'text-gold' : 'text-gold/60'}`}>◆</span>
                <span className="leading-relaxed">{f}</span>
              </li>
            ))}
          </ul>

          {/* CTA */}
          <Link
            href="/contact"
            className={`mt-8 rounded-sm px-5 py-3.5 text-center font-mono text-xs uppercase tracking-wide transition-colors ${
              t.featured
                ? 'bg-gold text-bg hover:bg-gold-soft'
                : 'border border-gold-border text-gold hover:bg-gold-dim'
            }`}
          >
            Start with {t.name}
          </Link>
        </div>
      ))}
    </div>
  );
}
