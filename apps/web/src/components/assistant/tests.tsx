"use client";
import * as React from "react";
import { ClipboardCheck, FileText, Plus, Save, Sparkles, Trash2, X } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ErrorNote, SuccessNote } from "@/components/ui/feedback";
import { api } from "@/lib/api";
import { useAction } from "@/lib/useAction";
import type { AssessmentDraft, AssistantContext, RubricPoint } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useTopics } from "./lesson";

type Theory = { topic: string; question: string; points: RubricPoint[] };

const STYLES = [
  ["school", "School style"],
  ["waec", "WAEC"],
  ["neco", "NECO"],
  ["bece", "BECE"],
  ["jamb", "JAMB"],
] as const;

const marksOf = (t: Theory) => t.points.reduce((n, p) => n + (Number(p.marks) || 0), 0);

/** The test paper and its marking scheme as Markdown, for printing or saving. */
function toMarkdown(title: string, draft: AssessmentDraft, theory: Theory[]) {
  const obj = draft.objective
    .map((q, i) => `${i + 1}. ${q.body}\n${q.options.map((o) => `   ${o.key}. ${o.text}`).join("\n")}`)
    .join("\n\n");
  const th = theory.map((t, i) => `${i + 1}. ${t.question} (${marksOf(t)} marks)`).join("\n\n");
  const paper = [`# ${title}`, draft.objective.length ? `## Section A: Objective\n\nAnswer all questions.\n\n${obj}` : "", theory.length ? `## Section B: Theory\n\n${th}` : ""].filter(Boolean).join("\n\n");
  const keyA = draft.objective.map((q, i) => `${i + 1}. ${q.answer}${q.explanation ? ` (${q.explanation})` : ""}`).join("\n");
  const keyB = theory.map((t, i) => `${i + 1}. ${t.question}\n${t.points.map((p) => `   - ${p.point} (${p.marks})`).join("\n")}`).join("\n\n");
  const scheme = [`# Marking scheme: ${title}`, keyA ? `## Section A\n\n${keyA}` : "", keyB ? `## Section B\n\n${keyB}` : ""].filter(Boolean).join("\n\n");
  return { paper, scheme };
}

export function TestsTab({ ctx, onMarkTheory }: { ctx: AssistantContext; onMarkTheory: (t: Theory, title: string) => void }) {
  const topics = useTopics(ctx);
  const names = [...new Set(topics.map((t) => t.topic))];
  const [chosen, setChosen] = React.useState<string[]>(names.slice(0, 2));
  const [extra, setExtra] = React.useState("");
  const [objective, setObjective] = React.useState(10);
  const [theoryCount, setTheoryCount] = React.useState(2);
  const [style, setStyle] = React.useState<string>(ctx.section.kind === "junior_secondary" ? "bece" : "waec");
  const [purpose, setPurpose] = React.useState<"class_test" | "exam">("class_test");
  const [draft, setDraft] = React.useState<AssessmentDraft | null>(null);
  const [theory, setTheory] = React.useState<Theory[]>([]);
  const [title, setTitle] = React.useState("");
  const gen = useAction();
  const save = useAction();

  const toggle = (t: string) => setChosen((xs) => (xs.includes(t) ? xs.filter((x) => x !== t) : [...xs, t]));
  const allTopics = [...chosen, ...extra.split(",").map((s) => s.trim()).filter(Boolean)];

  async function generate() {
    const r = await gen.run(() =>
      api<AssessmentDraft>("assistant/assessment", {
        method: "POST",
        body: { classId: ctx.class.id, subjectId: ctx.subject.id, topics: allTopics, objectiveCount: objective, theoryCount, style, purpose },
      }),
    );
    if (r) {
      setDraft(r);
      setTheory(r.theory);
      setTitle(r.title);
      save.setNotice(null);
    }
  }

  const removeObjective = (i: number) => draft && setDraft({ ...draft, objective: draft.objective.filter((_, k) => k !== i) });
  const setT = (i: number, patch: Partial<Theory>) => setTheory((xs) => xs.map((t, k) => (k === i ? { ...t, ...patch } : t)));

  async function saveAll() {
    if (!draft) return;
    const { paper, scheme } = toMarkdown(title, draft, theory);
    await save.run(async () => {
      const fresh = draft.objective.filter((q) => q.source === "ai");
      if (fresh.length) {
        await api("questions/bulk", {
          method: "POST",
          body: {
            questions: fresh.map((q) => ({
              subjectId: ctx.subject.id,
              topic: q.topic,
              body: q.body,
              options: q.options,
              answer: q.answer,
              explanation: q.explanation || undefined,
              exam: style,
              sectionKind: ctx.section.kind,
            })),
          },
        });
      }
      await api("assistant/save", { method: "POST", body: { classId: ctx.class.id, subjectId: ctx.subject.id, kind: "past_questions", title, body: paper, visibleToStudents: false } });
      await api("assistant/save", { method: "POST", body: { classId: ctx.class.id, subjectId: ctx.subject.id, kind: "marking_scheme", title: `Marking scheme: ${title}`, body: scheme } });
      return fresh.length;
    }, (n) => `Saved the paper and marking scheme to the knowledge base (staff only)${n ? `, and ${n} new questions to the question bank for CBT` : ""}.`);
  }

  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-[360px_1fr]">
      <Card>
        <CardHeader title="Set a test or exam" subtitle="Objective questions come from your question bank first." />
        <div className="flex flex-col gap-3">
          <div>
            <Label>Topics</Label>
            <div className="flex flex-wrap gap-1.5">
              {names.map((t) => (
                <button key={t} onClick={() => toggle(t)} className={cn("rounded-lg px-2.5 py-1 text-xs font-semibold", chosen.includes(t) ? "bg-brand-600 text-white" : "bg-canvas text-muted hover:text-ink")}>
                  {t}
                </button>
              ))}
            </div>
            <Input className="mt-2" aria-label="Other topics" placeholder="Other topics, separated by commas" value={extra} onChange={(e) => setExtra(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="obj">Objective</Label>
              <Input id="obj" type="number" min={0} max={60} value={objective} onChange={(e) => setObjective(Number(e.target.value))} />
            </div>
            <div>
              <Label htmlFor="th">Theory</Label>
              <Input id="th" type="number" min={0} max={10} value={theoryCount} onChange={(e) => setTheoryCount(Number(e.target.value))} />
            </div>
            <div>
              <Label htmlFor="style">Style</Label>
              <Select id="style" value={style} onChange={(e) => setStyle(e.target.value)}>
                {STYLES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </Select>
            </div>
            <div>
              <Label htmlFor="purpose">For</Label>
              <Select id="purpose" value={purpose} onChange={(e) => setPurpose(e.target.value as "class_test" | "exam")}>
                <option value="class_test">Class test</option>
                <option value="exam">Examination</option>
              </Select>
            </div>
          </div>
          <Button disabled={gen.busy || (objective === 0 && theoryCount === 0)} onClick={generate}>
            <Sparkles className="h-4 w-4" /> {gen.busy ? "Setting questions…" : "Draft questions"}
          </Button>
          <ErrorNote>{gen.error}</ErrorNote>
        </div>
      </Card>

      <Card className="min-h-[50dvh]">
        {draft ? (
          <div className="flex flex-col gap-5">
            <div>
              <Input aria-label="Title" value={title} onChange={(e) => setTitle(e.target.value)} className="font-semibold" />
              {draft.note ? <p className="mt-2 rounded-2xl bg-amber-50 px-3 py-2 text-xs text-amber-800">{draft.note}</p> : null}
            </div>

            <section>
              <h4 className="mb-2 text-sm font-semibold">Section A: Objective ({draft.objective.length})</h4>
              <ol className="flex flex-col gap-2">
                {draft.objective.map((q, i) => (
                  <li key={i} className="rounded-2xl bg-canvas p-3 text-sm">
                    <div className="flex items-start gap-2">
                      <span className="font-semibold">{i + 1}.</span>
                      <div className="min-w-0 flex-1">
                        <p>{q.body}</p>
                        <ul className="mt-1.5 grid gap-1 sm:grid-cols-2">
                          {q.options.map((o) => (
                            <li key={o.key} className={cn("rounded-lg px-2 py-1 text-xs", o.key === q.answer ? "bg-emerald-50 font-semibold text-emerald-800" : "bg-white")}>
                              {o.key}. {o.text}
                            </li>
                          ))}
                        </ul>
                        <p className="mt-1.5 text-xs text-muted">
                          <Badge tone={q.source === "bank" ? "gray" : "brand"}>{q.source === "bank" ? "Question bank" : "New"}</Badge> {q.topic}
                        </p>
                      </div>
                      <Button variant="ghost" size="sm" aria-label="Remove question" onClick={() => removeObjective(i)}><X className="h-3.5 w-3.5" /></Button>
                    </div>
                  </li>
                ))}
              </ol>
            </section>

            <section>
              <div className="mb-2 flex items-center justify-between gap-2">
                <h4 className="text-sm font-semibold">Section B: Theory, with marking scheme</h4>
                <Button variant="outline" size="sm" onClick={() => setTheory((xs) => [...xs, { topic: allTopics[0] ?? "", question: "", points: [{ point: "", marks: 2 }] }])}>
                  <Plus className="h-3.5 w-3.5" /> Add question
                </Button>
              </div>
              {theory.length === 0 ? <p className="text-sm text-muted">No theory questions yet.</p> : null}
              <ol className="flex flex-col gap-3">
                {theory.map((t, i) => (
                  <li key={i} className="rounded-2xl border border-line p-3">
                    <div className="flex items-start gap-2">
                      <span className="mt-2 text-sm font-semibold">{i + 1}.</span>
                      <Textarea aria-label={`Theory question ${i + 1}`} rows={2} value={t.question} onChange={(e) => setT(i, { question: e.target.value })} />
                      <Button variant="ghost" size="sm" aria-label="Remove theory question" onClick={() => setTheory((xs) => xs.filter((_, k) => k !== i))}><Trash2 className="h-3.5 w-3.5" /></Button>
                    </div>
                    <p className="mt-2 text-xs font-semibold text-muted uppercase">Marking points · {marksOf(t)} marks</p>
                    <ul className="mt-1 flex flex-col gap-1.5">
                      {t.points.map((p, k) => (
                        <li key={k} className="flex gap-2">
                          <Input aria-label="Marking point" value={p.point} onChange={(e) => setT(i, { points: t.points.map((x, j) => (j === k ? { ...x, point: e.target.value } : x)) })} />
                          <Input aria-label="Marks" type="number" min={0.5} step={0.5} className="w-20" value={p.marks} onChange={(e) => setT(i, { points: t.points.map((x, j) => (j === k ? { ...x, marks: Number(e.target.value) } : x)) })} />
                        </li>
                      ))}
                    </ul>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Button variant="ghost" size="sm" onClick={() => setT(i, { points: [...t.points, { point: "", marks: 1 }] })}><Plus className="h-3.5 w-3.5" /> Point</Button>
                      <Button variant="secondary" size="sm" disabled={!t.question.trim() || !t.points.some((p) => p.point.trim())} onClick={() => onMarkTheory({ ...t, points: t.points.filter((p) => p.point.trim()) }, title)}>
                        <ClipboardCheck className="h-3.5 w-3.5" /> Mark students’ answers
                      </Button>
                    </div>
                  </li>
                ))}
              </ol>
            </section>

            <div className="flex flex-col gap-2 border-t border-line pt-4 sm:flex-row sm:items-center">
              <Button disabled={save.busy} onClick={saveAll}><Save className="h-4 w-4" /> Save paper and marking scheme</Button>
              <SuccessNote className="flex-1">{save.notice}</SuccessNote>
              <ErrorNote className="flex-1">{save.error}</ErrorNote>
            </div>
          </div>
        ) : (
          <div className="flex h-full min-h-[40dvh] flex-col items-center justify-center gap-2 text-center text-sm text-muted">
            <FileText className="h-8 w-8 text-brand-500" />
            <p className="max-w-sm">Choose topics and the number of questions. You get a paper in WAEC, NECO, BECE, JAMB or school style, with answers and a marking scheme you can edit.</p>
          </div>
        )}
      </Card>
    </div>
  );
}
