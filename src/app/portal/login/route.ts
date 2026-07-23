import { NextResponse } from 'next/server';
import {
  PORTAL_COOKIE,
  PORTAL_COOKIE_MAX_AGE,
  newSessionCookieValue,
  verifyLoginKey,
} from '@/lib/portal/session';

export const dynamic = 'force-dynamic';

// A client's portal link is `/portal/login?c=<clientId>&k=<key>`. We verify the key
// (an HMAC bound to that client id), then set the scoped session cookie and redirect
// to the portal — stripping the key from the address bar. An invalid link lands on
// the portal's "no access" state rather than leaking why it failed.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const clientId = await verifyLoginKey(url.searchParams.get('c'), url.searchParams.get('k'));

  if (!clientId) {
    return NextResponse.redirect(new URL('/portal', url.origin));
  }

  const value = await newSessionCookieValue(clientId);
  const response = NextResponse.redirect(new URL('/portal', url.origin));
  if (value) {
    response.cookies.set(PORTAL_COOKIE, value, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/portal',
      maxAge: PORTAL_COOKIE_MAX_AGE,
    });
  }
  return response;
}
