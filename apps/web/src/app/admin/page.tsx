"use client";
import Link from "next/link";
import { CalendarCheck, FileCheck2, GraduationCap, MessageSquare, Users, Wallet } from "lucide-react";
import { Hero } from "@/components/widgets/hero";
import { StatCard } from "@/components/widgets/stat-card";
import { MiniCalendar } from "@/components/widgets/schedule-rail";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { BarChart } from "@/components/charts/bar-chart";
import { Donut, Legend } from "@/components/charts/donut";
import { buttonClass } from "@/components/ui/button";
import { Async, Empty } from "@/components/ui/feedback";
import { useApi } from "@/lib/api";
import { useStaff } from "@/lib/session";
import { dateTime, longDate, MESSAGE_KINDS, naira, pct, dayLabel } from "@/lib/format";
import type { Dashboard, FeeSummary } from "@/lib/types";

/** Score entry progress per class: score rows entered out of students × subjects. */
function progressByClass(d: Dashboard) {
  const by = new Map<string, { name: string; entered: number; expected: number }>();
  for (const s of d.scoreSheets) {
    const cur = by.get(s.classId) ?? { name: s.className, entered: 0, expected: 0 };
    cur.entered += s.entered;
    cur.expected += s.students;
    by.set(s.classId, cur);
  }
  return [...by.values()].map((c) => ({ ...c, pct: pct(c.entered, c.expected) }));
}

export default function AdminDashboard() {
  const me = useStaff();
  const { data, error } = useApi<Dashboard>("dashboard");
  const { data: fees } = useApi<FeeSummary>(data?.currentTerm ? `terms/${data.currentTerm.id}/fees/summary` : null);

  return (
    <Async data={data} error={error}>
      {(d) => {
        const marked = d.classes.reduce((s, c) => s + c.markedToday, 0);
        const present = d.classes.reduce((s, c) => s + c.presentToday, 0);
        const classesMarked = d.classes.filter((c) => c.markedToday > 0).length;
        const progress = progressByClass(d);
        const slices = fees
          ? [
              { label: "Paid", value: fees.paid, color: "#6a3bf0" },
              { label: "Part paid", value: fees.partPaid, color: "#e879f9" },
              { label: "Owing", value: fees.unpaid, color: "#f5d0fe" },
            ]
          : [];
        return (
          <div className="grid gap-6 2xl:grid-cols-[1fr_340px]">
            <div className="min-w-0">
              <h1 className="mb-5 text-[28px] font-bold tracking-tight sm:text-4xl">Dashboard</h1>
              <Hero
                name={me.staff.fullName}
                line={`${me.school.name}${d.currentTerm ? ` · ${d.currentTerm.name} ${d.currentTerm.sessionName}` : " · no current term set"}`}
                stats={[
                  { icon: GraduationCap, value: String(d.counts?.students ?? 0), label: "Students" },
                  { icon: Users, value: String(d.counts?.staff ?? 0), label: "Staff" },
                ]}
                asideTitle="Results this term"
                aside={
                  <div>
                    <div className="flex items-center justify-between">
                      <Badge tone="orchid">{d.resultsPublished ?? 0} of {d.classes.length} classes published</Badge>
                    </div>
                    <p className="mt-3 text-lg font-semibold">Score entry progress</p>
                    {progress.length ? (
                      <ul className="mt-3 flex flex-col gap-3">
                        {progress.slice(0, 5).map((r) => (
                          <li key={r.name}>
                            <div className="mb-1 flex justify-between text-xs"><span className="font-semibold">{r.name}</span><span className="text-muted">{r.pct}%</span></div>
                            <Progress value={r.pct} />
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-2 text-sm text-muted">No subjects are assigned to classes yet.</p>
                    )}
                    <Link href="/admin/results" className={buttonClass("secondary", "sm", "mt-4 w-full")}><FileCheck2 className="h-4 w-4" /> Open results</Link>
                  </div>
                }
              />

              <div className="mb-5 grid grid-cols-2 gap-4 xl:grid-cols-4">
                <StatCard
                  icon={Wallet}
                  label="Fees collected this term"
                  value={naira(d.fees?.collectedKobo ?? 0, { compact: true })}
                  delta={d.fees?.expectedKobo ? `${pct(d.fees.collectedKobo, d.fees.expectedKobo)}%` : undefined}
                />
                <StatCard icon={Wallet} label="Outstanding" value={naira((d.fees?.expectedKobo ?? 0) - (d.fees?.collectedKobo ?? 0), { compact: true })} tone="orchid" />
                <StatCard
                  icon={CalendarCheck}
                  label={`Present today · ${classesMarked} of ${d.classes.length} registers taken`}
                  value={marked ? `${pct(present, marked)}%` : "–"}
                  tone="green"
                />
                <StatCard icon={Users} label="Parents on record" value={String(d.counts?.parents ?? 0)} tone="amber" />
              </div>

              <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
                <Card className="bg-gradient-to-b from-orchid-100/70 to-white">
                  <CardHeader title="Attendance" subtitle="Whole school, last school days" />
                  {d.attendanceTrend.length ? (
                    <BarChart
                      data={d.attendanceTrend.map((t) => ({ label: dayLabel(t.date), value: pct(t.present, t.marked) }))}
                      max={100}
                      unit="percent"
                      height={220}
                      highlight={d.attendanceTrend.length - 1}
                    />
                  ) : (
                    <Empty title="No registers yet">Teachers take the daily register from their phones.</Empty>
                  )}
                </Card>
                <Card>
                  <CardHeader title="Fee Status" subtitle="Bills this term" action={<Link href="/admin/fees" className="text-sm font-semibold text-brand-600">View</Link>} />
                  {fees && fees.invoices ? (
                    <>
                      <Donut slices={slices} centerValue={String(fees.invoices)} centerLabel="Bills" />
                      <Legend slices={slices} />
                    </>
                  ) : (
                    <Empty title="No bills yet">Add fee items and generate bills on the Fees page.</Empty>
                  )}
                </Card>
              </div>

              <Card className="mt-5">
                <CardHeader
                  title="Messages to parents"
                  subtitle="Latest SMS and WhatsApp"
                  action={<Link href="/admin/messages" className="text-sm font-semibold text-brand-600">View all</Link>}
                />
                {d.recentMessages?.length ? (
                  <ul className="grid gap-3 sm:grid-cols-2">
                    {d.recentMessages.map((m) => (
                      <li key={m.id} className="flex items-start gap-3 rounded-2xl bg-canvas p-3.5">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-brand-600"><MessageSquare className="h-4 w-4" /></span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-2 text-xs text-muted">
                            <span className="font-semibold text-ink">{MESSAGE_KINDS[m.kind] ?? m.kind}</span> · {dateTime(m.createdAt)} · {m.recipients} {m.recipients === 1 ? "parent" : "parents"}
                          </span>
                          <span className="mt-0.5 line-clamp-2 block text-sm">{m.body}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <Empty title="No messages sent yet" />
                )}
              </Card>
            </div>
            <div className="2xl:pt-[68px]">
              <aside className="rounded-3xl bg-white p-5 sm:p-6">
                <h3 className="mb-4 text-xl font-semibold tracking-tight">Today</h3>
                <MiniCalendar />
                <div className="mt-6 border-t border-line pt-5">
                  <p className="mb-3 font-semibold">{longDate(d.today)}</p>
                  <p className="mb-2 text-xs font-semibold tracking-wider text-muted uppercase">Registers</p>
                  <ul className="flex flex-col gap-2">
                    {d.classes.map((c) => (
                      <li key={c.id} className="flex items-center justify-between gap-2 rounded-2xl bg-canvas px-3.5 py-2.5 text-sm">
                        <span className="font-semibold">{c.arm ? `${c.name} ${c.arm}` : c.name}</span>
                        {c.markedToday ? (
                          <Badge tone="green">{c.presentToday}/{c.students} in</Badge>
                        ) : (
                          <Badge tone="amber">Not taken</Badge>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              </aside>
            </div>
          </div>
        );
      }}
    </Async>
  );
}
