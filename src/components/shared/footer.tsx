import Link from 'next/link';
import { navLinks, site } from '@/lib/site-config';

export default function Footer() {
  return (
    <footer className="relative border-t border-line">
      <div className="container-forge py-16">
        <div className="flex flex-col gap-12 md:flex-row md:items-start md:justify-between">
          {/* Brand block */}
          <div className="max-w-sm">
            <div className="flex items-center gap-2">
              <span className="font-bebas text-3xl tracking-wide text-ink">FORGE</span>
              <span className="mt-1 h-1.5 w-1.5 rounded-full bg-gold" />
            </div>
            <p className="mt-4 font-mono text-xs leading-relaxed text-muted">
              AI-native marketing automation for small businesses. Built by operators, for operators.
            </p>
            <p className="mt-6 font-mono text-[10px] uppercase tracking-label text-muted-dark">
              Built in {site.location} &nbsp;◆&nbsp; Open source
            </p>
          </div>

          {/* Links */}
          <div className="flex gap-16">
            <div>
              <div className="font-mono text-[10px] uppercase tracking-label text-muted-dark">Navigate</div>
              <div className="mt-4 flex flex-col gap-3">
                {navLinks.map((l) => (
                  <Link
                    key={l.href}
                    href={l.href}
                    className="font-mono text-xs text-muted transition-colors hover:text-gold"
                  >
                    {l.label}
                  </Link>
                ))}
              </div>
            </div>

            <div>
              <div className="font-mono text-[10px] uppercase tracking-label text-muted-dark">Connect</div>
              <div className="mt-4 flex flex-col gap-3">
                <a href={site.github} target="_blank" rel="noopener noreferrer" className="font-mono text-xs text-muted transition-colors hover:text-gold">
                  GitHub
                </a>
                <a href={`mailto:${site.email}`} className="font-mono text-xs text-muted transition-colors hover:text-gold">
                  {site.email}
                </a>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="mt-16 flex flex-col gap-2 border-t border-line pt-8 md:flex-row md:items-center md:justify-between">
          <p className="font-mono text-[10px] uppercase tracking-label text-muted-dark">
            © {new Date().getFullYear()} {site.name}. All rights reserved.
          </p>
          <p className="font-mono text-[10px] uppercase tracking-label text-muted-dark">
            AI that runs your marketing.
          </p>
        </div>
      </div>
    </footer>
  );
}
