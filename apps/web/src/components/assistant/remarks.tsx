"use client";
import * as React from "react";
import { AlertTriangle, CheckCircle2, MessageSquareText, Save, Sparkles } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label, Select, Textarea } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Empty, ErrorNote, Loading, SuccessNote } from "@/components/ui/feedback";
import { api, useApi } from "@/lib/api";
import { useStaff } from "@/lib/session";
import { useAction } from "@/lib/useAction";
import type { AssistantContext, ClassRemarks, Session, Watchlist } from "@/lib/types";

export function RemarksTab({ ctx }: { ctx: AssistantContext }) {
  const me = useStaff();
  const leader = me.staff.role !== "teacher";
  const { data: sessions } = useApi<Session[]>("sessions");
  const terms = (sessions ?? []).flatMap((s) => s.terms.map((t) => ({ ...t, label: `${t.name}, ${s.name}` })));
  const [termId, setTermId] = React.useState(ctx.term?.id ?? "");
  const [res, setRes] = React.useState<ClassRemarks | null>(null);
  const [text, setText] = React.useState<Record<string, { teacher: string; head: string }>>({});
  const [saved, setSaved] = React.useState<Set<string>>(new Set());
  const gen = useAction();
  const save = useAction();

  const idx = terms.findIndex((t) => t.id === termId);
  const earlier = idx > 0 ? terms[idx - 1] : null;
  const incomplete = !!gen.error && gen.error.includes("not complete");

  async function draft(id = termId) {
    if (id !== termId) setTermId(id);
    const r = await gen.run(() => api<ClassRemarks>("assistant/remarks", { method: "POST", body: { termId: id, classId: ctx.class.id } }));
    if (r) {
      setRes(r);
      setSaved(new Set());
      setText(Object.fromEntries(r.students.map((s) => [s.studentId, { teacher: s.draft.teacherComment, head: s.draft.headComment }])));
    }
  }

  async function saveRows(ids: string[]) {
    await save.run(async () => {
      for (const id of ids) {
        const t = text[id];
        await api(`terms/${termId}/students/${id}/comments`, { method: "PUT", body: leader ? { teacherComment: t.teacher, headComment: t.head } : { teacherComment: t.teacher } });
        setSaved((s) => new Set(s).add(id));
      }
      return ids.length;
    }, (n) => `Saved ${n} remark${n === 1 ? "" : "s"}. They appear on the report cards.`);
  }

  return (
    <Card>
      <CardHeader title="Report card remarks" subtitle={`Drafts for every student in ${ctx.class.name} ${ctx.class.arm}, from their results. Edit, then save.`} />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="sm:w-72">
          <Label htmlFor="rt">Term</Label>
          <Select id="rt" value={termId} onChange={(e) => setTermId(e.target.value)}>
            {terms.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
          </Select>
        </div>
        <Button disabled={gen.busy || !termId} onClick={() => draft()}><Sparkles className="h-4 w-4" /> {gen.busy ? "Drafting…" : "Draft remarks for the class"}</Button>
        {res ? <Button variant="outline" disabled={save.busy} onClick={() => saveRows(res.students.map((s) => s.studentId))}><Save className="h-4 w-4" /> Save all</Button> : null}
      </div>
      <ErrorNote className="mt-3">{gen.error ?? save.error}</ErrorNote>
      {incomplete && earlier ? (
        <Button className="mt-2" variant="outline" size="sm" disabled={gen.busy} onClick={() => draft(earlier.id)}>
          Draft for {earlier.label} instead
        </Button>
      ) : null}
      <SuccessNote className="mt-3">{save.notice}</SuccessNote>
      {res ? (
        <>
          <p className="mt-3 text-xs text-muted">{res.source === "ai" ? "Drafted by AI from each student’s results." : "Drafted from each student’s results: best subject, weakest subject and the trend since last term."}</p>
          <ul className="mt-4 flex flex-col gap-3">
            {res.students.map((s) => (
              <li key={s.studentId} className="rounded-2xl border border-line p-3">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{s.name}</span>
                  <span className="text-xs text-muted">Average {s.average} · {s.position}</span>
                  {saved.has(s.studentId) ? <Badge tone="green"><CheckCircle2 className="h-3 w-3" /> Saved</Badge> : s.current.teacherComment ? <Badge tone="gray">Has a remark</Badge> : null}
                </div>
                {s.current.teacherComment && !saved.has(s.studentId) ? <p className="mb-2 text-xs text-muted">Current: “{s.current.teacherComment}”</p> : null}
                <div className={leader ? "grid grid-cols-1 gap-2 md:grid-cols-[2fr_1fr]" : ""}>
                  <Textarea aria-label={`Teacher's remark for ${s.name}`} rows={2} value={text[s.studentId]?.teacher ?? ""} onChange={(e) => setText({ ...text, [s.studentId]: { ...text[s.studentId], teacher: e.target.value } })} />
                  {leader ? <Textarea aria-label={`Head's remark for ${s.name}`} rows={2} value={text[s.studentId]?.head ?? ""} onChange={(e) => setText({ ...text, [s.studentId]: { ...text[s.studentId], head: e.target.value } })} /> : null}
                </div>
                <div className="mt-2">
                  <Button variant="ghost" size="sm" disabled={save.busy} onClick={() => saveRows([s.studentId])}><Save className="h-3.5 w-3.5" /> Save</Button>
                </div>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <Empty className="mt-4" title="No drafts yet" icon={MessageSquareText}>Pick a term with scores entered and draft remarks for the whole class in one go.</Empty>
      )}
    </Card>
  );
}

export function WatchTab({ ctx }: { ctx: AssistantContext }) {
  const { data, error } = useApi<Watchlist>(`assistant/watchlist?classId=${ctx.class.id}`);
  if (!data) return <Card>{error ? <ErrorNote>{error}</ErrorNote> : <Loading />}</Card>;
  const flagged = data.students.filter((s) => s.level);
  return (
    <Card>
      <CardHeader
        title="Students to watch"
        subtitle={`${data.class.name} ${data.class.arm}, ${data.term.name}. From scores so far, attendance, missed CBT tests and practice.`}
        action={
          <div className="flex gap-1.5">
            <Badge tone="red">{data.counts.high} urgent</Badge>
            <Badge tone="amber">{data.counts.medium} watch</Badge>
          </div>
        }
      />
      {flagged.length === 0 ? (
        <Empty title="Nobody is falling behind" icon={CheckCircle2}>All {data.counts.total} students are on track this term.</Empty>
      ) : (
        <ul className="flex flex-col gap-2">
          {flagged.map((s) => (
            <li key={s.studentId} className={s.level === "high" ? "rounded-2xl bg-rose-50/70 p-3.5" : "rounded-2xl bg-amber-50/70 p-3.5"}>
              <div className="flex flex-wrap items-center gap-2">
                <AlertTriangle className={s.level === "high" ? "h-4 w-4 text-rose-600" : "h-4 w-4 text-amber-600"} />
                <span className="font-semibold">{s.name}</span>
                <span className="text-xs text-muted">{s.admissionNumber}{s.average != null ? ` · ${s.average}% so far` : ""}</span>
              </div>
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {s.reasons.map((r, i) => <li key={i}><Badge tone={r.serious ? "red" : "amber"}>{r.text}</Badge></li>)}
              </ul>
            </li>
          ))}
        </ul>
      )}
      {flagged.length ? <p className="mt-3 text-xs text-muted">{data.counts.total - flagged.length} other students are on track. “So far” uses only the scores entered this term.</p> : null}
    </Card>
  );
}
