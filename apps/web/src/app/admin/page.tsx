import Link from "next/link";
import { CalendarCheck, GraduationCap, MoreHorizontal, Users, Wallet, FileCheck2 } from "lucide-react";
import { Hero } from "@/components/widgets/hero";
import { StatCard } from "@/components/widgets/stat-card";
import { ScheduleRail } from "@/components/widgets/schedule-rail";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { BarChart } from "@/components/charts/bar-chart";
import { Donut, Legend } from "@/components/charts/donut";
import { buttonClass } from "@/components/ui/button";
import { events } from "@/lib/mock";

export const metadata = { title: "School Admin" };

const attendance = [
  { label: "Mon", value: 94 }, { label: "Tue", value: 96 }, { label: "Wed", value: 91 }, { label: "Thu", value: 97 }, { label: "Fri", value: 88 },
];
const fees = [
  { label: "Paid", value: 412, color: "#6a3bf0" },
  { label: "Part paid", value: 138, color: "#e879f9" },
  { label: "Owing", value: 92, color: "#f5d0fe" },
];
const resultsProgress = [
  { c: "SS 3 Gold", v: 100 }, { c: "SS 2 Gold", v: 78 }, { c: "JSS 3 Blue", v: 64 }, { c: "Primary 4", v: 45 },
];
const rail = [
  { time: "8:00 am", title: "Assembly", sub: "Main hall", tone: "brand" },
  { time: "10:00 am", title: "Staff meeting", sub: "Results deadline review", tone: "orchid" },
  { time: "12:30 pm", title: "Visit: new parents", sub: "Admissions office", tone: "amber" },
] as const;

export default function AdminDashboard() {
  return (
    <div className="grid gap-6 2xl:grid-cols-[1fr_340px]">
      <div className="min-w-0">
        <h1 className="mb-5 text-[28px] font-bold tracking-tight sm:text-4xl">Dashboard</h1>
        <Hero
          name="Mrs. Eze"
          line="Linx Demo College · First Term 2025/2026, week 9"
          stats={[
            { icon: GraduationCap, value: "642", label: "Students" },
            { icon: Users, value: "48", label: "Staff" },
          ]}
          asideTitle="Results this term"
          aside={
            <div>
              <div className="flex items-center justify-between"><Badge tone="orchid">Due Dec 10</Badge><MoreHorizontal className="h-5 w-5 text-muted" /></div>
              <p className="mt-3 text-lg font-semibold">Score entry progress</p>
              <ul className="mt-3 flex flex-col gap-3">
                {resultsProgress.map((r) => (
                  <li key={r.c}>
                    <div className="mb-1 flex justify-between text-xs"><span className="font-semibold">{r.c}</span><span className="text-muted">{r.v}%</span></div>
                    <Progress value={r.v} />
                  </li>
                ))}
              </ul>
              <Link href="/admin/results" className={buttonClass("secondary", "sm", "mt-4 w-full")}><FileCheck2 className="h-4 w-4" /> Open results</Link>
            </div>
          }
        />

        <div className="mb-5 grid grid-cols-2 gap-4 xl:grid-cols-4">
          <StatCard icon={Wallet} label="Fees collected" value="₦84.2m" delta="72%" />
          <StatCard icon={Wallet} label="Outstanding" value="₦32.7m" tone="orchid" />
          <StatCard icon={CalendarCheck} label="Attendance today" value="97%" tone="green" />
          <StatCard icon={Users} label="Parents reached" value="588" tone="amber" />
        </div>

        <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
          <Card className="bg-gradient-to-b from-orchid-100/70 to-white">
            <CardHeader title="Attendance" subtitle="Whole school, this week" />
            <BarChart data={attendance} max={100} unit="percent" height={220} />
          </Card>
          <Card>
            <CardHeader title="Fee Status" action={<Link href="/admin/fees" className="text-sm font-semibold text-brand-600">View</Link>} />
            <Donut slices={fees} centerValue="642" centerLabel="Students" />
            <Legend slices={fees} />
          </Card>
        </div>

        <Card className="mt-5">
          <CardHeader title="Upcoming" subtitle="School calendar" />
          <ul className="grid gap-3 sm:grid-cols-2">
            {events.map((e) => (
              <li key={e.title} className="flex items-center gap-3 rounded-2xl bg-canvas p-3.5">
                <span className="flex h-12 w-12 flex-col items-center justify-center rounded-xl bg-white text-center leading-none">
                  <span className="text-[10px] font-semibold text-muted uppercase">{e.date.split(" ")[0]}</span>
                  <span className="text-lg font-bold">{e.date.split(" ")[1]}</span>
                </span>
                <span className="flex-1 text-sm font-semibold">{e.title}</span>
                <Badge tone="brand">{e.tag}</Badge>
              </li>
            ))}
          </ul>
        </Card>
      </div>
      <div className="2xl:pt-[68px]"><ScheduleRail title="Today" items={rail} /></div>
    </div>
  );
}
