import { site } from '@/lib/site-config';
import { resolveSourceOffer } from '@/lib/net/source-url';

// The AGPL's own guidance for section 13 is that "its interface could display a 'Source'
// link that leads users to an archive of the code" — so the notice links here rather than
// embedding the URL, and this route resolves it per request.
//
// That indirection is the whole point. Reading FORGE_SOURCE_URL inside the notice baked
// the value into every prerendered page at `next build`, so an image built once and given
// the variable at container start — the ordinary way a self-hosted fork is deployed, and
// exactly the deployment section 13 governs — would keep advertising upstream forever.
export const dynamic = 'force-dynamic';

export async function GET() {
  let url: string;
  try {
    ({ url } = resolveSourceOffer(process.env.FORGE_SOURCE_URL, site.github));
  } catch (error) {
    // Never fall back to upstream here: sending a modified deployment's users to someone
    // else's source is a compliance failure that looks like success. Fail visibly instead.
    console.error('[source] FORGE_SOURCE_URL is misconfigured', error);
    return new Response(
      `${error instanceof Error ? error.message : String(error)}\n`,
      { status: 500, headers: { 'content-type': 'text/plain; charset=utf-8' } },
    );
  }

  return Response.redirect(url, 307);
}
