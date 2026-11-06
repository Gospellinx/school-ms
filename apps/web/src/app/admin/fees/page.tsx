import { Banknote, Bell, Wallet } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/widgets/stat-card";
import { StatusBadge } from "@/components/widgets/status-badge";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { LineChart } from "@/components/charts/line-chart";
import { feeItems, payments } from "@/lib/mock";
import { naira } from "@/lib/utils";

export const metadata = { title: "Fees" };

export default function Fees() {
  const total = feeItems.reduce((a, b) => a + b.amount, 0);
  return (
    <>
      <PageHeader title="Fees" subtitle="Paid online with Paystack, straight into the school's account." actions={<><Button variant="outline"><Bell className="h-4 w-4" /> Remind owing parents</Button><Button>New invoice</Button></>} />
      <div className="mb-5 grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard icon={Wallet} label="Expected this term" value="₦116.9m" />
        <StatCard icon={Banknote} label="Collected" value="₦84.2m" tone="green" delta="72%" />
        <StatCard icon={Wallet} label="Outstanding" value="₦32.7m" tone="orchid" />
        <StatCard icon={Bell} label="Owing students" value="92" tone="amber" />
      </div>
      <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
        <Card>
          <CardHeader title="Collections" subtitle="Millions of naira per week" />
          <LineChart values={[6.2, 14.8, 22.1, 9.4, 11.3, 7.9, 6.6, 5.9]} labels={["W1", "W2", "W3", "W4", "W5", "W6", "W7", "W8"]} height={220} />
        </Card>
        <Card>
          <CardHeader title="SS 2 fee schedule" subtitle="First Term" />
          <ul className="divide-y divide-line text-sm">
            {feeItems.map((f) => <li key={f.item} className="flex justify-between py-2.5"><span>{f.item}</span><span className="font-semibold">{naira(f.amount)}</span></li>)}
            <li className="flex justify-between py-3 text-base font-bold"><span>Total</span><span>{naira(total)}</span></li>
          </ul>
        </Card>
      </div>
      <Card className="mt-5">
        <CardHeader title="Recent payments" />
        <Table>
          <THead><tr><TH>Reference</TH><TH>Student</TH><TH>Amount</TH><TH>Method</TH><TH>Date</TH><TH>Status</TH></tr></THead>
          <tbody>
            {payments.map((p) => (
              <TR key={p.ref}><TD className="font-mono text-xs">{p.ref}</TD><TD className="font-semibold">{p.student}</TD><TD>{naira(p.amount)}</TD><TD>{p.method}</TD><TD>{p.date}</TD><TD><StatusBadge status={p.status} /></TD></TR>
            ))}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
