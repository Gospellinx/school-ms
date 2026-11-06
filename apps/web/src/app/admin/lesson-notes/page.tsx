"use client";
import * as React from "react";
import { BookCheck } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { LessonBookPage } from "@/components/pages/lesson-book";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Async, Empty } from "@/components/ui/feedback";
import { Progress } from "@/components/ui/progress";
import { useApi } from "@/lib/api";
import { TermSelect, useTerms } from "@/lib/terms";
import { className, type LessonBookOverview } from "@/lib/types";

/** Every class and subject's lesson notes at a glance, then one book to read, vet and print. */
export default function Page() {
  const { sessions, termId, setTermId } = useTerms();
  const overview = useApi<LessonBookOverview>(termId ? `lesson-book/overview?termId=${termId}` : null);
  const [pick, setPick] = React.useState<string | undefined>();
  const bookRef = React.useRef<HTMLDivElement>(null);

  const open = (cs: string) => {
    setPick(cs);
    setTimeout(() => bookRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  };

  return (
    <>
      <PageHeader
        title="Lesson Notes"
        subtitle="See which teachers have notes ready for every week, vet them, and print any book for an inspection visit."
        actions={<TermSelect sessions={sessions} value={termId} onChange={setTermId} className="sm:w-64" />}
      />
      <Card className="no-print mb-6">
        <CardHeader
          title="Readiness by class and subject"
          subtitle={overview.data?.currentWeek ? `Week ${overview.data.currentWeek} of term. Coverage counts weeks so far.` : "Coverage is checked against each subject's scheme of work."}
        />
        <Async data={overview.data} error={overview.error}>
          {(o) =>
            !o.rows.length ? (
              <Empty title="No subjects assigned to classes yet" icon={BookCheck} />
            ) : (
              <div className="-mx-5 overflow-x-auto sm:-mx-6">
                <table className="w-full min-w-[720px] text-sm">
                  <thead className="text-left text-xs font-semibold text-muted uppercase">
                    <tr className="border-b border-line">
                      <th className="py-3 pl-5 sm:pl-6">Class and subject</th>
                      <th className="px-2 py-3">Teacher</th>
                      <th className="px-2 py-3">Weeks with notes</th>
                      <th className="px-2 py-3 text-center">Notes</th>
                      <th className="px-2 py-3 text-center">Plans</th>
                      <th className="px-2 py-3">To vet</th>
                      <th className="py-3 pr-5 sm:pr-6" />
                    </tr>
                  </thead>
                  <tbody>
                    {o.rows.map((r) => (
                      <tr key={`${r.classId}:${r.subjectId}`} className="border-b border-line last:border-0">
                        <td className="py-2.5 pl-5 sm:pl-6"><span className="font-semibold">{className({ name: r.className, arm: r.arm })}</span> · {r.subjectName}</td>
                        <td className="px-2 py-2.5">{r.teacher ?? <span className="text-muted">Not assigned</span>}</td>
                        <td className="px-2 py-2.5">
                          {r.percent === null ? (
                            <span className="text-xs text-muted">No scheme of work</span>
                          ) : (
                            <div className="flex items-center gap-2">
                              <Progress value={r.percent} className="w-24" barClassName={r.percent >= 80 ? "bg-emerald-500" : r.percent >= 50 ? "bg-amber-400" : "bg-rose-500"} />
                              <span className="text-xs font-semibold">{r.percent}%</span>
                              {r.missingWeeks.length ? <span className="text-xs text-muted">missing wk {r.missingWeeks.slice(0, 4).join(", ")}{r.missingWeeks.length > 4 ? "…" : ""}</span> : null}
                            </div>
                          )}
                        </td>
                        <td className="px-2 py-2.5 text-center">{r.notes}</td>
                        <td className="px-2 py-2.5 text-center">{r.plans}</td>
                        <td className="px-2 py-2.5">{r.awaitingVetting ? <Badge tone="amber">{r.awaitingVetting} waiting</Badge> : r.notes + r.plans ? <Badge tone="green">All vetted</Badge> : null}</td>
                        <td className="py-2.5 pr-5 text-right sm:pr-6">
                          <Button size="sm" variant="outline" onClick={() => open(`${r.classId}:${r.subjectId}`)}>Open book</Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          }
        </Async>
      </Card>
      <div ref={bookRef} className="scroll-mt-6">
        <LessonBookPage initial={pick} termId={termId} />
      </div>
    </>
  );
}
