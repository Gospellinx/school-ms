"use client";
import * as React from "react";
import Link from "next/link";
import { Activity, CalendarClock, ExternalLink, Mail, MonitorCheck, Search, UserPlus, Wallet } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { Button, buttonClass } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Tabs } from "@/components/ui/tabs";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { Async, Empty } from "@/components/ui/feedback";
import { StatCard } from "@/components/widgets/stat-card";
import { BarChart } from "@/components/charts/bar-chart";
import { ApplicationDialog, ScheduleDialog } from "@/components/admissions/application-dialog";
import { useApi } from "@/lib/api";
import { naira, shortDate } from "@/lib/format";
import { EVENT_LABEL, STATUS_LABEL, STATUS_TONE, timeAgo, type AdmissionsOverview, type ApplicationRow, type ApplicationStatus } from "@/lib/admissions";

const TABS: { label: string; status?: ApplicationStatus }[] = [
  { label: "All" },
  { label: "Awaiting fee", status: "pending_payment" },
  { label: "Applied", status: "applied" },
  { label: "Entrance exam", status: "exam" },
  { label: "Offered", status: "offered" },
  { label: "Accepted", status: "accepted" },
  { label: "Enrolled", status: "enrolled" },
  { label: "Not successful", status: "rejected" },
];

/** Polls every 15 seconds so new applications, payments and exam results appear without a refresh. */
function useLive(reload: () => Promise<void>, every = 15000) {
  const [at, setAt] = React.useState(Date.now());
  const [now, setNow] = React.useState(Date.now());
  React.useEffect(() => {
    const t = setInterval(async () => {
      if (document.visibilityState !== "visible") return;
      await reload();
      setAt(Date.now());
    }, every);
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      clearInterval(t);
      clearInterval(tick);
    };
  }, [reload, every]);
  return Math.round((now - at) / 1000);
}

export default function Admissions() {
  const overview = useApi<AdmissionsOverview>("admissions/overview");
  const [tab, setTab] = React.useState("All");
  const [q, setQ] = React.useState("");
  const status = TABS.find((t) => t.label === tab)?.status;
  const qs = new URLSearchParams({ ...(status ? { status } : {}), ...(q.trim() ? { q: q.trim() } : {}) }).toString();
  const list = useApi<ApplicationRow[]>(`admissions/applications${qs ? `?${qs}` : ""}`);
  const [open, setOpen] = React.useState<string | null>(null);
  const [picked, setPicked] = React.useState<Set<string>>(new Set());
  const [scheduling, setScheduling] = React.useState(false);

  const reloadAll = React.useCallback(async () => {
    await Promise.all([overview.reload(), list.reload()]);
  }, [overview.reload, list.reload]); // eslint-disable-line react-hooks/exhaustive-deps
  const ago = useLive(reloadAll);

  const o = overview.data;
  const schedulable = (list.data ?? []).filter((r) => r.hasExam && (r.status === "applied" || r.status === "exam"));

  return (
    <>
      <PageHeader
        title="Admissions"
        subtitle="Applications from your website, form fees, entrance exams, offers and enrolment."
        actions={
          <>
            <span className="flex h-10 items-center gap-2 rounded-xl bg-white px-3 text-xs font-semibold text-muted">
              <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" /><span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" /></span>
              Live · updated {ago < 5 ? "now" : `${ago}s ago`}
            </span>
            {o ? <a href={o.site.url} target="_blank" rel="noreferrer" className={buttonClass("outline")}><ExternalLink className="h-4 w-4" /> View website</a> : null}
            <Link href="/admin/website" className={buttonClass()}>Website & settings</Link>
          </>
        }
      />
      <Async data={o} error={overview.error}>
        {(o) => (
          <div className="flex flex-col gap-5">
            {!o.site.published || !o.site.admissionsOpen ? (
              <Card className="flex flex-wrap items-center justify-between gap-3 bg-amber-50">
                <p className="text-sm font-semibold text-amber-800">{!o.site.published ? "Your website is not published yet, so families cannot apply." : "Admissions are closed on your website."}</p>
                <Link href="/admin/website" className={buttonClass("outline", "sm")}>Open settings</Link>
              </Card>
            ) : null}
            <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
              <StatCard icon={UserPlus} label="Applications" value={String(o.total)} delta={o.daily.length ? `+${o.daily.reduce((s, d) => s + d.n, 0)} this week` : undefined} />
              <StatCard icon={Wallet} tone="green" label={`Form fees from ${o.fees.paid} families`} value={naira(o.fees.collectedKobo)} />
              <StatCard icon={MonitorCheck} tone="orchid" label={o.exam.averagePercentage !== null ? `Sat the exam · average ${o.exam.averagePercentage}%` : "Sat the entrance exam"} value={String(o.exam.sat)} />
              <StatCard icon={Mail} tone="amber" label={`Follow-up emails sent · ${o.emails.scheduled} scheduled`} value={String(o.emails.sent)} />
            </div>

            <div className="grid gap-5 xl:grid-cols-[1.3fr_1fr]">
              <Card>
                <CardHeader title="Pipeline" subtitle="From application to enrolment" />
                <ul className="flex flex-col gap-3">
                  {o.funnel.map((f) => (
                    <li key={f.key}>
                      <div className="mb-1 flex justify-between text-sm"><span className="font-medium">{f.label}</span><span className="font-semibold">{f.n}</span></div>
                      <Progress value={o.funnel[0].n ? (f.n / o.funnel[0].n) * 100 : 0} />
                    </li>
                  ))}
                </ul>
                {o.counts.pending_payment ? <p className="mt-4 text-sm text-muted">{o.counts.pending_payment} more started the form but have not paid the fee yet. They get reminder emails after one and three days.</p> : null}
                <div className="mt-6">
                  <p className="mb-2 text-sm font-semibold">Places by class</p>
                  <ul className="grid gap-2 sm:grid-cols-2">
                    {o.classes.map((c) => (
                      <li key={c.id} className="rounded-2xl bg-canvas p-3">
                        <div className="flex justify-between text-sm"><span className="font-semibold">{c.className}</span><span>{c.seatsTaken}{c.seats ? ` / ${c.seats}` : ""} offered</span></div>
                        {c.seats ? <Progress className="mt-2" value={(c.seatsTaken / c.seats) * 100} barClassName="bg-emerald-500" /> : null}
                        <p className="mt-1.5 text-xs text-muted">{c.entranceTest ? `${c.entranceTest.title}${c.passMark !== null ? ` · pass mark ${c.passMark}%` : ""}` : "No entrance exam"}{c.open ? "" : " · closed"}</p>
                      </li>
                    ))}
                  </ul>
                </div>
              </Card>
              <Card>
                <CardHeader title="Live activity" subtitle="Everything families and staff did, newest first" action={<Activity className="h-5 w-5 text-brand-600" />} />
                {o.activity.length === 0 ? (
                  <Empty title="No activity yet">Share your website link so families can apply.</Empty>
                ) : (
                  <ul className="flex max-h-[420px] flex-col gap-1 overflow-y-auto pr-1">
                    {o.activity.map((e) => (
                      <li key={e.id}>
                        <button onClick={() => setOpen(e.applicationId)} className="flex w-full items-start gap-3 rounded-2xl px-2 py-2 text-left hover:bg-canvas">
                          <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand-500" />
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm"><strong>{e.childName}</strong> · {EVENT_LABEL[e.kind] ?? e.kind}</span>
                            {e.detail ? <span className="block truncate text-xs text-muted">{e.detail}</span> : null}
                          </span>
                          <span className="shrink-0 text-xs text-muted">{timeAgo(e.createdAt)}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </div>

            {o.daily.length > 1 ? (
              <Card>
                <CardHeader title="New applications" subtitle="Last 7 days" />
                <BarChart height={180} max={Math.max(4, Math.ceil((Math.max(...o.daily.map((d) => d.n)) * 1.2) / 4) * 4)} data={o.daily.map((d) => ({ label: new Date(`${d.day}T12:00:00Z`).toLocaleDateString("en-NG", { weekday: "short" }), value: d.n }))} />
              </Card>
            ) : null}
          </div>
        )}
      </Async>

      <Card className="mt-5">
        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <Tabs tabs={TABS.map((t) => t.label)} value={tab} onChange={(t) => { setTab(t); setPicked(new Set()); }} />
          <div className="flex gap-2">
            <div className="relative flex-1 lg:w-64">
              <Search className="pointer-events-none absolute top-3 left-3 h-4 w-4 text-muted" />
              <Input className="pl-9" placeholder="Name, reference or phone" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <Button disabled={picked.size === 0} onClick={() => setScheduling(true)}><CalendarClock className="h-4 w-4" /> Schedule exam{picked.size ? ` (${picked.size})` : ""}</Button>
          </div>
        </div>
        <Async data={list.data} error={list.error}>
          {(rows) =>
            rows.length === 0 ? (
              <Empty title="No applications here" />
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <THead>
                    <tr>
                      <TH className="w-8">
                        <input type="checkbox" aria-label="Select all who can sit the exam" checked={schedulable.length > 0 && schedulable.every((r) => picked.has(r.id))} onChange={(e) => setPicked(e.target.checked ? new Set(schedulable.map((r) => r.id)) : new Set())} />
                      </TH>
                      <TH>Applicant</TH>
                      <TH>Class</TH>
                      <TH>Parent</TH>
                      <TH>Fee</TH>
                      <TH>Exam</TH>
                      <TH>Status</TH>
                      <TH>Applied</TH>
                    </tr>
                  </THead>
                  <tbody>
                    {rows.map((r) => {
                      const canPick = r.hasExam && (r.status === "applied" || r.status === "exam");
                      return (
                        <TR key={r.id} className="cursor-pointer" onClick={() => setOpen(r.id)}>
                          <TD onClick={(e) => e.stopPropagation()}>
                            <input type="checkbox" disabled={!canPick} aria-label={`Select ${r.childName}`} checked={picked.has(r.id)} onChange={(e) => { const n = new Set(picked); if (e.target.checked) n.add(r.id); else n.delete(r.id); setPicked(n); }} />
                          </TD>
                          <TD><p className="font-semibold">{r.childName}</p><p className="text-xs text-muted">{r.reference}</p></TD>
                          <TD>{r.className}</TD>
                          <TD><p>{r.parentName}</p><p className="text-xs text-muted">0{r.parentPhone.slice(3)}</p></TD>
                          <TD>{r.feeKobo === 0 ? <span className="text-muted">Free</span> : r.feePaid ? <Badge tone="green">Paid</Badge> : <Badge tone="amber">Owing</Badge>}</TD>
                          <TD>
                            {r.examPercentage !== null ? (
                              <span className="flex items-center gap-1.5 font-semibold">{Math.round(r.examPercentage)}%{r.recommended !== null ? <Badge tone={r.recommended ? "green" : "red"}>{r.recommended ? "Pass" : "Below"}</Badge> : null}</span>
                            ) : r.examOpensAt ? <span className="text-xs text-muted">Booked {shortDate(r.examOpensAt)}</span> : r.hasExam ? <span className="text-xs text-muted">Not booked</span> : <span className="text-xs text-muted">None</span>}
                          </TD>
                          <TD><Badge tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</Badge></TD>
                          <TD className="text-xs text-muted">{timeAgo(r.createdAt)}</TD>
                        </TR>
                      );
                    })}
                  </tbody>
                </Table>
              </div>
            )
          }
        </Async>
      </Card>

      <ApplicationDialog id={open} onClose={() => setOpen(null)} onChanged={reloadAll} />
      <ScheduleDialog ids={scheduling ? [...picked] : null} onClose={() => setScheduling(false)} onDone={async () => { setPicked(new Set()); setScheduling(false); await reloadAll(); }} />
    </>
  );
}
