"use client";
import { Check } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { Async } from "@/components/ui/feedback";
import { useApi } from "@/lib/api";
import type { SchoolSummary } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Proposed price list, in naira per student per term. Not charged anywhere yet. */
const plans = [
  { name: "Basic", price: 250, features: ["Results & report cards", "Parent SMS alerts", "Up to 300 students"] },
  { name: "Standard", price: 400, features: ["Everything in Basic", "Fees with Paystack", "CBT tests", "WhatsApp alerts"], hot: true },
  { name: "Premium", price: 500, features: ["Everything in Standard", "AI exam prep for every student", "School landing page", "Priority support"] },
];
const fmt = (n: number) => `₦${n.toLocaleString("en-NG")}`;

export default function Billing() {
  const { data, error } = useApi<SchoolSummary[]>("platform/schools");
  return (
    <>
      <PageHeader title="Billing" subtitle="Proposed plans, priced per student per term. Charging schools is not switched on yet." />
      <div className="grid gap-5 md:grid-cols-3">
        {plans.map((p) => (
          <Card key={p.name} className={cn(p.hot && "bg-brand-600 text-white")}>
            <p className={cn("text-sm font-semibold", p.hot ? "text-white/80" : "text-brand-600")}>{p.name}</p>
            <p className="mt-2 text-4xl font-bold">{fmt(p.price)}<span className={cn("text-sm font-medium", p.hot ? "text-white/75" : "text-muted")}> / student / term</span></p>
            <ul className="mt-5 flex flex-col gap-2 text-sm">
              {p.features.map((f) => <li key={f} className="flex items-center gap-2"><Check className="h-4 w-4" /> {f}</li>)}
            </ul>
          </Card>
        ))}
      </div>
      <Card className="mt-5">
        <CardHeader title="What each school would pay per term" subtitle="From today's student numbers" />
        <Async data={data} error={error}>
          {(schools) => (
            <Table>
              <THead><tr><TH>School</TH><TH>Students</TH>{plans.map((p) => <TH key={p.name}>{p.name}</TH>)}</tr></THead>
              <tbody>
                {schools.map((s) => (
                  <TR key={s.id}>
                    <TD className="font-semibold">{s.name}</TD>
                    <TD>{s.students}</TD>
                    {plans.map((p) => <TD key={p.name}>{fmt(p.price * s.students)}</TD>)}
                  </TR>
                ))}
              </tbody>
            </Table>
          )}
        </Async>
      </Card>
    </>
  );
}
