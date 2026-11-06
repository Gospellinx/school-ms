"use client";
import { Suspense } from "react";
import { CalendarCheck, CalendarX, Clock } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { StatCard } from "@/components/widgets/stat-card";
import { Async, Empty, Loading } from "@/components/ui/feedback";
import { useApi } from "@/lib/api";
import { ChildPicker, childClass, childName, useChild } from "@/lib/child";
import { longDate, shortDate } from "@/lib/format";
import type { AttendanceStatus, StudentAttendance } from "@/lib/types";
import { cn } from "@/lib/utils";

const tone: Record<AttendanceStatus, string> = {
  present: "bg-brand-100 text-brand-700",
  late: "bg-amber-100 text-amber-700",
  absent: "bg-rose-100 text-rose-600",
  excused: "bg-sky-100 text-sky-700",
};
const mark: Record<AttendanceStatus, string> = { present: "✓", late: "L", absent: "A", excused: "E" };

/** Monday (YYYY-MM-DD) of the week a date falls in. */
function mondayOf(date: string) {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

function Attendance() {
  const child = useChild();
  const { data, error } = useApi<StudentAttendance>(child ? `parent/children/${child.id}/attendance` : null);
  if (!child) return <Card><Empty title="No children linked yet" /></Card>;
  return (
    <>
      <PageHeader title="Attendance" subtitle={`${childName(child)} · ${childClass(child)}`} actions={<ChildPicker current={child} />} />
      <Async data={data} error={error}>
        {(a) => {
          const weeks = new Map<string, Map<number, (typeof a.records)[number]>>();
          for (const r of a.records) {
            const w = mondayOf(r.date);
            const day = (new Date(`${r.date}T12:00:00Z`).getUTCDay() + 6) % 7;
            if (day > 4) continue;
            if (!weeks.has(w)) weeks.set(w, new Map());
            weeks.get(w)!.set(day, r);
          }
          const rows = [...weeks.entries()].sort(([x], [y]) => (x < y ? 1 : -1));
          const notes = a.records.filter((r) => r.status !== "present").slice(-8).reverse();
          return (
            <>
              <div className="mb-5 grid grid-cols-3 gap-4">
                <StatCard icon={CalendarCheck} label="Present" value={String(a.summary.present)} tone="green" />
                <StatCard icon={Clock} label="Late" value={String(a.summary.late)} tone="amber" />
                <StatCard icon={CalendarX} label="Absent" value={String(a.summary.absent)} tone="orchid" />
              </div>
              <div className="grid gap-5 lg:grid-cols-[1.5fr_1fr]">
                <Card>
                  <CardHeader title="Day by day" subtitle={`${shortDate(a.from)} to ${shortDate(a.to)}`} />
                  {rows.length ? (
                    <div className="overflow-x-auto">
                      <div className="grid min-w-[420px] grid-cols-[90px_repeat(5,1fr)] gap-2 text-center text-xs">
                        <span />
                        {["Mon", "Tue", "Wed", "Thu", "Fri"].map((d) => <span key={d} className="font-semibold text-muted">{d}</span>)}
                        {rows.map(([w, days]) => (
                          <div key={w} className="contents">
                            <span className="flex items-center text-left font-semibold text-muted">{new Date(`${w}T12:00:00Z`).toLocaleDateString("en-NG", { day: "numeric", month: "short" })}</span>
                            {[0, 1, 2, 3, 4].map((d) => {
                              const r = days.get(d);
                              return <span key={d} title={r?.note ?? undefined} className={cn("rounded-lg py-2.5 font-bold", r ? tone[r.status] : "bg-canvas text-muted")}>{r ? mark[r.status] : "·"}</span>;
                            })}
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <Empty title="No registers yet" />
                  )}
                </Card>
                <Card>
                  <CardHeader title="Days missed or late" />
                  {notes.length ? (
                    <ul className="flex flex-col gap-2 text-sm">
                      {notes.map((r) => (
                        <li key={r.date} className="flex items-center justify-between gap-2 rounded-2xl bg-canvas px-3.5 py-2.5">
                          <span><span className="font-semibold">{longDate(r.date)}</span>{r.note ? <span className="block text-xs text-muted">{r.note}</span> : null}</span>
                          <span className={cn("rounded-lg px-2 py-0.5 text-xs font-bold capitalize", tone[r.status])}>{r.status}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <Empty title="Never absent or late" />
                  )}
                </Card>
              </div>
            </>
          );
        }}
      </Async>
    </>
  );
}

export default function Page() {
  return <Suspense fallback={<Loading />}><Attendance /></Suspense>;
}
