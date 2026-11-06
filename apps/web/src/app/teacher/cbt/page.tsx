"use client";
import * as React from "react";
import { Plus, Sparkles } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Async, Empty, ErrorNote, SuccessNote } from "@/components/ui/feedback";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/widgets/status-badge";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { api, useApi } from "@/lib/api";
import { currentTermId } from "@/lib/terms";
import { useAction } from "@/lib/useAction";
import { shortDate } from "@/lib/format";
import { className, type Assignment, type CbtResults, type CbtTest, type CbtTestDetail, type Question, type Session, type Subject } from "@/lib/types";

const STATUS: Record<CbtTest["status"], string> = { draft: "Draft", published: "Open", closed: "Done" };

export default function TeacherCbt() {
  const tests = useApi<CbtTest[]>("cbt/tests");
  const { data: subjects } = useApi<Subject[]>("subjects");
  const [open, setOpen] = React.useState<string | null>(null);
  const subjectName = (id: string) => subjects?.find((s) => s.id === id)?.name ?? "";
  return (
    <>
      <PageHeader title="CBT Tests" subtitle="Set computer-based tests from the question bank. Marking is automatic." />
      <div className="grid gap-5 xl:grid-cols-[1fr_1.3fr]">
        <NewTest onCreated={(id) => { void tests.reload(); setOpen(id); }} />
        <Card>
          <CardHeader title="Tests" />
          <Async data={tests.data} error={tests.error}>
            {(rows) =>
              rows.length === 0 ? (
                <Empty title="No tests yet" />
              ) : (
                <Table>
                  <THead><tr><TH>Test</TH><TH>Subject</TH><TH>Status</TH><TH /></tr></THead>
                  <tbody>
                    {rows.map((t) => (
                      <TR key={t.id}>
                        <TD><p className="font-semibold">{t.title}</p><p className="text-xs text-muted">{t.durationMinutes} min · set {shortDate(t.createdAt)}</p></TD>
                        <TD>{subjectName(t.subjectId)}</TD>
                        <TD><StatusBadge status={STATUS[t.status]} /></TD>
                        <TD className="text-right"><Button size="sm" variant="ghost" onClick={() => setOpen(t.id)}>Open</Button></TD>
                      </TR>
                    ))}
                  </tbody>
                </Table>
              )
            }
          </Async>
        </Card>
      </div>
      {open ? <TestDialog id={open} onClose={() => setOpen(null)} onChanged={() => void tests.reload()} /> : null}
    </>
  );
}

function NewTest({ onCreated }: { onCreated: (id: string) => void }) {
  const { data: assignments } = useApi<Assignment[]>("my-assignments");
  const { data: sessions } = useApi<Session[]>("sessions");
  const [pick, setPick] = React.useState("");
  React.useEffect(() => {
    if (!pick && assignments?.length) setPick(`${assignments[0]!.classId}:${assignments[0]!.subjectId}`);
  }, [assignments, pick]);
  const [classId, subjectId] = pick.split(":");
  const bank = useApi<Question[]>(subjectId ? `questions?subjectId=${subjectId}` : null);
  const [chosen, setChosen] = React.useState<Set<string>>(new Set());
  const [adding, setAdding] = React.useState(false);
  React.useEffect(() => setChosen(new Set()), [subjectId]);
  const a = useAction();

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const when = (k: string) => (f.get(k) ? new Date(String(f.get(k))).toISOString() : undefined);
    const r = await a.run(
      () =>
        api<CbtTestDetail>("cbt/tests", {
          method: "POST",
          body: {
            title: String(f.get("title")).trim(),
            subjectId,
            termId: currentTermId(sessions) || undefined,
            durationMinutes: Number(f.get("duration")),
            classIds: [classId],
            questionIds: [...chosen],
            opensAt: when("opensAt"),
            closesAt: when("closesAt"),
            scoreComponent: f.get("component") || undefined,
          },
        }),
      "Draft saved. Open it to publish to the class.",
    );
    if (r) onCreated(r.id);
  }

  const topics = [...new Set((bank.data ?? []).map((q) => q.topic))];
  if (assignments && !assignments.length) return <Card><Empty title="No subjects assigned to you yet" /></Card>;

  return (
    <Card>
      <CardHeader title="New test" subtitle="Saved as a draft until you publish it." />
      <form className="grid gap-4 sm:grid-cols-2" onSubmit={submit}>
        <ErrorNote className="sm:col-span-2">{a.error}</ErrorNote>
        <SuccessNote className="sm:col-span-2">{a.notice}</SuccessNote>
        <div className="sm:col-span-2"><Label>Title</Label><Input name="title" required placeholder="SS 2 Maths: Quadratic equations" /></div>
        <div className="sm:col-span-2">
          <Label>Class and subject</Label>
          <Select className="w-full" value={pick} onChange={(e) => setPick(e.target.value)}>
            {(assignments ?? []).map((x) => <option key={`${x.classId}:${x.subjectId}`} value={`${x.classId}:${x.subjectId}`}>{className({ name: x.className, arm: x.arm })} · {x.subjectName}</option>)}
          </Select>
        </div>
        <div><Label>Duration (minutes)</Label><Input name="duration" type="number" min={1} max={300} defaultValue={30} required /></div>
        <div>
          <Label>Counts towards</Label>
          <Select name="component" className="w-full" defaultValue="">
            <option value="">Nothing (practice)</option>
            <option value="ca1">1st CA</option>
            <option value="ca2">2nd CA</option>
          </Select>
        </div>
        <div><Label>Opens (optional)</Label><Input name="opensAt" type="datetime-local" /></div>
        <div><Label>Closes (optional)</Label><Input name="closesAt" type="datetime-local" /></div>
        <div className="sm:col-span-2 rounded-2xl bg-brand-50 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="flex items-center gap-2 font-semibold text-brand-700"><Sparkles className="h-4 w-4" /> Questions from the bank</p>
            <span className="text-sm text-brand-700">{chosen.size} chosen</span>
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {topics.map((t) => (
              <Button
                key={t}
                type="button"
                size="sm"
                variant="white"
                onClick={() => setChosen(new Set([...chosen, ...(bank.data ?? []).filter((q) => q.topic === t).map((q) => q.id)]))}
              >
                + {t}
              </Button>
            ))}
            <Button type="button" size="sm" variant="outline" onClick={() => setAdding(true)}><Plus className="h-3.5 w-3.5" /> New question</Button>
          </div>
          <ul className="mt-3 flex max-h-72 flex-col gap-2 overflow-y-auto">
            {(bank.data ?? []).map((q) => (
              <li key={q.id}>
                <label className="flex items-start gap-3 rounded-2xl border border-line bg-white p-3 text-sm">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={chosen.has(q.id)}
                    onChange={(e) => {
                      const next = new Set(chosen);
                      if (e.target.checked) next.add(q.id);
                      else next.delete(q.id);
                      setChosen(next);
                    }}
                  />
                  <span className="flex-1">{q.body}</span>
                  <Badge tone="gray">{q.topic}</Badge>
                </label>
              </li>
            ))}
            {bank.data && !bank.data.length ? <li className="text-sm text-muted">No questions for this subject yet. Add some first.</li> : null}
          </ul>
        </div>
        <div className="flex justify-end sm:col-span-2"><Button disabled={a.busy || chosen.size === 0}>Save draft</Button></div>
      </form>
      {adding ? <NewQuestion subjectId={subjectId!} onClose={() => setAdding(false)} onSaved={() => void bank.reload()} /> : null}
    </Card>
  );
}

function NewQuestion({ subjectId, onClose, onSaved }: { subjectId: string; onClose: () => void; onSaved: () => void }) {
  const a = useAction();
  const [drafts, setDrafts] = React.useState<{ body: string; options: { key: string; text: string }[]; answer: string; explanation?: string }[]>([]);
  const [topic, setTopic] = React.useState("");
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const options = ["A", "B", "C", "D"].map((k) => ({ key: k, text: String(f.get(`opt${k}`)).trim() })).filter((o) => o.text);
    const r = await a.run(
      () => api("questions", { method: "POST", body: { subjectId, topic: topic.trim(), body: String(f.get("body")).trim(), options, answer: f.get("answer"), explanation: String(f.get("explanation") || "") || undefined, exam: f.get("exam") } }),
      "Question saved to the bank.",
    );
    if (r) {
      form.reset();
      onSaved();
    }
  }
  async function aiDraft() {
    const r = await a.run(() => api<{ questions: typeof drafts }>("questions/generate", { method: "POST", body: { subjectId, topic: topic.trim(), count: 5 } }));
    if (r) setDrafts(r.questions);
  }
  async function saveDrafts() {
    const r = await a.run(() => api<unknown[]>("questions/bulk", { method: "POST", body: { questions: drafts.map((d) => ({ ...d, subjectId, topic: topic.trim(), source: "ai", exam: "waec" })) } }), (x) => `${x.length} questions saved.`);
    if (r) {
      setDrafts([]);
      onSaved();
    }
  }
  return (
    <Dialog open onClose={onClose} wide title="Add to the question bank" subtitle="Type a question, or let AI draft some on a topic for you to check.">
      <form className="grid gap-4 sm:grid-cols-2" onSubmit={submit}>
        <ErrorNote className="sm:col-span-2">{a.error}</ErrorNote>
        <SuccessNote className="sm:col-span-2">{a.notice}</SuccessNote>
        <div><Label>Topic</Label><Input value={topic} onChange={(e) => setTopic(e.target.value)} required placeholder="Quadratic equations" /></div>
        <div><Label>Exam style</Label><Select name="exam" className="w-full" defaultValue="waec"><option value="school">School</option><option value="bece">BECE</option><option value="waec">WAEC</option><option value="neco">NECO</option><option value="jamb">JAMB</option></Select></div>
        <div className="sm:col-span-2"><Label>Question</Label><Textarea name="body" rows={3} required={!drafts.length} /></div>
        {["A", "B", "C", "D"].map((k) => <div key={k}><Label>Option {k}</Label><Input name={`opt${k}`} /></div>)}
        <div><Label>Correct option</Label><Select name="answer" className="w-full">{["A", "B", "C", "D"].map((k) => <option key={k}>{k}</option>)}</Select></div>
        <div><Label>Explanation</Label><Input name="explanation" /></div>
        <div className="flex flex-wrap justify-end gap-2 sm:col-span-2">
          <Button type="button" variant="secondary" disabled={a.busy || topic.trim().length < 2} onClick={aiDraft}><Sparkles className="h-4 w-4" /> Draft 5 with AI</Button>
          <Button disabled={a.busy}>Save question</Button>
        </div>
      </form>
      {drafts.length ? (
        <div className="mt-5 border-t border-line pt-4">
          <p className="mb-2 font-semibold">AI drafts: check each one before saving</p>
          <ol className="flex flex-col gap-2">
            {drafts.map((d, i) => (
              <li key={i} className="rounded-2xl bg-canvas p-3 text-sm">
                <p className="font-semibold">{i + 1}. {d.body}</p>
                <p className="mt-1 text-muted">{d.options.map((o) => `${o.key}. ${o.text}`).join("   ")} · Answer {d.answer}</p>
                <button className="mt-1 text-xs font-semibold text-rose-600" onClick={() => setDrafts(drafts.filter((_, j) => j !== i))}>Remove</button>
              </li>
            ))}
          </ol>
          <div className="mt-3 flex justify-end"><Button onClick={saveDrafts} disabled={a.busy}>Save {drafts.length} to the bank</Button></div>
        </div>
      ) : null}
    </Dialog>
  );
}

function TestDialog({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const test = useApi<CbtTestDetail>(`cbt/tests/${id}`);
  const results = useApi<CbtResults>(`cbt/tests/${id}/results`);
  const a = useAction();
  const act = (path: string, msg: string | ((r: { written: number; component: string }) => string)) =>
    a.run(async () => {
      const r = await api<{ written: number; component: string }>(`cbt/tests/${id}/${path}`, { method: "POST" });
      await test.reload();
      await results.reload();
      onChanged();
      return r;
    }, msg);
  const t = test.data;
  return (
    <Dialog open onClose={onClose} wide title={t?.title ?? "Test"} subtitle={t ? `${t.classes.map(className).join(", ")} · ${t.questions.length} questions · ${t.totalMarks} marks · ${t.durationMinutes} min` : undefined}>
      <ErrorNote className="mb-3">{a.error}</ErrorNote>
      <SuccessNote className="mb-3">{a.notice}</SuccessNote>
      {t ? (
        <div className="mb-4 flex flex-wrap gap-2">
          <StatusBadge status={STATUS[t.status]} />
          {t.status === "draft" ? <Button size="sm" disabled={a.busy} onClick={() => act("publish", "Published. Students in the class can take it now.")}>Publish to class</Button> : null}
          {t.status === "published" ? <Button size="sm" variant="outline" disabled={a.busy} onClick={() => act("close", "Closed. Late attempts are submitted automatically.")}>Close test</Button> : null}
          {t.scoreComponent && t.status !== "draft" ? (
            <Button size="sm" variant="secondary" disabled={a.busy} onClick={() => act("push-scores", (r) => `Wrote ${r.written} scores into ${r.component.toUpperCase()} on the score sheet.`)}>
              Copy scores to {t.scoreComponent.toUpperCase()}
            </Button>
          ) : null}
        </div>
      ) : null}
      <Async data={results.data} error={results.error}>
        {(r) => (
          <div className="grid gap-5 lg:grid-cols-[1.2fr_1fr]">
            <div>
              <p className="mb-2 text-sm text-muted">{r.submittedCount} of {r.students.length} submitted{r.averagePercentage !== null ? ` · average ${r.averagePercentage}%` : ""}</p>
              <ul className="divide-y divide-line">
                {r.students.map((s) => (
                  <li key={s.studentId} className="flex items-center justify-between py-2 text-sm">
                    <span><span className="font-semibold">{s.name}</span> <span className="text-xs text-muted">{s.admissionNumber}</span></span>
                    {s.status === "submitted" ? <strong>{s.score}/{s.maxScore} · {s.percentage}%</strong> : <Badge tone={s.status === "in_progress" ? "amber" : "gray"}>{s.status === "in_progress" ? "Taking it" : "Not started"}</Badge>}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="mb-2 text-sm font-semibold">How many got each question right</p>
              <ul className="flex flex-col gap-1.5">
                {r.items.map((q, i) => (
                  <li key={q.questionId} className="flex items-center gap-2 text-sm">
                    <span className="w-6 text-muted">{i + 1}.</span>
                    <span className="flex-1 truncate">{q.topic}</span>
                    <span className={q.percentCorrect !== null && q.percentCorrect < 50 ? "font-semibold text-rose-600" : "font-semibold"}>{q.percentCorrect === null ? "–" : `${q.percentCorrect}%`}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </Async>
    </Dialog>
  );
}
