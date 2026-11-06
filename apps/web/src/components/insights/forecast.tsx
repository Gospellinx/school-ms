"use client";
import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, ArrowLeft, BookOpenCheck, GraduationCap, RefreshCw, Target, TrendingUp, Users } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button, buttonClass } from "@/components/ui/button";
import { Tabs } from "@/components/ui/tabs";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { Async, Empty } from "@/components/ui/feedback";
import { StatCard } from "@/components/widgets/stat-card";
import { useApi } from "@/lib/api";
import { BAND, EXAM_SHORT, type Band, type ClassForecastView, type CohortForecast, type ExamCode, type SchoolForecastView, type StudentForecast } from "@/lib/insights";
import { cn } from "@/lib/utils";

/** A compact subject label for grade chips: Maths, Eng, Phys, Chem. */
const short = (name: string) => (/^math/i.test(name) ? "Maths" : name.split(" ")[0].slice(0, 4));

const BANDS: Band[] = ["on_track", "borderline", "at_risk", "unknown"];

/** One bar split into on track / borderline / at risk / no evidence. */
export function BandBar({ bands, className }: { bands: Record<Band, number>; className?: string }) {
  const total = BANDS.reduce((n, b) => n + bands[b], 0);
  if (!total) return <div className={cn("h-2.5 rounded-full bg-canvas", className)} />;
  return (
    <div className={cn("flex h-2.5 w-full overflow-hidden rounded-full bg-canvas", className)} title={BANDS.map((b) => `${BAND[b].label}: ${bands[b]}`).join(" · ")}>
      {BANDS.map((b) => (bands[b] ? <div key={b} style={{ width: `${(bands[b] / total) * 100}%`, background: BAND[b].color }} /> : null))}
    </div>
  );
}

function BandLegend({ bands }: { bands: Record<Band, number> }) {
  return (
    <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
      {BANDS.map((b) => (
        <li key={b} className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: BAND[b].color }} /> {BAND[b].label} <span className="font-semibold text-ink">{bands[b]}</span>
        </li>
      ))}
    </ul>
  );
}

const rate = (f: CohortForecast) => (f.projectedRate ? (f.projectedRate.low === f.projectedRate.high ? `${f.projectedRate.low}%` : `${f.projectedRate.low}–${f.projectedRate.high}%`) : "–");
const score = (n: number | null) => (n === null ? "–" : `${n}%`);

function Meter({ value }: { value: number | null }) {
  if (value === null) return <span className="text-muted">–</span>;
  const color = value >= 65 ? "bg-emerald-500" : value >= 50 ? "bg-amber-400" : "bg-rose-500";
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-20 overflow-hidden rounded-full bg-canvas">
        <div className={cn("h-full rounded-full", color)} style={{ width: `${Math.min(100, value)}%` }} />
      </div>
      <span className="w-9 text-right text-xs font-semibold tabular-nums">{value}%</span>
    </div>
  );
}

function Risks({ s }: { s: StudentForecast }) {
  if (!s.risks.length) return <span className="text-xs text-muted">None</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {s.risks.map((r) => (
        <Badge key={r.code} tone={r.severity === "high" ? "red" : "amber"} className="whitespace-normal">{r.label}</Badge>
      ))}
    </div>
  );
}

function Benchmark({ v }: { v: boolean | null }) {
  return v === true ? <Badge tone="green">On course</Badge> : v === false ? <Badge tone="red">Off course</Badge> : <Badge tone="gray">Not sure yet</Badge>;
}

function ExamTabs({ exams, exam, onChange }: { exams: ExamCode[]; exam: ExamCode; onChange: (e: ExamCode) => void }) {
  if (exams.length < 2) return null;
  return <Tabs tabs={exams.map((e) => EXAM_SHORT[e])} value={EXAM_SHORT[exam]} onChange={(t) => onChange(exams.find((e) => EXAM_SHORT[e] === t)!)} />;
}

const HOW =
  "Each prediction mixes the student's recent mock exams (half the weight), latest released school results and practice accuracy, the same way students see it on their Exam Prep page. It is a guide for planning support, not a promise.";

function SchoolView({ base, exam, setExam }: { base: string; exam: ExamCode | null; setExam: (e: ExamCode) => void }) {
  const [refresh, setRefresh] = React.useState(0);
  const { data, error, loading } = useApi<SchoolForecastView>(`insights/forecast${exam ? `?exam=${exam}` : ""}${refresh ? `${exam ? "&" : "?"}fresh=1&r=${refresh}` : ""}`);
  return (
    <>
      <PageHeader
        title="Exam Forecast"
        subtitle={data?.scope === "teacher" ? "How your classes are heading for their external exams, and who needs help now." : "How every class is heading for WAEC, NECO, JAMB and BECE, and who needs help now."}
        actions={
          <Button variant="outline" size="sm" onClick={() => setRefresh((n) => n + 1)} disabled={loading}>
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} /> Refresh
          </Button>
        }
      />
      <Async data={data} error={error} loadingLabel="Working out the forecast…">
        {(f) =>
          !f.exam ? (
            <Card><Empty title="No exam classes" icon={GraduationCap}>Forecasts cover junior and senior secondary classes. Add a JSS or SS class to see one.</Empty></Card>
          ) : (
            <div className="flex flex-col gap-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <ExamTabs exams={f.exams} exam={f.exam} onChange={setExam} />
                <p className="text-xs text-muted">Target: {f.benchmark} · updated {new Date(f.generatedAt).toLocaleTimeString("en-NG", { hour: "2-digit", minute: "2-digit" })}</p>
              </div>
              <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                <StatCard icon={Target} label={`Projected to reach the ${EXAM_SHORT[f.exam]} target`} value={rate(f.summary)} tone="green" />
                <StatCard icon={TrendingUp} label="Average predicted score" value={score(f.summary.average)} />
                <StatCard icon={AlertTriangle} label="Candidates needing attention" value={String(f.atRisk.length)} tone="amber" />
                <StatCard icon={Users} label="Candidates with evidence" value={`${f.summary.withEvidence} / ${f.summary.students}`} tone="orchid" />
              </div>
              {f.summary.students ? (
                <Card>
                  <CardHeader title="Where candidates stand" subtitle={`${f.summary.benchmark.likely} on course for ${f.benchmark}, ${f.summary.benchmark.undecided} not sure yet, ${f.summary.benchmark.unlikely} off course.`} />
                  <BandBar bands={f.summary.bands} className="h-4" />
                  <BandLegend bands={f.summary.bands} />
                </Card>
              ) : null}

              <div className="grid grid-cols-1 gap-5 2xl:grid-cols-2">
                <Card>
                  <CardHeader title="Classes" subtitle="Open a class for each student and the topics to reteach." />
                  {f.classes.length ? (
                    <Table>
                      <THead>
                        <tr><TH>Class</TH><TH>Candidates</TH><TH>Average</TH><TH className="w-40">Spread</TH><TH>On course</TH><TH /></tr>
                      </THead>
                      <tbody>
                        {f.classes.map((c) => (
                          <TR key={c.id}>
                            <TD className="font-semibold">{c.label}</TD>
                            <TD>{c.forecast.students}</TD>
                            <TD><Meter value={c.forecast.average} /></TD>
                            <TD><BandBar bands={c.forecast.bands} /></TD>
                            <TD className="font-semibold">{rate(c.forecast)}</TD>
                            <TD className="text-right"><Link className={buttonClass("outline", "sm")} href={`${base}/forecast?exam=${f.exam}&class=${c.id}`}>Open</Link></TD>
                          </TR>
                        ))}
                      </tbody>
                    </Table>
                  ) : (
                    <Empty title="No classes for this exam" />
                  )}
                </Card>
                <Card>
                  <CardHeader title="Subjects, weakest first" subtitle="Share of candidates predicted at credit (50%) or better." />
                  {f.summary.subjects.length ? (
                    <Table>
                      <THead><tr><TH>Subject</TH><TH>Average</TH><TH>Credit rate</TH><TH>Below credit</TH></tr></THead>
                      <tbody>
                        {f.summary.subjects.map((s) => (
                          <TR key={s.subjectId}>
                            <TD className="font-semibold">{s.subjectName}</TD>
                            <TD><Meter value={s.average} /></TD>
                            <TD>{s.creditRate === null ? "–" : `${s.creditRate}%`} <span className="text-xs text-muted">of {s.students}</span></TD>
                            <TD>{s.atRisk ? <Badge tone="red">{s.atRisk}</Badge> : <span className="text-muted">0</span>}</TD>
                          </TR>
                        ))}
                      </tbody>
                    </Table>
                  ) : (
                    <Empty title="No subjects yet" />
                  )}
                </Card>
              </div>

              <Card>
                <CardHeader title="Needs attention" subtitle="Candidates with a warning sign: predicted below credit, falling results, or missing school." />
                {f.atRisk.length ? (
                  <Table>
                    <THead><tr><TH>Student</TH><TH>Class</TH><TH>Predicted</TH><TH>Target</TH><TH>Why</TH></tr></THead>
                    <tbody>
                      {f.atRisk.map((s) => (
                        <TR key={s.studentId}>
                          <TD><p className="font-semibold">{s.name}</p><p className="text-xs text-muted">{s.admissionNumber}</p></TD>
                          <TD>{s.className}</TD>
                          <TD><Meter value={s.overall} /></TD>
                          <TD><Benchmark v={s.meetsBenchmark} /></TD>
                          <TD><Risks s={s} /></TD>
                        </TR>
                      ))}
                    </tbody>
                  </Table>
                ) : (
                  <Empty title="Nobody flagged" icon={BookOpenCheck}>No candidate has a warning sign right now.</Empty>
                )}
              </Card>

              {f.teachers.length ? (
                <Card>
                  <CardHeader title={f.scope === "teacher" ? "My subjects" : "Teachers and subjects"} subtitle="Predicted results of the candidates each teacher takes, subject by subject." />
                  <Table>
                    <THead><tr><TH>Teacher</TH><TH>Subject</TH><TH>Classes</TH><TH>Average</TH><TH>Credit rate</TH></tr></THead>
                    <tbody>
                      {f.teachers.map((t) => (
                        <TR key={`${t.teacherId}-${t.subjectName}`}>
                          <TD className="font-semibold">{t.teacherName}</TD>
                          <TD>{t.subjectName}</TD>
                          <TD className="text-muted">{t.classes.join(", ")}</TD>
                          <TD><Meter value={t.average} /></TD>
                          <TD>{t.creditRate === null ? "–" : `${t.creditRate}%`} <span className="text-xs text-muted">of {t.students}</span></TD>
                        </TR>
                      ))}
                    </tbody>
                  </Table>
                </Card>
              ) : null}
              <p className="text-xs text-muted">{HOW}</p>
            </div>
          )
        }
      </Async>
    </>
  );
}

function ClassView({ base, classId, exam, setExam }: { base: string; classId: string; exam: ExamCode | null; setExam: (e: ExamCode) => void }) {
  const { data, error } = useApi<ClassForecastView>(`insights/forecast/classes/${classId}${exam ? `?exam=${exam}` : ""}`);
  return (
    <>
      <PageHeader
        title={data ? `${data.class.label} forecast` : "Class forecast"}
        subtitle={data ? `${data.examName}: target is ${data.benchmark}.` : undefined}
        actions={<Link href={`${base}/forecast${exam ? `?exam=${exam}` : ""}`} className={buttonClass("outline", "sm")}><ArrowLeft className="h-4 w-4" /> All classes</Link>}
      />
      <Async data={data} error={error} loadingLabel="Working out the forecast…">
        {(c) => (
          <div className="flex flex-col gap-5">
            <div><ExamTabs exams={c.exams} exam={c.exam} onChange={setExam} /></div>
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <StatCard icon={Target} label="Projected to reach the target" value={rate(c.forecast)} tone="green" />
              <StatCard icon={TrendingUp} label="Average predicted score" value={score(c.forecast.average)} />
              <StatCard icon={AlertTriangle} label="Predicted below credit overall" value={String(c.forecast.bands.at_risk)} tone="amber" />
              <StatCard icon={Users} label="Candidates with evidence" value={`${c.forecast.withEvidence} / ${c.forecast.students}`} tone="orchid" />
            </div>
            <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1fr_360px]">
              <Card>
                <CardHeader title="Students" subtitle="Lowest predicted first." />
                {c.students.length ? (
                  <Table className="min-w-[820px]">
                    <THead><tr><TH>Student</TH><TH>Predicted</TH><TH>Target</TH><TH>Subjects</TH><TH>Warning signs</TH></tr></THead>
                    <tbody>
                      {c.students.map((s) => (
                        <TR key={s.studentId}>
                          <TD>
                            <p className="font-semibold">{s.name}</p>
                            <p className="text-xs text-muted">{s.admissionNumber}{s.attendanceRate !== null ? ` · attendance ${s.attendanceRate}%` : ""}</p>
                          </TD>
                          <TD>
                            <Meter value={s.overall} />
                            {s.jambAggregate !== null ? <p className="mt-1 text-xs text-muted">UTME about {s.jambAggregate}/400</p> : null}
                          </TD>
                          <TD><Benchmark v={s.meetsBenchmark} /></TD>
                          <TD>
                            <div className="flex max-w-[220px] flex-wrap gap-1">
                              {s.subjects.map((x) => (
                                <span key={x.subjectId} title={`${x.subjectName}: ${x.predicted ?? "no evidence"} (${x.confidence} confidence)`} className={cn("rounded-md px-1.5 py-0.5 text-[11px] font-semibold", x.predicted === null ? "bg-canvas text-muted" : x.predicted >= 65 ? "bg-emerald-50 text-emerald-700" : x.predicted >= 50 ? "bg-amber-50 text-amber-700" : "bg-rose-50 text-rose-600")}>
                                  {short(x.subjectName)} {x.grade ?? "–"}
                                </span>
                              ))}
                            </div>
                          </TD>
                          <TD><Risks s={s} /></TD>
                        </TR>
                      ))}
                    </tbody>
                  </Table>
                ) : (
                  <Empty title="No students in this class" />
                )}
              </Card>
              <div className="flex flex-col gap-5">
                <Card>
                  <CardHeader title="Topics to reteach" subtitle="Where most of the class keeps getting CBT, practice and tutor quiz questions wrong." />
                  {c.reteach.length ? (
                    <ul className="flex flex-col gap-2.5">
                      {c.reteach.map((t) => (
                        <li key={`${t.subjectName}-${t.topic}`} className="rounded-2xl bg-canvas p-3 text-sm">
                          <div className="flex items-center justify-between gap-2">
                            <p className="font-semibold">{t.topic}</p>
                            <Badge tone={t.accuracy < 40 ? "red" : "amber"}>{t.accuracy}% right</Badge>
                          </div>
                          <p className="mt-0.5 text-xs text-muted">{t.subjectName} · {t.students} students · {t.attempted} answers</p>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <Empty title="Nothing stands out yet" icon={BookOpenCheck}>Topics appear once several students have practised the same topic.</Empty>
                  )}
                </Card>
                <Card>
                  <CardHeader title="Subjects" />
                  <ul className="flex flex-col gap-2 text-sm">
                    {c.forecast.subjects.map((s) => (
                      <li key={s.subjectId} className="flex items-center justify-between gap-2">
                        <span className="truncate">{s.subjectName}</span>
                        <Meter value={s.average} />
                      </li>
                    ))}
                  </ul>
                </Card>
              </div>
            </div>
            <p className="text-xs text-muted">{HOW}</p>
          </div>
        )}
      </Async>
    </>
  );
}

/** Exam forecast for leadership (`/admin`) and teachers (`/teacher`); `?class=` opens one class. */
export function ForecastPage({ base }: { base: "/admin" | "/teacher" }) {
  const params = useSearchParams();
  const router = useRouter();
  const path = usePathname();
  const exam = (params.get("exam") as ExamCode | null) ?? null;
  const classId = params.get("class");
  const setExam = (e: ExamCode) => {
    const q = new URLSearchParams(params.toString());
    q.set("exam", e);
    router.replace(`${path}?${q}`);
  };
  return classId ? <ClassView base={base} classId={classId} exam={exam} setExam={setExam} /> : <SchoolView base={base} exam={exam} setExam={setExam} />;
}
