"use client";
import * as React from "react";
import Link from "next/link";
import { Activity, AlertTriangle, Bell, Bot, CalendarCheck, CheckCircle2, CreditCard, FileText, MonitorCheck, ShieldAlert, Target, Wallet } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Empty, Loading } from "@/components/ui/feedback";
import { BarChart } from "@/components/charts/bar-chart";
import { naira, pct } from "@/lib/format";
import { useLive, type LiveSnapshot, type LiveStatus } from "@/lib/insights";
import { cn } from "@/lib/utils";

function StatusPill({ status, at }: { status: LiveStatus; at: string | null }) {
  const live = status === "live";
  return (
    <span className={cn("inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold", live ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700")} role="status" aria-live="polite">
      <span className="relative flex h-2.5 w-2.5">
        {live ? <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" /> : null}
        <span className={cn("relative inline-flex h-2.5 w-2.5 rounded-full", live ? "bg-emerald-500" : "bg-amber-500")} />
      </span>
      {live ? "Live" : status === "connecting" ? "Connecting…" : "Reconnecting…"}
      {at ? <span className="font-normal opacity-80">· {new Date(at).toLocaleTimeString("en-NG", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span> : null}
    </span>
  );
}

function Tile({ icon: Icon, label, value, sub, tone = "brand" }: { icon: React.ElementType; label: string; value: string; sub?: string; tone?: "brand" | "green" | "amber" | "orchid" | "sky" }) {
  const tones = { brand: "bg-brand-50 text-brand-600", green: "bg-emerald-50 text-emerald-600", amber: "bg-amber-50 text-amber-600", orchid: "bg-orchid-100 text-fuchsia-600", sky: "bg-sky-50 text-sky-600" };
  return (
    <div className="rounded-3xl bg-white p-5">
      <span className={cn("flex h-10 w-10 items-center justify-center rounded-2xl", tones[tone])}><Icon className="h-5 w-5" strokeWidth={1.8} /></span>
      <p className="mt-3 text-2xl font-bold tracking-tight tabular-nums transition-all sm:text-[28px]">{value}</p>
      <p className="text-sm text-muted">{label}</p>
      {sub ? <p className="mt-0.5 text-xs text-muted">{sub}</p> : null}
    </div>
  );
}

const ALERT_ICON: Record<string, React.ElementType> = { attendance: CalendarCheck, forecast: Target, safety: ShieldAlert, ai: Bot, fees: Wallet };
const FEED_ICON: Record<string, React.ElementType> = { attendance: CalendarCheck, payment: CreditCard, cbt: MonitorCheck, safety: ShieldAlert, results: FileText };

function Alerts({ s }: { s: LiveSnapshot }) {
  return (
    <Card>
      <CardHeader title="Alerts" subtitle="What needs someone's attention right now." action={<Badge tone={s.alerts.some((a) => a.severity === "high") ? "red" : "gray"}>{s.alerts.length}</Badge>} />
      {s.alerts.length ? (
        <ul className="flex flex-col gap-2">
          {s.alerts.map((a) => {
            const Icon = ALERT_ICON[a.kind] ?? AlertTriangle;
            const body = (
              <>
                <Icon className={cn("mt-0.5 h-5 w-5 shrink-0", a.severity === "high" ? "text-rose-600" : a.severity === "medium" ? "text-amber-600" : "text-sky-600")} />
                <div className="min-w-0">
                  <p className="font-semibold">{a.title}</p>
                  <p className="mt-0.5 text-muted">{a.detail}</p>
                </div>
              </>
            );
            const cls = cn("flex gap-3 rounded-2xl p-3.5 text-sm", a.severity === "high" ? "bg-rose-50/80" : a.severity === "medium" ? "bg-amber-50/80" : "bg-sky-50/80");
            return <li key={a.id}>{a.href ? <Link href={a.href} className={cn(cls, "hover:ring-2 hover:ring-brand-200")}>{body}</Link> : <div className={cls}>{body}</div>}</li>;
          })}
        </ul>
      ) : (
        <Empty title="All clear" icon={CheckCircle2}>No alerts right now.</Empty>
      )}
    </Card>
  );
}

function Feed({ s, fresh }: { s: LiveSnapshot; fresh: Set<string> }) {
  return (
    <Card>
      <CardHeader title="Activity" subtitle="As it happens, newest first." />
      {s.activity.length ? (
        <ol className="flex flex-col">
          {s.activity.map((a) => {
            const Icon = FEED_ICON[a.kind] ?? Activity;
            return (
              <li key={a.id} className={cn("flex items-start gap-3 rounded-xl px-2 py-2.5 text-sm transition-colors duration-[2000ms]", fresh.has(a.id) ? "bg-brand-50" : "bg-transparent")}>
                <span className={cn("mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg", a.tone === "good" ? "bg-emerald-50 text-emerald-600" : a.tone === "bad" ? "bg-rose-50 text-rose-600" : "bg-canvas text-muted")}>
                  <Icon className="h-4 w-4" />
                </span>
                <p className="min-w-0 flex-1">{a.text}</p>
                <time className="shrink-0 text-xs text-muted tabular-nums">{new Date(a.at).toLocaleTimeString("en-NG", { hour: "2-digit", minute: "2-digit" })}</time>
              </li>
            );
          })}
        </ol>
      ) : (
        <Empty title="Quiet so far" icon={Activity}>Registers, payments, CBT results and safety flags show up here the moment they happen.</Empty>
      )}
    </Card>
  );
}

function AttendanceCard({ s }: { s: LiveSnapshot }) {
  return (
    <Card>
      <CardHeader title="Attendance today" subtitle={s.attendance.unmarked ? `${s.attendance.unmarked} ${s.attendance.unmarked === 1 ? "class has" : "classes have"} not taken the register yet.` : "Every class has taken the register."} />
      {s.attendance.classes.length ? (
        <ul className="flex flex-col gap-3">
          {s.attendance.classes.map((c) => {
            const here = c.present + c.late;
            return (
              <li key={c.id} className="grid grid-cols-[minmax(0,7rem)_1fr_auto] items-center gap-3 text-sm">
                <span className="truncate font-semibold">{c.label}</span>
                {c.marked ? (
                  <div className="flex h-2.5 overflow-hidden rounded-full bg-canvas" title={`${c.present} present, ${c.late} late, ${c.absent} absent`}>
                    <div className="bg-emerald-500" style={{ width: `${(c.present / c.students) * 100}%` }} />
                    <div className="bg-amber-400" style={{ width: `${(c.late / c.students) * 100}%` }} />
                    <div className="bg-rose-400" style={{ width: `${(c.absent / c.students) * 100}%` }} />
                  </div>
                ) : (
                  <span className="text-xs text-amber-700">Register not taken</span>
                )}
                <span className="text-xs text-muted tabular-nums">{c.marked ? `${here}/${c.students}` : `0/${c.students}`}</span>
              </li>
            );
          })}
        </ul>
      ) : (
        <Empty title="No classes" />
      )}
    </Card>
  );
}

function CbtCard({ s }: { s: LiveSnapshot }) {
  return (
    <Card>
      <CardHeader title="CBT right now" subtitle={`${s.cbt.submittedToday} finished today${s.cbt.averageToday !== null ? `, averaging ${s.cbt.averageToday}%` : ""}.`} />
      {s.cbt.sessions.length ? (
        <ul className="flex flex-col gap-2">
          {s.cbt.sessions.map((x) => (
            <li key={x.key} className="flex items-center gap-3 rounded-2xl bg-canvas p-3 text-sm">
              <span className={cn("flex h-9 w-9 items-center justify-center rounded-xl", x.active ? "bg-emerald-50 text-emerald-600" : "bg-white text-muted")}><MonitorCheck className="h-4 w-4" /></span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{x.title}</p>
                <p className="text-xs text-muted">{x.subject}{x.endsAt ? ` · ends ${new Date(x.endsAt).toLocaleTimeString("en-NG", { hour: "2-digit", minute: "2-digit" })}` : ""}</p>
              </div>
              <div className="text-right text-xs">
                {x.active ? <p className="font-semibold text-emerald-700">{x.active} writing</p> : null}
                {x.finished ? <p className="text-muted">{x.finished} done{x.average !== null ? ` · ${x.average}%` : ""}</p> : null}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <Empty title="No CBT in progress" icon={MonitorCheck} />
      )}
    </Card>
  );
}

function FeesCard({ fees }: { fees: NonNullable<LiveSnapshot["fees"]> }) {
  return (
    <Card>
      <CardHeader title="Fees" subtitle={fees.term ? fees.term.name : "No current term"} />
      {fees.term ? (
        <>
          <p className="text-2xl font-bold">{naira(fees.term.collectedKobo, { compact: true })} <span className="text-sm font-medium text-muted">of {naira(fees.term.expectedKobo, { compact: true })}</span></p>
          <Progress className="mt-2" value={pct(fees.term.collectedKobo, fees.term.expectedKobo)} barClassName="bg-emerald-500" />
          <p className="mt-1.5 text-xs text-muted">{pct(fees.term.collectedKobo, fees.term.expectedKobo)}% collected · {fees.term.invoicesOwing} families still owing</p>
        </>
      ) : null}
      <p className="mt-5 mb-1 text-xs font-semibold tracking-wide text-muted uppercase">Last 7 days</p>
      <BarChart height={140} unit="naira-k" data={fees.last7Days.map((d) => ({ label: new Date(`${d.date}T12:00:00Z`).toLocaleDateString("en-NG", { weekday: "short" }), value: d.kobo / 100_000 }))} />
    </Card>
  );
}

function AiCard({ ai, forecasts }: { ai: NonNullable<LiveSnapshot["ai"]>; forecasts: LiveSnapshot["forecasts"] }) {
  return (
    <Card>
      <CardHeader title="AI learning" subtitle={ai.enabled ? "Claude is on." : "Practice mode (no AI key yet)."} />
      <div className="grid grid-cols-3 gap-2 text-center">
        {[
          ["On the tutor now", ai.studentsUsingTutorNow],
          ["AI replies today", ai.callsToday],
          ["Cost today", `₦${ai.costTodayNaira.toLocaleString("en-NG")}`],
        ].map(([l, v]) => (
          <div key={l as string} className="rounded-2xl bg-canvas p-3">
            <p className="text-xl font-bold tabular-nums">{v}</p>
            <p className="text-[11px] text-muted">{l}</p>
          </div>
        ))}
      </div>
      <p className="mt-4 mb-1 text-xs text-muted">Monthly allowance {ai.budgetUsedPct}% used</p>
      <Progress value={ai.budgetUsedPct} barClassName={ai.budgetUsedPct >= 80 ? "bg-rose-500" : undefined} />
      {forecasts.length ? <ForecastMini forecasts={forecasts} base="/admin" /> : null}
    </Card>
  );
}

function ForecastMini({ forecasts, base }: { forecasts: LiveSnapshot["forecasts"]; base: string }) {
  return (
    <div className="mt-5 flex flex-col gap-2">
      <p className="text-xs font-semibold tracking-wide text-muted uppercase">Exam forecast</p>
      {forecasts.map((f) => (
        <Link key={f.exam} href={`${base}/forecast?exam=${f.exam}`} className="flex items-center justify-between rounded-2xl bg-canvas p-3 text-sm hover:ring-2 hover:ring-brand-200">
          <span className="font-semibold">{f.examName}</span>
          <span className="text-xs text-muted">{f.onTrack}/{f.students} on course{f.atRisk ? <> · <span className="font-semibold text-rose-600">{f.atRisk} at risk</span></> : null}</span>
        </Link>
      ))}
    </div>
  );
}

/** Real-time monitoring for leadership (whole school) and teachers (their classes). */
export function LiveMonitor({ base }: { base: "/admin" | "/teacher" }) {
  const { snap: s, status, fresh } = useLive();
  return (
    <>
      <PageHeader
        title="Live Monitor"
        subtitle={base === "/admin" ? "Attendance, fees, CBT, AI and alerts across the school, updating the moment they change." : "Your classes' attendance, CBT and alerts, updating the moment they change."}
        actions={<StatusPill status={status} at={s?.at ?? null} />}
      />
      {!s ? (
        <Loading label="Connecting to the live feed…" />
      ) : (
        <div className="flex flex-col gap-5">
          <div className={cn("grid grid-cols-2 gap-4", s.fees ? "lg:grid-cols-5" : "lg:grid-cols-3")}>
            <Tile
              icon={CalendarCheck}
              label="Present today"
              value={s.attendance.totals.marked ? `${pct(s.attendance.totals.present + s.attendance.totals.late, s.attendance.totals.marked)}%` : "–"}
              sub={`${s.attendance.totals.present + s.attendance.totals.late} of ${s.attendance.totals.marked} marked · ${s.attendance.totals.absent} absent`}
              tone="green"
            />
            <Tile icon={MonitorCheck} label="Writing CBT now" value={String(s.cbt.inProgress)} sub={`${s.cbt.submittedToday} finished today`} tone="sky" />
            <Tile icon={Bell} label="Alerts" value={String(s.alerts.length)} sub={`${s.alerts.filter((a) => a.severity === "high").length} urgent`} tone="amber" />
            {s.fees ? <Tile icon={Wallet} label="Fees received today" value={naira(s.fees.collectedTodayKobo, { compact: true })} sub={`${s.fees.paymentsToday} payments${s.fees.failedToday ? ` · ${s.fees.failedToday} failed` : ""}`} tone="brand" /> : null}
            {s.ai ? <Tile icon={Bot} label="Students on the AI tutor" value={String(s.ai.studentsUsingTutorNow)} sub={`${s.ai.callsToday} AI replies today`} tone="orchid" /> : null}
          </div>
          <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1fr_380px]">
            <div className="flex min-w-0 flex-col gap-5">
              <Alerts s={s} />
              <div className="grid grid-cols-1 gap-5 2xl:grid-cols-2">
                <AttendanceCard s={s} />
                <CbtCard s={s} />
              </div>
              {s.fees ? <FeesCard fees={s.fees} /> : null}
            </div>
            <div className="flex min-w-0 flex-col gap-5">
              {s.ai ? <AiCard ai={s.ai} forecasts={s.forecasts} /> : s.forecasts.length ? <Card><ForecastMini forecasts={s.forecasts} base={base} /></Card> : null}
              <Feed s={s} fresh={fresh} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
