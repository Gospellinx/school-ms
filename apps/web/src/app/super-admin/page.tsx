import Link from "next/link";
import { Banknote, MoreHorizontal, School, TrendingUp, Users } from "lucide-react";
import { Hero } from "@/components/widgets/hero";
import { StatCard } from "@/components/widgets/stat-card";
import { StatusBadge } from "@/components/widgets/status-badge";
import { Card, CardHeader } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { BarChart } from "@/components/charts/bar-chart";
import { Donut, Legend } from "@/components/charts/donut";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { buttonClass } from "@/components/ui/button";
import { schools } from "@/lib/mock";
import { naira } from "@/lib/utils";

export const metadata = { title: "Super Admin" };

const revenue = [
  { label: "Jun", value: 620 }, { label: "Jul", value: 710 }, { label: "Aug", value: 680 }, { label: "Sep", value: 1040 },
  { label: "Oct", value: 1210 }, { label: "Nov", value: 1322 },
];
const plans = [
  { label: "Premium", value: 2, color: "#6a3bf0" },
  { label: "Standard", value: 4, color: "#e879f9" },
  { label: "Basic", value: 2, color: "#f5d0fe" },
];

export default function SuperAdminDashboard() {
  return (
    <>
      <h1 className="mb-5 text-[28px] font-bold tracking-tight sm:text-4xl">Dashboard</h1>
      <Hero
        name="Gospel"
        line="8 schools on Linx School · 3 waiting for you"
        stats={[
          { icon: School, value: "8", label: "Schools" },
          { icon: Users, value: "4,034", label: "Students" },
        ]}
        asideTitle="Needs your attention"
        aside={
          <ul className="flex flex-col gap-3">
            {schools.filter((s) => s.status !== "Active").slice(0, 3).map((s) => (
              <li key={s.name} className="flex items-center gap-3">
                <Avatar name={s.name} size={38} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{s.name}</span>
                  <span className="block text-xs text-muted">{s.city}</span>
                </span>
                <StatusBadge status={s.status} />
              </li>
            ))}
            <Link href="/super-admin/schools" className={buttonClass("secondary", "sm", "mt-1 w-full")}>Review schools</Link>
          </ul>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard icon={Banknote} label="Monthly revenue" value="₦1.32m" delta="+9%" />
        <StatCard icon={School} label="Active schools" value="5" tone="orchid" />
        <StatCard icon={TrendingUp} label="Fees processed (Nov)" value="₦48.6m" tone="green" delta="+21%" />
        <StatCard icon={Users} label="Parents on WhatsApp" value="3,187" tone="amber" />
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
        <Card className="bg-gradient-to-b from-orchid-100/70 to-white">
          <CardHeader title="Subscription Revenue" subtitle="Thousands of naira per month" action={<span className="rounded-xl bg-white/70 px-3 py-1.5 text-xs font-medium">Jun – Nov 2026</span>} />
          <BarChart data={revenue} unit="naira-k" height={230} />
        </Card>
        <Card>
          <CardHeader title="Plans" action={<MoreHorizontal className="h-5 w-5 text-muted" />} />
          <Donut slices={plans} centerValue="8" centerLabel="Schools" />
          <Legend slices={plans} />
        </Card>
      </div>

      <Card className="mt-5">
        <CardHeader title="Recently joined" action={<Link href="/super-admin/schools" className="text-sm font-semibold text-brand-600">All schools</Link>} />
        <Table>
          <THead><tr><TH>School</TH><TH>Plan</TH><TH>Students</TH><TH>MRR</TH><TH>Status</TH></tr></THead>
          <tbody>
            {schools.slice(3).map((s) => (
              <TR key={s.name}>
                <TD><div className="flex items-center gap-3"><Avatar name={s.name} size={34} /><div><p className="font-semibold">{s.name}</p><p className="text-xs text-muted">{s.city} · since {s.since}</p></div></div></TD>
                <TD>{s.plan}</TD>
                <TD>{s.students}</TD>
                <TD>{s.mrr ? naira(s.mrr) : "—"}</TD>
                <TD><StatusBadge status={s.status} /></TD>
              </TR>
            ))}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
