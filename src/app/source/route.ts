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
    //
    // The detail goes to the operator's logs, not to the response. Some of these errors
    // quote the configured value back, and this endpoint is public — echoing it would turn
    // a misconfigured URL into a way to read a fragment of the deployment's environment.
    console.error('[source] FORGE_SOURCE_URL is misconfigured', error);
    return new Response(
      'This deployment is misconfigured and cannot serve its source link. ' +
        'Its operator must fix FORGE_SOURCE_URL; the reason is in the server logs.\n',
      { status: 500, headers: { 'content-type': 'text/plain; charset=utf-8' } },
    );
  }

  return Response.redirect(url, 307);
}
