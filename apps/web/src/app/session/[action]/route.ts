import { NextRequest, NextResponse } from 'next/server';
import { API_URL, setToken, TOKEN_COOKIE } from '@/lib/server';

const UPSTREAM: Record<string, string> = { login: 'auth/login', register: 'auth/register-school' };

/** Logs in, registers a school, or logs out, keeping the token in an httpOnly cookie. */
export async function POST(req: NextRequest, ctx: { params: Promise<{ action: string }> }) {
  const { action } = await ctx.params;
  if (action === 'logout') {
    const res = NextResponse.json({ ok: true });
    res.cookies.delete(TOKEN_COOKIE);
    return res;
  }
  const upstream = UPSTREAM[action];
  if (!upstream) return NextResponse.json({ message: 'Not found' }, { status: 404 });

  const apiRes = await fetch(`${API_URL}/${upstream}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: await req.text(),
    cache: 'no-store',
  });
  const data = await apiRes.json().catch(() => ({}));
  if (!apiRes.ok) return NextResponse.json(data, { status: apiRes.status });
  const { token, ...rest } = data as { token: string };
  const res = NextResponse.json(rest);
  setToken(res, token);
  return res;
}
