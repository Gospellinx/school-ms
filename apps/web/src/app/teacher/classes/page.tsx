"use client";
import * as React from "react";
import Link from "next/link";
import { Users } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { Card } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button, buttonClass } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Async, Empty } from "@/components/ui/feedback";
import { useApi } from "@/lib/api";
import { pct } from "@/lib/format";
import type { Dashboard, Student } from "@/lib/types";

export default function MyClasses() {
  const { data, error } = useApi<Dashboard>("dashboard");
  const [roster, setRoster] = React.useState<{ classId: string; name: string } | null>(null);
  return (
    <>
      <PageHeader title="My Classes" subtitle={data?.currentTerm ? `Subjects you teach · ${data.currentTerm.name} ${data.currentTerm.sessionName}` : "Subjects you teach."} />
      <Async data={data} error={error}>
        {(d) =>
          d.scoreSheets.length === 0 ? (
            <Empty title="No subjects assigned to you yet">The school admin assigns teachers to subjects under Classes & Subjects.</Empty>
          ) : (
            <div className="grid gap-5 lg:grid-cols-3">
              {d.scoreSheets.map((s) => {
                const cls = d.classes.find((c) => c.id === s.classId);
                const entered = pct(s.entered, s.students);
                return (
                  <Card key={`${s.classId}:${s.subjectId}`}>
                    <div className="flex items-start justify-between">
                      <div><p className="text-xl font-semibold">{s.className}</p><p className="text-sm text-muted">{s.subjectName}</p></div>
                      <Badge tone="brand"><Users className="h-3.5 w-3.5" /> {s.students}</Badge>
                    </div>
                    <div className="mt-5 grid grid-cols-2 gap-3 rounded-2xl bg-canvas p-3">
                      <div><p className="text-xs text-muted">Scores entered</p><p className="text-lg font-bold">{s.entered} of {s.students}</p></div>
                      <div><p className="text-xs text-muted">Register today</p><p className="text-lg font-bold">{cls?.markedToday ? `${cls.presentToday} in` : "Not taken"}</p></div>
                    </div>
                    <Progress value={entered} className="mt-4" />
                    <div className="mt-5 flex gap-2">
                      <Link href={`/teacher/scores?class=${s.classId}&subject=${s.subjectId}`} className={buttonClass("primary", "sm", "flex-1")}>Enter scores</Link>
                      <Button size="sm" variant="secondary" className="flex-1" onClick={() => setRoster({ classId: s.classId, name: s.className })}>Students</Button>
                    </div>
                  </Card>
                );
              })}
            </div>
          )
        }
      </Async>
      {roster && data ? <Roster classId={roster.classId} name={roster.name} termId={data.currentTerm?.id ?? ""} onClose={() => setRoster(null)} /> : null}
    </>
  );
}

function Roster({ classId, name, termId, onClose }: { classId: string; name: string; termId: string; onClose: () => void }) {
  const { data, error } = useApi<Student[]>(`students?classId=${classId}`);
  return (
    <Dialog open onClose={onClose} title={name} subtitle="Open a student's report card for this term to add your comment.">
      <Async data={data} error={error}>
        {(rows) => (
          <ul className="divide-y divide-line">
            {rows.map((s) => (
              <li key={s.id} className="flex items-center gap-3 py-2.5">
                <Avatar name={`${s.firstName} ${s.lastName}`} size={32} />
                <span className="flex-1"><span className="block font-semibold">{s.lastName} {s.firstName}</span><span className="text-xs text-muted">{s.admissionNumber}</span></span>
                {termId ? <Link href={`/teacher/report-card?term=${termId}&student=${s.id}`} className="text-sm font-semibold text-brand-600">Report card</Link> : null}
              </li>
            ))}
          </ul>
        )}
      </Async>
    </Dialog>
  );
}
