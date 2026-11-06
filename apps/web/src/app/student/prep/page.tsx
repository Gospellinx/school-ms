"use client";
import * as React from "react";
import { Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Bot, CalendarClock, Gauge, Timer, Target } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { Button, buttonClass } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { Badge, type Tone } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs } from "@/components/ui/tabs";
import { Async, Empty, ErrorNote, Loading, SuccessNote } from "@/components/ui/feedback";
import { api, useApi } from "@/lib/api";
import { useAction } from "@/lib/useAction";
import type { Attempt, ExamCode, ExamOverview, ExamPlan, ExamTopic, ReadinessBand } from "@/lib/types";
import { cn } from "@/lib/utils";

const BAND: Record<ReadinessBand, { label: string; tone: Tone }> = {
  on_track: { label: "On track", tone: "green" },
  borderline: { label: "Borderline", tone: "amber" },
  at_risk: { label: "At risk", tone: "red" },
  unknown: { label: "Not enough data", tone: "gray" },
};

const fmtDate = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" });

type Exam = ExamOverview["exams"][number];

function GoalForm({ exam, subjects, onSaved }: { exam: Exam; subjects: ExamOverview["subjects"]; onSaved: () => void }) {
  const [picked, setPicked] = React.useState<string[]>(exam.goal?.subjectIds ?? subjects.filter((s) => exam.compulsorySubjectCodes.includes(s.code)).map((s) => s.id));
  const [date, setDate] = React.useState(exam.goal?.examDate ?? exam.suggestedDate);
  const act = useAction();
  const jamb = exam.code === "jamb";
  const toggle = (id: string) => setPicked(picked.includes(id) ? picked.filter((x) => x !== id) : jamb && picked.length >= 4 ? picked : [...picked, id]);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Label>{jamb ? "Your four UTME subjects (Use of English is compulsory)" : "Subjects you are writing"}</Label>
        <div className="flex flex-wrap gap-2">
          {subjects.map((s) => {
            const on = picked.includes(s.id);
            const count = exam.questionsBySubject[s.id] ?? 0;
            return (
              <button key={s.id} type="button" onClick={() => toggle(s.id)} className={cn("rounded-xl border px-3 py-2 text-sm font-medium", on ? "border-brand-500 bg-brand-50 text-brand-800" : "border-line")}>
                {s.name} <span className="text-xs text-muted">· {count} q</span>
              </button>
            );
          })}
        </div>
      </div>
      <div className="max-w-xs">
        <Label htmlFor="exam-date">Exam date</Label>
        <Input id="exam-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <p className="mt-1 text-xs text-muted">Usual date shown. Change it when the timetable is out.</p>
      </div>
      <ErrorNote>{act.error}</ErrorNote>
      <SuccessNote>{act.notice}</SuccessNote>
      <Button className="self-start" disabled={act.busy || !picked.length} onClick={() => act.run(() => api("student/exams/goal", { method: "PUT", body: { exam: exam.code, examDate: date, subjectIds: picked } }), "Saved. Your plan is updated.").then((r) => r && onSaved())}>
        Save my exam plan
      </Button>
    </div>
  );
}

function MockCard({ exam, subjects }: { exam: Exam; subjects: ExamOverview["subjects"] }) {
  const router = useRouter();
  const goalSubjects = exam.goal?.subjectIds ?? [];
  const [subjectId, setSubjectId] = React.useState(goalSubjects[0] ?? subjects[0]?.id ?? "");
  const act = useAction();
  const jamb = exam.code === "jamb";
  async function start(size: "short" | "full") {
    const a = await act.run(() => api<Attempt>("student/exams/mock", { method: "POST", body: { exam: exam.code, size, subjectIds: jamb ? undefined : [subjectId] } }));
    if (a) router.push(`/student/cbt/take?attempt=${a.id}`);
  }
  const shortQs = Math.round(exam.fullMock.questions / 4);
  return (
    <Card>
      <CardHeader title="Timed mock exam" subtitle={jamb ? "Four subjects in one sitting, like the UTME CBT centre." : "One paper, timed like the real objective paper."} />
      {!jamb ? (
        <Select className="mb-3 w-full" value={subjectId} onChange={(e) => setSubjectId(e.target.value)} aria-label="Subject">
          {subjects.map((s) => <option key={s.id} value={s.id}>{s.name} ({exam.questionsBySubject[s.id] ?? 0} questions)</option>)}
        </Select>
      ) : !exam.goal ? (
        <p className="mb-3 text-sm text-amber-700">Choose your four subjects first.</p>
      ) : null}
      <div className="flex flex-col gap-2">
        <Button variant="secondary" disabled={act.busy || (jamb && !exam.goal)} onClick={() => start("short")}><Timer className="h-4 w-4" /> Short mock · ~{shortQs} q</Button>
        <Button disabled={act.busy || (jamb && !exam.goal)} onClick={() => start("full")}><Timer className="h-4 w-4" /> Full · {exam.fullMock.questions} q, {exam.fullMock.minutes} min</Button>
      </div>
      <p className="mt-2 text-xs text-muted">Short mocks keep the real pace and use less data. Answers save as you go.</p>
      <ErrorNote className="mt-3">{act.error}</ErrorNote>
    </Card>
  );
}

function Topics({ exam, subjects }: { exam: ExamCode; subjects: ExamOverview["subjects"] }) {
  const router = useRouter();
  const [subjectId, setSubjectId] = React.useState(subjects[0]?.id ?? "");
  const topics = useApi<ExamTopic[]>(subjectId ? `student/exams/topics?exam=${exam}&subjectId=${subjectId}` : null);
  const act = useAction();
  async function practise(topic: string) {
    const a = await act.run(() => api<Attempt>("student/prep/practice", { method: "POST", body: { subjectId, topic, exam, count: 10 } }));
    if (a) router.push(`/student/cbt/take?attempt=${a.id}`);
  }
  return (
    <Card>
      <CardHeader
        title="Practise by topic"
        subtitle="Weakest first. Marked straight away, with the working shown."
        action={
          <Select value={subjectId} onChange={(e) => setSubjectId(e.target.value)} aria-label="Subject">
            {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        }
      />
      <ErrorNote className="mb-3">{act.error}</ErrorNote>
      <Async data={topics.data} error={topics.error}>
        {(list) =>
          list.length ? (
            <ul className="grid gap-2 md:grid-cols-2">
              {list.map((t) => (
                <li key={t.topic} className="flex items-center gap-3 rounded-2xl bg-canvas p-3 text-sm">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{t.topic}</p>
                    <p className="text-xs text-muted">
                      {t.accuracy === null ? "Not tried yet" : `${t.accuracy}% right of ${t.attempted}`} · {t.questions} questions{t.inSchemeOfWork ? " · in your scheme of work" : ""}
                    </p>
                    {t.accuracy !== null ? <Progress value={t.accuracy} className="mt-1.5 h-1.5" /> : null}
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Link href={`/student/tutor?subject=${subjectId}&topic=${encodeURIComponent(t.topic)}`} className={buttonClass("ghost", "icon")} aria-label={`Ask the tutor about ${t.topic}`}><Bot className="h-4 w-4" /></Link>
                    <Button size="sm" variant="secondary" disabled={act.busy || t.questions < 1} onClick={() => practise(t.topic)}>Practise</Button>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <Empty title="No questions yet" icon={Target}>Your teachers have not added questions for this subject yet.</Empty>
          )
        }
      </Async>
    </Card>
  );
}

function ExamPanel({ exam, overview, reload }: { exam: Exam; overview: ExamOverview; reload: () => void }) {
  const plan = useApi<ExamPlan>(`student/exams/plan?exam=${exam.code}`);
  const [allWeeks, setAllWeeks] = React.useState(false);
  const [editing, setEditing] = React.useState(false);
  const r = plan.data?.readiness;
  const cd = plan.data?.countdown;
  const goalSubjects = exam.goal ? overview.subjects.filter((s) => exam.goal!.subjectIds.includes(s.id)) : overview.subjects;

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
        <Card className="bg-brand-600 text-white">
          <p className="flex items-center gap-2 text-sm text-white/80"><CalendarClock className="h-4 w-4" /> {exam.name}</p>
          <p className="mt-1 text-4xl font-bold">{cd ? `${cd.daysLeft} days` : "–"}</p>
          <p className="mt-1 text-sm text-white/85">{cd ? `to ${fmtDate(cd.examDate)}` : " "}</p>
          <button className="mt-3 text-sm font-semibold underline underline-offset-4" onClick={() => setEditing(!editing)}>{exam.goal ? "Change subjects or date" : "Set my subjects and date"}</button>
        </Card>
        <Card>
          <p className="flex items-center gap-2 text-sm text-muted"><Gauge className="h-4 w-4" /> Predicted readiness</p>
          {r ? (
            <>
              <p className="mt-1 text-4xl font-bold">{r.jambAggregate !== null ? `${r.jambAggregate}/400` : r.overall !== null ? `${r.overall}%` : "–"}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <Badge tone={BAND[r.band].tone}>{BAND[r.band].label}</Badge>
                {exam.code !== "jamb" ? <Badge tone="gray">{r.creditsLikely} credits likely</Badge> : null}
              </div>
              <p className="mt-2 text-xs text-muted">From your mocks, school results and practice. A guide, not a promise.</p>
            </>
          ) : (
            <Loading />
          )}
        </Card>
        <MockCard exam={exam} subjects={goalSubjects} />
      </div>

      {editing || !exam.goal ? (
        <Card>
          <CardHeader title={exam.goal ? "Change your exam plan" : `Plan for ${exam.name}`} subtitle="Pick your subjects and the exam date, and you get a week-by-week plan to exam day." />
          <GoalForm exam={exam} subjects={overview.subjects} onSaved={() => { setEditing(false); reload(); void plan.reload(); }} />
        </Card>
      ) : null}

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1fr_360px]">
        <div className="flex flex-col gap-5">
          <Card>
            <CardHeader title="Your plan to exam day" subtitle="Weak topics first, a timed mock every third week, revision at the end." />
            <Async data={plan.data} error={plan.error} loadingLabel="Building your plan…">
              {(p) => (
                <ol className="flex flex-col gap-2.5">
                  {p.countdown.weeks.slice(0, allWeeks ? undefined : 6).map((w) => (
                    <li key={w.week} className="rounded-2xl bg-canvas p-3.5 text-sm">
                      <p className="flex items-center justify-between text-xs font-semibold text-muted uppercase">
                        <span>Week {w.week} · from {fmtDate(w.startsOn)}</span>
                        {w.mock ? <Badge tone="orchid">Mock week</Badge> : null}
                      </p>
                      <ul className="mt-1.5 flex flex-wrap gap-1.5">
                        {w.focus.map((f, k) => (
                          <li key={k} className={cn("rounded-lg px-2 py-1 text-xs font-medium", f.kind === "fix" ? "bg-rose-50 text-rose-700" : f.kind === "revise" ? "bg-sky-50 text-sky-700" : "bg-white")}>
                            {f.subject}: {f.topic}
                          </li>
                        ))}
                      </ul>
                    </li>
                  ))}
                  {p.countdown.weeks.length > 6 ? (
                    <Button variant="ghost" onClick={() => setAllWeeks(!allWeeks)}>{allWeeks ? "Show less" : `Show all ${p.countdown.weeks.length} weeks`}</Button>
                  ) : null}
                </ol>
              )}
            </Async>
          </Card>
          <Topics exam={exam.code} subjects={goalSubjects} />
        </div>
        <div className="flex flex-col gap-5">
          <Card>
            <CardHeader title="By subject" />
            {r ? (
              <ul className="flex flex-col gap-2">
                {r.subjects.map((s) => (
                  <li key={s.subjectId} className="flex items-center justify-between gap-2 rounded-2xl bg-canvas p-3 text-sm">
                    <span className="min-w-0">
                      <span className="block truncate font-semibold">{s.subjectName}</span>
                      <span className="text-xs text-muted">{s.confidence} confidence</span>
                    </span>
                    <span className="flex items-center gap-1.5">
                      {s.grade ? <span className="font-bold">{s.grade}</span> : null}
                      <Badge tone={BAND[s.band].tone}>{s.predicted === null ? "–" : `${s.predicted}%`}</Badge>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <Loading />
            )}
          </Card>
          <Card>
            <CardHeader title="Recent mocks" />
            {overview.recentMocks.filter((m) => m.exam === exam.code).length ? (
              <ul className="flex flex-col gap-2">
                {overview.recentMocks.filter((m) => m.exam === exam.code).map((m) => (
                  <li key={m.id}>
                    <Link href={`/student/cbt/take?attempt=${m.id}`} className="flex items-center justify-between rounded-2xl bg-canvas p-3 text-sm hover:bg-brand-50">
                      <span className="min-w-0"><span className="block truncate font-semibold">{m.subjects.join(", ")}</span><span className="text-xs text-muted">{new Date(m.submittedAt).toLocaleDateString("en-NG")}</span></span>
                      <Badge>{Math.round(m.percentage ?? 0)}%</Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">No mocks yet. Try a short one.</p>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

function Prep() {
  const q = useSearchParams();
  const router = useRouter();
  const overview = useApi<ExamOverview>("student/exams");
  const exams = overview.data?.exams ?? [];
  const current = exams.find((e) => e.code === q.get("exam")) ?? exams.find((e) => e.goal) ?? exams[0];

  return (
    <>
      <PageHeader title="Exam Prep" subtitle="WAEC, NECO, JAMB and BECE practice from your school’s question bank, timed mocks and a plan to exam day." />
      <Async data={overview.data} error={overview.error} loadingLabel="Loading your exams…">
        {(o) =>
          current ? (
            <div className="flex flex-col gap-5">
              {exams.length > 1 ? (
                <Tabs tabs={exams.map((e) => e.name)} value={current.name} onChange={(name) => router.replace(`/student/prep?exam=${exams.find((e) => e.name === name)!.code}`)} />
              ) : null}
              <ExamPanel key={current.code} exam={current} overview={o} reload={overview.reload} />
            </div>
          ) : (
            <Card>
              <Empty title="No external exam for your class yet" icon={Target}>
                Exam prep starts in JSS for BECE and in SS for WAEC, NECO and JAMB. Use the AI tutor for your school subjects.
              </Empty>
            </Card>
          )
        }
      </Async>
    </>
  );
}

export default function Page() {
  return <Suspense fallback={<Loading />}><Prep /></Suspense>;
}
