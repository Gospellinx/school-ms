"use client";
import * as React from "react";
import { BadgeCheck, BookOpen, Printer, Undo2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/input";
import { Async, Empty, ErrorNote } from "@/components/ui/feedback";
import { Markdown } from "@/components/ui/markdown";
import { api, useApi } from "@/lib/api";
import { longDate, shortDate } from "@/lib/format";
import { TermSelect, useTerms } from "@/lib/terms";
import { useAction } from "@/lib/useAction";
import { className, type Assignment, type LessonBook, type LessonBookEntry } from "@/lib/types";
import { cn, initials } from "@/lib/utils";

const kindName = (k: LessonBookEntry["kind"]) => (k === "lesson_note" ? "Lesson note" : "Lesson plan");

/** Picks a class and subject (the teacher's own, or any for leadership) and a term, and shows the book. */
export function LessonBookPage({ initial, termId: fixedTerm }: { initial?: string; termId?: string }) {
  const { data: assignments, error } = useApi<Assignment[]>("my-assignments");
  const terms = useTerms();
  const termId = fixedTerm || terms.termId;
  const [pick, setPick] = React.useState(initial ?? "");
  React.useEffect(() => {
    if (!pick && assignments?.[0]) setPick(`${assignments[0].classId}:${assignments[0].subjectId}`);
  }, [assignments, pick]);
  React.useEffect(() => {
    if (initial) setPick(initial);
  }, [initial]);
  const [classId, subjectId] = pick.split(":");

  if (error) return <ErrorNote>{error}</ErrorNote>;
  if (assignments && !assignments.length) return <Card><Empty title="No subjects assigned yet">Ask the school admin to assign you the subjects you teach.</Empty></Card>;

  return (
    <div className="flex flex-col gap-5">
      <div className="no-print flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <Select aria-label="Class and subject" className="sm:w-80" value={pick} onChange={(e) => setPick(e.target.value)}>
          {(assignments ?? []).map((a) => (
            <option key={`${a.classId}:${a.subjectId}`} value={`${a.classId}:${a.subjectId}`}>{className({ name: a.className, arm: a.arm })} · {a.subjectName}</option>
          ))}
        </Select>
        {fixedTerm ? null : <TermSelect sessions={terms.sessions} value={termId} onChange={terms.setTermId} className="sm:w-64" />}
      </div>
      {classId && subjectId && termId ? <LessonBookLoader classId={classId} subjectId={subjectId} termId={termId} /> : null}
    </div>
  );
}

function LessonBookLoader({ classId, subjectId, termId }: { classId: string; subjectId: string; termId: string }) {
  const book = useApi<LessonBook>(`lesson-book?classId=${classId}&subjectId=${subjectId}&termId=${termId}`);
  return <Async data={book.data} error={book.error}>{(b) => <LessonBookView book={b} reload={book.reload} />}</Async>;
}

export function LessonBookView({ book, reload }: { book: LessonBook; reload: () => void }) {
  const [plans, setPlans] = React.useState(true);
  const a = useAction();
  const cls = className(book.class);
  const shown = book.entries.filter((e) => plans || e.kind === "lesson_note").sort((x, y) => (x.week ?? 99) - (y.week ?? 99) || x.kind.localeCompare(y.kind));
  const notes = book.entries.filter((e) => e.kind === "lesson_note");
  const vetted = book.entries.filter((e) => e.vetted).length;
  const cov = book.coverage;

  const vet = (e: LessonBookEntry) => {
    const comment = window.prompt(`Vet "${e.title}". Add a remark for the teacher (optional):`, "");
    if (comment === null) return;
    void a.run(async () => {
      await api(`lesson-book/${e.id}/vet`, { method: "PUT", body: { comment: comment.trim() || null } });
      reload();
    });
  };
  const unvet = (e: LessonBookEntry) =>
    a.run(async () => {
      await api(`lesson-book/${e.id}/vet`, { method: "DELETE" });
      reload();
    });
  const setWeek = (e: LessonBookEntry, week: string) =>
    a.run(async () => {
      await api(`lesson-book/${e.id}`, { method: "PATCH", body: { week: week ? Number(week) : null } });
      reload();
    });

  return (
    <div className="flex flex-col gap-5">
      {/* Controls and the inspection check, on screen only */}
      <Card className="no-print">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
          <div className="flex-1">
            <p className="text-sm text-muted">Inspection check</p>
            <p className="text-lg font-bold">
              {cov.rows.length
                ? `${cov.percent}% of weeks${book.currentWeek ? ` so far (week ${book.currentWeek})` : ""} have a lesson note`
                : `${notes.length} lesson ${notes.length === 1 ? "note" : "notes"} this term`}
            </p>
            <p className="text-sm text-muted">
              {vetted} of {book.entries.length} vetted.
              {cov.missingWeeks.length ? ` No note yet for week ${cov.missingWeeks.join(", ")}.` : ""}
              {!cov.rows.length ? " Upload the scheme of work to the knowledge base to check notes week by week." : ""}
            </p>
          </div>
          <label className="flex items-center gap-2 text-sm font-medium">
            <input type="checkbox" checked={plans} onChange={(e) => setPlans(e.target.checked)} className="h-4 w-4 accent-brand-600" /> Include lesson plans
          </label>
          <Button onClick={() => window.print()} disabled={!shown.length}><Printer className="h-4 w-4" /> Print / Save PDF</Button>
        </div>
        <ErrorNote className="mt-3">{a.error}</ErrorNote>
      </Card>

      {!book.entries.length ? (
        <Card className="no-print">
          <Empty title="No lesson notes for this term yet" icon={BookOpen}>
            Draft them in the Teaching Assistant and press Save to knowledge base, or upload your own notes (Word, PDF or a photo of handwritten notes) to the knowledge base as lesson notes.
          </Empty>
        </Card>
      ) : (
        <div className="print-sheet lesson-book mx-auto w-full max-w-[820px] rounded-3xl bg-white p-5 text-[13px] sm:p-10">
          {/* Cover */}
          <header className="flex flex-col items-center gap-3 border-b-2 border-brand-600 pb-5 text-center">
            <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-600 text-2xl font-bold text-white">{initials(book.school.name.replace(/\(.*\)/, ""))}</span>
            <h2 className="text-xl font-bold tracking-tight text-brand-800 uppercase sm:text-2xl">{book.school.name}</h2>
            {book.school.address ? <p className="text-xs text-muted">{book.school.address}</p> : null}
            {book.school.motto ? <p className="text-xs text-muted italic">Motto: {book.school.motto}</p> : null}
          </header>
          <h3 className="mt-6 text-center text-2xl font-bold tracking-tight uppercase">Lesson Notes</h3>
          <dl className="mx-auto mt-5 grid max-w-md grid-cols-[130px_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="text-muted">Teacher</dt><dd className="font-semibold">{book.teacher ?? "Not assigned"}</dd>
            <dt className="text-muted">Subject</dt><dd className="font-semibold">{book.subject.name}</dd>
            <dt className="text-muted">Class</dt><dd className="font-semibold">{cls}{book.class.section ? ` (${book.class.section})` : ""}</dd>
            <dt className="text-muted">Term</dt><dd className="font-semibold">{book.term ? `${book.term.name}, ${book.term.session}` : "–"}</dd>
            <dt className="text-muted">Notes and plans</dt><dd className="font-semibold">{notes.length} notes, {book.entries.length - notes.length} plans · {vetted} vetted</dd>
          </dl>

          {/* Record of work against the scheme */}
          {cov.rows.length ? (
            <section className="mt-8">
              <h4 className="mb-2 font-bold uppercase">Scheme of work coverage</h4>
              <table className="w-full border-collapse text-left text-[12px]">
                <thead>
                  <tr className="bg-brand-600 text-white">
                    <th className="px-2 py-2">Week</th>
                    <th className="px-2 py-2">Topic</th>
                    <th className="px-2 py-2 text-center">Note</th>
                    <th className="px-2 py-2 text-center">Plan</th>
                    <th className="px-2 py-2 text-center">Vetted</th>
                  </tr>
                </thead>
                <tbody>
                  {cov.rows.map((r) => (
                    <tr key={r.week} className={cn("border-b border-line", book.currentWeek && r.week > book.currentWeek && "text-muted")}>
                      <td className="px-2 py-1.5 font-semibold">{r.week}</td>
                      <td className="px-2 py-1.5">{r.topic}</td>
                      <td className="px-2 py-1.5 text-center">{r.noteId ? "✓" : book.currentWeek && r.week > book.currentWeek ? "" : <span className="font-semibold text-rose-600">Missing</span>}</td>
                      <td className="px-2 py-1.5 text-center">{r.planId ? "✓" : ""}</td>
                      <td className="px-2 py-1.5 text-center">{r.vetted ? "✓" : ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ) : null}

          <Signatures className="mt-10" />

          {/* One note or plan per page */}
          {shown.map((e) => (
            <article key={e.id} className="lesson-page mt-10 border-t-2 border-dashed border-line pt-8">
              <table className="w-full border-collapse text-[12px]">
                <tbody>
                  <tr className="border border-line">
                    <th className="w-28 bg-canvas px-2 py-1.5 text-left">Week</th>
                    <td className="px-2 py-1.5">
                      {e.week ?? "–"}
                      {(e.mine || book.canVet) && !e.week ? (
                        <Select aria-label="Set the week" className="no-print ml-2 inline-block h-7 w-24 py-0 text-xs" value="" onChange={(ev) => void setWeek(e, ev.target.value)}>
                          <option value="">Set week</option>
                          {Array.from({ length: 14 }, (_, i) => i + 1).map((w) => <option key={w} value={w}>Week {w}</option>)}
                        </Select>
                      ) : null}
                    </td>
                    <th className="w-28 bg-canvas px-2 py-1.5 text-left">Date prepared</th>
                    <td className="px-2 py-1.5">{shortDate(e.createdAt)}</td>
                  </tr>
                  <tr className="border border-line">
                    <th className="bg-canvas px-2 py-1.5 text-left">Subject</th>
                    <td className="px-2 py-1.5">{book.subject.name}</td>
                    <th className="bg-canvas px-2 py-1.5 text-left">Class</th>
                    <td className="px-2 py-1.5">{cls}</td>
                  </tr>
                  <tr className="border border-line">
                    <th className="bg-canvas px-2 py-1.5 text-left">{kindName(e.kind)}</th>
                    <td className="px-2 py-1.5 font-semibold" colSpan={3}>{e.title}</td>
                  </tr>
                  <tr className="border border-line">
                    <th className="bg-canvas px-2 py-1.5 text-left">Prepared by</th>
                    <td className="px-2 py-1.5" colSpan={3}>{e.author ?? book.teacher ?? "–"}</td>
                  </tr>
                </tbody>
              </table>
              <div className="mt-4">
                {e.body === null ? (
                  <p className="text-muted italic">This file has not been read yet. Open it in the knowledge base.</p>
                ) : e.format === "markdown" ? (
                  <Markdown text={e.body} className="flex flex-col gap-2 text-[13px] leading-relaxed" />
                ) : (
                  <div className="text-[13px] leading-relaxed whitespace-pre-wrap">{e.body}</div>
                )}
              </div>
              <div className="mt-5 rounded-xl border border-line p-3 text-[12px]">
                {e.vetted ? (
                  <p className="flex flex-wrap items-center gap-x-2">
                    <BadgeCheck className="h-4 w-4 text-emerald-600" />
                    <strong>Vetted by {e.vetted.by ?? "the school"}</strong> on {longDate(e.vetted.at)}
                    {e.vetted.comment ? <span className="w-full pt-1">Remark: {e.vetted.comment}</span> : null}
                  </p>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-3">
                    <p>HOD / Vice Principal’s remark: ____________________</p>
                    <p>Signature: ______________</p>
                    <p>Date: ______________</p>
                  </div>
                )}
                {book.canVet ? (
                  <div className="no-print mt-2 flex gap-2">
                    {e.vetted ? (
                      <Button size="sm" variant="ghost" disabled={a.busy} onClick={() => void unvet(e)}><Undo2 className="h-3.5 w-3.5" /> Undo vetting</Button>
                    ) : (
                      <Button size="sm" variant="secondary" disabled={a.busy} onClick={() => vet(e)}><BadgeCheck className="h-3.5 w-3.5" /> Mark as vetted</Button>
                    )}
                  </div>
                ) : !e.vetted ? (
                  <Badge tone="amber" className="no-print mt-2">Waiting for the head of school to vet</Badge>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

function Signatures({ className: cls }: { className?: string }) {
  return (
    <section className={cn("grid gap-6 text-[12px] sm:grid-cols-3", cls)}>
      {["Subject teacher", "HOD / Vice Principal", "Principal / Head teacher"].map((r) => (
        <div key={r}>
          <div className="h-10 border-b border-ink" />
          <p className="mt-1 font-semibold">{r}</p>
          <p className="text-muted">Signature and date</p>
        </div>
      ))}
    </section>
  );
}
