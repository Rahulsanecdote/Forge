import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Forge — AI marketing agent for any small business',
  description:
    'Describe your business and Forge drafts a brand voice, then writes on-brand social posts and review replies — without inventing facts. Open source, bring your own model.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
