import { NextRequest, NextResponse } from 'next/server';
import { API_URL } from '@/lib/server';

/** Starts the Paystack checkout for a pay link and sends the parent straight to it. */
export async function POST(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const form = await req.formData();
  const option = form.get('option') === 'full' ? 'full' : 'due';
  const res = await fetch(`${API_URL}/pay-links/${encodeURIComponent(token)}/checkout`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ option }),
    cache: 'no-store',
  });
  const body = (await res.json().catch(() => ({}))) as { authorizationUrl?: string; message?: string };
  if (res.ok && body.authorizationUrl) return NextResponse.redirect(body.authorizationUrl, 303);
  const back = new URL(`/pay/${encodeURIComponent(token)}`, req.url);
  back.searchParams.set('error', res.status === 503 ? 'Online payment is not switched on for this school yet. Please pay at the bursary.' : (body.message ?? 'Could not start the payment. Please try again.'));
  return NextResponse.redirect(back, 303);
}
