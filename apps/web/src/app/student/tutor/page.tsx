"use client";
import * as React from "react";
import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, BookOpen, Bot, CheckCircle2, Lightbulb, ListChecks, MessageSquarePlus, PenLine, Send, XCircle } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label, Select, Textarea } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Empty, ErrorNote, Loading } from "@/components/ui/feedback";
import { api, useApi } from "@/lib/api";
import { useStudent } from "@/lib/session";
import type { TutorConversation, TutorConversationSummary, TutorMessage, TutorTopics } from "@/lib/types";
import { cn } from "@/lib/utils";

type Intent = "ask" | "explain" | "example" | "quiz" | "hint";

const ACTIONS: { intent: Intent; label: string; icon: React.ElementType }[] = [
  { intent: "explain", label: "Explain", icon: BookOpen },
  { intent: "example", label: "Worked example", icon: PenLine },
  { intent: "quiz", label: "Quiz me", icon: ListChecks },
  { intent: "hint", label: "Hint", icon: Lightbulb },
];

/** Minimal formatting for tutor replies: paragraphs, "- " bullets and **bold**. */
function Rich({ text }: { text: string }) {
  const inline = (line: string) => line.split(/(\*\*[^*]+\*\*)/g).map((part, i) => (part.startsWith("**") && part.endsWith("**") ? <strong key={i}>{part.slice(2, -2)}</strong> : part));
  return (
    <div className="flex flex-col gap-2">
      {text.split(/\n{2,}/).map((block, i) => {
        const lines = block.split("\n");
        if (lines.every((l) => /^\s*[-•]\s/.test(l))) {
          return <ul key={i} className="list-disc pl-5">{lines.map((l, k) => <li key={k}>{inline(l.replace(/^\s*[-•]\s/, ""))}</li>)}</ul>;
        }
        return <p key={i} className="whitespace-pre-line">{inline(block)}</p>;
      })}
    </div>
  );
}

function Quiz({ m, onAnswered }: { m: TutorMessage; onAnswered: (m: TutorMessage) => void }) {
  const [busy, setBusy] = React.useState(false);
  const q = m.quiz!;
  async function pick(key: string) {
    if (q.chosen || busy) return;
    setBusy(true);
    try {
      onAnswered(await api<TutorMessage>(`student/tutor/messages/${m.id}/quiz`, { method: "POST", body: { choice: key } }));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="mt-3 rounded-2xl border border-line bg-white p-3.5">
      <p className="font-semibold whitespace-pre-line">{q.question}</p>
      <div className="mt-3 flex flex-col gap-2">
        {q.options.map((o) => {
          const state = q.answer ? (o.key === q.answer ? "right" : o.key === q.chosen ? "wrong" : "") : "";
          return (
            <button
              key={o.key}
              disabled={Boolean(q.chosen) || busy}
              onClick={() => pick(o.key)}
              className={cn(
                "flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left text-sm",
                state === "right" ? "border-emerald-300 bg-emerald-50" : state === "wrong" ? "border-rose-300 bg-rose-50" : "border-line hover:border-brand-300",
              )}
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-canvas text-xs font-bold">{o.key}</span>
              {o.text}
            </button>
          );
        })}
      </div>
      {q.answer ? (
        <div className={cn("mt-3 flex items-start gap-2 rounded-xl p-3 text-sm", q.correct ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-900")}>
          {q.correct ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0" />}
          <span><strong>{q.correct ? "Correct!" : `The answer is ${q.answer}.`}</strong> {q.explanation}</span>
        </div>
      ) : null}
    </div>
  );
}

function Bubble({ m, onAnswered }: { m: TutorMessage; onAnswered: (m: TutorMessage) => void }) {
  const mine = m.role === "student";
  return (
    <div className={cn("flex gap-2.5", mine && "flex-row-reverse")}>
      {!mine ? <span className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-brand-600 text-white"><Bot className="h-4 w-4" /></span> : null}
      <div className={cn("min-w-0 max-w-[88%] break-words rounded-2xl px-4 py-3 text-sm sm:max-w-[80%]", mine ? "bg-brand-600 text-white" : m.source === "safety" ? "bg-amber-50 text-amber-950" : "bg-canvas")}>
        <Rich text={m.content} />
        {m.quiz ? <Quiz m={m} onAnswered={onAnswered} /> : null}
        {m.citations.length ? (
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {m.citations.map((c, i) => (
              <span key={`${c.documentId}-${i}`} className="rounded-lg bg-white px-2 py-1 text-xs font-medium text-brand-700">
                [{i + 1}] {c.title}{c.locator ? ` · ${c.locator}` : ""}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Chat({ id, onBack }: { id: string; onBack: () => void }) {
  const [conv, setConv] = React.useState<TutorConversation | null>(null);
  const [text, setText] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [followUps, setFollowUps] = React.useState<string[]>([]);
  const end = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    setConv(null);
    setFollowUps([]);
    api<TutorConversation>(`student/tutor/conversations/${id}`).then(setConv, (e) => setError((e as Error).message));
  }, [id]);
  React.useEffect(() => end.current?.scrollIntoView({ behavior: "smooth", block: "end" }), [conv?.messages.length, busy]);

  async function send(intent: Intent, body?: string) {
    if (busy || !conv) return;
    const t = (body ?? text).trim();
    if (intent === "ask" && !t) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ message: TutorMessage; reply: TutorMessage; followUps: string[] }>(`student/tutor/conversations/${id}/messages`, { method: "POST", body: { text: t || undefined, intent } });
      setConv({ ...conv, messages: [...conv.messages, r.message, r.reply] });
      setFollowUps(r.followUps);
      setText("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const replace = (m: TutorMessage) => conv && setConv({ ...conv, messages: conv.messages.map((x) => (x.id === m.id ? m : x)) });
  const intentFor = (f: string): Intent => (/quiz/i.test(f) ? "quiz" : /example/i.test(f) ? "example" : /explain/i.test(f) ? "explain" : "ask");

  if (!conv) return <Card>{error ? <ErrorNote>{error}</ErrorNote> : <Loading label="Opening chat…" />}</Card>;
  return (
    <Card className="flex min-h-[70dvh] flex-col p-0 sm:p-0">
      <div className="flex items-center gap-3 border-b border-line px-4 py-3 sm:px-5">
        <Button variant="ghost" size="icon" className="lg:hidden" onClick={onBack} aria-label="Back to chats"><ArrowLeft className="h-4 w-4" /></Button>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{conv.title}</p>
          <p className="text-xs text-muted">{conv.aiEnabled ? "AI tutor · answers from your school’s notes first" : "Practice mode · AI switches on soon"}</p>
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-4 py-4 sm:px-5">
        {conv.messages.length === 0 ? (
          <div className="m-auto max-w-sm text-center text-sm text-muted">
            <Bot className="mx-auto mb-2 h-8 w-8 text-brand-500" />
            Ask a question about {conv.topic ?? conv.subject}, or tap a button below. I will help you work it out step by step.
          </div>
        ) : null}
        {conv.messages.map((m) => <Bubble key={m.id} m={m} onAnswered={replace} />)}
        {busy ? <p className="text-xs text-muted">Tutor is thinking…</p> : null}
        <div ref={end} />
      </div>
      <div className="border-t border-line px-4 py-3 sm:px-5">
        <ErrorNote className="mb-2">{error}</ErrorNote>
        <div className="scrollbar-none mb-2 flex gap-1.5 overflow-x-auto">
          {ACTIONS.map((a) => (
            <Button key={a.intent} size="sm" variant="secondary" disabled={busy} onClick={() => send(a.intent)}><a.icon className="h-3.5 w-3.5" /> {a.label}</Button>
          ))}
          {followUps.map((f) => (
            <Button key={f} size="sm" variant="outline" disabled={busy} onClick={() => send(intentFor(f), f)}>{f}</Button>
          ))}
        </div>
        <form
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void send("ask");
          }}
        >
          <Textarea
            rows={1}
            value={text}
            maxLength={1000}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send("ask");
              }
            }}
            placeholder="Type your question…"
            className="min-h-10 resize-none"
            aria-label="Your question"
          />
          <Button type="submit" size="icon" disabled={busy || !text.trim()} aria-label="Send"><Send className="h-4 w-4" /></Button>
        </form>
      </div>
    </Card>
  );
}

function NewChat({ onStarted }: { onStarted: (id: string) => void }) {
  const me = useStudent();
  const q = useSearchParams();
  const [subjectId, setSubjectId] = React.useState(q.get("subject") ?? me.subjects[0]?.id ?? "");
  const [topic, setTopic] = React.useState(q.get("topic") ?? "");
  const { data: topics } = useApi<TutorTopics>(subjectId ? `student/tutor/topics?subjectId=${subjectId}` : null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const termTopics = topics?.schemeOfWork.filter((t) => !topics.currentTerm || !t.termNumber || t.termNumber === topics.currentTerm) ?? [];
  const others = topics?.bankTopics.filter((b) => !termTopics.some((t) => t.topic.toLowerCase() === b.toLowerCase())) ?? [];

  async function start() {
    setBusy(true);
    setError(null);
    try {
      const c = await api<{ id: string }>("student/tutor/conversations", { method: "POST", body: { subjectId, topic: topic || undefined } });
      onStarted(c.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader title="New chat" subtitle="Pick a subject and a topic from your scheme of work." />
      <div className="flex flex-col gap-3">
        <div>
          <Label htmlFor="t-subject">Subject</Label>
          <Select id="t-subject" className="w-full" value={subjectId} onChange={(e) => { setSubjectId(e.target.value); setTopic(""); }}>
            {me.subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        </div>
        <div>
          <Label htmlFor="t-topic">Topic</Label>
          <Select id="t-topic" className="w-full" value={topic} onChange={(e) => setTopic(e.target.value)}>
            <option value="">Any topic</option>
            {termTopics.length ? (
              <optgroup label="This term’s scheme of work">
                {termTopics.map((t) => <option key={`${t.termNumber}-${t.week}`} value={t.topic}>Week {t.week}: {t.topic}</option>)}
              </optgroup>
            ) : null}
            {others.length ? (
              <optgroup label="Exam topics">
                {others.map((t) => <option key={t}>{t}</option>)}
              </optgroup>
            ) : null}
          </Select>
        </div>
        <ErrorNote>{error}</ErrorNote>
        <Button disabled={busy || !subjectId} onClick={start}><MessageSquarePlus className="h-4 w-4" /> {busy ? "Starting…" : "Start chat"}</Button>
      </div>
    </Card>
  );
}

function Tutor() {
  const router = useRouter();
  const q = useSearchParams();
  const open = q.get("c");
  const list = useApi<TutorConversationSummary[]>("student/tutor/conversations");
  const go = (id: string | null) => router.push(id ? `/student/tutor?c=${id}` : "/student/tutor");

  return (
    <>
      <PageHeader title="AI Tutor" subtitle="Your study partner for every subject. It explains, gives worked examples and quizzes you, and helps you find answers yourself." />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[320px_1fr]">
        <div className={cn("flex flex-col gap-5", open && "hidden lg:flex")}>
          <NewChat onStarted={(id) => { void list.reload(); go(id); }} />
          <Card>
            <CardHeader title="Recent chats" />
            {list.data?.length ? (
              <ul className="flex flex-col gap-1.5">
                {list.data.map((c) => (
                  <li key={c.id}>
                    <button onClick={() => go(c.id)} className={cn("w-full rounded-2xl px-3 py-2.5 text-left text-sm", c.id === open ? "bg-brand-50" : "hover:bg-canvas")}>
                      <span className="block truncate font-semibold">{c.topic ?? c.subject}</span>
                      <span className="text-xs text-muted">{c.subject} · {new Date(c.updatedAt).toLocaleDateString("en-NG", { day: "numeric", month: "short" })}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : list.data ? (
              <p className="text-sm text-muted">No chats yet.</p>
            ) : (
              <Loading />
            )}
          </Card>
        </div>
        <div className={cn("min-w-0", !open && "hidden lg:block")}>
          {open ? (
            <Chat id={open} onBack={() => go(null)} />
          ) : (
            <Card className="flex min-h-[50dvh] items-center justify-center">
              <Empty title="Start a chat" icon={Bot}>
                Choose a subject and topic. The tutor uses your school’s notes and scheme of work, and <Badge tone="brand">guides you</Badge> to the answer instead of just giving it.
              </Empty>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}

export default function Page() {
  return <Suspense fallback={<Loading />}><Tutor /></Suspense>;
}
