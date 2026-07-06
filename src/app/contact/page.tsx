import type { Metadata } from 'next';
import Nav from '@/components/shared/nav';
import Footer from '@/components/shared/footer';
import WaitlistForm from '@/components/forge/waitlist-form';
import { site } from '@/lib/site-config';

export const metadata: Metadata = {
  title: 'Contact',
  description:
    'Get a free marketing audit. See exactly where your business is losing customers online — and how Forge fixes it.',
};

export default function ContactPage() {
  return (
    <>
      <Nav />
      <main className="pt-32">
        <section className="relative py-16">
          <div className="container-forge">
            <div className="grid gap-16 lg:grid-cols-2">
              {/* Left — pitch + waitlist */}
              <div>
                <div className="mb-6 inline-flex items-center gap-2 rounded-sm border border-gold-border bg-gold-dim px-3 py-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-gold animate-blink" />
                  <span className="font-mono text-[11px] uppercase tracking-label text-gold">
                    Free Audit
                  </span>
                </div>

                <h1 className="font-bebas text-[clamp(48px,7vw,90px)] leading-[0.9] tracking-wide text-ink">
                  See what
                  <br />
                  <span className="text-gold">you&apos;re missing.</span>
                </h1>

                <p className="mt-6 max-w-md font-serif text-xl italic leading-relaxed text-muted">
                  Book a free 15-minute audit. We&apos;ll show you exactly where your business is
                  invisible online — and what it&apos;s costing you.
                </p>

                <div className="mt-10">
                  <div className="mb-3 font-mono text-[11px] uppercase tracking-label text-muted">
                    Or join the early-access list
                  </div>
                  <WaitlistForm source="contact_page" variant="stacked" cta="Notify Me" />
                </div>

                {/* Direct contact */}
                <div className="mt-12 flex flex-col gap-3 border-t border-line pt-8">
                  <div className="font-mono text-[10px] uppercase tracking-label text-muted-dark">
                    Prefer email?
                  </div>
                  <a
                    href={`mailto:${site.email}`}
                    className="font-mono text-sm text-gold transition-colors hover:text-gold-soft"
                  >
                    {site.email}
                  </a>
                </div>
              </div>

              {/* Right — Calendly embed */}
              <div>
                <div className="section-label mb-4">Book a Time</div>
                <div className="overflow-hidden rounded-md border border-line bg-surface">
                  {/*
                    Calendly inline embed.
                    Replace the src URL with your real Calendly link (set in site-config).
                    The iframe approach needs no external script.
                  */}
                  <iframe
                    src={`${site.calendly}?hide_gdpr_banner=1&background_color=0C1220&text_color=F0EDE6&primary_color=E8C547`}
                    className="h-[680px] w-full"
                    title="Book a free audit"
                    loading="lazy"
                  />
                </div>
                <p className="mt-4 text-center font-mono text-[11px] text-muted-dark">
                  15 minutes. No pressure. Just clarity on where you stand.
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
