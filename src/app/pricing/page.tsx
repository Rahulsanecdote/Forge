import type { Metadata } from 'next';
import Nav from '@/components/shared/nav';
import Footer from '@/components/shared/footer';
import PricingCards from '@/components/forge/pricing-cards';
import CTA from '@/components/forge/cta';

export const metadata: Metadata = {
  title: 'Pricing',
  description:
    'Simple, transparent pricing for AI-powered marketing. No contracts, no setup fees. Plans from $800/month.',
};

const faqs = [
  {
    q: 'Is there a contract?',
    a: 'No. Every plan is month-to-month. Cancel anytime — though we think you won\u2019t want to.',
  },
  {
    q: 'What do I need to provide?',
    a: 'Access to your Google Business Profile and social accounts, plus a short onboarding call so the agent learns your brand voice. That\u2019s it.',
  },
  {
    q: 'How is this different from a normal agency?',
    a: 'A traditional agency assigns junior staff to manual tasks and charges you for their hours. Forge runs an AI agent that does the same work continuously, at a fraction of the cost, with full transparency.',
  },
  {
    q: 'Can I switch plans later?',
    a: 'Anytime. Upgrade or downgrade with one message and it takes effect on your next billing cycle.',
  },
  {
    q: 'Do you work with multi-location businesses?',
    a: 'Yes — that\u2019s exactly what the Foundry plan is built for. Each location gets managed independently under one account.',
  },
];

export default function PricingPage() {
  return (
    <>
      <Nav />
      <main className="pt-32">
        {/* Header */}
        <section className="relative py-16">
          <div className="container-forge text-center">
            <div className="mx-auto mb-6 inline-flex items-center gap-2 rounded-sm border border-gold-border bg-gold-dim px-3 py-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-gold" />
              <span className="font-mono text-[11px] uppercase tracking-label text-gold">Pricing</span>
            </div>
            <h1 className="font-bebas text-[clamp(52px,9vw,110px)] leading-[0.9] tracking-wide text-ink">
              Pick your <span className="text-gold">heat.</span>
            </h1>
            <p className="mx-auto mt-6 max-w-lg font-serif text-xl italic text-muted">
              No contracts. No setup fees. Just marketing that works — priced for real businesses.
            </p>
          </div>
        </section>

        {/* Cards */}
        <section className="pb-20">
          <div className="container-forge">
            <PricingCards />
            <p className="mt-8 text-center font-mono text-xs text-muted-dark">
              All plans include onboarding, brand-voice training, and transparent reporting.
            </p>
          </div>
        </section>

        {/* FAQ */}
        <section className="border-t border-line py-24">
          <div className="container-forge">
            <div className="section-label mb-12">Frequently Asked</div>
            <div className="grid gap-x-16 gap-y-10 md:grid-cols-2">
              {faqs.map((f) => (
                <div key={f.q}>
                  <h3 className="mb-3 font-serif text-xl text-ink">{f.q}</h3>
                  <p className="font-mono text-[13px] leading-relaxed text-muted">{f.a}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <CTA />
      </main>
      <Footer />
    </>
  );
}
