"use client";
import Link from "next/link";
import { ClipboardCheck, FileText, Sparkles, TrendingUp } from "lucide-react";
import { Hero } from "@/components/widgets/hero";
import { MiniCalendar } from "@/components/widgets/schedule-rail";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BarChart } from "@/components/charts/bar-chart";
import { buttonClass } from "@/components/ui/button";
import { Async, Empty } from "@/components/ui/feedback";
import { useApi } from "@/lib/api";
import { useStudent } from "@/lib/session";
import { shortDate } from "@/lib/format";
import { className, type PrepResponse, type PublishedTerm, type StudentTest } from "@/lib/types";

export default function StudentDashboard() {
  const me = useStudent();
  const tests = useApi<StudentTest[]>("student/tests");
  const prep = useApi<PrepResponse>("student/prep/plan?ai=false");
  const results = useApi<PublishedTerm[]>("student/results");
  const name = `${me.student.firstName} ${me.student.lastName}`;
  const cls = me.className ? className({ name: me.className, arm: me.arm }) : "No class yet";

  return (
    <Async data={prep.data} error={prep.error}>
      {({ profile }) => {
        const done = (tests.data ?? []).filter((t) => t.attempt?.submitted);
        const open = (tests.data ?? []).filter((t) => t.isOpen && !t.attempt?.submitted);
        const scored = profile.subjects.filter((s) => s.latestScore !== null);
        const focus = [...profile.subjects].sort((a, b) => b.priority - a.priority).filter((s) => s.priority > 0).slice(0, 4);
        const next = open[0];
        return (
          <div className="grid gap-6 2xl:grid-cols-[1fr_340px]">
            <div className="min-w-0">
              <h1 className="mb-5 text-[28px] font-bold tracking-tight sm:text-4xl">Dashboard</h1>
              <Hero
                name={name}
                line={`${cls} · preparing for ${profile.targetExam}`}
                stats={[
                  { icon: ClipboardCheck, value: String(done.length), label: "Tests completed" },
                  { icon: TrendingUp, value: profile.overallAverage === null ? "–" : `${Math.round(profile.overallAverage)}%`, label: "Average, last results" },
                ]}
                asideTitle={next ? "Test waiting for you" : "Keep practising"}
                aside={
                  next ? (
                    <div>
                      <Badge tone="brand">{next.subject}</Badge>
                      <p className="mt-3 text-lg leading-snug font-semibold">{next.title}</p>
                      <p className="mt-2 text-sm text-muted">{next.durationMinutes} minutes{next.closesAt ? ` · closes ${shortDate(next.closesAt)}` : ""}</p>
                      <Link href={`/student/cbt/take?test=${next.id}`} className={buttonClass("primary", "sm", "mt-4 w-full")}>{next.attempt ? "Continue test" : "Start test"}</Link>
                    </div>
                  ) : (
                    <div>
                      <p className="text-lg leading-snug font-semibold">No tests open right now</p>
                      <p className="mt-2 text-sm text-muted">A short practice set on your weakest topics is the best use of 15 minutes.</p>
                      <Link href="/student/prep" className={buttonClass("primary", "sm", "mt-4 w-full")}><Sparkles className="h-4 w-4" /> Exam prep</Link>
                    </div>
                  )
                }
              />

              <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
                <Card className="bg-gradient-to-b from-orchid-100/70 to-white">
                  <CardHeader title="Scores by subject" subtitle={scored[0]?.latestTerm ? `From ${scored[0].latestTerm} results` : "From your released results"} />
                  {scored.length ? (
                    <BarChart data={scored.map((s) => ({ label: s.subjectName.split(" ")[0]!, value: Math.round(s.latestScore!) }))} max={100} unit="percent" height={220} />
                  ) : (
                    <Empty title="No results released yet" />
                  )}
                </Card>
                <Card>
                  <CardHeader title="Focus next" subtitle="Picked from your results and tests" action={<Link href="/student/prep" className="text-sm font-semibold text-brand-600">Prep</Link>} />
                  {focus.length ? (
                    <ul className="flex flex-col gap-2">
                      {focus.map((s) => (
                        <li key={s.subjectId} className="rounded-2xl bg-canvas px-3.5 py-2.5 text-sm">
                          <span className="flex items-center justify-between gap-2"><span className="font-semibold">{s.subjectName}</span>{s.latestScore !== null ? <span className="text-muted">{Math.round(s.latestScore)}%</span> : null}</span>
                          <span className="block text-xs text-muted">{s.weakTopics[0] ? `Weak topic: ${s.weakTopics[0].topic}` : s.reasons[0]}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <Empty title="Nothing flagged" >Keep taking tests and the weak spots show here.</Empty>
                  )}
                </Card>
              </div>

              <Card className="mt-5">
                <CardHeader title="CBT tests" action={<Link href="/student/cbt" className="text-sm font-semibold text-brand-600">See all</Link>} />
                <Async data={tests.data} error={tests.error}>
                  {(list) =>
                    list.length ? (
                      <ul className="grid gap-3 sm:grid-cols-2">
                        {list.slice(0, 4).map((t) => (
                          <li key={t.id} className="flex items-center gap-3 rounded-2xl bg-canvas p-3.5">
                            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white text-brand-600"><ClipboardCheck className="h-5 w-5" /></span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-semibold">{t.title}</span>
                              <span className="block text-xs text-muted">{t.subject} · {t.durationMinutes} min</span>
                            </span>
                            {t.attempt?.submitted ? (
                              <Badge tone="green">{t.attempt.percentage !== null ? `${Math.round(t.attempt.percentage)}%` : "Done"}</Badge>
                            ) : t.isOpen ? (
                              <Link href={`/student/cbt/take?test=${t.id}`} className={buttonClass("primary", "sm")}>{t.attempt ? "Continue" : "Start"}</Link>
                            ) : (
                              <Badge tone="gray">Not open</Badge>
                            )}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <Empty title="No tests from your teachers yet" />
                    )
                  }
                </Async>
              </Card>
            </div>
            <div className="2xl:pt-[68px]">
              <aside className="rounded-3xl bg-white p-5 sm:p-6">
                <h3 className="mb-4 text-xl font-semibold tracking-tight">Calendar</h3>
                <MiniCalendar />
                <div className="mt-5 border-t border-line pt-4">
                  <p className="mb-2 text-xs font-semibold tracking-wider text-muted uppercase">Report cards</p>
                  {results.data?.length ? (
                    <ul className="flex flex-col gap-2">
                      {results.data.map((t) => (
                        <li key={t.id}>
                          <Link href="/student/results" className="flex items-center gap-2 rounded-2xl bg-canvas px-3.5 py-2.5 text-sm font-semibold"><FileText className="h-4 w-4 text-brand-600" /> {t.name} {t.session}</Link>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-muted">None released yet.</p>
                  )}
                </div>
              </aside>
            </div>
          </div>
        );
      }}
    </Async>
  );
}
