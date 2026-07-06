import SparkBackground from '@/components/shared/spark-background';
import WaitlistForm from '@/components/forge/waitlist-form';

export default function CTA() {
  return (
    <section className="relative overflow-hidden py-28">
      <div className="container-forge">
        <div className="relative overflow-hidden rounded-md border border-gold-border bg-gradient-to-br from-[#12100a] via-surface to-bg p-12 md:p-20">
          {/* Sparks inside the card */}
          <SparkBackground density={30} className="absolute inset-0 h-full w-full opacity-60" />
          <div className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-[radial-gradient(circle,rgba(232,197,71,0.10),transparent_65%)]" />

          <div className="relative z-10 max-w-2xl">
            <div className="section-label mb-6 !text-gold before:hidden">
              <span className="text-gold">◆</span> Early Access
            </div>

            <h2 className="font-bebas text-[clamp(40px,6vw,80px)] leading-[0.92] tracking-wide text-ink">
              Stop paying for
              <br />
              <span className="text-gold">manual marketing.</span>
            </h2>

            <p className="mt-6 max-w-lg font-serif text-xl italic text-muted">
              Join the waitlist. Be first in line when Forge opens to new businesses.
            </p>

            <div className="mt-10">
              <WaitlistForm source="cta_band" cta="Join the Waitlist" />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
