import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export const TOKEN_COOKIE = 'sms_token';
/** Which portal the signed-in user belongs to. Only used to route pages; the API checks every request itself. */
export const PORTAL_COOKIE = 'sms_portal';
export const API_URL = process.env.API_URL ?? 'http://localhost:3001/api';

export type Portal = 'admin' | 'teacher' | 'parent' | 'student' | 'super-admin';

/**
 * Forwards a request to the API, adding the user's token from the httpOnly cookie.
 * Bodies pass through as bytes, so file uploads and downloads (knowledge base) work too.
 */
export async function forward(path: string, init: { method: string; body?: ArrayBuffer; contentType?: string | null; search?: string }) {
  const token = (await cookies()).get(TOKEN_COOKIE)?.value;
  const res = await fetch(`${API_URL}/${path}${init.search ?? ''}`, {
    method: init.method,
    body: init.body && init.body.byteLength ? init.body : undefined,
    headers: {
      'content-type': init.contentType ?? 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    cache: 'no-store',
  });
  const headers: Record<string, string> = { 'content-type': res.headers.get('content-type') ?? 'application/json' };
  const disposition = res.headers.get('content-disposition');
  if (disposition) headers['content-disposition'] = disposition;
  const body = await res.arrayBuffer();
  return new NextResponse(body.byteLength ? body : null, { status: res.status, headers });
}

/** Token lifetimes match the API: parents 30 days, students 6 hours, staff 12 hours. */
const MAX_AGE: Record<Portal, number> = {
  admin: 60 * 60 * 12,
  teacher: 60 * 60 * 12,
  'super-admin': 60 * 60 * 12,
  student: 60 * 60 * 6,
  parent: 60 * 60 * 24 * 30,
};

export function setSession(res: NextResponse, token: string, portal: Portal) {
  const base = { httpOnly: true, sameSite: 'lax' as const, secure: process.env.NODE_ENV === 'production', path: '/', maxAge: MAX_AGE[portal] };
  res.cookies.set(TOKEN_COOKIE, token, base);
  res.cookies.set(PORTAL_COOKIE, portal, base);
}

export function clearSession(res: NextResponse) {
  res.cookies.delete(TOKEN_COOKIE);
  res.cookies.delete(PORTAL_COOKIE);
}
