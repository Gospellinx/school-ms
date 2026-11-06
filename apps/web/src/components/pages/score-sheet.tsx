"use client";
import * as React from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { Async, Empty, ErrorNote, SuccessNote } from "@/components/ui/feedback";
import { api, useApi } from "@/lib/api";
import { TermSelect, useTerms } from "@/lib/terms";
import { useAction } from "@/lib/useAction";
import { className, type Assignment, type GradeBand, type SchoolClass, type ScoreSheet as Sheet, type Section } from "@/lib/types";
import { cn } from "@/lib/utils";

type Draft = Record<string, Record<string, string>>;

function gradeFor(total: number, scale: GradeBand[]) {
  return scale.find((g) => total >= g.min && total <= g.max + 0.0001)?.grade ?? "";
}

/** The score sheet for one class, subject and term: type scores like a spreadsheet, then save. */
export function ScoreSheet({ initial }: { initial?: { classId?: string; subjectId?: string } }) {
  const { data: assignments, error: aErr } = useApi<Assignment[]>("my-assignments");
  const { data: classes } = useApi<SchoolClass[]>("classes");
  const { data: sections } = useApi<Section[]>("sections");
  const { sessions, termId, setTermId } = useTerms();
  const [pick, setPick] = React.useState("");
  React.useEffect(() => {
    if (pick || !assignments?.length) return;
    const want = assignments.find((x) => x.classId === initial?.classId && (!initial?.subjectId || x.subjectId === initial.subjectId)) ?? assignments[0]!;
    setPick(`${want.classId}:${want.subjectId}`);
  }, [assignments, pick, initial]);
  const [classId, subjectId] = pick.split(":");
  const sheet = useApi<Sheet>(termId && classId && subjectId ? `terms/${termId}/classes/${classId}/subjects/${subjectId}/scores` : null);
  const [draft, setDraft] = React.useState<Draft>({});
  const [dirty, setDirty] = React.useState(false);
  const a = useAction();

  React.useEffect(() => {
    if (!sheet.data) return;
    setDraft(Object.fromEntries(sheet.data.rows.map((r) => [r.studentId, Object.fromEntries(Object.entries(r.scores ?? {}).map(([k, v]) => [k, String(v)]))])));
    setDirty(false);
  }, [sheet.data]);

  const cls = classes?.find((c) => c.id === classId);
  const scale = sections?.find((s) => s.id === cls?.sectionId)?.gradingScale ?? [];

  const problems: string[] = [];
  const totals = new Map<string, number | null>();
  for (const r of sheet.data?.rows ?? []) {
    const vals = draft[r.studentId] ?? {};
    let total = 0;
    let any = false;
    for (const c of sheet.data!.components) {
      const raw = (vals[c.key] ?? "").trim();
      if (!raw) continue;
      const n = Number(raw);
      if (Number.isNaN(n) || n < 0 || n > c.maxScore) problems.push(`${r.name}: ${c.label} must be between 0 and ${c.maxScore}`);
      else {
        total += n;
        any = true;
      }
    }
    totals.set(r.studentId, any ? Math.round(total * 100) / 100 : null);
  }
  const filled = [...totals.values()].filter((v): v is number => v !== null);
  const avg = filled.length ? filled.reduce((x, y) => x + y, 0) / filled.length : null;

  const save = () =>
    a.run(async () => {
      const entries = (sheet.data?.rows ?? [])
        .map((r) => {
          const scores: Record<string, number> = {};
          for (const [k, v] of Object.entries(draft[r.studentId] ?? {})) if (v.trim() !== "") scores[k] = Number(v);
          return { studentId: r.studentId, scores };
        })
        .filter((e) => Object.keys(e.scores).length > 0);
      const r = await api<{ saved: number }>(`terms/${termId}/classes/${classId}/subjects/${subjectId}/scores`, { method: "PUT", body: { entries } });
      await sheet.reload();
      return r;
    }, (r) => `Saved scores for ${r.saved} students.`);

  const cell = "h-10 w-16 rounded-xl border bg-white text-center font-semibold outline-none focus:border-brand-400 focus:ring-4 focus:ring-brand-100";

  if (aErr) return <ErrorNote>{aErr}</ErrorNote>;
  if (assignments && !assignments.length) return <Card><Empty title="No subjects assigned to you yet">Ask the school admin to add you as the teacher of a subject in a class.</Empty></Card>;

  return (
    <Card>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Select value={pick} onChange={(e) => setPick(e.target.value)} aria-label="Class and subject">
          {(assignments ?? []).map((x) => (
            <option key={`${x.classId}:${x.subjectId}`} value={`${x.classId}:${x.subjectId}`}>{className({ name: x.className, arm: x.arm })} · {x.subjectName}</option>
          ))}
        </Select>
        <TermSelect sessions={sessions} value={termId} onChange={setTermId} />
        <span className="ml-auto text-sm text-muted">Class average <strong className="text-ink">{avg === null ? "–" : avg.toFixed(1)}</strong></span>
      </div>
      <Async data={sheet.data} error={sheet.error}>
        {(s) =>
          s.rows.length === 0 ? (
            <Empty title="No students in this class" />
          ) : (
            <div className="-mx-5 overflow-x-auto sm:-mx-6">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="text-xs font-semibold text-muted uppercase">
                  <tr className="border-b border-line">
                    <th className="sticky left-0 z-10 bg-white py-3 pl-5 text-left sm:pl-6">Student</th>
                    {s.components.map((c) => <th key={c.key} className="px-2 py-3">{c.label} <span className="normal-case">/{c.maxScore}</span></th>)}
                    <th className="px-2 py-3">Total</th>
                    <th className="py-3 pr-5 sm:pr-6">Grade</th>
                  </tr>
                </thead>
                <tbody>
                  {s.rows.map((r) => {
                    const t = totals.get(r.studentId) ?? null;
                    const g = t === null ? "" : gradeFor(t, scale);
                    return (
                      <tr key={r.studentId} className="border-b border-line last:border-0">
                        <td className="sticky left-0 z-10 bg-white py-2 pr-2 pl-5 sm:pl-6"><span className="font-semibold">{r.name}</span><span className="block text-xs text-muted">{r.admissionNumber}</span></td>
                        {s.components.map((c) => {
                          const v = draft[r.studentId]?.[c.key] ?? "";
                          const bad = v.trim() !== "" && (Number.isNaN(Number(v)) || Number(v) < 0 || Number(v) > c.maxScore);
                          return (
                            <td key={c.key} className="px-2 text-center">
                              <input
                                inputMode="decimal"
                                className={cn(cell, bad ? "border-rose-400 bg-rose-50" : "border-line")}
                                value={v}
                                onChange={(e) => {
                                  setDirty(true);
                                  setDraft({ ...draft, [r.studentId]: { ...draft[r.studentId], [c.key]: e.target.value.replace(/[^\d.]/g, "") } });
                                }}
                                aria-label={`${r.name} ${c.label}`}
                              />
                            </td>
                          );
                        })}
                        <td className="px-2 text-center text-base font-bold">{t ?? "–"}</td>
                        <td className="pr-5 text-center sm:pr-6">
                          {g ? <span className={cn("rounded-lg px-2.5 py-1 text-xs font-bold", g.startsWith("F") ? "bg-rose-50 text-rose-600" : g.startsWith("A") || g.startsWith("B") ? "bg-brand-50 text-brand-700" : "bg-amber-50 text-amber-700")}>{g}</span> : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )
        }
      </Async>
      <div className="mt-4 flex flex-col gap-2">
        {problems.length ? <ErrorNote>{problems[0]}{problems.length > 1 ? ` (and ${problems.length - 1} more)` : ""}</ErrorNote> : null}
        <ErrorNote>{a.error}</ErrorNote>
        <SuccessNote>{a.notice}</SuccessNote>
        <div className="flex flex-col-reverse items-stretch gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-muted">Leave a box empty if that score is not in yet. Parents only see results after the admin publishes them.</p>
          <Button disabled={a.busy || problems.length > 0 || !dirty} onClick={save}>{a.busy ? "Saving…" : dirty ? "Save scores" : "Saved"}</Button>
        </div>
      </div>
    </Card>
  );
}
