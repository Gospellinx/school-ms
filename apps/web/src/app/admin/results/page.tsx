"use client";
import * as React from "react";
import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { EyeOff, Send } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Async, Empty, ErrorNote, Loading, SuccessNote } from "@/components/ui/feedback";
import { StatusBadge } from "@/components/widgets/status-badge";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { api, useApi } from "@/lib/api";
import { TermSelect, useTerms } from "@/lib/terms";
import { useAction } from "@/lib/useAction";
import { pct, shortDate } from "@/lib/format";
import { className, type Broadsheet, type Dashboard, type Publication, type SchoolClass } from "@/lib/types";

function Results() {
  const params = useSearchParams();
  const { sessions, termId, setTermId, label } = useTerms();
  const { data: classes } = useApi<SchoolClass[]>("classes");
  const { data: dash } = useApi<Dashboard>("dashboard");
  const [classId, setClassId] = React.useState(params.get("class") ?? "");
  React.useEffect(() => {
    if (params.get("term")) setTermId(params.get("term")!);
  }, [params, setTermId]);
  React.useEffect(() => {
    if (!classId && classes?.length) setClassId(classes[0]!.id);
  }, [classes, classId]);

  const pubs = useApi<Publication[]>(termId ? `terms/${termId}/publications` : null);
  const sheet = useApi<Broadsheet>(termId && classId ? `terms/${termId}/classes/${classId}/results` : null);
  const a = useAction();
  const published = (pubs.data ?? []).find((p) => p.classId === classId);
  const cls = classes?.find((c) => c.id === classId);

  // Score entry progress is for the current term only (that is what the dashboard counts).
  const isCurrent = dash?.currentTerm?.id === termId;
  const progress = new Map<string, { entered: number; expected: number }>();
  for (const s of dash?.scoreSheets ?? []) {
    const cur = progress.get(s.classId) ?? { entered: 0, expected: 0 };
    cur.entered += s.entered;
    cur.expected += s.students;
    progress.set(s.classId, cur);
  }

  async function publish() {
    await a.run(
      () => api<{ parentsNotified: number }>(`terms/${termId}/classes/${classId}/publish`, { method: "POST", body: { notifyGuardians: true } }),
      (r) => `Published. ${r.parentsNotified} parents are being told by SMS.`,
    );
    await pubs.reload();
  }
  async function unpublish() {
    await a.run(() => api(`terms/${termId}/classes/${classId}/publish`, { method: "DELETE" }), "Hidden from parents and students again.");
    await pubs.reload();
  }

  return (
    <>
      <PageHeader
        title="Results"
        subtitle="Check scores, view broadsheets and publish report cards to parents."
        actions={
          classId && termId ? (
            published ? (
              <Button variant="outline" disabled={a.busy} onClick={unpublish}><EyeOff className="h-4 w-4" /> Unpublish {cls ? className(cls) : ""}</Button>
            ) : (
              <Button disabled={a.busy || !sheet.data?.students.length} onClick={publish}><Send className="h-4 w-4" /> Publish {cls ? className(cls) : ""}</Button>
            )
          ) : null
        }
      />
      <ErrorNote className="mb-4">{a.error}</ErrorNote>
      <SuccessNote className="mb-4">{a.notice}</SuccessNote>

      <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {(classes ?? []).map((c) => {
          const p = progress.get(c.id);
          const isPub = (pubs.data ?? []).some((x) => x.classId === c.id);
          return (
            <button key={c.id} onClick={() => setClassId(c.id)} className="text-left">
              <Card className={`p-5 sm:p-5 ${c.id === classId ? "ring-2 ring-brand-400" : ""}`}>
                <div className="flex items-center justify-between gap-2"><p className="font-semibold">{className(c)}</p><StatusBadge status={isPub ? "Published" : "Draft"} /></div>
                {isCurrent && p ? (
                  <>
                    <p className="mt-3 mb-1.5 text-xs text-muted">Scores entered {pct(p.entered, p.expected)}%</p>
                    <Progress value={pct(p.entered, p.expected)} />
                  </>
                ) : (
                  <p className="mt-3 text-xs text-muted">{isPub ? "Parents can see these results" : "Not released yet"}</p>
                )}
              </Card>
            </button>
          );
        })}
      </div>

      <Card>
        <CardHeader
          title={`Broadsheet${cls ? ` · ${className(cls)}` : ""}`}
          subtitle={`${label}${published ? ` · published ${shortDate(published.publishedAt)}` : ""}`}
          action={<TermSelect sessions={sessions} value={termId} onChange={setTermId} />}
        />
        <div className="mb-3 sm:hidden">
          <Select className="w-full" value={classId} onChange={(e) => setClassId(e.target.value)}>
            {(classes ?? []).map((c) => <option key={c.id} value={c.id}>{className(c)}</option>)}
          </Select>
        </div>
        <Async data={sheet.data} error={sheet.error}>
          {(b) =>
            b.students.length === 0 ? (
              <Empty title="No scores yet">Teachers enter scores per subject. The broadsheet fills in as they save.</Empty>
            ) : (
              <>
                <p className="mb-3 text-sm text-muted">Class average <strong className="text-ink">{b.classAverage}%</strong> · {b.studentCount} students</p>
                <Table className="min-w-[900px]">
                  <THead>
                    <tr>
                      <TH>Pos.</TH>
                      <TH>Student</TH>
                      {b.subjects.map((s) => <TH key={s.id} className="text-center" title={s.name}>{s.code}</TH>)}
                      <TH className="text-center">Total</TH>
                      <TH className="text-center">Avg</TH>
                      <TH />
                    </tr>
                  </THead>
                  <tbody>
                    {b.students.map((s) => (
                      <TR key={s.studentId}>
                        <TD className="font-bold text-brand-700">{s.positionText}</TD>
                        <TD>
                          <div className="flex items-center gap-2"><Avatar name={s.name} size={28} /><span className="font-semibold whitespace-nowrap">{s.name}</span></div>
                        </TD>
                        {b.subjects.map((sub) => {
                          const r = s.subjects.find((x) => x.subjectId === sub.id);
                          return <TD key={sub.id} className="text-center">{r ? <>{r.total} <span className="text-[10px] text-muted">{r.grade}</span></> : <span className="text-muted">–</span>}</TD>;
                        })}
                        <TD className="text-center font-bold">{s.grandTotal}</TD>
                        <TD className="text-center">{s.average}</TD>
                        <TD className="text-right">
                          <Link href={`/admin/results/report-card?term=${termId}&student=${s.studentId}&class=${classId}`} className="text-sm font-semibold text-brand-600">Report card</Link>
                        </TD>
                      </TR>
                    ))}
                  </tbody>
                </Table>
              </>
            )
          }
        </Async>
      </Card>
    </>
  );
}

export default function Page() {
  return <Suspense fallback={<Loading />}><Results /></Suspense>;
}
