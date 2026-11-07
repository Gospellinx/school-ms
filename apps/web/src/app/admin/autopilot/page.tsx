"use client";
import * as React from "react";
import { Activity, AlertTriangle, BellRing, CalendarClock, CheckCircle2, HandCoins, Mail, MessageCircle, Play, Plus, RotateCcw, Send, Smartphone, Trash2, Wallet } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { Toggle } from "@/components/pages/settings";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge, type Tone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Async, Empty, ErrorNote, SuccessNote } from "@/components/ui/feedback";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Tabs } from "@/components/ui/tabs";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { StatCard } from "@/components/widgets/stat-card";
import { api, useApi } from "@/lib/api";
import { useAction } from "@/lib/useAction";
import { dateTime, longDate, naira, pct, shortDate } from "@/lib/format";
import type { AutopilotActivity, AutopilotOverview, AutomationSettings, DigestRecipient, FeeRecovery, FollowUpChannel, Providers, Sequence, SequenceStep, SequenceTrigger } from "@/lib/types";
import { cn } from "@/lib/utils";

const TABS = ["Live activity", "Fee recovery", "Weekly parent report", "Daily summary", "Follow-ups"];
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const HOURS = Array.from({ length: 24 }, (_, h) => h);
const hourLabel = (h: number) => `${h % 12 === 0 ? 12 : h % 12}:00 ${h < 12 ? "am" : "pm"}`;
const CHANNELS: { key: FollowUpChannel; label: string }[] = [
  { key: "preferred", label: "Parent's choice (SMS or WhatsApp)" },
  { key: "sms", label: "SMS" },
  { key: "whatsapp", label: "WhatsApp" },
  { key: "email", label: "Email" },
];
const FIELDS: Record<SequenceTrigger, string[]> = {
  fee_overdue: ["parent_name", "student_first_name", "student_name", "school_name", "school_phone", "term", "balance", "amount_due", "due_date", "pay_link", "hold_note", "plan_note"],
  new_parent: ["parent_name", "children", "student_first_name", "school_name", "school_phone", "portal_link", "parent_phone"],
  absent_streak: ["parent_name", "student_first_name", "student_name", "school_name", "school_phone", "absent_days", "portal_link"],
};
const KIND: Record<string, { label: string; tone: Tone }> = {
  fee_reminder: { label: "Fee reminder", tone: "amber" },
  weekly_report: { label: "Weekly report", tone: "brand" },
  daily_summary: { label: "Daily summary", tone: "blue" },
  new_parent: { label: "Welcome", tone: "green" },
  absent_streak: { label: "Missed days", tone: "red" },
};

function timeAgo(iso: string) {
  const s = Math.max(0, (Date.now() - new Date(iso.replace(" ", "T").replace(/([+-]\d\d)$/, "$1:00")).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return dateTime(iso);
}

function offsetLabel(d: number, anchor: string) {
  if (d === 0) return `On the ${anchor}`;
  return `${Math.abs(d)} day${Math.abs(d) === 1 ? "" : "s"} ${d < 0 ? "before" : "after"} the ${anchor}`;
}

/** Fills placeholders with sample values so the school sees what parents will read. */
function sample(text: string) {
  const v: Record<string, string> = {
    parent_name: "Mrs Okafor", student_first_name: "Ada", student_name: "Ada Okafor", children: "Ada and Chidi", school_name: "your school", school_phone: "0803 123 4567",
    term: "First Term", balance: "₦175,000", amount_due: "₦175,000", due_date: "14 November 2026", pay_link: "https://…/pay/Xy12ab", hold_note: "Report cards are released once fees are cleared.",
    plan_note: "", portal_link: "https://…", parent_phone: "08031234567", absent_days: "3",
  };
  return text.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (_, k: string) => v[k.toLowerCase()] ?? "").replace(/\s{2,}/g, " ").trim();
}

function ProviderBadges({ p }: { p: Providers }) {
  const item = (label: string, value: string, live: boolean) => (
    <Badge tone={live ? "green" : "amber"} className="gap-1">
      {label}: {live ? value : value === "missing" ? "not set up" : `${value === "test" ? "test mode" : "sandbox"}`}
    </Badge>
  );
  return (
    <div className="flex flex-wrap items-center gap-2">
      {item("SMS/WhatsApp", p.sms === "termii" ? "Termii" : p.sms, p.sms !== "sandbox")}
      {item("Email", p.email === "brevo" ? "Brevo" : p.email === "resend" ? "Resend" : p.email, p.email !== "sandbox")}
      {item("Paystack", p.paystack, p.paystack === "live")}
    </div>
  );
}

export default function Autopilot() {
  const overview = useApi<AutopilotOverview>("automations");
  const [tab, setTab] = React.useState(TABS[0]);
  const a = useAction();
  return (
    <>
      <PageHeader
        title="Autopilot"
        subtitle="Fee reminders, parent reports and follow-ups that run on their own, by SMS, WhatsApp and email."
        actions={
          <Button
            variant="outline"
            disabled={a.busy}
            onClick={() =>
              a.run(() => api<{ feeReminders: number; weeklyReports: number; dailySummaries: number; newParents: number; absences: number; sent: number }>("automations/run", { method: "POST" }), (r) =>
                `Checked now: ${r.feeReminders} fee reminders, ${r.newParents + r.absences} follow-ups, ${r.weeklyReports} weekly reports, ${r.dailySummaries} summaries. ${r.sent} messages sent.`,
              )
            }
          >
            <Play className="h-4 w-4" /> Run now
          </Button>
        }
      />
      {overview.data ? (
        <div className="mb-4 flex flex-col gap-2">
          <ProviderBadges p={overview.data.providers} />
          {overview.data.providers.sms === "sandbox" || overview.data.providers.email === "sandbox" ? (
            <p className="text-xs text-muted">Sandbox means messages are recorded here but not delivered. Add the Termii and Brevo keys on the server to go live.</p>
          ) : null}
        </div>
      ) : null}
      <ErrorNote className="mb-4">{a.error}</ErrorNote>
      <SuccessNote className="mb-4">{a.notice}</SuccessNote>
      <Tabs tabs={TABS} value={tab} onChange={setTab} className="mb-5" />
      <Async data={overview.data} error={overview.error}>
        {(o) => (
          <>
            {tab === "Live activity" ? <Live settings={o.settings} onSaved={overview.reload} /> : null}
            {tab === "Fee recovery" ? <FeeRecoveryTab overview={o} onChanged={overview.reload} /> : null}
            {tab === "Weekly parent report" ? <WeeklyTab settings={o.settings} onSaved={overview.reload} /> : null}
            {tab === "Daily summary" ? <DailyTab settings={o.settings} onSaved={overview.reload} /> : null}
            {tab === "Follow-ups" ? (
              <div className="grid gap-5">
                {o.sequences.filter((s) => s.trigger !== "fee_overdue").map((s) => <SequenceCard key={s.id} sequence={s} onSaved={overview.reload} />)}
              </div>
            ) : null}
          </>
        )}
      </Async>
    </>
  );
}

// ---------------------------------------------------------------- Live activity

function Live({ settings, onSaved }: { settings: AutomationSettings; onSaved: () => void }) {
  const feed = useApi<AutopilotActivity>("automations/activity");
  const { reload } = feed;
  React.useEffect(() => {
    const t = setInterval(() => void reload(), 5000);
    return () => clearInterval(t);
  }, [reload]);
  const a = useAction();
  return (
    <Async data={feed.data} error={feed.error}>
      {(f) => {
        const count = (channel: string | null, status: string) => f.today.filter((t) => (!channel || t.channel === channel) && t.status === status).reduce((s, t) => s + t.n, 0);
        const sent = count(null, "sent");
        const failed = count(null, "failed");
        const waiting = count(null, "queued") + count(null, "sending");
        return (
          <div className="grid gap-5">
            <div className="flex items-center gap-2 text-sm">
              <span className="relative flex h-2.5 w-2.5">
                <span className={cn("absolute inline-flex h-full w-full rounded-full opacity-75", f.sendingNow ? "animate-ping bg-emerald-400" : "")} />
                <span className={cn("relative inline-flex h-2.5 w-2.5 rounded-full", f.sendingNow ? "bg-emerald-500" : "bg-amber-400")} />
              </span>
              <span className="font-semibold">{f.sendingNow ? "Live" : "Quiet hours"}</span>
              <span className="text-muted">
                Parents are messaged between {hourLabel(f.schedule.window.from)} and {hourLabel(f.schedule.window.until)}. Updated {timeAgo(f.now)}, refreshes every 5 seconds.
              </span>
            </div>
            <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
              <StatCard icon={Send} label="Messages delivered today" value={String(sent)} tone="green" />
              <StatCard icon={Activity} label="Waiting to send" value={String(waiting)} tone="brand" />
              <StatCard icon={AlertTriangle} label="Failed today" value={String(failed)} tone={failed ? "orchid" : "green"} />
              <StatCard icon={BellRing} label="Autopilot actions (latest 40)" value={String(f.runs.length)} tone="amber" />
            </div>
            <div className="grid gap-5 xl:grid-cols-[1.5fr_1fr]">
              <Card>
                <CardHeader title="What the autopilot did" subtitle="Every reminder, report and follow-up, newest first." />
                {f.runs.length === 0 ? (
                  <Empty title="Nothing yet">Switch on fee recovery or a report, then press Run now or wait for the next check (every few minutes).</Empty>
                ) : (
                  <ul className="max-h-[640px] divide-y divide-line overflow-y-auto pr-1">
                    {f.runs.map((r) => (
                      <li key={r.id} className="flex items-start gap-3 py-3">
                        <Badge tone={KIND[r.kind]?.tone ?? "gray"} className="mt-0.5 shrink-0">{KIND[r.kind]?.label ?? r.kind}</Badge>
                        <span className="min-w-0 flex-1 text-sm">
                          <span className="block">{r.summary ?? r.student ?? r.key}</span>
                          <span className="text-xs text-muted">{r.messages} message{r.messages === 1 ? "" : "s"} · {timeAgo(r.createdAt)}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
              <div className="grid h-fit gap-5">
                <Card>
                  <CardHeader title="Today by channel" />
                  <ul className="grid gap-3 text-sm">
                    {[
                      { key: "sms", label: "SMS", icon: Smartphone },
                      { key: "whatsapp", label: "WhatsApp", icon: MessageCircle },
                      { key: "email", label: "Email", icon: Mail },
                    ].map((c) => {
                      const s = count(c.key, "sent");
                      const fl = count(c.key, "failed");
                      const q = count(c.key, "queued") + count(c.key, "sending");
                      return (
                        <li key={c.key}>
                          <div className="mb-1 flex items-center justify-between">
                            <span className="flex items-center gap-2 font-semibold"><c.icon className="h-4 w-4 text-muted" /> {c.label}</span>
                            <span className="text-xs text-muted">{s} sent{q ? ` · ${q} waiting` : ""}{fl ? ` · ${fl} failed` : ""}</span>
                          </div>
                          <Progress value={pct(s, s + fl + q)} />
                        </li>
                      );
                    })}
                  </ul>
                </Card>
                <Card>
                  <CardHeader title="Coming up" />
                  <ul className="grid gap-2 text-sm">
                    {f.schedule.sequences.map((s) => (
                      <li key={s.trigger} className="flex justify-between"><span>{s.name}</span><Badge tone={s.enabled ? "green" : "gray"}>{s.enabled ? "On" : "Off"}</Badge></li>
                    ))}
                    <li className="flex justify-between"><span>Weekly parent report</span><span className="text-muted">{f.schedule.weeklyReport ? `${shortDate(f.schedule.weeklyReport.date)}, ${hourLabel(f.schedule.weeklyReport.hour)}` : "Off"}</span></li>
                    <li className="flex justify-between"><span>Daily summary</span><span className="text-muted">{f.schedule.dailySummary ? `${shortDate(f.schedule.dailySummary.date)}, ${hourLabel(f.schedule.dailySummary.hour)}` : "Off"}</span></li>
                  </ul>
                </Card>
                {f.failures.length ? (
                  <Card>
                    <CardHeader title="Recent failures" subtitle="Each message is tried three times before it counts as failed." />
                    <ul className="grid gap-2 text-sm">
                      {f.failures.map((x) => (
                        <li key={x.id} className="rounded-2xl bg-rose-50 p-3">
                          <p className="font-semibold">{x.channel} to {x.to}</p>
                          <p className="text-xs text-rose-700">{x.error ?? "Unknown error"} · {timeAgo(x.createdAt)}</p>
                        </li>
                      ))}
                    </ul>
                  </Card>
                ) : null}
                <Card>
                  <CardHeader title="Sending hours" subtitle="Parents are never messaged outside these hours (West Africa Time)." />
                  <ErrorNote className="mb-2">{a.error}</ErrorNote>
                  <div className="flex items-end gap-3">
                    <HourSelect label="From" value={settings.sendFrom} onChange={(v) => void a.run(async () => { await api("automations/settings", { method: "PATCH", body: { sendFrom: v } }); onSaved(); void reload(); })} />
                    <HourSelect label="Until" value={settings.sendUntil} onChange={(v) => void a.run(async () => { await api("automations/settings", { method: "PATCH", body: { sendUntil: v } }); onSaved(); void reload(); })} />
                  </div>
                </Card>
              </div>
            </div>
          </div>
        );
      }}
    </Async>
  );
}

function HourSelect({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div>
      <Label>{label}</Label>
      <Select value={value} onChange={(e) => onChange(Number(e.target.value))}>
        {HOURS.map((h) => <option key={h} value={h}>{hourLabel(h)}</option>)}
      </Select>
    </div>
  );
}

// ---------------------------------------------------------------- Fee recovery

function FeeRecoveryTab({ overview, onChanged }: { overview: AutopilotOverview; onChanged: () => void }) {
  const data = useApi<FeeRecovery>("automations/fee-recovery");
  const seq = overview.sequences.find((s) => s.trigger === "fee_overdue")!;
  const a = useAction();
  const patch = (body: Partial<AutomationSettings>) => a.run(async () => { await api("automations/settings", { method: "PATCH", body }); onChanged(); await data.reload(); }, "Saved.");
  return (
    <Async data={data.data} error={data.error}>
      {(f) => {
        const maxSent = Math.max(1, ...f.reminders.map((r) => r.sent));
        return (
          <div className="grid gap-5">
            <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
              <StatCard icon={Wallet} label={`Owed on ${f.owingBills} bills this term`} value={naira(f.owingKobo, { compact: true })} tone="orchid" />
              <StatCard icon={HandCoins} label={`Paid after a reminder (${f.recoveredBills} bills)`} value={naira(f.recoveredKobo, { compact: true })} tone="green" />
              <StatCard icon={CalendarClock} label={`Payment plans, ${f.plans.onTrack} on track`} value={String(f.plans.total)} delta={f.plans.behindKobo ? `${naira(f.plans.behindKobo, { compact: true })} behind` : undefined} tone="brand" />
              <StatCard icon={BellRing} label="Reminders due at the next check" value={String(f.dueToday.length)} tone="amber" />
            </div>
            <div className="grid gap-5 xl:grid-cols-[1fr_1.2fr]">
              <Card>
                <CardHeader title="Fee recovery" subtitle="Reminds every parent who owes, on a schedule, with a link to pay by card, transfer or USSD. Stops the moment the bill is paid." />
                <ErrorNote className="mb-2">{a.error}</ErrorNote>
                <SuccessNote className="mb-2">{a.notice}</SuccessNote>
                <Toggle
                  label="Send fee reminders automatically"
                  hint={f.enabled ? "On. Parents who owe get each reminder once." : "Off. Nothing is sent until you switch this on."}
                  on={seq.enabled}
                  disabled={a.busy}
                  onChange={(v) => void a.run(async () => { await api("automations/sequences/fee_overdue", { method: "PATCH", body: { enabled: v } }); onChanged(); await data.reload(); }, v ? "Fee recovery is on." : "Fee recovery is off.")}
                />
                <div className="flex flex-wrap items-end gap-3 py-3">
                  <div>
                    <Label>Fees are due this many days after the term starts</Label>
                    <Input type="number" min={0} max={120} defaultValue={f.feeDueDays} className="w-28" onBlur={(e) => Number(e.target.value) !== f.feeDueDays && void patch({ feeDueDays: Number(e.target.value) })} />
                  </div>
                  <p className="pb-3 text-sm text-muted">
                    {f.term ? (f.dueDate ? <>{f.term.name} fees are due on <b>{longDate(f.dueDate)}</b>.</> : <>Set {f.term.name}&apos;s start date in Settings to fix a due date.</>) : "Mark a term as current in Settings."}
                  </p>
                </div>
                <Toggle
                  label="Hold back report cards while fees are owed"
                  hint="Parents and students cannot open a term's report card until that term's bill is paid."
                  on={f.withholdResultsForDebt}
                  disabled={a.busy}
                  onChange={(v) => void a.run(async () => { await api("school", { method: "PATCH", body: { withholdResultsForDebt: v } }); await data.reload(); }, "Saved.")}
                />
                <Toggle
                  label="Release results to parents keeping to a payment plan"
                  hint="With report cards held, a parent who agreed instalments and is up to date can still see them."
                  on={f.holdAllowsPlans}
                  disabled={a.busy}
                  onChange={(v) => void patch({ holdAllowsPlans: v })}
                />
              </Card>
              <Card>
                <CardHeader title="Reminder ladder" subtitle="How many bills reached each step this term." />
                <ul className="grid gap-3">
                  {f.reminders.map((r) => (
                    <li key={r.step}>
                      <div className="mb-1 flex justify-between text-sm"><span className="font-semibold">{offsetLabel(r.offsetDays, "due date")}</span><span className="text-muted">{r.sent} bills · {r.messages} messages</span></div>
                      <Progress value={(r.sent / maxSent) * 100} />
                      <p className="mt-1 truncate text-xs text-muted">{sample(r.subject)}</p>
                    </li>
                  ))}
                </ul>
              </Card>
            </div>
            <Card>
              <CardHeader title="Due a reminder at the next check" subtitle={f.enabled ? "These go out within a few minutes, during sending hours." : "Switch fee recovery on to send these."} />
              {f.dueToday.length === 0 ? (
                <Empty title="No reminders due right now" />
              ) : (
                <Table>
                  <THead><tr><TH>Student</TH><TH>Reminder</TH><TH>Due date</TH><TH className="text-right">Amount asked</TH></tr></THead>
                  <tbody>
                    {f.dueToday.map((d) => (
                      <TR key={d.invoiceId}>
                        <TD className="font-semibold">{d.student}</TD>
                        <TD>Step {d.step + 1}{d.plan ? ` · instalment ${d.plan.index} of ${d.plan.count}` : ""}</TD>
                        <TD>{shortDate(d.dueDate)}</TD>
                        <TD className="text-right font-semibold">{naira(d.amountDueKobo)}</TD>
                      </TR>
                    ))}
                  </tbody>
                </Table>
              )}
            </Card>
            <SequenceCard sequence={seq} onSaved={() => { onChanged(); void data.reload(); }} hideToggle />
          </div>
        );
      }}
    </Async>
  );
}

// ---------------------------------------------------------------- Sequences

function SequenceCard({ sequence, onSaved, hideToggle }: { sequence: Sequence; onSaved: () => void; hideToggle?: boolean }) {
  const [steps, setSteps] = React.useState<SequenceStep[]>(sequence.steps);
  const [threshold, setThreshold] = React.useState(sequence.threshold ?? 3);
  const [open, setOpen] = React.useState<number | null>(null);
  const a = useAction();
  React.useEffect(() => setSteps(sequence.steps), [sequence.steps]);
  const anchor = sequence.trigger === "fee_overdue" ? "due date" : sequence.trigger === "new_parent" ? "day the parent is added" : "first missed day";
  const update = (i: number, s: Partial<SequenceStep>) => setSteps((all) => all.map((x, j) => (j === i ? { ...x, ...s } : x)));
  const save = () =>
    a.run(async () => {
      await api(`automations/sequences/${sequence.trigger}`, { method: "PATCH", body: { steps, ...(sequence.trigger === "absent_streak" ? { threshold } : {}) } });
      onSaved();
    }, "Saved. New wording is used from the next message.");
  const intro: Record<SequenceTrigger, string> = {
    fee_overdue: "The messages parents get, and when. Each bill gets each step once; paying stops the rest.",
    new_parent: "Welcomes parents added after you switch this on, and shows them the portal. Existing parents are not messaged.",
    absent_streak: "Checks in with parents when a child misses several school days in a row, on top of the daily absence alert.",
  };
  return (
    <Card>
      <CardHeader title={sequence.trigger === "fee_overdue" ? "Reminder wording and timing" : sequence.name} subtitle={intro[sequence.trigger]} />
      <ErrorNote className="mb-2">{a.error}</ErrorNote>
      <SuccessNote className="mb-2">{a.notice}</SuccessNote>
      {hideToggle ? null : (
        <Toggle
          label={`Send "${sequence.name}" automatically`}
          hint={sequence.enabled ? `On since ${dateTime(sequence.enabledAt)}.` : "Off."}
          on={sequence.enabled}
          disabled={a.busy}
          onChange={(v) => void a.run(async () => { await api(`automations/sequences/${sequence.trigger}`, { method: "PATCH", body: { enabled: v } }); onSaved(); }, v ? "Switched on." : "Switched off.")}
        />
      )}
      {sequence.trigger === "absent_streak" ? (
        <div className="py-3">
          <Label>Start after this many absences in a row</Label>
          <Input type="number" min={1} max={20} value={threshold} onChange={(e) => setThreshold(Number(e.target.value))} className="w-28" />
        </div>
      ) : null}
      <ol className="mt-2 grid gap-3">
        {steps.map((s, i) => (
          <li key={i} className="rounded-2xl border border-line p-4">
            <button className="flex w-full items-center justify-between gap-3 text-left" onClick={() => setOpen(open === i ? null : i)}>
              <span>
                <span className="block text-sm font-semibold">{i + 1}. {offsetLabel(s.offsetDays, anchor)}</span>
                <span className="text-xs text-muted">{s.channels.map((c) => CHANNELS.find((x) => x.key === c)?.label.replace(" (SMS or WhatsApp)", "")).join(", ")}</span>
              </span>
              <span className="text-xs font-semibold text-brand-600">{open === i ? "Close" : "Edit"}</span>
            </button>
            {open === i ? (
              <div className="mt-4 grid gap-3">
                <div className="flex flex-wrap items-end gap-3">
                  <div><Label>Days from the {anchor}</Label><Input type="number" value={s.offsetDays} onChange={(e) => update(i, { offsetDays: Number(e.target.value) })} className="w-28" /></div>
                  <div className="flex flex-wrap gap-3 pb-2">
                    {CHANNELS.map((c) => (
                      <label key={c.key} className="flex items-center gap-1.5 text-sm">
                        <input type="checkbox" checked={s.channels.includes(c.key)} onChange={(e) => update(i, { channels: e.target.checked ? [...s.channels, c.key] : s.channels.filter((x) => x !== c.key) })} />
                        {c.label}
                      </label>
                    ))}
                  </div>
                </div>
                <div><Label>Email subject</Label><Input value={s.subject} onChange={(e) => update(i, { subject: e.target.value })} /></div>
                <div><Label>Message</Label><Textarea rows={3} value={s.body} onChange={(e) => update(i, { body: e.target.value })} /></div>
                <p className="text-xs text-muted">Placeholders: {FIELDS[sequence.trigger].map((f) => `{{${f}}}`).join(" ")}</p>
                <div className="rounded-2xl bg-canvas p-3 text-sm"><span className="mb-1 block text-xs font-semibold text-muted uppercase">Preview</span>{sample(s.body)} <span className="text-xs text-muted">({sample(s.body).length} characters{sample(s.body).length > 160 ? ", more than one SMS" : ""})</span></div>
                <div className="flex justify-end"><Button size="sm" variant="ghost" onClick={() => { setSteps(steps.filter((_, j) => j !== i)); setOpen(null); }} disabled={steps.length === 1}><Trash2 className="h-4 w-4" /> Remove step</Button></div>
              </div>
            ) : null}
          </li>
        ))}
      </ol>
      <div className="mt-4 flex flex-wrap justify-between gap-2">
        <div className="flex gap-2">
          <Button variant="outline" size="sm" disabled={steps.length >= 10} onClick={() => { setSteps([...steps, { offsetDays: (steps.at(-1)?.offsetDays ?? 0) + 7, channels: ["preferred", "email"], subject: steps.at(-1)?.subject ?? "", body: steps.at(-1)?.body ?? "" }]); setOpen(steps.length); }}>
            <Plus className="h-4 w-4" /> Add step
          </Button>
          <Button variant="ghost" size="sm" disabled={a.busy} onClick={() => a.run(async () => { await api(`automations/sequences/${sequence.trigger}/reset`, { method: "POST" }); onSaved(); }, "Back to the standard wording.")}>
            <RotateCcw className="h-4 w-4" /> Reset to standard
          </Button>
        </div>
        <Button disabled={a.busy} onClick={save}>Save changes</Button>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------- Weekly report

function ChannelPicks({ value, onChange }: { value: FollowUpChannel[]; onChange: (v: FollowUpChannel[]) => void }) {
  return (
    <div className="flex flex-wrap gap-3">
      {CHANNELS.map((c) => (
        <label key={c.key} className="flex items-center gap-1.5 text-sm">
          <input type="checkbox" checked={value.includes(c.key)} onChange={(e) => onChange(e.target.checked ? [...value, c.key] : value.filter((x) => x !== c.key))} />
          {c.label}
        </label>
      ))}
    </div>
  );
}

function WeeklyTab({ settings, onSaved }: { settings: AutomationSettings; onSaved: () => void }) {
  const preview = useApi<{ guardian: { name: string }; subject: string; sms: string; email: string }>("automations/weekly-report/preview");
  const a = useAction();
  const patch = (body: Partial<AutomationSettings>) => a.run(async () => { await api("automations/settings", { method: "PATCH", body }); onSaved(); }, "Saved.");
  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_1.2fr]">
      <Card className="h-fit">
        <CardHeader title="Weekly parent report" subtitle="One short message per parent each week: attendance, new scores, practice tests and any fees owed, for all their children." />
        <ErrorNote className="mb-2">{a.error}</ErrorNote>
        <SuccessNote className="mb-2">{a.notice}</SuccessNote>
        <Toggle label="Send the weekly report" hint={settings.weeklyReport ? "On." : "Off."} on={settings.weeklyReport} disabled={a.busy} onChange={(v) => void patch({ weeklyReport: v })} />
        <div className="flex flex-wrap items-end gap-3 py-3">
          <div><Label>Day</Label><Select value={settings.weeklyDay} onChange={(e) => void patch({ weeklyDay: Number(e.target.value) })}>{DAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}</Select></div>
          <HourSelect label="From" value={settings.weeklyHour} onChange={(v) => void patch({ weeklyHour: v })} />
        </div>
        <Label>Send by</Label>
        <ChannelPicks value={settings.weeklyChannels} onChange={(v) => v.length && void patch({ weeklyChannels: v })} />
        <p className="mt-3 text-xs text-muted">Email goes only to parents with an address. Parents with several children get one message.</p>
      </Card>
      <Card>
        <CardHeader title="This week's report, as a parent sees it" subtitle={preview.data ? `For ${preview.data.guardian.name}` : undefined} />
        <Async data={preview.data} error={preview.error}>
          {(p) => (
            <div className="grid gap-4">
              <div>
                <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-muted uppercase"><MessageCircle className="h-3.5 w-3.5" /> SMS or WhatsApp</p>
                <div className="rounded-2xl rounded-tl-sm bg-emerald-50 p-3 text-sm whitespace-pre-line">{p.sms}</div>
              </div>
              <div>
                <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-muted uppercase"><Mail className="h-3.5 w-3.5" /> Email: {p.subject}</p>
                <div className="rounded-2xl border border-line p-4 text-sm whitespace-pre-line">{p.email}</div>
              </div>
            </div>
          )}
        </Async>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------- Daily summary

function DailyTab({ settings, onSaved }: { settings: AutomationSettings; onSaved: () => void }) {
  const preview = useApi<{ subject: string; text: string; email: string; recipients: DigestRecipient[] }>("automations/daily-summary/preview");
  const [people, setPeople] = React.useState<DigestRecipient[]>(settings.digestRecipients);
  const a = useAction();
  const patch = (body: Partial<AutomationSettings>, msg = "Saved.") => a.run(async () => { await api("automations/settings", { method: "PATCH", body }); onSaved(); await preview.reload(); }, msg);
  const edit = (i: number, r: Partial<DigestRecipient>) => setPeople((all) => all.map((x, j) => (j === i ? { ...x, ...r } : x)));
  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_1.2fr]">
      <Card className="h-fit">
        <CardHeader title="Proprietor's daily summary" subtitle="Every evening: money in today, how much of the term's fees is collected, attendance, and what the autopilot sent." />
        <ErrorNote className="mb-2">{a.error}</ErrorNote>
        <SuccessNote className="mb-2">{a.notice}</SuccessNote>
        <Toggle label="Send the daily summary" hint={settings.dailySummary ? "On." : "Off."} on={settings.dailySummary} disabled={a.busy} onChange={(v) => void patch({ dailySummary: v })} />
        <div className="py-3"><HourSelect label="At" value={settings.dailyHour} onChange={(v) => void patch({ dailyHour: v })} /></div>
        <Label>Who gets it</Label>
        <p className="mb-2 text-xs text-muted">Leave empty to email every proprietor account.</p>
        <ul className="grid gap-3">
          {people.map((p, i) => (
            <li key={i} className="grid gap-2 rounded-2xl border border-line p-3 sm:grid-cols-[1fr_auto]">
              <Input placeholder="Name" value={p.name} onChange={(e) => edit(i, { name: e.target.value })} />
              <Select value={p.channel} onChange={(e) => edit(i, { channel: e.target.value as DigestRecipient["channel"] })}>
                <option value="whatsapp">WhatsApp</option>
                <option value="sms">SMS</option>
                <option value="email">Email</option>
              </Select>
              {p.channel === "email" ? (
                <Input placeholder="Email address" type="email" value={p.email ?? ""} onChange={(e) => edit(i, { email: e.target.value })} />
              ) : (
                <Input placeholder="Phone, e.g. 0803 123 4567" value={p.phone ?? ""} onChange={(e) => edit(i, { phone: e.target.value })} />
              )}
              <Button variant="ghost" size="sm" onClick={() => setPeople(people.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /> Remove</Button>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex flex-wrap justify-between gap-2">
          <Button variant="outline" size="sm" onClick={() => setPeople([...people, { name: "", channel: "whatsapp", phone: "" }])}><Plus className="h-4 w-4" /> Add person</Button>
          <Button size="sm" disabled={a.busy} onClick={() => void patch({ digestRecipients: people.map((p) => ({ ...p, phone: p.phone || null, email: p.email || null })) }, "Recipients saved.")}>Save recipients</Button>
        </div>
      </Card>
      <Card>
        <CardHeader
          title="Today's summary so far"
          action={
            <Button size="sm" variant="outline" disabled={a.busy} onClick={() => a.run(() => api<{ queued: number }>("automations/daily-summary/send", { method: "POST" }), (r) => `Sent to ${r.queued} recipient${r.queued === 1 ? "" : "s"}.`)}>
              <Send className="h-4 w-4" /> Send now
            </Button>
          }
        />
        <Async data={preview.data} error={preview.error}>
          {(p) => (
            <div className="grid gap-3">
              <div className="rounded-2xl rounded-tl-sm bg-emerald-50 p-4 text-sm whitespace-pre-line">{p.text}</div>
              <p className="flex items-center gap-1.5 text-xs text-muted"><CheckCircle2 className="h-3.5 w-3.5" /> Goes to {p.recipients.length ? p.recipients.map((r) => r.name).join(", ") : "nobody yet"}.</p>
            </div>
          )}
        </Async>
      </Card>
    </div>
  );
}
