import { services } from '@/lib/site-config';

export default function Services() {
  return (
    <section id="services" className="relative scroll-mt-20 py-28">
      <div className="container-forge">
        <div className="section-label mb-4">01 / What Forge Does</div>

        <h2 className="mb-6 max-w-2xl font-bebas text-[clamp(40px,6vw,72px)] leading-[0.95] tracking-wide text-ink">
          One agent. The whole marketing stack.
        </h2>
        <p className="mb-16 max-w-xl font-mono text-sm leading-relaxed text-muted">
          Everything a traditional agency charges five people to do — run by an AI agent that never
          sleeps, never forgets, and never sends you a padded invoice.
        </p>

        <div className="grid gap-4 md:grid-cols-2">
          {services.map((s) => (
            <div
              key={s.no}
              className="group relative overflow-hidden rounded-sm border border-line border-l-2 border-l-gold bg-surface p-8 transition-colors hover:border-line-mid hover:bg-surface2"
            >
              {/* Number watermark */}
              <div className="absolute right-6 top-4 font-bebas text-5xl leading-none text-gold/10 transition-colors group-hover:text-gold/20">
                {s.no}
              </div>

              <h3 className="mb-3 font-serif text-2xl text-ink">{s.title}</h3>
              <p className="mb-6 max-w-md font-mono text-[13px] leading-relaxed text-muted">
                {s.desc}
              </p>

              <div className="flex flex-wrap gap-2">
                {s.points.map((p) => (
                  <span
                    key={p}
                    className="rounded-sm border border-line bg-surface3 px-3 py-1.5 font-mono text-[11px] text-muted"
                  >
                    {p}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
