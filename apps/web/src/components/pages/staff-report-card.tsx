"use client";
import * as React from "react";
import Link from "next/link";
import { ArrowLeft, Sparkles } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { Button, buttonClass } from "@/components/ui/button";
import { Async, ErrorNote, SuccessNote } from "@/components/ui/feedback";
import { Textarea } from "@/components/ui/input";
import { api, useApi } from "@/lib/api";
import { useStaff } from "@/lib/session";
import { useAction } from "@/lib/useAction";
import type { ReportCard } from "@/lib/types";
import { PrintButton } from "./print-button";
import { ReportCardSheet } from "./report-card";

/** A student's report card for staff, with the teacher's and head's comments editable in place. */
export function StaffReportCard({ termId, studentId, backHref }: { termId: string; studentId: string; backHref: string }) {
  const me = useStaff();
  const leader = me.staff.role !== "teacher";
  const { data, error, reload } = useApi<ReportCard>(termId && studentId ? `terms/${termId}/students/${studentId}/report-card` : null);
  const [teacher, setTeacher] = React.useState("");
  const [head, setHead] = React.useState("");
  const a = useAction();
  React.useEffect(() => {
    if (data) {
      setTeacher(data.comments.teacher ?? "");
      setHead(data.comments.head ?? "");
    }
  }, [data]);

  const save = () =>
    a.run(async () => {
      await api(`terms/${termId}/students/${studentId}/comments`, { method: "PUT", body: leader ? { teacherComment: teacher, headComment: head } : { teacherComment: teacher } });
      await reload();
    }, "Comments saved.");

  const draft = () =>
    a.run(async () => {
      const r = await api<{ teacherComment: string; headComment: string }>(`terms/${termId}/students/${studentId}/comments/draft`, { method: "POST" });
      setTeacher(r.teacherComment);
      if (leader) setHead(r.headComment);
    }, "AI drafts added below. Read and edit them, then save.");

  return (
    <>
      <PageHeader
        title="Report Card"
        subtitle={data ? `${data.student.name} · ${data.term} ${data.session}` : undefined}
        actions={<><Link href={backHref} className={buttonClass("outline")}><ArrowLeft className="h-4 w-4" /> Back</Link><PrintButton /></>}
      />
      <Async data={data} error={error}>
        {(rc) => (
          <ReportCardSheet
            rc={rc}
            comments={
              <section className="mt-5">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="rounded-2xl bg-canvas p-4">
                    <p className="text-xs font-semibold text-muted uppercase">Class teacher&apos;s comment</p>
                    <Textarea className="no-print mt-2 bg-white" rows={3} value={teacher} onChange={(e) => setTeacher(e.target.value)} />
                    <p className="hidden print:block mt-1">{teacher || "—"}</p>
                    <p className="mt-6 border-t border-dashed border-muted/40 pt-1 text-xs text-muted">Signature</p>
                  </div>
                  <div className="rounded-2xl bg-canvas p-4">
                    <p className="text-xs font-semibold text-muted uppercase">Principal&apos;s comment</p>
                    {leader ? <Textarea className="no-print mt-2 bg-white" rows={3} value={head} onChange={(e) => setHead(e.target.value)} /> : <p className="no-print mt-1">{head || "—"}</p>}
                    <p className="hidden print:block mt-1">{head || "—"}</p>
                    <p className="mt-6 border-t border-dashed border-muted/40 pt-1 text-xs text-muted">Signature & stamp</p>
                  </div>
                </div>
                <div className="no-print mt-3 flex flex-col gap-2">
                  <ErrorNote>{a.error}</ErrorNote>
                  <SuccessNote>{a.notice}</SuccessNote>
                  <div className="flex flex-wrap justify-end gap-2">
                    <Button variant="secondary" disabled={a.busy} onClick={draft}><Sparkles className="h-4 w-4" /> Draft with AI</Button>
                    <Button disabled={a.busy} onClick={save}>Save comments</Button>
                  </div>
                </div>
              </section>
            }
          />
        )}
      </Async>
    </>
  );
}
