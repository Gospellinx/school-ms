import { NextRequest } from 'next/server';
import { forward } from '@/lib/server';

/** Same-origin proxy so the browser never sees the API token. */
async function handle(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  const body = req.method === 'GET' || req.method === 'HEAD' ? undefined : await req.text();
  return forward(path.map(encodeURIComponent).join('/'), { method: req.method, body, search: req.nextUrl.search });
}

export { handle as GET, handle as POST, handle as PUT, handle as PATCH, handle as DELETE };
