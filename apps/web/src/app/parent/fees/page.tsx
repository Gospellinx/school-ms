"use client";
import * as React from "react";
import { CheckCircle2, CreditCard, Landmark, Smartphone } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/widgets/status-badge";
import { feeItems, payments } from "@/lib/mock";
import { cn, naira } from "@/lib/utils";

const methods = [
  { k: "Card", icon: CreditCard, sub: "Verve, Mastercard, Visa" },
  { k: "Bank transfer", icon: Landmark, sub: "Pay to a one-time account" },
  { k: "USSD", icon: Smartphone, sub: "No internet needed" },
];

export default function ParentFees() {
  const [method, setMethod] = React.useState("Bank transfer");
  const total = feeItems.reduce((a, b) => a + b.amount, 0);
  return (
    <>
      <PageHeader title="Fees & Payments" subtitle="Chiamaka Okafor · SS 2 Gold · First Term" />
      <div className="grid gap-5 lg:grid-cols-[1fr_380px]">
        <Card>
          <CardHeader title="Invoice" subtitle="INV-2026-1T-0101" action={<StatusBadge status="Part paid" />} />
          <ul className="divide-y divide-line text-sm">
            {feeItems.map((f) => <li key={f.item} className="flex justify-between py-3"><span>{f.item}</span><span className="font-semibold">{naira(f.amount)}</span></li>)}
            <li className="flex justify-between py-3 font-semibold"><span>Total</span><span>{naira(total)}</span></li>
            <li className="flex justify-between py-3 text-emerald-600"><span>Paid</span><span>− {naira(130000)}</span></li>
            <li className="flex justify-between py-3 text-lg font-bold"><span>Balance</span><span>{naira(total - 130000)}</span></li>
          </ul>
          <h4 className="mt-6 mb-3 font-semibold">Payment history</h4>
          <ul className="flex flex-col gap-2">
            {payments.slice(1, 2).concat(payments.slice(3, 4)).map((p) => (
              <li key={p.ref} className="flex items-center justify-between rounded-2xl bg-canvas p-3 text-sm">
                <span><span className="block font-semibold">{naira(p.amount)}</span><span className="text-xs text-muted">{p.date} · {p.method}</span></span>
                <StatusBadge status={p.status} />
              </li>
            ))}
          </ul>
        </Card>
        <Card className="h-fit">
          <CardHeader title="Pay balance" />
          <p className="text-4xl font-bold tracking-tight">{naira(total - 130000)}</p>
          <p className="text-sm text-muted">Goes straight to the school&apos;s bank account.</p>
          <div className="mt-5 flex flex-col gap-2">
            {methods.map((m) => {
              const Icon = m.icon;
              const on = method === m.k;
              return (
                <button key={m.k} onClick={() => setMethod(m.k)} className={cn("flex items-center gap-3 rounded-2xl border p-3.5 text-left", on ? "border-brand-500 bg-brand-50" : "border-line")}>
                  <span className={cn("flex h-10 w-10 items-center justify-center rounded-xl", on ? "bg-brand-600 text-white" : "bg-canvas")}><Icon className="h-5 w-5" /></span>
                  <span className="flex-1"><span className="block text-sm font-semibold">{m.k}</span><span className="text-xs text-muted">{m.sub}</span></span>
                  {on ? <CheckCircle2 className="h-5 w-5 text-brand-600" /> : null}
                </button>
              );
            })}
          </div>
          <Button size="lg" className="mt-5 w-full">Pay {naira(total - 130000)}</Button>
          <p className="mt-3 text-center text-xs text-muted">Secured by Paystack</p>
        </Card>
      </div>
    </>
  );
}
