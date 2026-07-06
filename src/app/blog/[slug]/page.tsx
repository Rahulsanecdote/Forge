import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import Nav from '@/components/shared/nav';
import Footer from '@/components/shared/footer';
import WaitlistForm from '@/components/forge/waitlist-form';
import { posts, getPost, formatDate } from '@/lib/blog/posts';
import { site } from '@/lib/site-config';

// Pre-render every post at build time
export function generateStaticParams() {
  return posts.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: { slug: string };
}): Promise<Metadata> {
  const post = getPost(params.slug);
  if (!post) return { title: 'Not found' };
  return {
    title: post.title,
    description: post.excerpt,
    openGraph: {
      title: post.title,
      description: post.excerpt,
      type: 'article',
      publishedTime: post.date,
    },
  };
}

export default function BlogPost({ params }: { params: { slug: string } }) {
  const post = getPost(params.slug);
  if (!post) notFound();

  return (
    <>
      <Nav />
      <main className="pt-32">
        <article className="py-16">
          <div className="mx-auto max-w-3xl px-6">
            {/* Back */}
            <Link
              href="/blog"
              className="font-mono text-xs uppercase tracking-wide text-muted transition-colors hover:text-gold"
            >
              ← All posts
            </Link>

            {/* Header */}
            <div className="mt-8 flex items-center gap-3">
              <span className="rounded-sm border border-gold-border bg-gold-dim px-2.5 py-1 font-mono text-[10px] uppercase tracking-wide text-gold">
                {post.tag}
              </span>
              <span className="font-mono text-[11px] text-muted-dark">
                {formatDate(post.date)} · {post.readMins} min read
              </span>
            </div>

            <h1 className="mt-6 font-bebas text-[clamp(38px,6vw,68px)] leading-[0.95] tracking-wide text-ink">
              {post.title}
            </h1>

            {/* Body */}
            <div className="mt-12 space-y-6">
              {post.body.map((block, i) => {
                if (block.type === 'h2') {
                  return (
                    <h2 key={i} className="pt-6 font-serif text-2xl text-ink">
                      {block.text}
                    </h2>
                  );
                }
                if (block.type === 'p') {
                  return (
                    <p key={i} className="font-sans text-[16px] leading-[1.8] text-muted">
                      {block.text}
                    </p>
                  );
                }
                if (block.type === 'ul') {
                  return (
                    <ul key={i} className="flex flex-col gap-3">
                      {block.items.map((it, j) => (
                        <li key={j} className="flex items-start gap-3 font-sans text-[15px] leading-relaxed text-muted">
                          <span className="mt-1.5 shrink-0 text-gold">◆</span>
                          <span>{it}</span>
                        </li>
                      ))}
                    </ul>
                  );
                }
                if (block.type === 'quote') {
                  return (
                    <blockquote
                      key={i}
                      className="my-8 border-l-2 border-gold bg-gold-dim px-6 py-5 font-serif text-xl italic leading-relaxed text-ink"
                    >
                      {block.text}
                    </blockquote>
                  );
                }
                return null;
              })}
            </div>

            {/* Inline CTA */}
            <div className="mt-16 rounded-md border border-gold-border bg-gradient-to-br from-gold-dim to-surface p-8">
              <h3 className="font-serif text-2xl text-ink">
                Want this handled for you?
              </h3>
              <p className="mt-2 max-w-md font-mono text-[13px] leading-relaxed text-muted">
                Forge runs all of this automatically — local SEO, reviews, content, reporting. Join
                the early-access list.
              </p>
              <div className="mt-6">
                <WaitlistForm source={`blog_${post.slug}`} cta="Get Early Access" />
              </div>
            </div>
          </div>
        </article>
      </main>
      <Footer />

      {/* Article structured data */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'BlogPosting',
            headline: post.title,
            description: post.excerpt,
            datePublished: post.date,
            author: { '@type': 'Organization', name: site.name },
            publisher: { '@type': 'Organization', name: site.name },
          }),
        }}
      />
    </>
  );
}
