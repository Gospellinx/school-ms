"use client";
import Link from "next/link";
import { BookOpen, CalendarCheck, ClipboardList, MonitorCheck, Users } from "lucide-react";
import { Hero } from "@/components/widgets/hero";
import { MiniCalendar } from "@/components/widgets/schedule-rail";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { BarChart } from "@/components/charts/bar-chart";
import { buttonClass } from "@/components/ui/button";
import { Async, Empty } from "@/components/ui/feedback";
import { useApi } from "@/lib/api";
import { useStaff } from "@/lib/session";
import { dayLabel, longDate, pct } from "@/lib/format";
import { className, type Dashboard } from "@/lib/types";

export default function TeacherDashboard() {
  const me = useStaff();
  const { data, error } = useApi<Dashboard>("dashboard");
  return (
    <Async data={data} error={error}>
      {(d) => {
        const subjects = [...new Set(d.scoreSheets.map((s) => s.subjectName))];
        const students = d.classes.reduce((n, c) => n + c.students, 0);
        const due = d.scoreSheets.filter((s) => s.entered < s.students);
        const form = d.classes.find((c) => c.isFormClass);
        return (
          <div className="grid gap-6 2xl:grid-cols-[1fr_340px]">
            <div className="min-w-0">
              <h1 className="mb-5 text-[28px] font-bold tracking-tight sm:text-4xl">Dashboard</h1>
              <Hero
                name={me.staff.fullName}
                line={`${subjects.join(", ") || "No subjects yet"} · ${d.classes.length} classes · ${students} students`}
                stats={[
                  { icon: BookOpen, value: String(d.scoreSheets.length), label: "Class subjects" },
                  { icon: ClipboardList, value: String(due.length), label: "Score sheets not finished" },
                ]}
                asideTitle={form ? "Your form class" : "Today"}
                aside={
                  form ? (
                    <div>
                      <Badge tone="brand">Form teacher</Badge>
                      <p className="mt-3 text-lg leading-snug font-semibold">{className(form)}</p>
                      <div className="mt-3 grid grid-cols-2 gap-2 rounded-2xl bg-canvas p-3 text-xs">
                        <span className="flex items-center gap-1.5"><Users className="h-3.5 w-3.5" /> {form.students} students</span>
                        <span className="flex items-center gap-1.5"><CalendarCheck className="h-3.5 w-3.5" /> {form.markedToday ? `${form.presentToday} present` : "Register not taken"}</span>
                      </div>
                      <Link href="/teacher/attendance" className={buttonClass("primary", "sm", "mt-4 w-full")}>{form.markedToday ? "Update register" : "Take register"}</Link>
                    </div>
                  ) : (
                    <div>
                      <p className="text-lg font-semibold">{longDate(d.today)}</p>
                      <p className="mt-1 text-sm text-muted">{d.cbt.open} CBT tests open</p>
                      <Link href="/teacher/cbt" className={buttonClass("primary", "sm", "mt-4 w-full")}><MonitorCheck className="h-4 w-4" /> CBT tests</Link>
                    </div>
                  )
                }
              />

              <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
                <Card className="bg-gradient-to-b from-orchid-100/70 to-white">
                  <CardHeader title="Attendance" subtitle="Your classes, last school days" />
                  {d.attendanceTrend.length ? (
                    <BarChart data={d.attendanceTrend.map((t) => ({ label: dayLabel(t.date), value: pct(t.present, t.marked) }))} max={100} unit="percent" height={220} highlight={d.attendanceTrend.length - 1} />
                  ) : (
                    <Empty title="No registers yet" />
                  )}
                </Card>
                <Card>
                  <CardHeader title="Classes" />
                  <ul className="flex flex-col gap-2">
                    {d.classes.map((c) => (
                      <li key={c.id} className="flex items-center justify-between gap-2 rounded-2xl bg-canvas px-3.5 py-2.5 text-sm">
                        <span className="font-semibold">{className(c)}</span>
                        {c.markedToday ? <Badge tone="green">{c.presentToday}/{c.students} in</Badge> : <Badge tone="amber">Not taken</Badge>}
                      </li>
                    ))}
                  </ul>
                </Card>
              </div>

              <Card className="mt-5">
                <CardHeader title="Score entry" subtitle={d.currentTerm ? `${d.currentTerm.name} ${d.currentTerm.sessionName}` : undefined} action={<Link href="/teacher/scores" className="text-sm font-semibold text-brand-600">Open</Link>} />
                {d.scoreSheets.length ? (
                  <ul className="flex flex-col gap-4">
                    {d.scoreSheets.map((s) => (
                      <li key={`${s.classId}:${s.subjectId}`}>
                        <Link href={`/teacher/scores?class=${s.classId}&subject=${s.subjectId}`} className="block">
                          <div className="mb-1.5 flex justify-between text-sm"><span className="font-semibold">{s.className} · {s.subjectName}</span><span className="text-muted">{s.entered} of {s.students}</span></div>
                          <Progress value={pct(s.entered, s.students)} />
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <Empty title="No subjects assigned to you yet" />
                )}
              </Card>
            </div>
            <div className="2xl:pt-[68px]">
              <aside className="rounded-3xl bg-white p-5 sm:p-6">
                <h3 className="mb-4 text-xl font-semibold tracking-tight">Calendar</h3>
                <MiniCalendar />
                {d.currentTerm?.endsOn ? <p className="mt-5 border-t border-line pt-4 text-sm text-muted">Term ends <strong className="text-ink">{longDate(d.currentTerm.endsOn)}</strong></p> : null}
              </aside>
            </div>
          </div>
        );
      }}
    </Async>
  );
}
