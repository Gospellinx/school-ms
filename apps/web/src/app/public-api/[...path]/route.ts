import { NextRequest, NextResponse } from 'next/server';
import { API_URL } from '@/lib/server';

/**
 * Same-origin proxy for the public school website and admissions pages. It only reaches the
 * API's /public routes and never sends a login token, so families need no account.
 */
async function handle(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  const body = req.method === 'GET' || req.method === 'HEAD' ? undefined : await req.arrayBuffer();
  const res = await fetch(`${API_URL}/public/${path.map(encodeURIComponent).join('/')}${req.nextUrl.search}`, {
    method: req.method,
    body: body && body.byteLength ? body : undefined,
    headers: { 'content-type': req.headers.get('content-type') ?? 'application/json' },
    cache: 'no-store',
  });
  const out = await res.arrayBuffer();
  return new NextResponse(out.byteLength ? out : null, { status: res.status, headers: { 'content-type': res.headers.get('content-type') ?? 'application/json' } });
}

export { handle as GET, handle as POST, handle as PUT };
