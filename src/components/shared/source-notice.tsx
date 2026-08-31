import { site } from '@/lib/site-config';
import { resolveSourceOffer } from '@/lib/net/source-url';

// AGPL-3.0 section 13 requires that users interacting with a network-deployed copy of
// Forge be offered its Corresponding Source. Rendering this from the root layout is what
// satisfies that for every interface — marketing, operator dashboard, and client portal
// alike — so it must stay mounted app-wide rather than living in one page's footer.
//
// Anyone deploying a modified fork points FORGE_SOURCE_URL at *their* source, not this
// repo. resolveSourceOffer validates it and throws on a malformed value, so a broken
// source link fails the deploy instead of shipping a notice that leads nowhere.
export default function SourceNotice() {
  const { url, modified } = resolveSourceOffer(process.env.FORGE_SOURCE_URL, site.github);

  return (
    <div className="relative z-10 border-t border-line px-6 py-3 text-center">
      <p className="font-mono text-[10px] uppercase tracking-label text-muted-dark">
        Forge · {modified ? 'Modified version · ' : ''}AGPL-3.0 ·{' '}
        <a
          href={url}
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
