import type { Metadata } from 'next';
import { site } from '@/lib/site-config';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(site.domain),
  title: {
    default: `${site.name} — AI that runs your marketing`,
    template: `%s — ${site.name}`,
  },
  description: site.description,
  keywords: [
    'AI marketing automation',
    'small business marketing',
    'local SEO New Jersey',
    'AI marketing agency',
    'Google Business optimization',
    'social media automation',
  ],
  authors: [{ name: site.name }],
  openGraph: {
    type: 'website',
    url: `${site.domain}/marketing`,
    title: `${site.name} — AI that runs your marketing`,
    description: site.description,
    siteName: site.name,
  },
  twitter: {
    card: 'summary_large_image',
    title: `${site.name} — AI that runs your marketing`,
    description: site.description,
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-bg text-ink antialiased">
        {/* Ambient overlays */}
        <div className="fx-grid pointer-events-none fixed inset-0 z-[1]" />
        <div className="fx-grain pointer-events-none fixed inset-0 z-[2]" />

        <div className="relative z-10">{children}</div>
      </body>
    </html>
  );
}
