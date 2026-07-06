import type { Metadata } from 'next';
import Link from 'next/link';
import Nav from '@/components/shared/nav';
import Footer from '@/components/shared/footer';
import { posts, formatDate } from '@/lib/blog/posts';

export const metadata: Metadata = {
  title: 'Blog',
  description:
    'Practical guides on local SEO, Google Business optimization, and marketing for New Jersey small businesses.',
};

export default function BlogIndex() {
  const sorted = [...posts].sort((a, b) => +new Date(b.date) - +new Date(a.date));

  return (
    <>
      <Nav />
      <main className="pt-32">
        {/* Header */}
        <section className="py-16">
          <div className="container-forge">
            <div className="section-label mb-6">The Forge Journal</div>
            <h1 className="max-w-2xl font-bebas text-[clamp(48px,8vw,96px)] leading-[0.9] tracking-wide text-ink">
              Marketing, <span className="text-gold">demystified.</span>
            </h1>
            <p className="mt-6 max-w-lg font-serif text-xl italic text-muted">
              No jargon. Just practical guides for small businesses that want to be found.
            </p>
          </div>
        </section>

        {/* Posts */}
        <section className="pb-24">
          <div className="container-forge">
            <div className="flex flex-col gap-4">
              {sorted.map((p) => (
                <Link
                  key={p.slug}
                  href={`/blog/${p.slug}`}
                  className="group flex flex-col gap-4 rounded-sm border border-line border-l-2 border-l-gold bg-surface p-8 transition-colors hover:border-line-mid hover:bg-surface2 md:flex-row md:items-center md:justify-between"
                >
                  <div className="max-w-2xl">
                    <div className="mb-3 flex items-center gap-3">
                      <span className="rounded-sm border border-gold-border bg-gold-dim px-2.5 py-1 font-mono text-[10px] uppercase tracking-wide text-gold">
                        {p.tag}
                      </span>
                      <span className="font-mono text-[11px] text-muted-dark">
                        {formatDate(p.date)} · {p.readMins} min read
                      </span>
                    </div>
                    <h2 className="mb-2 font-serif text-2xl leading-snug text-ink transition-colors group-hover:text-gold">
                      {p.title}
                    </h2>
                    <p className="font-mono text-[13px] leading-relaxed text-muted">{p.excerpt}</p>
                  </div>
                  <span className="shrink-0 font-mono text-sm text-gold opacity-0 transition-opacity group-hover:opacity-100">
                    Read →
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
