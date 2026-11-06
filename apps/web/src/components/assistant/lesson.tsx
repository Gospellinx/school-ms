"use client";
import * as React from "react";
import { BookOpen, Copy, Eye, PenLine, Save, Sparkles } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ErrorNote, SuccessNote } from "@/components/ui/feedback";
import { Markdown } from "@/components/ui/markdown";
import { api } from "@/lib/api";
import { useAction } from "@/lib/useAction";
import type { AssistantContext, LessonDraft } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Topics from the scheme of work, current term first. */
export function useTopics(ctx: AssistantContext) {
  return React.useMemo(() => {
    const t = ctx.term?.number ?? null;
    return [...ctx.outline].sort((a, b) => Number(b.termNumber === t) - Number(a.termNumber === t) || (a.termNumber ?? 0) - (b.termNumber ?? 0) || a.week - b.week);
  }, [ctx]);
}

export function LessonTab({ ctx }: { ctx: AssistantContext }) {
  const topics = useTopics(ctx);
  const [kind, setKind] = React.useState<"lesson_note" | "lesson_plan">("lesson_note");
  const [pick, setPick] = React.useState(topics[0] ? `${topics[0].termNumber}:${topics[0].week}` : "custom");
  const [custom, setCustom] = React.useState("");
  const [minutes, setMinutes] = React.useState(40);
  const [notes, setNotes] = React.useState("");
  const [draft, setDraft] = React.useState<LessonDraft | null>(null);
  const [body, setBody] = React.useState("");
  const [title, setTitle] = React.useState("");
  const [preview, setPreview] = React.useState(true);
  const gen = useAction();
  const save = useAction();

  const chosen = topics.find((t) => `${t.termNumber}:${t.week}` === pick);
  const topic = pick === "custom" ? custom.trim() : (chosen?.topic ?? "");

  async function generate() {
    const r = await gen.run(() =>
      api<LessonDraft>("assistant/lesson", {
        method: "POST",
        body: { classId: ctx.class.id, subjectId: ctx.subject.id, kind, topic, week: chosen?.week, durationMinutes: minutes, notes: notes || undefined },
      }),
    );
    if (r) {
      setDraft(r);
      setBody(r.body);
      setTitle(r.title);
      setPreview(true);
      save.setNotice(null);
    }
  }

  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-[360px_1fr]">
      <Card>
        <CardHeader title="What to write" subtitle={`From your ${ctx.subject.name} scheme of work for ${ctx.class.name}.`} />
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-1 rounded-2xl bg-canvas p-1" role="tablist">
            {(["lesson_note", "lesson_plan"] as const).map((k) => (
              <button key={k} role="tab" aria-selected={kind === k} onClick={() => setKind(k)} className={cn("h-9 rounded-xl text-sm font-semibold", kind === k ? "bg-white shadow-sm" : "text-muted")}>
                {k === "lesson_note" ? "Lesson note" : "Lesson plan"}
              </button>
            ))}
          </div>
          <div>
            <Label htmlFor="topic">Topic</Label>
            <Select id="topic" value={pick} onChange={(e) => setPick(e.target.value)}>
              {topics.map((t) => (
                <option key={`${t.termNumber}:${t.week}`} value={`${t.termNumber}:${t.week}`}>
                  {t.termNumber ? `Term ${t.termNumber}, ` : ""}Week {t.week}: {t.topic}
                </option>
              ))}
              <option value="custom">Another topic…</option>
            </Select>
            {topics.length === 0 ? <p className="mt-1 text-xs text-muted">Upload your scheme of work to the knowledge base to pick topics by week.</p> : null}
          </div>
          {pick === "custom" ? <Input aria-label="Topic" placeholder="e.g. Resistors in series and parallel" value={custom} onChange={(e) => setCustom(e.target.value)} /> : null}
          {kind === "lesson_plan" ? (
            <div>
              <Label htmlFor="mins">Lesson length</Label>
              <Select id="mins" value={minutes} onChange={(e) => setMinutes(Number(e.target.value))}>
                {[35, 40, 45, 60, 80].map((m) => <option key={m} value={m}>{m} minutes{m === 80 ? " (double period)" : ""}</option>)}
              </Select>
            </div>
          ) : null}
          <div>
            <Label htmlFor="notes">Anything to include (optional)</Label>
            <Textarea id="notes" rows={3} placeholder="e.g. Use the Ohm's law experiment with a rheostat. Students struggled with units last week." value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <Button disabled={gen.busy || topic.length < 2} onClick={generate}>
            <Sparkles className="h-4 w-4" /> {gen.busy ? "Writing…" : `Draft ${kind === "lesson_note" ? "lesson note" : "lesson plan"}`}
          </Button>
          <ErrorNote>{gen.error}</ErrorNote>
          {!ctx.aiEnabled ? <p className="text-xs text-muted">AI is not switched on yet, so you get a ready-made outline with your school’s notes filled in.</p> : null}
        </div>
      </Card>

      <Card className="min-h-[50dvh]">
        {draft ? (
          <>
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start">
              <div className="min-w-0 flex-1">
                <Input aria-label="Title" value={title} onChange={(e) => setTitle(e.target.value)} className="font-semibold" />
                <p className="mt-1.5 text-xs text-muted">
                  {draft.source === "ai" ? "Drafted by AI from your scheme of work and notes. Check it before you use it." : "Outline with your school’s notes. Fill in the [brackets]."}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <Button variant="outline" size="sm" onClick={() => setPreview(!preview)}>{preview ? <><PenLine className="h-3.5 w-3.5" /> Edit</> : <><Eye className="h-3.5 w-3.5" /> Preview</>}</Button>
                <Button variant="outline" size="sm" onClick={() => navigator.clipboard?.writeText(body)}><Copy className="h-3.5 w-3.5" /> Copy</Button>
              </div>
            </div>
            {preview ? <Markdown text={body} /> : <Textarea aria-label="Draft" rows={24} value={body} onChange={(e) => setBody(e.target.value)} className="font-mono text-xs" />}
            {draft.citations.length ? (
              <div className="mt-4 flex flex-wrap gap-1.5">
                {draft.citations.map((c, i) => <Badge key={i} tone="blue">[{i + 1}] {c.title}{c.locator ? ` · ${c.locator}` : ""}</Badge>)}
              </div>
            ) : null}
            <div className="mt-5 flex flex-col gap-2 border-t border-line pt-4 sm:flex-row sm:items-center">
              <Button
                disabled={save.busy}
                onClick={() =>
                  save.run(
                    () => api("assistant/save", { method: "POST", body: { classId: ctx.class.id, subjectId: ctx.subject.id, kind, title, body } }),
                    kind === "lesson_note" ? "Saved to the knowledge base. Students can read it and the tutor will use it." : "Saved to the knowledge base for staff.",
                  )
                }
              >
                <Save className="h-4 w-4" /> Save to knowledge base
              </Button>
              <SuccessNote className="flex-1">{save.notice}</SuccessNote>
              <ErrorNote className="flex-1">{save.error}</ErrorNote>
            </div>
          </>
        ) : (
          <div className="flex h-full min-h-[40dvh] flex-col items-center justify-center gap-2 text-center text-sm text-muted">
            <BookOpen className="h-8 w-8 text-brand-500" />
            <p className="max-w-sm">Pick a topic and draft a lesson note students can copy, or a lesson plan with objectives, steps and evaluation in the usual format.</p>
          </div>
        )}
      </Card>
    </div>
  );
}
