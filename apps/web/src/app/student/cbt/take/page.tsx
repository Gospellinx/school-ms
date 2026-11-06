"use client";
import * as React from "react";
import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, Clock, Flag, Sparkles, XCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button, buttonClass } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ErrorNote, Loading } from "@/components/ui/feedback";
import { api } from "@/lib/api";
import type { Attempt } from "@/lib/types";
import { cn } from "@/lib/utils";

function clock(s: number) {
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

function TakeTest() {
  const q = useSearchParams();
  const testId = q.get("test");
  const attemptId = q.get("attempt");
  const [attempt, setAttempt] = React.useState<Attempt | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [i, setI] = React.useState(0);
  const [answers, setAnswers] = React.useState<Record<string, string>>({});
  const [flags, setFlags] = React.useState<Record<string, boolean>>({});
  const [left, setLeft] = React.useState<number | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const pending = React.useRef<Record<string, string>>({});
  const submitted = React.useRef(false);

  const load = React.useCallback((a: Attempt) => {
    setAttempt(a);
    setAnswers(Object.fromEntries(a.questions.filter((x) => x.chosen).map((x) => [x.id, x.chosen!])));
    setLeft(a.secondsLeft);
  }, []);

  React.useEffect(() => {
    (async () => {
      try {
        if (testId) load(await api<Attempt>(`student/tests/${testId}/start`, { method: "POST" }));
        else if (attemptId) load(await api<Attempt>(`student/attempts/${attemptId}`));
        else setError("No test chosen.");
      } catch (e) {
        setError((e as Error).message);
      }
    })();
  }, [testId, attemptId, load]);

  // Save answers a moment after the student picks, so nothing is lost if the browser closes.
  const flush = React.useCallback(async () => {
    if (!attempt || attempt.submitted || !Object.keys(pending.current).length) return;
    const batch = pending.current;
    pending.current = {};
    setSaving(true);
    try {
      await api(`student/attempts/${attempt.id}/answers`, { method: "PUT", body: { answers: batch } });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }, [attempt]);

  React.useEffect(() => {
    const t = setTimeout(() => void flush(), 800);
    return () => clearTimeout(t);
  }, [answers, flush]);

  const submit = React.useCallback(async () => {
    if (!attempt || submitted.current) return;
    submitted.current = true;
    setSubmitting(true);
    try {
      await flush();
      load(await api<Attempt>(`student/attempts/${attempt.id}/submit`, { method: "POST" }));
      setI(0);
    } catch (e) {
      submitted.current = false;
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }, [attempt, flush, load]);

  // The clock keeps running on the server; when it hits zero the test is handed in.
  React.useEffect(() => {
    if (left === null || attempt?.submitted) return;
    if (left <= 0) {
      void submit();
      return;
    }
    const t = setTimeout(() => setLeft(left - 1), 1000);
    return () => clearTimeout(t);
  }, [left, attempt?.submitted, submit]);

  if (error && !attempt) return <div className="mx-auto max-w-lg"><ErrorNote>{error}</ErrorNote><Link href="/student/cbt" className={buttonClass("outline", "md", "mt-4")}>Back to tests</Link></div>;
  if (!attempt) return <Loading label="Opening your test…" />;
  if (attempt.submitted) return <Review attempt={attempt} />;

  const qs = attempt.questions;
  const cur = qs[i]!;
  const answered = qs.filter((x) => answers[x.id]).length;

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-muted">{attempt.title}</p>
          <h1 className="text-2xl font-bold tracking-tight">Question {i + 1} of {qs.length}</h1>
        </div>
        <span className="flex items-center gap-3 text-sm text-muted">
          {saving ? "Saving…" : "Saved"}
          {left !== null ? <span className={cn("flex items-center gap-2 rounded-2xl bg-white px-4 py-2.5 font-semibold", left < 60 ? "text-rose-600" : "text-brand-700")}><Clock className="h-4 w-4" /> {clock(left)}</span> : null}
        </span>
      </div>
      <ErrorNote className="mb-4">{error}</ErrorNote>
      <Progress value={(answered / qs.length) * 100} className="mb-5" />
      <div className="grid gap-5 lg:grid-cols-[1fr_260px]">
        <Card>
          <p className="text-xs font-semibold tracking-wide text-muted uppercase">{cur.topic}</p>
          <p className="mt-2 text-lg font-semibold whitespace-pre-line">{cur.body}</p>
          <div className="mt-5 flex flex-col gap-2.5">
            {cur.options.map((o) => (
              <button
                key={o.key}
                onClick={() => {
                  pending.current[cur.id] = o.key;
                  setAnswers({ ...answers, [cur.id]: o.key });
                }}
                className={cn("flex items-center gap-3 rounded-2xl border px-4 py-3.5 text-left font-medium transition-colors", answers[cur.id] === o.key ? "border-brand-500 bg-brand-50" : "border-line hover:border-brand-200")}
              >
                <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-sm font-bold", answers[cur.id] === o.key ? "bg-brand-600 text-white" : "bg-canvas")}>{o.key}</span>
                {o.text}
              </button>
            ))}
          </div>
          <div className="mt-6 flex flex-wrap justify-between gap-2">
            <Button variant="ghost" onClick={() => setFlags({ ...flags, [cur.id]: !flags[cur.id] })}><Flag className={cn("h-4 w-4", flags[cur.id] && "fill-amber-400 text-amber-500")} /> {flags[cur.id] ? "Flagged" : "Flag for review"}</Button>
            <div className="flex gap-2">
              <Button variant="outline" disabled={i === 0} onClick={() => setI(i - 1)}>Previous</Button>
              {i < qs.length - 1 ? <Button onClick={() => setI(i + 1)}>Next</Button> : <Button disabled={submitting} onClick={() => confirm(`Submit now? ${qs.length - answered} questions are not answered.`) && void submit()}>Submit</Button>}
            </div>
          </div>
        </Card>
        <Card className="h-fit">
          <p className="mb-3 font-semibold">Questions</p>
          <div className="grid grid-cols-5 gap-2">
            {qs.map((x, k) => (
              <button
                key={x.id}
                onClick={() => setI(k)}
                className={cn("relative flex h-10 items-center justify-center rounded-xl text-sm font-semibold", k === i ? "bg-brand-600 text-white" : answers[x.id] ? "bg-brand-100 text-brand-700" : "bg-canvas")}
              >
                {k + 1}
                {flags[x.id] ? <span className="absolute top-1 right-1 h-1.5 w-1.5 rounded-full bg-amber-500" /> : null}
              </button>
            ))}
          </div>
          <p className="mt-4 text-xs text-muted">{answered} answered · {qs.length - answered} left</p>
          <Button className="mt-4 w-full" variant="secondary" disabled={submitting} onClick={() => confirm("Submit your answers now?") && void submit()}>{submitting ? "Submitting…" : "Submit"}</Button>
        </Card>
      </div>
    </div>
  );
}

function Review({ attempt }: { attempt: Attempt }) {
  const [explained, setExplained] = React.useState<Record<string, string>>({});
  const [busy, setBusy] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const r = attempt.result;
  const reveal = attempt.questions.some((q) => q.answer !== undefined);
  async function explain(qid: string) {
    setBusy(qid);
    setError(null);
    try {
      const e = await api<{ explanation: string }>(`student/prep/explain/${qid}`, { method: "POST" });
      setExplained({ ...explained, [qid]: e.explanation });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }
  return (
    <div className="mx-auto max-w-3xl">
      <Card className="text-center">
        <p className="text-sm font-semibold text-brand-600">{attempt.kind === "practice" ? "Practice submitted" : "Test submitted"}</p>
        {r ? (
          <>
            <p className="mt-2 text-6xl font-bold">{Math.round(r.percentage)}%</p>
            <p className="mt-2 text-muted">{r.score} of {r.maxScore} marks</p>
          </>
        ) : (
          <p className="mt-2 text-muted">Your teacher will share the results.</p>
        )}
        <div className="mt-6 flex justify-center gap-2">
          <Link href="/student/cbt" className={buttonClass("outline")}>Back to tests</Link>
          <Link href="/student/prep" className={buttonClass()}>Exam prep</Link>
        </div>
      </Card>
      {reveal ? (
        <div className="mt-5 flex flex-col gap-3">
          <ErrorNote>{error}</ErrorNote>
          {attempt.questions.map((q) => (
            <Card key={q.id}>
              <div className="flex items-start gap-3">
                {q.correct ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" /> : <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-rose-500" />}
                <div className="flex-1">
                  <p className="text-xs font-semibold text-muted uppercase">{q.number}. {q.topic}</p>
                  <p className="mt-1 font-semibold">{q.body}</p>
                  <ul className="mt-2 grid gap-1 text-sm">
                    {q.options.map((o) => (
                      <li key={o.key} className={cn("rounded-lg px-2 py-1", o.key === q.answer ? "bg-emerald-50 font-semibold text-emerald-800" : o.key === q.chosen ? "bg-rose-50 text-rose-700" : "")}>
                        {o.key}. {o.text}
                      </li>
                    ))}
                  </ul>
                  {explained[q.id] ? (
                    <p className="mt-3 rounded-2xl bg-brand-50 p-3 text-sm whitespace-pre-line">{explained[q.id]}</p>
                  ) : !q.correct ? (
                    <Button size="sm" variant="secondary" className="mt-3" disabled={busy === q.id} onClick={() => explain(q.id)}><Sparkles className="h-3.5 w-3.5" /> {busy === q.id ? "Explaining…" : "Explain this"}</Button>
                  ) : null}
                </div>
              </div>
            </Card>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export default function Page() {
  return <Suspense fallback={<Loading />}><TakeTest /></Suspense>;
}
