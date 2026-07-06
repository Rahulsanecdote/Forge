import type { MetadataRoute } from 'next';
import { site } from '@/lib/site-config';
import { posts } from '@/lib/blog/posts';

export default function sitemap(): MetadataRoute.Sitemap {
  const routes = ['', '/pricing', '/contact', '/blog'].map((path) => ({
    url: `${site.domain}${path}`,
    lastModified: new Date(),
    changeFrequency: 'weekly' as const,
    priority: path === '' ? 1 : 0.8,
  }));

  const blogRoutes = posts.map((p) => ({
    url: `${site.domain}/blog/${p.slug}`,
    lastModified: new Date(p.date),
    changeFrequency: 'monthly' as const,
    priority: 0.6,
  }));

  return [...routes, ...blogRoutes];
}
