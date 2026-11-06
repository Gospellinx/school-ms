"use client";
import * as React from "react";
import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Lightbulb, Sparkles, Target } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Async, Empty, ErrorNote, Loading } from "@/components/ui/feedback";
import { api, useApi } from "@/lib/api";
import { useStudent } from "@/lib/session";
import type { Attempt, PrepResponse } from "@/lib/types";
import { cn } from "@/lib/utils";

function Prep() {
  const me = useStudent();
  const router = useRouter();
  const q = useSearchParams();
  const { data, error } = useApi<PrepResponse>("student/prep/plan?ai=true");
  const [subjectId, setSubjectId] = React.useState(q.get("subject") ?? "");
  const [count, setCount] = React.useState(10);
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  async function start() {
    setBusy(true);
    setErr(null);
    try {
      const a = await api<Attempt>("student/prep/practice", { method: "POST", body: { subjectId: subjectId || undefined, count } });
      router.push(`/student/cbt/take?attempt=${a.id}`);
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader title="Exam Prep" subtitle="Practice sets built from your weak topics, with the working shown for anything you miss." />
      <div className="grid gap-5 xl:grid-cols-[1fr_340px]">
        <div className="flex flex-col gap-5">
          <Card>
            <CardHeader title="Start a practice set" subtitle="Questions come from your school's bank and past WAEC, NECO and BECE papers." />
            <div className="flex flex-wrap items-center gap-2">
              <Select value={subjectId} onChange={(e) => setSubjectId(e.target.value)} aria-label="Subject">
                <option value="">My weakest topics (all subjects)</option>
                {me.subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
              <Select value={String(count)} onChange={(e) => setCount(Number(e.target.value))} aria-label="Number of questions">
                {[5, 10, 20, 30].map((n) => <option key={n} value={n}>{n} questions</option>)}
              </Select>
              <Button disabled={busy} onClick={start}><Sparkles className="h-4 w-4" /> {busy ? "Building…" : "Start practice"}</Button>
            </div>
            <ErrorNote className="mt-4">{err}</ErrorNote>
          </Card>

          <Async data={data} error={error} loadingLabel="Working out your study plan…">
            {({ plan, profile }) =>
              plan ? (
                <Card>
                  <CardHeader title="Your study plan" subtitle={`Aimed at ${profile.targetExam}`} />
                  <p className="text-sm">{plan.summary}</p>
                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    {plan.weeks.map((w) => (
                      <div key={w.week} className="rounded-2xl bg-canvas p-4">
                        <p className="mb-2 text-xs font-semibold text-muted uppercase">Week {w.week}</p>
                        <ul className="flex flex-col gap-2 text-sm">
                          {w.focus.map((f, k) => (
                            <li key={k}><span className="font-semibold">{f.subject}: {f.topic}</span><span className="block text-xs text-muted">{f.activities.join(" · ")}</span></li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                  {plan.tips.length ? <ul className="mt-4 list-disc space-y-1 pl-5 text-sm text-muted">{plan.tips.map((t) => <li key={t}>{t}</li>)}</ul> : null}
                </Card>
              ) : (
                <Card>
                  <CardHeader title="Where you stand" subtitle="From your released results and the tests you have taken" />
                  {profile.subjects.length ? (
                    <ul className="grid gap-2 md:grid-cols-2">
                      {[...profile.subjects].sort((a, b) => b.priority - a.priority).map((s) => (
                        <li key={s.subjectId} className="rounded-2xl bg-canvas p-3.5 text-sm">
                          <span className="flex items-center justify-between gap-2">
                            <span className="font-semibold">{s.subjectName}</span>
                            {s.latestScore !== null ? <Badge tone={s.belowCredit ? "red" : "brand"}>{Math.round(s.latestScore)}%</Badge> : <Badge tone="gray">No result</Badge>}
                          </span>
                          <span className="mt-1 block text-xs text-muted">{s.reasons.join(" · ") || "On track"}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <Empty title="Nothing to go on yet">Once results are released or you take a test, your plan shows here.</Empty>
                  )}
                  <p className="mt-4 text-xs text-muted">The AI study plan turns on when the school connects its AI key.</p>
                </Card>
              )
            }
          </Async>
        </div>

        <div className="flex flex-col gap-5">
          <Card className="bg-brand-600 text-white">
            <p className="text-sm text-white/80">Average, last results</p>
            <p className="mt-1 text-4xl font-bold">{data?.profile.overallAverage == null ? "–" : `${Math.round(data.profile.overallAverage)}%`}</p>
            <p className="mt-2 text-sm text-white/85">{data ? `${data.profile.subjects.filter((s) => s.belowCredit).length} subjects below a credit` : " "}</p>
          </Card>
          <Card>
            <CardHeader title="Weak topics" subtitle="From questions you got wrong" />
            {data ? (
              (() => {
                const topics = data.profile.subjects.flatMap((s) => s.weakTopics.map((t) => ({ ...t, subject: s.subjectName, subjectId: s.subjectId }))).sort((a, b) => a.accuracy - b.accuracy).slice(0, 6);
                return topics.length ? (
                  <ul className="flex flex-col gap-2">
                    {topics.map((t) => (
                      <li key={`${t.subjectId}:${t.topic}`}>
                        <button onClick={() => setSubjectId(t.subjectId)} className="flex w-full items-center gap-3 rounded-2xl bg-canvas p-3 text-left text-sm">
                          <Lightbulb className={cn("h-4 w-4 shrink-0", t.accuracy < 50 ? "text-amber-500" : "text-brand-500")} />
                          <span className="min-w-0 flex-1"><span className="block font-medium">{t.topic}</span><span className="text-xs text-muted">{t.subject}</span></span>
                          <span className="text-xs text-muted">{Math.round(t.accuracy)}%</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <Empty title="None yet" icon={Target}>Take a test or a practice set first.</Empty>
                );
              })()
            ) : (
              <Loading />
            )}
          </Card>
        </div>
      </div>
    </>
  );
}

export default function Page() {
  return <Suspense fallback={<Loading />}><Prep /></Suspense>;
}
