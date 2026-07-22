import { NextResponse } from 'next/server';
import { recordReviewRequestClick } from '@/lib/reviews/requests';

export const dynamic = 'force-dynamic';

// A customer's review-request link: `/r/<token>`. Record the click, then redirect to
// the business's Google review URL. Unknown or malformed links fall back to the home
// page. The target is an operator-configured URL; we only follow http(s).
export async function GET(_request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const origin = new URL(_request.url).origin;

  const target = await recordReviewRequestClick(token);
  if (target && /^https?:\/\//i.test(target)) {
    return NextResponse.redirect(target);
  }
  return NextResponse.redirect(new URL('/', origin));
}
