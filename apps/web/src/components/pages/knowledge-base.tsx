"use client";
import * as React from "react";
import { BookMarked, Download, FileText, Image as ImageIcon, RefreshCw, Search, Trash2, Upload } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { Button, buttonClass } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { Badge, type Tone } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { Async, Empty, ErrorNote, SuccessNote } from "@/components/ui/feedback";
import { api, apiUpload, useApi } from "@/lib/api";
import { useStaff } from "@/lib/session";
import { useAction } from "@/lib/useAction";
import type { KbAnswer, KbDocument, KbKind, SchoolClass, Subject } from "@/lib/types";

export const KIND_LABEL: Record<KbKind, string> = {
  scheme_of_work: "Scheme of work",
  lesson_note: "Lesson note",
  lesson_plan: "Lesson plan",
  past_questions: "Past questions",
  textbook: "Textbook",
  marking_scheme: "Marking scheme",
  other: "Other",
};

const STATUS: Record<KbDocument["status"], { label: string; tone: Tone }> = {
  ready: { label: "Ready", tone: "green" },
  processing: { label: "Reading…", tone: "blue" },
  needs_ai: { label: "Waiting for AI", tone: "amber" },
  failed: { label: "Could not read", tone: "red" },
};

const ACCEPT = ".pdf,.docx,.txt,.md,.jpg,.jpeg,.png,.webp";
const MAX_MB = 15;

const fileSize = (b: number) => (b > 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

/** Upload and manage the school's own teaching material, and test what the AI will answer from it. */
export function KnowledgeBase() {
  const me = useStaff();
  const leader = me.staff.role !== "teacher";
  const [subjectId, setSubjectId] = React.useState("");
  const [level, setLevel] = React.useState("");
  const query = new URLSearchParams({ ...(subjectId ? { subjectId } : {}), ...(level ? { classLevel: level } : {}) }).toString();
  const docs = useApi<KbDocument[]>(`kb/documents${query ? `?${query}` : ""}`);
  const { data: subjects } = useApi<Subject[]>("subjects");
  const { data: classes } = useApi<SchoolClass[]>("classes");
  const levels = React.useMemo(() => [...new Set((classes ?? []).sort((a, b) => a.sortOrder - b.sortOrder).map((c) => c.name))], [classes]);
  const [uploading, setUploading] = React.useState(false);
  const act = useAction();

  const canChange = (d: KbDocument) => leader || d.uploadedBy === me.staff.id;

  return (
    <>
      <PageHeader
        title="Knowledge Base"
        subtitle="Your school’s schemes of work, lesson notes, past questions and textbooks. The AI tutor answers from these first and cites them."
        actions={<Button onClick={() => setUploading(true)}><Upload className="h-4 w-4" /> Upload material</Button>}
      />
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1fr_380px]">
        <Card>
          <CardHeader
            title="Documents"
            subtitle={docs.data ? `${docs.data.length} ${docs.data.length === 1 ? "document" : "documents"}` : undefined}
            action={
              <div className="flex flex-wrap gap-2">
                <Select value={subjectId} onChange={(e) => setSubjectId(e.target.value)} aria-label="Subject">
                  <option value="">All subjects</option>
                  {subjects?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </Select>
                <Select value={level} onChange={(e) => setLevel(e.target.value)} aria-label="Class">
                  <option value="">All classes</option>
                  {levels.map((l) => <option key={l}>{l}</option>)}
                </Select>
              </div>
            }
          />
          <ErrorNote className="mb-3">{act.error}</ErrorNote>
          <SuccessNote className="mb-3">{act.notice}</SuccessNote>
          <Async data={docs.data} error={docs.error}>
            {(list) =>
              list.length ? (
                <ul className="flex flex-col divide-y divide-line">
                  {list.map((d) => {
                    const Icon = d.mimeType.startsWith("image/") ? ImageIcon : d.kind === "scheme_of_work" ? BookMarked : FileText;
                    return (
                      <li key={d.id} className="flex flex-col gap-3 py-3.5 sm:flex-row sm:items-center">
                        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-brand-50 text-brand-600"><Icon className="h-5 w-5" /></span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-semibold">{d.title}</p>
                          <p className="mt-0.5 text-xs text-muted">
                            {[KIND_LABEL[d.kind], d.subject ?? "All subjects", d.classLevel ?? "All classes", d.termNumber ? `Term ${d.termNumber}` : null, fileSize(d.sizeBytes)].filter(Boolean).join(" · ")}
                          </p>
                          <div className="mt-1.5 flex flex-wrap gap-1.5">
                            <Badge tone={STATUS[d.status].tone}>{STATUS[d.status].label}</Badge>
                            {d.status === "ready" ? <Badge tone="gray">{d.chunkCount} passages</Badge> : null}
                            {d.outlineWeeks ? <Badge tone="orchid">{d.outlineWeeks} weekly topics</Badge> : null}
                            {!d.visibleToStudents ? <Badge tone="gray">Staff only</Badge> : null}
                          </div>
                          {d.error ? <p className="mt-1.5 text-xs text-amber-700">{d.error}</p> : null}
                        </div>
                        <div className="flex gap-1.5">
                          <a href={`/bff/kb/documents/${d.id}/file`} className={buttonClass("ghost", "icon")} aria-label={`Download ${d.title}`}><Download className="h-4 w-4" /></a>
                          {canChange(d) && d.status !== "ready" ? (
                            <Button variant="ghost" size="icon" aria-label="Read again" disabled={act.busy} onClick={() => act.run(() => api(`kb/documents/${d.id}/reprocess`, { method: "POST" }), "Read again.").then(docs.reload)}>
                              <RefreshCw className="h-4 w-4" />
                            </Button>
                          ) : null}
                          {canChange(d) ? (
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={`Delete ${d.title}`}
                              disabled={act.busy}
                              onClick={() => confirm(`Delete “${d.title}”? The tutor will stop using it.`) && act.run(() => api(`kb/documents/${d.id}`, { method: "DELETE" }), "Deleted.").then(docs.reload)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          ) : null}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <Empty title="No material yet" icon={BookMarked}>
                  Start with the scheme of work for each subject and class: the tutor uses its weekly topics. Then add lesson notes and past questions.
                </Empty>
              )
            }
          </Async>
        </Card>
        <AskPanel subjects={subjects ?? []} levels={levels} />
      </div>
      <UploadDialog open={uploading} onClose={() => setUploading(false)} subjects={subjects ?? []} levels={levels} onDone={docs.reload} />
    </>
  );
}

function UploadDialog({ open, onClose, subjects, levels, onDone }: { open: boolean; onClose: () => void; subjects: Subject[]; levels: string[]; onDone: () => void }) {
  const [file, setFile] = React.useState<File | null>(null);
  const [title, setTitle] = React.useState("");
  const [kind, setKind] = React.useState<KbKind>("lesson_note");
  const [subjectId, setSubjectId] = React.useState("");
  const [level, setLevel] = React.useState("");
  const [term, setTerm] = React.useState("");
  const [visible, setVisible] = React.useState(true);
  const act = useAction();

  React.useEffect(() => setVisible(kind !== "marking_scheme"), [kind]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return act.setError("Choose a file");
    if (file.size > MAX_MB * 1024 * 1024) return act.setError(`Files can be up to ${MAX_MB} MB`);
    const doc = await act.run(() =>
      apiUpload<KbDocument>("kb/documents", file, {
        title: title || file.name.replace(/\.[^.]+$/, ""),
        kind,
        fileName: file.name,
        mimeType: file.type,
        subjectId,
        classLevel: level,
        termNumber: term,
        visibleToStudents: visible,
      }),
    );
    if (doc) {
      onDone();
      setFile(null);
      setTitle("");
      onClose();
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title="Upload material" subtitle="PDF, Word (.docx), text, or a photo of notes. Up to 15 MB.">
      <form onSubmit={submit} className="flex flex-col gap-4">
        <div>
          <Label htmlFor="kb-file">File</Label>
          <Input id="kb-file" type="file" accept={ACCEPT} className="h-auto py-2" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          <p className="mt-1 text-xs text-muted">Photos and scanned PDFs are read by AI once it is switched on.</p>
        </div>
        <div>
          <Label htmlFor="kb-title">Title</Label>
          <Input id="kb-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. SS 2 Physics scheme of work, first term" />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="kb-kind">Type</Label>
            <Select id="kb-kind" className="w-full" value={kind} onChange={(e) => setKind(e.target.value as KbKind)}>
              {Object.entries(KIND_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </Select>
          </div>
          <div>
            <Label htmlFor="kb-subject">Subject</Label>
            <Select id="kb-subject" className="w-full" value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
              <option value="">All subjects</option>
              {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </div>
          <div>
            <Label htmlFor="kb-level">Class</Label>
            <Select id="kb-level" className="w-full" value={level} onChange={(e) => setLevel(e.target.value)}>
              <option value="">All classes</option>
              {levels.map((l) => <option key={l}>{l}</option>)}
            </Select>
          </div>
          <div>
            <Label htmlFor="kb-term">Term</Label>
            <Select id="kb-term" className="w-full" value={term} onChange={(e) => setTerm(e.target.value)}>
              <option value="">Whole year</option>
              <option value="1">First term</option>
              <option value="2">Second term</option>
              <option value="3">Third term</option>
            </Select>
          </div>
        </div>
        <label className="flex items-start gap-2.5 text-sm">
          <input type="checkbox" className="mt-0.5 h-4 w-4 accent-brand-600" checked={visible} onChange={(e) => setVisible(e.target.checked)} />
          <span>Students can learn from this through the AI tutor<span className="block text-xs text-muted">Leave marking schemes and answer keys unticked.</span></span>
        </label>
        <ErrorNote>{act.error}</ErrorNote>
        <Button type="submit" disabled={act.busy}>{act.busy ? "Uploading and reading…" : "Upload"}</Button>
      </form>
    </Dialog>
  );
}

function AskPanel({ subjects, levels }: { subjects: Subject[]; levels: string[] }) {
  const [question, setQuestion] = React.useState("");
  const [subjectId, setSubjectId] = React.useState("");
  const [level, setLevel] = React.useState("");
  const [answer, setAnswer] = React.useState<KbAnswer | null>(null);
  const act = useAction();

  async function ask(e: React.FormEvent) {
    e.preventDefault();
    const r = await act.run(() => api<KbAnswer>("kb/ask", { method: "POST", body: { question, subjectId: subjectId || undefined, classLevel: level || undefined } }));
    if (r) setAnswer(r);
  }

  return (
    <Card className="h-fit">
      <CardHeader title="Ask your material" subtitle="See what the tutor would find for a question." />
      <form onSubmit={ask} className="flex flex-col gap-2.5">
        <Textarea rows={3} value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="e.g. What does Ohm’s law state?" maxLength={1000} />
        <div className="grid grid-cols-2 gap-2">
          <Select value={subjectId} onChange={(e) => setSubjectId(e.target.value)} aria-label="Subject">
            <option value="">Any subject</option>
            {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
          <Select value={level} onChange={(e) => setLevel(e.target.value)} aria-label="Class">
            <option value="">Any class</option>
            {levels.map((l) => <option key={l}>{l}</option>)}
          </Select>
        </div>
        <Button type="submit" disabled={act.busy || question.trim().length < 3}><Search className="h-4 w-4" /> {act.busy ? "Searching…" : "Ask"}</Button>
      </form>
      <ErrorNote className="mt-3">{act.error}</ErrorNote>
      {answer ? (
        <div className="mt-4 flex flex-col gap-3">
          <p className="text-sm whitespace-pre-line">{answer.answer}</p>
          {answer.passages.map((p) => (
            <div key={`${p.documentId}-${p.n}`} className="rounded-2xl bg-canvas p-3 text-sm">
              <p className="text-xs font-semibold text-brand-700">[{p.n}] {p.title}{p.locator ? ` · ${p.locator}` : ""}</p>
              <p className="mt-1 line-clamp-5 text-muted whitespace-pre-line">{p.excerpt}</p>
            </div>
          ))}
        </div>
      ) : null}
    </Card>
  );
}
