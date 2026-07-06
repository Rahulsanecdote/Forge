import Link from 'next/link';
import SparkBackground from '@/components/shared/spark-background';
import WaitlistForm from '@/components/forge/waitlist-form';

export default function Hero() {
  return (
    <section className="relative flex min-h-screen items-center overflow-hidden">
      {/* Spark layer */}
      <SparkBackground density={50} className="absolute inset-0 h-full w-full" />

      {/* Vignette */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_35%,rgba(6,9,15,0.9)_100%)]" />

      <div className="container-forge relative z-10 py-32">
        <div className="max-w-3xl">
          {/* Eyebrow */}
          <div className="mb-8 inline-flex items-center gap-2 rounded-sm border border-gold-border bg-gold-dim px-3 py-1.5 opacity-0 animate-[fadeIn_0.6s_ease_0.2s_forwards]">
            <span className="h-1.5 w-1.5 rounded-full bg-gold animate-blink" />
            <span className="font-mono text-[11px] uppercase tracking-label text-gold">
              AI-Native Marketing Automation
            </span>
          </div>

          {/* Headline */}
          <h1 className="font-bebas text-[clamp(56px,9vw,120px)] leading-[0.9] tracking-wide text-ink opacity-0 animate-[slideUp_0.7s_ease_0.3s_forwards]">
            Marketing that
            <br />
            <span className="text-gold">runs itself.</span>
          </h1>

          {/* Sub */}
          <p className="mt-8 max-w-xl font-serif text-[clamp(18px,2.5vw,24px)] italic leading-relaxed text-muted opacity-0 animate-[slideUp_0.7s_ease_0.5s_forwards]">
            An AI agent handles your local SEO, social content, reviews, and reporting — so you can
            get back to running your business.
          </p>

          {/* Sub copy */}
          <p className="mt-4 max-w-lg font-mono text-xs leading-relaxed tracking-wide text-muted-dark opacity-0 animate-[fadeIn_0.6s_ease_0.7s_forwards]">
            Built for small businesses tired of paying agencies for work a machine does better.
          </p>

          {/* CTA */}
          <div className="mt-10 flex flex-col gap-4 opacity-0 animate-[slideUp_0.7s_ease_0.8s_forwards] sm:flex-row sm:items-center">
            <WaitlistForm source="hero" cta="Get Early Access" />
          </div>

          <div className="mt-6 opacity-0 animate-[fadeIn_0.6s_ease_1s_forwards]">
            <Link
              href="/pricing"
              className="font-mono text-xs uppercase tracking-wide text-muted underline-offset-4 transition-colors hover:text-gold hover:underline"
            >
              Or see pricing →
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
