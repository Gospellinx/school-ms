"use client";
import * as React from "react";
import { Suspense } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { CheckCircle2, Clock, Flag } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ErrorNote, Loading } from "@/components/ui/feedback";
import { publicApi, recallKey, type ApplicantExam } from "@/lib/admissions";
import { cn } from "@/lib/utils";

function clock(s: number) {
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

/** The applicant's entrance exam: same flow as a student CBT test (autosave, server clock, auto-submit). */
function Exam() {
  const { slug } = useParams<{ slug: string }>();
  const q = useSearchParams();
  const ref = q.get("ref") ?? "";
  const key = q.get("key") ?? recallKey(ref) ?? "";
  const base = `schools/${slug}/applications/${encodeURIComponent(ref)}`;
  const auth = `key=${encodeURIComponent(key)}`;
  const [exam, setExam] = React.useState<ApplicantExam | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [i, setI] = React.useState(0);
  const [answers, setAnswers] = React.useState<Record<string, string>>({});
  const [flags, setFlags] = React.useState<Record<string, boolean>>({});
  const [left, setLeft] = React.useState<number | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const pending = React.useRef<Record<string, string>>({});
  const submitted = React.useRef(false);

  const load = React.useCallback((e: ApplicantExam) => {
    setExam(e);
    setAnswers(Object.fromEntries(e.questions.filter((x) => x.chosen).map((x) => [x.id, x.chosen!])));
    setLeft(e.secondsLeft);
  }, []);

  React.useEffect(() => {
    publicApi<ApplicantExam>(`${base}/exam/start?${auth}`, { method: "POST" }).then(load, (e: Error) => setError(e.message));
  }, [base, auth, load]);

  const flush = React.useCallback(async () => {
    if (!exam || exam.submitted || !Object.keys(pending.current).length) return;
    const batch = pending.current;
    pending.current = {};
    setSaving(true);
    try {
      await publicApi(`${base}/exam/answers?${auth}`, { method: "PUT", body: { answers: batch } });
    } catch (e) {
      pending.current = { ...batch, ...pending.current };
      setError(`${(e as Error).message}. Your answers will be saved again shortly.`);
    } finally {
      setSaving(false);
    }
  }, [exam, base, auth]);

  React.useEffect(() => {
    const t = setTimeout(() => void flush(), 800);
    return () => clearTimeout(t);
  }, [answers, flush]);

  const submit = React.useCallback(async () => {
    if (!exam || submitted.current) return;
    submitted.current = true;
    setSubmitting(true);
    try {
      await flush();
      load(await publicApi<ApplicantExam>(`${base}/exam/submit?${auth}`, { method: "POST" }));
    } catch (e) {
      submitted.current = false;
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }, [exam, flush, load, base, auth]);

  React.useEffect(() => {
    if (left === null || exam?.submitted) return;
    if (left <= 0) {
      void submit();
      return;
    }
    const t = setTimeout(() => setLeft(left - 1), 1000);
    return () => clearTimeout(t);
  }, [left, exam?.submitted, submit]);

  const back = `/s/${slug}/application?ref=${encodeURIComponent(ref)}&key=${encodeURIComponent(key)}`;
  if (error && !exam) return <div className="mx-auto max-w-lg p-6"><ErrorNote>{error}</ErrorNote><Link href={back} className="mt-4 inline-block text-sm font-semibold text-brand-700">Back to the application</Link></div>;
  if (!exam) return <Loading label="Opening the exam…" />;
  if (exam.submitted)
    return (
      <main className="flex min-h-screen items-center justify-center bg-canvas p-4">
        <Card className="w-full max-w-md text-center">
          <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600" />
          <h1 className="mt-4 text-2xl font-bold">Exam submitted</h1>
          <p className="mt-2 text-sm text-muted">Well done, {exam.childName.split(" ")[0]}. {exam.schoolName} will review the result and email your parent with a decision.</p>
          <Link href={back} className="mt-6 inline-flex h-11 items-center justify-center rounded-2xl bg-brand-600 px-5 font-semibold text-white">Back to the application</Link>
        </Card>
      </main>
    );

  const qs = exam.questions;
  const cur = qs[i]!;
  const answered = qs.filter((x) => answers[x.id]).length;
  const subjects = [...new Set(qs.map((x) => x.subject))];

  return (
    <main className="min-h-screen bg-canvas px-4 py-6 sm:px-6">
      <div className="mx-auto max-w-5xl">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm text-muted">{exam.schoolName} · {exam.title}</p>
            <h1 className="text-2xl font-bold tracking-tight">Question {i + 1} of {qs.length}</h1>
            <p className="text-sm text-muted">{exam.childName}</p>
          </div>
          <span className="flex items-center gap-3 text-sm text-muted">
            {saving ? "Saving…" : "Saved"}
            {left !== null ? <span className={cn("flex items-center gap-2 rounded-2xl bg-white px-4 py-2.5 font-semibold", left < 60 ? "text-rose-600" : "text-brand-700")}><Clock className="h-4 w-4" /> {clock(left)}</span> : null}
          </span>
        </div>
        <ErrorNote className="mb-4">{error}</ErrorNote>
        <Progress value={(answered / qs.length) * 100} className="mb-5" />
        {subjects.length > 1 ? (
          <div className="scrollbar-none mb-4 flex gap-1 overflow-x-auto rounded-2xl bg-white p-1" role="tablist" aria-label="Subjects">
            {subjects.map((s) => {
              const first = qs.findIndex((x) => x.subject === s);
              const total = qs.filter((x) => x.subject === s).length;
              const done = qs.filter((x) => x.subject === s && answers[x.id]).length;
              return (
                <button key={s} role="tab" aria-selected={cur.subject === s} onClick={() => setI(first)} className={cn("h-9 shrink-0 rounded-xl px-3 text-sm font-semibold", cur.subject === s ? "bg-brand-600 text-white" : "text-muted")}>
                  {s} <span className="text-xs opacity-80">{done}/{total}</span>
                </button>
              );
            })}
          </div>
        ) : null}
        <div className="grid gap-5 lg:grid-cols-[1fr_260px]">
          <Card>
            <p className="text-xs font-semibold tracking-wide text-muted uppercase">{cur.subject}</p>
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
                <button key={x.id} onClick={() => setI(k)} className={cn("relative flex h-10 items-center justify-center rounded-xl text-sm font-semibold", k === i ? "bg-brand-600 text-white" : answers[x.id] ? "bg-brand-100 text-brand-700" : "bg-canvas")}>
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
    </main>
  );
}

export default function Page() {
  return <Suspense fallback={<Loading />}><Exam /></Suspense>;
}
