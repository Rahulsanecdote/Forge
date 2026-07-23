import { optOutByToken } from '@/lib/reviews/optouts';

export const dynamic = 'force-dynamic';

// Email unsubscribe endpoint: `/u/<token>`. The visible in-body link (GET) records the
// opt-out and shows a plain confirmation; the one-click List-Unsubscribe-Post (POST) does
// the same and returns 200 with no body. Recording an opt-out is fail-safe (it only
// suppresses future sends), so an unknown/expired token simply confirms without error.

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function page(rawTitle: string, rawBody: string): Response {
  const title = escapeHtml(rawTitle);
  const body = escapeHtml(rawBody);
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${title}</title>
<style>
  body { margin:0; min-height:100vh; display:grid; place-items:center;
    font-family: -apple-system, "Helvetica Neue", Arial, sans-serif; background:#16120c; color:#f1e8d8; padding:2rem; }
  .card { max-width:32rem; text-align:center; border:1px solid #322a1d; border-radius:12px; padding:2.5rem 2rem; background:#1e1810; }
  h1 { font-size:1.4rem; margin:0 0 .6rem; }
  p { color:#a0967f; line-height:1.6; margin:0; }
  .mark { color:#d9aa4c; font-size:1.6rem; }
</style></head><body><div class="card"><div class="mark">✓</div><h1>${title}</h1><p>${body}</p></div></body></html>`;
  return new Response(html, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } });
}

export async function GET(_request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const result = await optOutByToken(token);
  const who = result.businessName ? ` from ${result.businessName}` : '';
  return page(
    "You're unsubscribed",
    `You won't receive any more review requests${who}. You can close this page.`,
  );
}

export async function POST(_request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  await optOutByToken(token);
  return new Response(null, { status: 200 });
}
