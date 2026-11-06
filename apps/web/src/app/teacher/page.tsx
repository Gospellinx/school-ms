import Link from "next/link";
import { BookOpen, ClipboardList, MoreHorizontal, Users, MapPin, Clock } from "lucide-react";
import { Hero } from "@/components/widgets/hero";
import { ScheduleRail } from "@/components/widgets/schedule-rail";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Avatar } from "@/components/ui/avatar";
import { BarChart } from "@/components/charts/bar-chart";
import { Donut, Legend } from "@/components/charts/donut";
import { buttonClass } from "@/components/ui/button";

export const metadata = { title: "Teacher Dashboard" };

const classAvg = [
  { label: "SS 2", value: 63 }, { label: "SS 3", value: 71 }, { label: "JSS 3", value: 58 }, { label: "SS 1", value: 66 },
];
const grades = [
  { label: "A1 – B3", value: 21, color: "#6a3bf0" },
  { label: "C4 – C6", value: 32, color: "#e879f9" },
  { label: "D7 – E8", value: 18, color: "#f5d0fe" },
  { label: "F9", value: 13, color: "#ebe5ff" },
];
const rail = [
  { time: "8:00 am", title: "Mathematics", sub: "SS 2 Gold · Room 4", tone: "brand" },
  { time: "9:20 am", title: "Further Maths", sub: "SS 3 Gold · Room 7", tone: "orchid" },
  { time: "11:40 am", title: "Mathematics", sub: "JSS 3 Blue · Room 2", tone: "brand" },
  { time: "2:00 pm", title: "Department meeting", sub: "Staff room", tone: "amber" },
] as const;

export default function TeacherDashboard() {
  return (
    <div className="grid gap-6 2xl:grid-cols-[1fr_340px]">
      <div className="min-w-0">
        <h1 className="mb-5 text-[28px] font-bold tracking-tight sm:text-4xl">Dashboard</h1>
        <Hero
          name="Mr. Bakare"
          line="Mathematics · 3 classes · 84 students"
          stats={[
            { icon: BookOpen, value: "4", label: "Lessons today" },
            { icon: ClipboardList, value: "2", label: "Score sheets due" },
          ]}
          asideTitle="Next class"
          aside={
            <div>
              <div className="flex items-center justify-between"><Badge tone="brand">Mathematics</Badge><MoreHorizontal className="h-5 w-5 text-muted" /></div>
              <p className="mt-3 text-lg leading-snug font-semibold">SS 2 Gold: Quadratic Equations</p>
              <div className="mt-3 grid grid-cols-2 gap-2 rounded-2xl bg-canvas p-3 text-xs">
                <span className="flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" /> 8:00 – 8:40</span>
                <span className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" /> Room 4</span>
                <span className="flex items-center gap-1.5"><Users className="h-3.5 w-3.5" /> 29 students</span>
                <span className="flex items-center gap-1.5"><BookOpen className="h-3.5 w-3.5" /> Week 9</span>
              </div>
              <div className="mt-3 flex -space-x-2">
                {["Chiamaka Okafor", "Tobi Adeyemi", "Musa Ibrahim", "Ngozi Eze", "David Okon"].map((n) => <Avatar key={n} name={n} size={30} className="ring-2 ring-white" />)}
                <span className="flex h-[30px] items-center pl-4 text-xs text-muted">+24</span>
              </div>
              <Link href="/teacher/attendance" className={buttonClass("primary", "sm", "mt-4 w-full")}>Take register</Link>
            </div>
          }
        />

        <div className="mb-4">
          <h2 className="text-2xl font-semibold tracking-tight">Class Performance</h2>
          <p className="text-sm text-muted">Average scores in your subject, this term so far.</p>
        </div>
        <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
          <Card className="bg-gradient-to-b from-orchid-100/70 to-white">
            <CardHeader title="Average by class" action={<span className="rounded-xl bg-white/70 px-3 py-1.5 text-xs font-medium">First Term</span>} />
            <BarChart data={classAvg} max={100} unit="percent" height={220} />
          </Card>
          <Card>
            <CardHeader title="Grades" action={<MoreHorizontal className="h-5 w-5 text-muted" />} />
            <Donut slices={grades} centerValue="84" centerLabel="Students" />
            <Legend slices={grades} />
          </Card>
        </div>

        <Card className="mt-5">
          <CardHeader title="To do" action={<Link href="/teacher/scores" className="text-sm font-semibold text-brand-600">Score entry</Link>} />
          <ul className="flex flex-col gap-4">
            {[["SS 2 Gold · 2nd CA scores", 62, "Due Nov 14"], ["JSS 3 Blue · 2nd CA scores", 30, "Due Nov 14"], ["SS 3 Gold · Mock CBT marking", 100, "Done"]].map(([t, v, d]) => (
              <li key={t as string}>
                <div className="mb-1.5 flex justify-between text-sm"><span className="font-semibold">{t}</span><span className="text-muted">{d}</span></div>
                <Progress value={v as number} />
              </li>
            ))}
          </ul>
        </Card>
      </div>
      <div className="2xl:pt-[68px]"><ScheduleRail items={rail} /></div>
    </div>
  );
}
