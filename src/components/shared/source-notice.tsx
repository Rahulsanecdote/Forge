// AGPL-3.0 section 13 requires that users interacting with a network-deployed copy of
// Forge be offered its Corresponding Source. Rendering this from the root layout is what
// satisfies that for every interface — marketing, operator dashboard, and client portal
// alike — so it must stay mounted app-wide rather than living in one page's footer.
//
// It deliberately links to /source instead of reading FORGE_SOURCE_URL here. This
// component is prerendered into every static page at build time, so an embedded URL would
// freeze whatever the build environment happened to have: an image built once and given
// the variable at container start — how a self-hosted fork is normally deployed, and the
// case section 13 is actually about — would advertise upstream forever. The route resolves
// and validates per request instead, so the link is correct however the fork is deployed.
export default function SourceNotice() {
  return (
    <div className="relative z-10 border-t border-line px-6 py-3 text-center">
      <p className="font-mono text-[10px] uppercase tracking-label text-muted-dark">
        Forge · AGPL-3.0 ·{' '}
        <a
          href="/source"
          rel="noopener noreferrer"
          className="underline transition-colors hover:text-gold"
        >
          Source
        </a>
      </p>
    </div>
  );
}
