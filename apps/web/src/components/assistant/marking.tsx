"use client";
import * as React from "react";
import { ArrowLeft, CheckCircle2, ClipboardCheck, Plus, Send, Sparkles, Trash2 } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Empty, ErrorNote, Loading, SuccessNote } from "@/components/ui/feedback";
import { api, useApi } from "@/lib/api";
import { useAction } from "@/lib/useAction";
import type { AssistantContext, EssayScript, EssayTask, EssayTaskSummary, RubricPoint } from "@/lib/types";
import { cn } from "@/lib/utils";

export interface EssayPrefill {
  title: string;
  question: string;
  rubricText: string;
}

export const rubricToText = (points: RubricPoint[]) => points.map((p) => `${p.point} (${p.marks})`).join("\n");

function NewTask({ ctx, prefill, onCreated, onCancel }: { ctx: AssistantContext; prefill: EssayPrefill | null; onCreated: (id: string) => void; onCancel: () => void }) {
  const [title, setTitle] = React.useState(prefill?.title ?? "");
  const [question, setQuestion] = React.useState(prefill?.question ?? "");
  const [rubric, setRubric] = React.useState(prefill?.rubricText ?? "");
  const [component, setComponent] = React.useState("");
  const act = useAction();
  async function create() {
    const r = await act.run(() =>
      api<{ id: string }>("assistant/essays", {
        method: "POST",
        body: {
          classId: ctx.class.id,
          subjectId: ctx.subject.id,
          title,
          question,
          rubricText: rubric,
          termId: component ? ctx.term?.id : null,
          scoreComponent: component || null,
        },
      }),
    );
    if (r) onCreated(r.id);
  }
  return (
    <Card>
      <CardHeader title="New marking task" subtitle="Type the question and your marking scheme. Each line is one point, with its marks in brackets." />
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <div className="flex flex-col gap-3">
          <div>
            <Label htmlFor="et">Title</Label>
            <Input id="et" placeholder="e.g. 2nd CA theory, question 1" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="eq">Question</Label>
            <Textarea id="eq" rows={4} value={question} onChange={(e) => setQuestion(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="ec">Send confirmed marks to (optional)</Label>
            <Select id="ec" value={component} onChange={(e) => setComponent(e.target.value)} disabled={!ctx.term}>
              <option value="">Don’t send to the score sheet</option>
              {ctx.section.components.map((c) => <option key={c.key} value={c.key}>{c.label} ({ctx.term?.name}, out of {c.maxScore})</option>)}
            </Select>
          </div>
        </div>
        <div>
          <Label htmlFor="er">Marking scheme</Label>
          <Textarea id="er" rows={9} placeholder={"States that current is proportional to p.d. (2)\nMentions constant temperature (1)\nCorrect formula V = IR (1)"} value={rubric} onChange={(e) => setRubric(e.target.value)} />
        </div>
      </div>
      <ErrorNote className="mt-3">{act.error}</ErrorNote>
      <div className="mt-4 flex gap-2">
        <Button disabled={act.busy || title.trim().length < 2 || question.trim().length < 5 || !rubric.trim()} onClick={create}><Plus className="h-4 w-4" /> Create</Button>
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </Card>
  );
}

function ScriptRow({ task, row, onSaved }: { task: EssayTask; row: EssayTask["students"][number]; onSaved: (s: EssayScript) => void }) {
  const [answer, setAnswer] = React.useState(row.script?.answer ?? "");
  const [mark, setMark] = React.useState<string>(row.script?.awarded != null ? String(row.script.awarded) : row.script?.suggestion ? String(row.script.suggestion.total) : "");
  const [open, setOpen] = React.useState(false);
  const act = useAction();
  const s = row.script;

  async function suggest() {
    const r = await act.run(() => api<EssayScript>(`assistant/essays/${task.id}/scripts/${row.studentId}`, { method: "PUT", body: { answer } }));
    if (r) {
      onSaved(r);
      setMark(String(r.suggestion?.total ?? ""));
    }
  }
  async function confirm() {
    const r = await act.run(() => api<EssayScript>(`assistant/essays/${task.id}/scripts/${row.studentId}`, { method: "PATCH", body: { awarded: Number(mark) } }));
    if (r) onSaved({ ...s!, ...r });
  }

  return (
    <li className="rounded-2xl border border-line">
      <button className="flex w-full items-center gap-3 px-4 py-3 text-left" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold">{row.name}</span>
          <span className="text-xs text-muted">{row.admissionNumber}</span>
        </span>
        {s?.status === "confirmed" ? (
          <Badge tone="green"><CheckCircle2 className="h-3 w-3" /> {s.awarded} / {task.maxMarks}</Badge>
        ) : s?.suggestion ? (
          <Badge tone="amber">Suggested {s.suggestion.total} / {task.maxMarks}</Badge>
        ) : (
          <Badge tone="gray">Not marked</Badge>
        )}
      </button>
      {open ? (
        <div className="flex flex-col gap-3 border-t border-line px-4 py-3">
          <Textarea aria-label={`Answer by ${row.name}`} rows={4} placeholder="Type or paste the student’s answer" value={answer} onChange={(e) => setAnswer(e.target.value)} />
          <div>
            <Button variant="secondary" size="sm" disabled={act.busy || !answer.trim()} onClick={suggest}><Sparkles className="h-3.5 w-3.5" /> {s?.suggestion ? "Suggest again" : "Suggest marks"}</Button>
          </div>
          {s?.suggestion ? (
            <div className="rounded-2xl bg-canvas p-3 text-sm">
              <ul className="flex flex-col gap-1.5">
                {s.suggestion.criteria.map((c, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className={cn("mt-0.5 w-14 shrink-0 rounded-md px-1.5 py-0.5 text-center text-xs font-semibold", c.awarded === c.marks ? "bg-emerald-100 text-emerald-800" : c.awarded > 0 ? "bg-amber-100 text-amber-800" : "bg-rose-100 text-rose-700")}>
                      {c.awarded}/{c.marks}
                    </span>
                    <span className="min-w-0"><span className="font-medium">{c.point}</span> <span className="text-muted">· {c.reason}</span></span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-muted">{s.suggestion.feedback}</p>
              <p className="mt-1 text-xs text-muted">{s.suggestion.source === "ai" ? "Suggested by AI." : "Rough guide from key words in the answer. Read the answer before you confirm."}</p>
            </div>
          ) : null}
          {s ? (
            <div className="flex flex-wrap items-end gap-2">
              <div>
                <Label htmlFor={`m-${row.studentId}`}>Final mark</Label>
                <Input id={`m-${row.studentId}`} type="number" min={0} max={task.maxMarks} step={0.5} className="w-28" value={mark} onChange={(e) => setMark(e.target.value)} />
              </div>
              <Button size="md" disabled={act.busy || mark === "" || Number(mark) > task.maxMarks} onClick={confirm}><CheckCircle2 className="h-4 w-4" /> Confirm</Button>
            </div>
          ) : null}
          <ErrorNote>{act.error}</ErrorNote>
        </div>
      ) : null}
    </li>
  );
}

function TaskView({ id, ctx, onBack }: { id: string; ctx: AssistantContext; onBack: () => void }) {
  const { data, error, reload } = useApi<EssayTask>(`assistant/essays/${id}`);
  const [task, setTask] = React.useState<EssayTask | null>(null);
  const push = useAction();
  React.useEffect(() => setTask(data), [data]);
  if (!task) return <Card>{error ? <ErrorNote>{error}</ErrorNote> : <Loading />}</Card>;
  const confirmed = task.students.filter((s) => s.script?.status === "confirmed").length;
  const comp = ctx.section.components.find((c) => c.key === task.scoreComponent);
  const saved = (studentId: string, s: EssayScript) => setTask({ ...task, students: task.students.map((r) => (r.studentId === studentId ? { ...r, script: s } : r)) });

  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1fr_340px]">
      <Card>
        <div className="mb-4 flex items-start gap-2">
          <Button variant="ghost" size="icon" aria-label="Back to marking tasks" onClick={onBack}><ArrowLeft className="h-4 w-4" /></Button>
          <div className="min-w-0">
            <h3 className="text-lg font-semibold">{task.title}</h3>
            <p className="text-sm text-muted">{confirmed} of {task.students.length} confirmed · out of {task.maxMarks}</p>
          </div>
        </div>
        <ul className="flex flex-col gap-2">
          {task.students.map((row) => <ScriptRow key={row.studentId} task={task} row={row} onSaved={(s) => saved(row.studentId, s)} />)}
        </ul>
      </Card>
      <div className="flex flex-col gap-5">
        <Card>
          <CardHeader title="Question" />
          <p className="text-sm whitespace-pre-line">{task.question}</p>
          <p className="mt-4 text-xs font-semibold text-muted uppercase">Marking scheme</p>
          <ul className="mt-1.5 flex flex-col gap-1 text-sm">
            {task.rubric.map((p, i) => <li key={i} className="flex justify-between gap-3"><span>{p.point}</span><span className="shrink-0 font-semibold">{p.marks}</span></li>)}
          </ul>
        </Card>
        {comp ? (
          <Card>
            <CardHeader title="Score sheet" subtitle={`Confirmed marks go to ${comp.label}, scaled to ${comp.maxScore}.`} />
            <Button disabled={push.busy || confirmed === 0} onClick={() => push.run(() => api<{ written: number }>(`assistant/essays/${task.id}/push-scores`, { method: "POST" }), (r) => `${r.written} marks sent to ${comp.label}.`).then(() => reload())}>
              <Send className="h-4 w-4" /> Send {confirmed} marks
            </Button>
            <SuccessNote className="mt-3">{push.notice}</SuccessNote>
            <ErrorNote className="mt-3">{push.error}</ErrorNote>
          </Card>
        ) : null}
      </div>
    </div>
  );
}

export function MarkingTab({ ctx, prefill, clearPrefill }: { ctx: AssistantContext; prefill: EssayPrefill | null; clearPrefill: () => void }) {
  const list = useApi<EssayTaskSummary[]>(`assistant/essays?classId=${ctx.class.id}`);
  const [open, setOpen] = React.useState<string | null>(null);
  const [creating, setCreating] = React.useState(Boolean(prefill));
  const del = useAction();
  React.useEffect(() => setCreating(Boolean(prefill)), [prefill]);

  if (open) return <TaskView id={open} ctx={ctx} onBack={() => { setOpen(null); void list.reload(); }} />;
  if (creating) {
    return (
      <NewTask
        key={prefill?.question ?? "new"}
        ctx={ctx}
        prefill={prefill}
        onCancel={() => { setCreating(false); clearPrefill(); }}
        onCreated={(id) => { setCreating(false); clearPrefill(); void list.reload(); setOpen(id); }}
      />
    );
  }
  const tasks = (list.data ?? []).filter((t) => t.subjectId === ctx.subject.id);
  return (
    <Card>
      <CardHeader
        title="Mark written answers"
        subtitle="Suggested marks for each point of your marking scheme. You confirm every mark before it counts."
        action={<Button onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> New task</Button>}
      />
      <ErrorNote>{list.error ?? del.error}</ErrorNote>
      {list.data && tasks.length === 0 ? (
        <Empty title="No marking tasks yet" icon={ClipboardCheck}>Create one, or use “Mark students’ answers” on a theory question in Tests & exams.</Empty>
      ) : (
        <ul className="flex flex-col gap-2">
          {tasks.map((t) => (
            <li key={t.id} className="flex items-center gap-3 rounded-2xl bg-canvas px-4 py-3">
              <button className="min-w-0 flex-1 text-left" onClick={() => setOpen(t.id)}>
                <span className="block truncate text-sm font-semibold">{t.title}</span>
                <span className="text-xs text-muted">{t.confirmed} confirmed · {t.scripts} answers entered · out of {t.maxMarks}</span>
              </button>
              <Button variant="ghost" size="sm" aria-label={`Delete ${t.title}`} onClick={() => del.run(() => api(`assistant/essays/${t.id}`, { method: "DELETE" })).then(() => list.reload())}><Trash2 className="h-3.5 w-3.5" /></Button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
