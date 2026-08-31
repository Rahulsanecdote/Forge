import { site } from '@/lib/site-config';

// AGPL-3.0 section 13 requires that users interacting with a network-deployed copy of
// Forge be offered its Corresponding Source. Rendering this from the root layout is what
// satisfies that for every interface — marketing, operator dashboard, and client portal
// alike — so it must stay mounted app-wide rather than living in one page's footer.
//
// Anyone deploying a modified fork has to point this at *their* source, not this repo:
// set FORGE_SOURCE_URL to the location of the modified code.
export default function SourceNotice() {
  const sourceUrl = process.env.FORGE_SOURCE_URL ?? site.github;
  const modified = Boolean(process.env.FORGE_SOURCE_URL);

  return (
    <div className="relative z-10 border-t border-line px-6 py-3 text-center">
      <p className="font-mono text-[10px] uppercase tracking-label text-muted-dark">
        Forge · {modified ? 'Modified version · ' : ''}AGPL-3.0 ·{' '}
        <a
          href={sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="underline transition-colors hover:text-gold"
        >
          Source
        </a>
      </p>
    </div>
  );
}
