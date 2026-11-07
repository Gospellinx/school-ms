import { Lock } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { naira, shortDate } from "@/lib/format";
import { API_URL } from "@/lib/server";

export const dynamic = "force-dynamic";

interface PayLink {
  school: { name: string; phone: string | null };
  student: string;
  term: string;
  totalKobo: number;
  paidKobo: number;
  balanceKobo: number;
  amountDueKobo: number;
  plan: { schedule: { dueOn: string; amountKobo: number }[]; onTrack: boolean; next: { dueOn: string; outstandingKobo: number } | null } | null;
}

/** The page behind the link in fee reminders. Parents pay here without signing in. */
export default async function PayPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ error?: string }> }) {
  const { token } = await params;
  const { error } = await searchParams;
  const res = await fetch(`${API_URL}/pay-links/${encodeURIComponent(token)}`, { cache: "no-store" });
  const body = (await res.json().catch(() => null)) as (PayLink & { message?: string }) | null;
  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas p-4">
      <Card className="w-full max-w-md">
        {!res.ok || !body ? (
          <p className="text-center text-sm text-muted">{body?.message ?? "This payment link is not valid. Please ask the school for a new one."}</p>
        ) : (
          <>
            <p className="text-sm font-semibold text-brand-600">{body.school.name}</p>
            <h1 className="mt-1 text-2xl font-bold">{body.student} · {body.term} fees</h1>
            <ul className="mt-4 divide-y divide-line text-sm">
              <li className="flex justify-between py-2"><span>Bill</span><span>{naira(body.totalKobo)}</span></li>
              <li className="flex justify-between py-2 text-emerald-600"><span>Paid</span><span>− {naira(body.paidKobo)}</span></li>
              <li className="flex justify-between py-2 text-lg font-bold"><span>Balance</span><span>{naira(body.balanceKobo)}</span></li>
            </ul>
            {body.plan ? (
              <div className="mt-3 rounded-2xl bg-brand-50 p-3 text-sm">
                <p className="mb-1 font-semibold">Payment plan</p>
                {body.plan.schedule.map((i, n) => <p key={i.dueOn} className="flex justify-between"><span>{n + 1}. by {shortDate(i.dueOn)}</span><span>{naira(i.amountKobo)}</span></p>)}
              </div>
            ) : null}
            {error ? <p className="mt-4 rounded-2xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p> : null}
            {body.balanceKobo > 0 ? (
              <form method="post" action={`/pay/${token}/checkout`} className="mt-5 grid gap-2">
                <Button size="lg" name="option" value="due" className="w-full">Pay {naira(body.amountDueKobo)}{body.amountDueKobo < body.balanceKobo ? " now" : ""}</Button>
                {body.amountDueKobo < body.balanceKobo ? <Button size="lg" variant="outline" name="option" value="full" className="w-full">Pay full balance {naira(body.balanceKobo)}</Button> : null}
              </form>
            ) : (
              <p className="mt-5 rounded-2xl bg-emerald-50 p-3 text-center text-sm font-semibold text-emerald-700">Fully paid. Thank you!</p>
            )}
            <p className="mt-4 flex items-center justify-center gap-1.5 text-xs text-muted"><Lock className="h-3 w-3" /> Card, bank transfer or USSD, secured by Paystack. Money goes to the school.</p>
            {body.school.phone ? <p className="mt-1 text-center text-xs text-muted">Questions? Call {body.school.phone}.</p> : null}
          </>
        )}
      </Card>
    </main>
  );
}
