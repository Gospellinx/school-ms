import { Check } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/widgets/status-badge";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { schools } from "@/lib/mock";
import { cn, naira } from "@/lib/utils";

export const metadata = { title: "Billing" };

const plans = [
  { name: "Basic", price: 250, features: ["Results & report cards", "Parent SMS alerts", "Up to 300 students"] },
  { name: "Standard", price: 400, features: ["Everything in Basic", "Fees with Paystack", "CBT tests", "WhatsApp alerts"], hot: true },
  { name: "Premium", price: 500, features: ["Everything in Standard", "AI exam prep for every student", "School landing page", "Priority support"] },
];

export default function Billing() {
  return (
    <>
      <PageHeader title="Billing" subtitle="Plans are priced per student, per term." />
      <div className="grid gap-5 md:grid-cols-3">
        {plans.map((p) => (
          <Card key={p.name} className={cn(p.hot && "bg-brand-600 text-white")}>
            <p className={cn("text-sm font-semibold", p.hot ? "text-white/80" : "text-brand-600")}>{p.name}</p>
            <p className="mt-2 text-4xl font-bold">₦{p.price}<span className={cn("text-sm font-medium", p.hot ? "text-white/75" : "text-muted")}> / student / term</span></p>
            <ul className="mt-5 flex flex-col gap-2 text-sm">
              {p.features.map((f) => <li key={f} className="flex items-center gap-2"><Check className="h-4 w-4" /> {f}</li>)}
            </ul>
            <Button variant={p.hot ? "white" : "secondary"} className="mt-6 w-full">Edit plan</Button>
          </Card>
        ))}
      </div>
      <Card className="mt-5">
        <CardHeader title="Invoices this term" />
        <Table>
          <THead><tr><TH>School</TH><TH>Plan</TH><TH>Students</TH><TH>Amount</TH><TH>Status</TH></tr></THead>
          <tbody>
            {schools.map((s) => {
              const price = plans.find((p) => p.name === s.plan)!.price;
              return (
                <TR key={s.name}>
                  <TD className="font-semibold">{s.name}</TD><TD>{s.plan}</TD><TD>{s.students}</TD><TD>{naira(price * s.students)}</TD>
                  <TD><StatusBadge status={s.status === "Overdue" ? "Overdue" : s.status === "Active" ? "Paid" : "Pending"} /></TD>
                </TR>
              );
            })}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
