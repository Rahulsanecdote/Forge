import Link from 'next/link';
import Nav from '@/components/shared/nav';
import Footer from '@/components/shared/footer';
import Hero from '@/components/forge/hero';
import Services from '@/components/forge/services';
import PricingCards from '@/components/forge/pricing-cards';
import CTA from '@/components/forge/cta';
import { site } from '@/lib/site-config';

export default function HomePage() {
  return (
    <>
      <Nav />
      <main>
        <Hero />

        {/* Proof / positioning strip */}
        <section className="border-y border-line bg-surface3/50 py-16">
          <div className="container-forge">
            <div className="grid gap-8 md:grid-cols-3">
              {[
                { stat: '90%', label: 'of agency work is manual tasks AI can automate' },
                { stat: '$300+', label: 'saved monthly vs. traditional agency retainers' },
                { stat: '24/7', label: 'your marketing agent never clocks out' },
              ].map((item) => (
                <div key={item.label}>
                  <div className="font-bebas text-6xl leading-none text-gold">{item.stat}</div>
                  <p className="mt-3 max-w-xs font-mono text-xs leading-relaxed text-muted">
                    {item.label}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <Services />

        {/* The operator story */}
        <section className="relative py-28">
          <div className="container-forge">
            <div className="grid items-center gap-12 md:grid-cols-2">
              <div>
                <div className="section-label mb-4">02 / Why We Built This</div>
                <h2 className="font-bebas text-[clamp(36px,5vw,64px)] leading-[0.95] tracking-wide text-ink">
                  We&apos;re not an agency.
                  <br />
                  <span className="text-gold">We&apos;re operators.</span>
                </h2>
              </div>
              <div className="space-y-5 font-mono text-sm leading-relaxed text-muted">
                <p>
                  Forge was built by people who run real businesses — multiple locations, real
                  payroll, real marketing headaches.
                </p>
                <p>
                  We got tired of agencies charging thousands for work that was mostly copy-paste. So
                  we built an AI agent to do it better, faster, and for a fraction of the cost.
                </p>
                <p className="text-ink">
                  Now we&apos;re opening it up to every small business that&apos;s been overcharged and
                  underserved.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Pricing preview */}
        <section className="relative py-28">
          <div className="container-forge">
            <div className="section-label mb-4">03 / Pricing</div>
            <div className="mb-16 flex flex-col justify-between gap-6 md:flex-row md:items-end">
              <h2 className="max-w-xl font-bebas text-[clamp(40px,6vw,72px)] leading-[0.95] tracking-wide text-ink">
                Simple pricing. No contracts.
              </h2>
              <Link
                href="/pricing"
                className="shrink-0 font-mono text-xs uppercase tracking-wide text-muted underline-offset-4 transition-colors hover:text-gold hover:underline"
              >
                Full comparison →
              </Link>
            </div>
            <PricingCards />
          </div>
        </section>

        <CTA />
      </main>
      <Footer />

      {/* JSON-LD structured data */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'Organization',
            name: site.name,
            url: site.domain,
            description: site.description,
            email: site.email,
            areaServed: site.location,
          }),
        }}
      />
    </>
  );
}
