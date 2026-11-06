import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export const TOKEN_COOKIE = 'sms_token';
export const API_URL = process.env.API_URL ?? 'http://localhost:3001/api';

/** Forwards a request to the API, adding the staff member's token from the httpOnly cookie. */
export async function forward(path: string, init: { method: string; body?: string; search?: string }) {
  const token = (await cookies()).get(TOKEN_COOKIE)?.value;
  const res = await fetch(`${API_URL}/${path}${init.search ?? ''}`, {
    method: init.method,
    body: init.body,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    cache: 'no-store',
  });
  const text = await res.text();
  return new NextResponse(text || null, {
    status: res.status,
    headers: { 'content-type': res.headers.get('content-type') ?? 'application/json' },
  });
}

export function setToken(res: NextResponse, token: string) {
  res.cookies.set(TOKEN_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 12,
  });
}
