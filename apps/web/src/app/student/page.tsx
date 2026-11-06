import Link from "next/link";
import { ClipboardCheck, MoreHorizontal, PlayCircle, Sparkles, Timer, TrendingUp } from "lucide-react";
import { Hero } from "@/components/widgets/hero";
import { ScheduleRail } from "@/components/widgets/schedule-rail";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { BarChart } from "@/components/charts/bar-chart";
import { Donut, Legend } from "@/components/charts/donut";
import { cbtTests, schedule } from "@/lib/mock";
import { buttonClass } from "@/components/ui/button";

export const metadata = { title: "Student Dashboard" };

const study = [
  { label: "Mon", value: 1.5 }, { label: "Tue", value: 2.2 }, { label: "Wed", value: 3.4 },
  { label: "Thu", value: 2.6 }, { label: "Fri", value: 1.1 }, { label: "Sat", value: 2.9 }, { label: "Sun", value: 0.8 },
];

const subjectsProgress = [
  { s: "Mathematics", topics: "18 of 24 topics", v: 75 },
  { s: "Physics", topics: "11 of 20 topics", v: 55 },
  { s: "English Language", topics: "15 of 18 topics", v: 83 },
  { s: "Chemistry", topics: "8 of 22 topics", v: 36 },
];

export default function StudentDashboard() {
  return (
    <div className="grid gap-6 2xl:grid-cols-[1fr_340px]">
      <div className="min-w-0">
        <h1 className="no-print mb-5 text-[28px] font-bold tracking-tight sm:text-4xl">Dashboard</h1>
        <Hero
          name="Chiamaka Okafor"
          line="SS 2 Gold · WAEC 2027 is 186 days away"
          stats={[
            { icon: ClipboardCheck, value: "24", label: "Tests completed" },
            { icon: Timer, value: "58", label: "Hours studied" },
          ]}
          asideTitle="Continue Learning"
          aside={
            <div>
              <div className="flex items-center justify-between">
                <Badge tone="brand">Physics</Badge>
                <MoreHorizontal className="h-5 w-5 text-muted" />
              </div>
              <p className="mt-3 text-lg leading-snug font-semibold">Projectile Motion: WAEC Past Questions</p>
              <div className="mt-3 flex h-28 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-brand-200 via-orchid-200 to-brand-400">
                <svg viewBox="0 0 200 90" className="h-full w-full" aria-hidden>
                  <path d="M10 80 Q 100 -30 190 80" fill="none" stroke="white" strokeWidth="3" strokeDasharray="6 6" />
                  <circle cx="100" cy="25" r="9" fill="#6a3bf0" />
                  <line x1="0" y1="82" x2="200" y2="82" stroke="white" strokeWidth="2" opacity=".7" />
                </svg>
              </div>
              <p className="mt-3 text-sm text-muted">Range, time of flight and maximum height, worked step by step.</p>
              <div className="mt-3 flex items-center justify-between border-t border-line pt-3 text-xs font-medium">
                <span className="flex items-center gap-1.5"><PlayCircle className="h-4 w-4" /> 12 lessons</span>
                <span className="flex items-center gap-1.5"><TrendingUp className="h-4 w-4" /> 64% done</span>
              </div>
            </div>
          }
        />

        <div className="mb-4">
          <h2 className="text-2xl font-semibold tracking-tight">Learning Statistics</h2>
          <p className="text-sm text-muted">Your study time, tests and subjects this week.</p>
        </div>

        <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
          <Card className="bg-gradient-to-b from-orchid-100/70 to-white">
            <CardHeader
              title="Study Time"
              action={<span className="rounded-xl bg-white/70 px-3 py-1.5 text-xs font-medium">This week</span>}
            />
            <BarChart data={study} max={4} unit="hours" highlight={2} height={220} />
          </Card>
          <Card>
            <CardHeader title="Test Results" action={<MoreHorizontal className="h-5 w-5 text-muted" />} />
            <Donut
              slices={[
                { label: "A1 – B3", value: 11, color: "#6a3bf0" },
                { label: "C4 – C6", value: 8, color: "#e879f9" },
                { label: "D7 – E8", value: 4, color: "#f5d0fe" },
                { label: "F9", value: 1, color: "#ebe5ff" },
              ]}
              centerValue="24"
              centerLabel="Total tests"
            />
            <Legend
              slices={[
                { label: "A1 – B3", value: 11, color: "#6a3bf0" },
                { label: "C4 – C6", value: 8, color: "#e879f9" },
                { label: "D7 – E8", value: 4, color: "#f5d0fe" },
                { label: "F9", value: 1, color: "#ebe5ff" },
              ]}
            />
          </Card>
        </div>

        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          <Card>
            <CardHeader title="Subject Progress" subtitle="WAEC syllabus covered" action={<Link href="/student/subjects" className="text-sm font-semibold text-brand-600">See all</Link>} />
            <ul className="flex flex-col gap-4">
              {subjectsProgress.map((s) => (
                <li key={s.s}>
                  <div className="mb-1.5 flex justify-between text-sm"><span className="font-semibold">{s.s}</span><span className="text-muted">{s.topics}</span></div>
                  <Progress value={s.v} />
                </li>
              ))}
            </ul>
          </Card>
          <Card>
            <CardHeader title="Upcoming CBT" action={<Link href="/student/cbt" className="text-sm font-semibold text-brand-600">See all</Link>} />
            <ul className="flex flex-col gap-3">
              {cbtTests.filter((t) => t.status === "Open").map((t) => (
                <li key={t.title} className="flex items-center gap-3 rounded-2xl bg-canvas p-3.5">
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white text-brand-600"><ClipboardCheck className="h-5 w-5" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{t.title}</span>
                    <span className="block text-xs text-muted">{t.questions} questions · {t.minutes} min · due {t.due}</span>
                  </span>
                  <Link href="/student/cbt/take" className={buttonClass("primary", "sm")}>Start</Link>
                </li>
              ))}
              <li className="flex items-center gap-3 rounded-2xl bg-brand-50 p-3.5">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-600 text-white"><Sparkles className="h-5 w-5" /></span>
                <span className="flex-1 text-sm"><span className="block font-semibold">Weak topic: Mole concept</span><span className="text-xs text-muted">AI made you a 10-question drill</span></span>
                <Link href="/student/prep" className={buttonClass("secondary", "sm")}>Practise</Link>
              </li>
            </ul>
          </Card>
        </div>
      </div>

      <div className="2xl:pt-[68px]">
        <ScheduleRail items={schedule} />
      </div>
    </div>
  );
}
