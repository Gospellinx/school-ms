"use client";
import { Suspense } from "react";
import { Home, Target } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Async, Empty, Loading } from "@/components/ui/feedback";
import { useApi } from "@/lib/api";
import { ChildPicker, useChild } from "@/lib/child";
import { BAND, type ParentForecastView } from "@/lib/insights";
import { cn } from "@/lib/utils";

function Forecast() {
  const child = useChild();
  const { data, error } = useApi<ParentForecastView>("parent/forecast");
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-[28px] font-bold tracking-tight sm:text-4xl">Exam Forecast</h1>
          <p className="mt-1 text-sm text-muted sm:text-base">How your child is heading for WAEC, NECO, JAMB or BECE, and how you can help at home.</p>
        </div>
        <ChildPicker current={child} />
      </div>
      <Async data={data} error={error}>
        {(d) => {
          const kid = d.children.find((c) => c.studentId === child?.id) ?? d.children[0];
          if (!kid) return <Card><Empty title="No children linked yet">Ask the school office to link your phone number to your child.</Empty></Card>;
          if (!kid.exams.length)
            return <Card><Empty title="No external exam yet" icon={Target}>{kid.name.split(" ")[0]} is not yet in a class that prepares for WAEC, NECO, JAMB or BECE.</Empty></Card>;
          return kid.exams.map((e) => (
            <Card key={e.exam}>
              <CardHeader
                title={e.examName}
                subtitle={`Target: ${e.benchmark}`}
                action={<Badge tone={BAND[e.band].tone}>{BAND[e.band].label}</Badge>}
              />
              <p className="text-lg font-semibold">{e.text.headline}</p>
              <ul className="mt-2 flex flex-col gap-1 text-sm text-muted">
                {e.text.lines.map((l) => <li key={l}>{l}</li>)}
              </ul>
              {e.subjects.length ? (
                <ul className="mt-5 grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">
                  {e.subjects.map((s) => (
                    <li key={s.subjectId} className="text-sm">
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{s.subjectName}</span>
                        <span className="text-xs text-muted">{s.predicted === null ? "Not enough results yet" : `about ${s.predicted}% · ${s.grade}`}</span>
                      </div>
                      <div className="mt-1 h-2 overflow-hidden rounded-full bg-canvas">
                        {s.predicted !== null ? <div className={cn("h-full rounded-full", s.predicted >= 65 ? "bg-emerald-500" : s.predicted >= 50 ? "bg-amber-400" : "bg-rose-500")} style={{ width: `${s.predicted}%` }} /> : null}
                      </div>
                    </li>
                  ))}
                </ul>
              ) : null}
              <div className="mt-6 rounded-2xl bg-brand-50/70 p-4">
                <p className="flex items-center gap-2 font-semibold text-brand-700"><Home className="h-4 w-4" /> What you can do at home</p>
                <ul className="mt-2 list-disc pl-5 text-sm">
                  {e.text.atHome.map((l) => <li key={l} className="mt-1">{l}</li>)}
                </ul>
              </div>
              <p className="mt-4 text-xs text-muted">Worked out from released school results, practice mocks and practice questions. It is a guide, not a promise.</p>
            </Card>
          ));
        }}
      </Async>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<Loading />}>
      <Forecast />
    </Suspense>
  );
}
