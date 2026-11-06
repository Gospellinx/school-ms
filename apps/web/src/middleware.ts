import { NextRequest, NextResponse } from 'next/server';

const PORTALS = ['admin', 'teacher', 'parent', 'student', 'super-admin'];

/**
 * Sends signed-out visitors to the sign-in page and keeps each user in their own portal.
 * This is only navigation: the API checks the token and role on every request.
 */
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const token = req.cookies.get('sms_token')?.value;
  const portal = req.cookies.get('sms_portal')?.value;

  if (pathname.startsWith('/bff')) {
    return token ? NextResponse.next() : NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const section = pathname.split('/')[1] ?? '';
  const redirect = (to: string) => {
    const url = req.nextUrl.clone();
    url.pathname = to;
    url.search = '';
    return NextResponse.redirect(url);
  };

  // Signed in and on the sign-in page: go to your portal.
  if ((pathname === '/' || pathname === '/register') && token && portal && PORTALS.includes(portal)) return redirect(`/${portal}`);

  if (PORTALS.includes(section)) {
    if (!token || !portal) return redirect('/');
    if (section !== portal) return redirect(`/${portal}`);
  }
  return NextResponse.next();
}

export const config = { matcher: ['/((?!_next|favicon|session|pay).*)'] };
