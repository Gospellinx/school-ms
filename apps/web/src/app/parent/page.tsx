import Link from "next/link";
import { CalendarCheck, FileText, MoreHorizontal, Trophy, Wallet } from "lucide-react";
import { Hero } from "@/components/widgets/hero";
import { ScheduleRail } from "@/components/widgets/schedule-rail";
import { Card, CardHeader } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { LineChart } from "@/components/charts/line-chart";
import { Donut, Legend } from "@/components/charts/donut";
import { buttonClass } from "@/components/ui/button";
import { messages } from "@/lib/mock";
import { cn } from "@/lib/utils";

export const metadata = { title: "Parent Dashboard" };

const kids = [
  { name: "Chiamaka Okafor", cls: "SS 2 Gold", active: true },
  { name: "Obinna Okafor", cls: "Primary 4", active: false },
];
const att = [
  { label: "Present", value: 58, color: "#6a3bf0" },
  { label: "Late", value: 2, color: "#e879f9" },
  { label: "Absent", value: 2, color: "#f5d0fe" },
];
const rail = [
  { time: "Nov 12", title: "Mid-term break begins", sub: "School closes 1:00 pm", tone: "brand" },
  { time: "Nov 20", title: "PTA general meeting", sub: "Main hall · 10:00 am", tone: "orchid" },
  { time: "Dec 1", title: "First term exams", sub: "Timetable sent by SMS", tone: "amber" },
] as const;

export default function ParentDashboard() {
  return (
    <div className="grid gap-6 2xl:grid-cols-[1fr_340px]">
      <div className="min-w-0">
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-[28px] font-bold tracking-tight sm:text-4xl">Dashboard</h1>
          <div className="flex gap-2">
            {kids.map((k) => (
              <span key={k.name} className={cn("flex items-center gap-2 rounded-2xl px-3 py-2 text-sm", k.active ? "bg-white font-semibold ring-2 ring-brand-500" : "bg-white/60 text-muted")}>
                <Avatar name={k.name} size={28} /> {k.name.split(" ")[0]} <span className="text-xs text-muted">{k.cls}</span>
              </span>
            ))}
          </div>
        </div>
        <Hero
          name="Mr. Okafor"
          line="Chiamaka's first term results are out"
          stats={[
            { icon: Trophy, value: "3rd", label: "In class of 29" },
            { icon: CalendarCheck, value: "94%", label: "Attendance" },
          ]}
          asideTitle="Fees this term"
          aside={
            <div>
              <div className="flex items-center justify-between"><Badge tone="amber">Part paid</Badge><MoreHorizontal className="h-5 w-5 text-muted" /></div>
              <p className="mt-3 text-sm text-muted">Balance to pay</p>
              <p className="text-3xl font-bold">₦132,000</p>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-brand-50"><div className="h-full w-1/2 rounded-full bg-brand-600" /></div>
              <p className="mt-1.5 text-xs text-muted">₦130,000 of ₦262,000 paid · due Nov 30</p>
              <Link href="/parent/fees" className={buttonClass("primary", "sm", "mt-4 w-full")}><Wallet className="h-4 w-4" /> Pay now</Link>
            </div>
          }
        />

        <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
          <Card>
            <CardHeader title="Average score" subtitle="Chiamaka, last 6 terms" action={<Link href="/parent/results" className="text-sm font-semibold text-brand-600">Report card</Link>} />
            <LineChart values={[58, 61, 64, 63, 69, 74.6]} labels={["JSS3 T2", "JSS3 T3", "SS1 T1", "SS1 T2", "SS1 T3", "SS2 T1"]} height={210} />
          </Card>
          <Card>
            <CardHeader title="Attendance" subtitle="This term" />
            <Donut slices={att} centerValue="62" centerLabel="School days" />
            <Legend slices={att} />
          </Card>
        </div>

        <Card className="mt-5">
          <CardHeader title="From the school" action={<Link href="/parent/messages" className="text-sm font-semibold text-brand-600">All messages</Link>} />
          <ul className="flex flex-col gap-3">
            <li className="flex items-center gap-3 rounded-2xl bg-brand-50 p-3.5">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-600 text-white"><FileText className="h-5 w-5" /></span>
              <span className="flex-1 text-sm"><span className="block font-semibold">First term report card is ready</span><span className="text-xs text-muted">Today · Linx Demo College</span></span>
              <Link href="/parent/results" className={buttonClass("primary", "sm")}>View</Link>
            </li>
            {messages.slice(0, 2).map((m) => (
              <li key={m.title} className="flex items-center gap-3 rounded-2xl bg-canvas p-3.5 text-sm">
                <Avatar name="Linx Demo" size={44} className="rounded-xl" />
                <span className="flex-1"><span className="block font-semibold">{m.title}</span><span className="text-xs text-muted">{m.sent} · {m.channel}</span></span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
      <div className="2xl:pt-[68px]"><ScheduleRail title="School Calendar" items={rail} dayLabel="Coming up" /></div>
    </div>
  );
}
