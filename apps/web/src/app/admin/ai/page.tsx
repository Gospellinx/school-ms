"use client";
import * as React from "react";
import { Bot, ShieldAlert, ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Async, Empty, ErrorNote, Loading } from "@/components/ui/feedback";
import { api, useApi } from "@/lib/api";
import type { AiOverview, TutorMessage } from "@/lib/types";
import { cn } from "@/lib/utils";

const FEATURE: Record<string, string> = {
  tutor: "Student tutor",
  explain: "Answer explanations",
  prep_plan: "Study plans",
  question_drafts: "Question drafts",
  report_comment: "Report card remarks",
  kb_answer: "Knowledge base answers",
  kb_transcribe: "Reading scans and photos",
  lesson_draft: "Lesson notes and plans",
  assessment_draft: "Tests and marking schemes",
  essay_marking: "Marking written answers",
};

const naira = (n: number) => `₦${n.toLocaleString("en-NG")}`;

function FlagThread({ id, onClose }: { id: string | null; onClose: () => void }) {
  const [thread, setThread] = React.useState<{ title: string; messages: (TutorMessage & { safety: string | null })[] } | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  React.useEffect(() => {
    setThread(null);
    if (id) api<typeof thread>(`ai/flags/${id}`).then(setThread, (e) => setError((e as Error).message));
  }, [id]);
  return (
    <Dialog open={Boolean(id)} onClose={onClose} title="Flagged conversation" subtitle="Shared with school leadership for safeguarding. Follow up with the student in person." wide>
      <ErrorNote>{error}</ErrorNote>
      {thread ? (
        <ol className="flex flex-col gap-2.5">
          {thread.messages.map((m) => (
            <li key={m.id} className={cn("rounded-2xl p-3 text-sm", m.role === "student" ? (m.safety ? "bg-rose-50" : "bg-canvas") : "bg-white ring-1 ring-line")}>
              <p className="mb-1 text-xs font-semibold text-muted uppercase">{m.role === "student" ? "Student" : "Tutor"} · {new Date(m.createdAt).toLocaleString("en-NG")}{m.safety ? ` · ${m.safety}` : ""}</p>
              <p className="whitespace-pre-line">{m.content}</p>
            </li>
          ))}
        </ol>
      ) : !error ? (
        <Loading />
      ) : null}
    </Dialog>
  );
}

export default function Page() {
  const { data, error } = useApi<AiOverview>("ai/overview");
  const [open, setOpen] = React.useState<string | null>(null);
  return (
    <>
      <PageHeader title="AI Usage & Safety" subtitle="What the AI tutor costs this month, and conversations that need an adult’s attention." />
      <Async data={data} error={error}>
        {(o) => (
          <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1fr_380px]">
            <div className="flex flex-col gap-5">
              <Card>
                <CardHeader
                  title="Safety flags"
                  subtitle="Messages that mentioned harm, abuse or unsafe topics. The student got a caring reply pointing them to a trusted adult."
                />
                {o.flags.length ? (
                  <ul className="flex flex-col gap-2">
                    {o.flags.map((f) => (
                      <li key={`${f.conversationId}-${f.at}`} className="flex flex-col gap-2 rounded-2xl bg-rose-50/70 p-3.5 text-sm sm:flex-row sm:items-center">
                        <ShieldAlert className="h-5 w-5 shrink-0 text-rose-600" />
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold">{f.student} <span className="font-normal text-muted">· {f.className} · {f.subject}</span></p>
                          <p className="mt-0.5 line-clamp-2 text-muted">“{f.message}”</p>
                          <p className="mt-1 text-xs text-muted">{new Date(f.at).toLocaleString("en-NG")} · <Badge tone={f.category === "safeguarding" ? "red" : "amber"}>{f.category}</Badge></p>
                        </div>
                        <Button size="sm" variant="outline" onClick={() => setOpen(f.conversationId)}>Read chat</Button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <Empty title="No flags" icon={ShieldCheck}>Nothing needs attention.</Empty>
                )}
              </Card>
              <Card>
                <CardHeader title="Tutor activity this month" />
                <div className="grid grid-cols-3 gap-3 text-center">
                  {[
                    ["Students", o.tutorActivity.students],
                    ["Chats", o.tutorActivity.conversations],
                    ["Questions asked", o.tutorActivity.messages],
                  ].map(([label, n]) => (
                    <div key={label as string} className="rounded-2xl bg-canvas p-4">
                      <p className="text-2xl font-bold">{n}</p>
                      <p className="text-xs text-muted">{label}</p>
                    </div>
                  ))}
                </div>
              </Card>
            </div>
            <div className="flex flex-col gap-5">
              <Card>
                <CardHeader title="AI allowance this month" subtitle={o.enabled ? "Claude is switched on." : "Not switched on yet: students get practice mode from your notes and question bank."} />
                <p className="text-3xl font-bold">{naira(o.budget.spentNaira)} <span className="text-base font-medium text-muted">of {naira(o.budget.capNaira)}</span></p>
                <Progress value={o.budget.capCents ? (o.budget.spentCents / o.budget.capCents) * 100 : 0} className="mt-3" />
                <p className="mt-2 text-xs text-muted">
                  ${(o.budget.spentCents / 100).toFixed(2)} of ${(o.budget.capCents / 100).toFixed(2)} at ₦{o.budget.usdToNgn}/$. AI pauses when the allowance is used up. Each student can use {o.studentDailyLimit} AI replies a day.
                </p>
              </Card>
              <Card>
                <CardHeader title="By feature" />
                {o.byFeature.length ? (
                  <ul className="flex flex-col gap-2 text-sm">
                    {o.byFeature.map((f) => (
                      <li key={f.feature} className="flex items-center justify-between">
                        <span>{FEATURE[f.feature] ?? f.feature} <span className="text-xs text-muted">· {f.calls} calls</span></span>
                        <span className="font-semibold">${(f.costCents / 100).toFixed(2)}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <Empty title="No AI use yet" icon={Bot} />
                )}
              </Card>
            </div>
          </div>
        )}
      </Async>
      <FlagThread id={open} onClose={() => setOpen(null)} />
    </>
  );
}
