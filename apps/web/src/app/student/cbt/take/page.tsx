"use client";
import * as React from "react";
import Link from "next/link";
import { Clock, Flag } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button, buttonClass } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cbtQuestions } from "@/lib/mock";
import { cn } from "@/lib/utils";

export default function TakeTest() {
  const [i, setI] = React.useState(0);
  const [answers, setAnswers] = React.useState<Record<number, number>>({});
  const [flags, setFlags] = React.useState<Record<number, boolean>>({});
  const [done, setDone] = React.useState(false);
  const q = cbtQuestions[i]!;
  const answered = Object.keys(answers).length;

  if (done) {
    const score = cbtQuestions.filter((x, k) => answers[k] === x.answer).length;
    return (
      <Card className="mx-auto mt-6 max-w-lg text-center">
        <p className="text-sm font-semibold text-brand-600">Test submitted</p>
        <p className="mt-2 text-6xl font-bold">{Math.round((score / cbtQuestions.length) * 100)}%</p>
        <p className="mt-2 text-muted">{score} of {cbtQuestions.length} correct</p>
        <div className="mt-6 flex justify-center gap-2">
          <Link href="/student/cbt" className={buttonClass("outline")}>Back to tests</Link>
          <Link href="/student/prep" className={buttonClass()}>Fix my mistakes</Link>
        </div>
      </Card>
    );
  }

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-muted">WAEC Mixed Mock</p>
          <h1 className="text-2xl font-bold tracking-tight">Question {i + 1} of {cbtQuestions.length}</h1>
        </div>
        <span className="flex items-center gap-2 rounded-2xl bg-white px-4 py-2.5 font-semibold text-brand-700"><Clock className="h-4 w-4" /> 23:41</span>
      </div>
      <Progress value={(answered / cbtQuestions.length) * 100} className="mb-5" />
      <div className="grid gap-5 lg:grid-cols-[1fr_260px]">
        <Card>
          <p className="text-xs font-semibold tracking-wide text-muted uppercase">{q.topic}</p>
          <p className="mt-2 text-lg font-semibold">{q.q}</p>
          <div className="mt-5 flex flex-col gap-2.5">
            {q.options.map((o, k) => (
              <button
                key={o}
                onClick={() => setAnswers({ ...answers, [i]: k })}
                className={cn(
                  "flex items-center gap-3 rounded-2xl border px-4 py-3.5 text-left font-medium transition-colors",
                  answers[i] === k ? "border-brand-500 bg-brand-50" : "border-line hover:border-brand-200",
                )}
              >
                <span className={cn("flex h-8 w-8 items-center justify-center rounded-xl text-sm font-bold", answers[i] === k ? "bg-brand-600 text-white" : "bg-canvas")}>{"ABCD"[k]}</span>
                {o}
              </button>
            ))}
          </div>
          <div className="mt-6 flex flex-wrap justify-between gap-2">
            <Button variant="ghost" onClick={() => setFlags({ ...flags, [i]: !flags[i] })}><Flag className={cn("h-4 w-4", flags[i] && "fill-amber-400 text-amber-500")} /> {flags[i] ? "Flagged" : "Flag for review"}</Button>
            <div className="flex gap-2">
              <Button variant="outline" disabled={i === 0} onClick={() => setI(i - 1)}>Previous</Button>
              {i < cbtQuestions.length - 1 ? <Button onClick={() => setI(i + 1)}>Next</Button> : <Button onClick={() => setDone(true)}>Submit</Button>}
            </div>
          </div>
        </Card>
        <Card className="h-fit">
          <p className="mb-3 font-semibold">Questions</p>
          <div className="grid grid-cols-5 gap-2">
            {cbtQuestions.map((_, k) => (
              <button
                key={k}
                onClick={() => setI(k)}
                className={cn(
                  "relative flex h-10 items-center justify-center rounded-xl text-sm font-semibold",
                  k === i ? "bg-brand-600 text-white" : answers[k] !== undefined ? "bg-brand-100 text-brand-700" : "bg-canvas",
                )}
              >
                {k + 1}
                {flags[k] ? <span className="absolute top-1 right-1 h-1.5 w-1.5 rounded-full bg-amber-500" /> : null}
              </button>
            ))}
          </div>
          <p className="mt-4 text-xs text-muted">{answered} answered · {cbtQuestions.length - answered} left</p>
          <Button className="mt-4 w-full" variant="secondary" onClick={() => setDone(true)}>Submit test</Button>
        </Card>
      </div>
    </div>
  );
}
