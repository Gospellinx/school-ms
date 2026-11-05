import { NextRequest, NextResponse } from 'next/server';

const PUBLIC = ['/login', '/register', '/session', '/_next', '/favicon'];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC.some((p) => pathname.startsWith(p))) return NextResponse.next();
  if (!req.cookies.get('sms_token')) {
    if (pathname.startsWith('/bff')) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.search = '';
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}
