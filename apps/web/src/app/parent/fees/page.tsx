"use client";
import * as React from "react";
import { Suspense } from "react";
import { Lock } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { StatusBadge } from "@/components/widgets/status-badge";
import { Async, Empty, ErrorNote, Loading } from "@/components/ui/feedback";
import { api, ApiError, useApi } from "@/lib/api";
import { ChildPicker, childClass, childName, useChild } from "@/lib/child";
import { dateTime, INVOICE_STATUS, naira, shortDate } from "@/lib/format";
import type { InvoiceDetail } from "@/lib/types";
import { cn } from "@/lib/utils";

const PAYMENT_STATUS: Record<string, string> = { success: "Successful", pending: "Pending", failed: "Failed", abandoned: "Failed" };

function PayBox({ invoice }: { invoice: InvoiceDetail }) {
  const [amount, setAmount] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const p = invoice.plan?.progress;
  const due = p ? (p.behindKobo > 0 ? p.behindKobo : (p.next?.outstandingKobo ?? invoice.balanceKobo)) : invoice.balanceKobo;
  const part = amount.trim() ? Math.round(Number(amount) * 100) : due < invoice.balanceKobo ? due : null;
  const toPay = part ?? invoice.balanceKobo;

  async function pay() {
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ authorizationUrl: string }>(`parent/invoices/${invoice.id}/pay`, { method: "POST", body: part ? { amountKobo: part } : {} });
      window.location.href = r.authorizationUrl;
    } catch (e) {
      setError(e instanceof ApiError && e.status === 503 ? "Online payment is not switched on for this school yet. Please pay at the bursary or by bank transfer for now." : (e as Error).message);
      setBusy(false);
    }
  }

  return (
    <Card className="h-fit">
      <CardHeader title="Pay balance" subtitle={`Bill ${invoice.number}`} />
      <p className="text-4xl font-bold tracking-tight">{naira(invoice.balanceKobo)}</p>
      <p className="text-sm text-muted">Card, bank transfer or USSD. It goes straight to the school&apos;s account.</p>
      <div className="mt-5">
        <Label htmlFor="amt">Pay part now (optional)</Label>
        <Input id="amt" inputMode="decimal" placeholder={`Up to ${naira(invoice.balanceKobo)}`} value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))} />
      </div>
      <ErrorNote className="mt-4">{error}</ErrorNote>
      <Button size="lg" className="mt-5 w-full" disabled={busy || toPay <= 0 || toPay > invoice.balanceKobo} onClick={pay}>
        {busy ? "Opening checkout…" : `Pay ${naira(toPay)}`}
      </Button>
      <p className="mt-3 flex items-center justify-center gap-1.5 text-xs text-muted"><Lock className="h-3 w-3" /> Secured by Paystack</p>
    </Card>
  );
}

function Fees() {
  const child = useChild();
  const { data, error } = useApi<InvoiceDetail[]>(child ? `parent/children/${child.id}/invoices` : null);
  const [pick, setPick] = React.useState<string | null>(null);
  if (!child) return <Card><Empty title="No children linked yet" /></Card>;
  return (
    <>
      <PageHeader title="Fees & Payments" subtitle={`${childName(child)} · ${childClass(child)}`} actions={<ChildPicker current={child} />} />
      <Async data={data} error={error}>
        {(list) => {
          if (!list.length) return <Card><Empty title="No bills yet">The school has not issued a bill for {child.firstName} yet.</Empty></Card>;
          const inv = list.find((i) => i.id === pick) ?? list.find((i) => i.balanceKobo > 0) ?? list[0]!;
          return (
            <div className="grid gap-5 lg:grid-cols-[1fr_380px]">
              <div className="flex flex-col gap-5">
                {list.length > 1 ? (
                  <div className="flex flex-wrap gap-2">
                    {list.map((i) => (
                      <button key={i.id} onClick={() => setPick(i.id)} className={cn("rounded-2xl px-3.5 py-2 text-sm", i.id === inv.id ? "bg-white font-semibold ring-2 ring-brand-500" : "bg-white/60 text-muted")}>
                        {i.term} {i.session}
                      </button>
                    ))}
                  </div>
                ) : null}
                <Card>
                  <CardHeader title={`${inv.term} ${inv.session}`} subtitle={`Bill ${inv.number}`} action={<StatusBadge status={INVOICE_STATUS[inv.status] ?? inv.status} />} />
                  <ul className="divide-y divide-line text-sm">
                    {inv.lines.map((l) => <li key={l.id} className="flex justify-between py-3"><span>{l.name}</span><span className="font-semibold">{naira(l.amountKobo)}</span></li>)}
                    <li className="flex justify-between py-3 font-semibold"><span>Total</span><span>{naira(inv.totalKobo)}</span></li>
                    <li className="flex justify-between py-3 text-emerald-600"><span>Paid</span><span>− {naira(inv.paidKobo)}</span></li>
                    <li className="flex justify-between py-3 text-lg font-bold"><span>Balance</span><span>{naira(inv.balanceKobo)}</span></li>
                  </ul>
                  {inv.plan ? (
                    <div className="mt-5 rounded-2xl bg-brand-50 p-4 text-sm">
                      <p className="mb-2 font-semibold">Your payment plan {inv.plan.progress.onTrack ? <span className="font-normal text-emerald-700">· on track</span> : <span className="font-normal text-rose-600">· {naira(inv.plan.progress.behindKobo)} behind</span>}</p>
                      <ul className="grid gap-1">
                        {inv.plan.schedule.map((i, n) => <li key={i.dueOn} className="flex justify-between"><span>{n + 1}. by {shortDate(i.dueOn)}</span><span className="font-semibold">{naira(i.amountKobo)}</span></li>)}
                      </ul>
                    </div>
                  ) : null}
                  <h4 className="mt-6 mb-3 font-semibold">Payment history</h4>
                  {inv.payments.length ? (
                    <ul className="flex flex-col gap-2">
                      {inv.payments.map((p) => (
                        <li key={p.id} className="flex items-center justify-between rounded-2xl bg-canvas p-3 text-sm">
                          <span><span className="block font-semibold">{naira(p.amountKobo)}</span><span className="text-xs text-muted">{dateTime(p.paidAt ?? p.createdAt)} · {p.method === "paystack" ? "Online" : p.method}</span></span>
                          <StatusBadge status={PAYMENT_STATUS[p.status] ?? p.status} />
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-muted">No payments yet.</p>
                  )}
                </Card>
              </div>
              {inv.balanceKobo > 0 ? (
                <PayBox key={inv.id} invoice={inv} />
              ) : (
                <Card className="h-fit text-center"><p className="text-lg font-semibold text-emerald-700">Fully paid</p><p className="mt-1 text-sm text-muted">Thank you. A receipt was sent by SMS.</p></Card>
              )}
            </div>
          );
        }}
      </Async>
    </>
  );
}

export default function Page() {
  return <Suspense fallback={<Loading />}><Fees /></Suspense>;
}
