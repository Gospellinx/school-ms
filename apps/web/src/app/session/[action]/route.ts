import { NextRequest, NextResponse } from 'next/server';
import { API_URL, clearSession, setSession, type Portal } from '@/lib/server';

type StaffRole = 'proprietor' | 'admin' | 'teacher';

/** Each sign-in kind: which API route to call and which portal the user lands in. */
const ACTIONS: Record<string, { upstream: string; portal: (data: Record<string, any>) => Portal | null }> = {
  login: { upstream: 'auth/login', portal: (d) => ((d.staff?.role as StaffRole) === 'teacher' ? 'teacher' : 'admin') },
  register: { upstream: 'auth/register-school', portal: () => 'admin' },
  'parent-code': { upstream: 'parent/auth/request-code', portal: () => null },
  parent: { upstream: 'parent/auth/verify', portal: () => 'parent' },
  student: { upstream: 'student/auth/login', portal: () => 'student' },
  platform: { upstream: 'platform/auth/login', portal: () => 'super-admin' },
};

/** Signs in (staff, parent, student, super admin), registers a school, or signs out. The token stays in an httpOnly cookie. */
export async function POST(req: NextRequest, ctx: { params: Promise<{ action: string }> }) {
  const { action } = await ctx.params;
  if (action === 'logout') {
    const res = NextResponse.json({ ok: true });
    clearSession(res);
    return res;
  }
  const spec = ACTIONS[action];
  if (!spec) return NextResponse.json({ message: 'Not found' }, { status: 404 });

  const apiRes = await fetch(`${API_URL}/${spec.upstream}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: await req.text(),
    cache: 'no-store',
  });
  const data = (await apiRes.json().catch(() => ({}))) as Record<string, any>;
  if (!apiRes.ok) return NextResponse.json(data, { status: apiRes.status });

  const portal = spec.portal(data);
  if (!portal) return NextResponse.json(data);
  const { token, ...rest } = data;
  const res = NextResponse.json({ ...rest, home: `/${portal}` });
  setSession(res, token as string, portal);
  return res;
}
