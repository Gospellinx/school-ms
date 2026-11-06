"use client";
import Link from "next/link";
import { BookOpen, Sparkles } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { buttonClass } from "@/components/ui/button";
import { Empty } from "@/components/ui/feedback";
import { useApi } from "@/lib/api";
import { useStudent } from "@/lib/session";
import { className, type PrepResponse } from "@/lib/types";
import { cn } from "@/lib/utils";

const covers = ["from-brand-200 to-brand-400", "from-orchid-200 to-orchid-400", "from-amber-100 to-orange-300", "from-emerald-100 to-emerald-300", "from-sky-100 to-sky-300"];

export default function Subjects() {
  const me = useStudent();
  const { data } = useApi<PrepResponse>("student/prep/plan?ai=false");
  const bySubject = new Map(data?.profile.subjects.map((s) => [s.subjectId, s]));
  return (
    <>
      <PageHeader title="My Subjects" subtitle={me.className ? className({ name: me.className, arm: me.arm }) : undefined} />
      {me.subjects.length === 0 ? (
        <Card><Empty title="No subjects yet">Your school adds subjects to your class.</Empty></Card>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {me.subjects.map((s, i) => {
            const p = bySubject.get(s.id);
            const score = p?.latestScore ?? null;
            return (
              <Card key={s.id} className="flex flex-col">
                <div className={cn("relative flex h-24 items-end rounded-2xl bg-gradient-to-br p-4", covers[i % covers.length])}>
                  <BookOpen className="absolute top-4 right-4 h-6 w-6 text-white/80" />
                  <Badge tone="gray" className="bg-white/80 text-ink">{s.code}</Badge>
                </div>
                <h3 className="mt-4 text-lg font-semibold">{s.name}</h3>
                <p className="text-sm text-muted">{p?.weakTopics[0] ? `Work on: ${p.weakTopics[0].topic}` : p?.belowCredit ? "Below a credit last term" : "No weak topics flagged"}</p>
                <div className="mt-4 mb-1.5 flex justify-between text-xs"><span className="text-muted">{p?.latestTerm ? `Last result · ${p.latestTerm}` : "No result yet"}</span><span className="font-semibold">{score === null ? "–" : `${Math.round(score)}%`}</span></div>
                <Progress value={score ?? 0} />
                <div className="mt-5 flex gap-2">
                  <Link href={`/student/prep?subject=${s.id}`} className={buttonClass("primary", "sm", "flex-1")}><Sparkles className="h-4 w-4" /> Practise</Link>
                  <Link href="/student/results" className={buttonClass("secondary", "sm", "flex-1")}>Results</Link>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
