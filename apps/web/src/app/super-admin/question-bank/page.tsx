"use client";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { Async, Empty } from "@/components/ui/feedback";
import { useApi } from "@/lib/api";
import type { SchoolSummary } from "@/lib/types";

const EXAMS = [
  ["waec", "WAEC"],
  ["neco", "NECO"],
  ["bece", "BECE"],
  ["jamb", "JAMB"],
  ["school", "School"],
] as const;

export default function QuestionBank() {
  const { data, error } = useApi<SchoolSummary[]>("platform/schools");
  return (
    <>
      <PageHeader title="Question Bank" subtitle="Questions each school has added for CBT tests and exam prep." />
      <Async data={data} error={error}>
        {(schools) => {
          const totals = Object.fromEntries(EXAMS.map(([k]) => [k, schools.reduce((n, s) => n + (s.questionsByExam[k] ?? 0), 0)]));
          return (
            <>
              <div className="mb-5 grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-5">
                {EXAMS.map(([k, label]) => (
                  <Card key={k}>
                    <p className="text-sm text-muted">{label}</p>
                    <p className="mt-1 text-3xl font-bold">{totals[k]}</p>
                  </Card>
                ))}
              </div>
              <Card>
                <CardHeader title="By school" subtitle="A shared bank that every school can draw from is the next step; for now each school keeps its own." />
                {schools.length ? (
                  <Table>
                    <THead><tr><TH>School</TH>{EXAMS.map(([k, l]) => <TH key={k}>{l}</TH>)}<TH>Total</TH></tr></THead>
                    <tbody>
                      {schools.map((s) => (
                        <TR key={s.id}>
                          <TD className="font-semibold">{s.name}</TD>
                          {EXAMS.map(([k]) => <TD key={k}>{s.questionsByExam[k] ?? 0}</TD>)}
                          <TD><Badge tone="brand">{s.questions}</Badge></TD>
                        </TR>
                      ))}
                    </tbody>
                  </Table>
                ) : (
                  <Empty title="No schools yet" />
                )}
              </Card>
            </>
          );
        }}
      </Async>
    </>
  );
}
