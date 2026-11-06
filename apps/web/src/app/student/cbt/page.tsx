"use client";
import Link from "next/link";
import { Clock, MonitorCheck } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { Async, Empty } from "@/components/ui/feedback";
import { useApi } from "@/lib/api";
import { dateTime } from "@/lib/format";
import type { StudentTest } from "@/lib/types";

function status(t: StudentTest): { label: string; tone: "green" | "brand" | "amber" | "gray" } {
  if (t.attempt?.submitted) return { label: "Submitted", tone: "green" };
  if (t.attempt && t.isOpen) return { label: "In progress", tone: "amber" };
  if (t.isOpen) return { label: "Open", tone: "brand" };
  return { label: t.opensAt && new Date(t.opensAt) > new Date() ? "Not open yet" : "Closed", tone: "gray" };
}

export default function Cbt() {
  const { data, error } = useApi<StudentTest[]>("student/tests");
  return (
    <>
      <PageHeader title="CBT Tests" subtitle="Tests from your teachers. You get one attempt, and the clock keeps running once you start." actions={<Link href="/student/prep" className={buttonClass("secondary")}>Practise instead</Link>} />
      <Async data={data} error={error}>
        {(list) =>
          list.length === 0 ? (
            <Card><Empty title="No tests yet" icon={MonitorCheck}>Tests your teachers publish for your class show here.</Empty></Card>
          ) : (
            <div className="grid gap-5 md:grid-cols-2">
              {list.map((t) => {
                const s = status(t);
                return (
                  <Card key={t.id}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold text-brand-600 uppercase">{t.subject}</p>
                        <h3 className="mt-1 text-lg font-semibold">{t.title}</h3>
                      </div>
                      <Badge tone={s.tone}>{s.label}</Badge>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-4 text-sm text-muted">
                      <span className="flex items-center gap-1.5"><Clock className="h-4 w-4" /> {t.durationMinutes} minutes</span>
                      {t.closesAt ? <span>Closes {dateTime(t.closesAt)}</span> : t.opensAt ? <span>Opens {dateTime(t.opensAt)}</span> : null}
                    </div>
                    <div className="mt-5 flex items-center justify-between border-t border-line pt-4">
                      {t.attempt?.submitted ? (
                        <span className="text-sm">{t.attempt.percentage !== null ? <>Your score <strong className="text-lg">{Math.round(t.attempt.percentage)}%</strong></> : "Your teacher will share the score"}</span>
                      ) : (
                        <span className="text-sm text-muted">One attempt allowed</span>
                      )}
                      {t.attempt?.submitted ? (
                        <Link href={`/student/cbt/take?attempt=${t.attempt.id}`} className={buttonClass("secondary", "sm")}>Review</Link>
                      ) : t.isOpen ? (
                        <Link href={`/student/cbt/take?test=${t.id}`} className={buttonClass("primary", "sm")}>{t.attempt ? "Continue" : "Start test"}</Link>
                      ) : null}
                    </div>
                  </Card>
                );
              })}
            </div>
          )
        }
      </Async>
    </>
  );
}
