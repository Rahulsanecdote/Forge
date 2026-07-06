'use client';

import Link from 'next/link';
import { useState, useEffect } from 'react';
import { navLinks, site } from '@/lib/site-config';

export default function Nav() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    onScroll();
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-colors duration-300 ${
        scrolled ? 'bg-bg/80 backdrop-blur-md border-b border-line' : 'bg-transparent'
      }`}
    >
      <nav className="container-forge flex items-center justify-between py-4">
        {/* Brand */}
        <Link href="/" className="group flex items-center gap-2" onClick={() => setOpen(false)}>
          <span className="font-bebas text-2xl tracking-wide text-ink transition-colors group-hover:text-gold">
            FORGE
          </span>
          <span className="mt-1 h-1.5 w-1.5 rounded-full bg-gold animate-blink" />
        </Link>

        {/* Desktop links */}
        <div className="hidden items-center gap-8 md:flex">
          {navLinks.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="font-mono text-xs uppercase tracking-wide text-muted transition-colors hover:text-gold"
            >
              {l.label}
            </Link>
          ))}
          <Link
            href="/contact"
            className="rounded-sm bg-gold px-5 py-2.5 font-mono text-xs uppercase tracking-wide text-bg transition-colors hover:bg-gold-soft"
          >
            Free Audit
          </Link>
        </div>

        {/* Mobile toggle */}
        <button
          className="flex flex-col gap-1.5 md:hidden"
          onClick={() => setOpen((v) => !v)}
          aria-label="Toggle menu"
        >
          <span className={`h-px w-6 bg-ink transition-transform ${open ? 'translate-y-[7px] rotate-45' : ''}`} />
          <span className={`h-px w-6 bg-ink transition-opacity ${open ? 'opacity-0' : ''}`} />
          <span className={`h-px w-6 bg-ink transition-transform ${open ? '-translate-y-[7px] -rotate-45' : ''}`} />
        </button>
      </nav>

      {/* Mobile menu */}
      {open && (
        <div className="border-t border-line bg-bg/95 backdrop-blur-md md:hidden">
          <div className="container-forge flex flex-col gap-1 py-4">
            {navLinks.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className="py-3 font-mono text-sm uppercase tracking-wide text-muted transition-colors hover:text-gold"
              >
                {l.label}
              </Link>
            ))}
            <Link
              href="/contact"
              onClick={() => setOpen(false)}
              className="mt-2 rounded-sm bg-gold px-5 py-3 text-center font-mono text-xs uppercase tracking-wide text-bg"
            >
              Free Audit
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
