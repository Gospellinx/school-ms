"use client";
import * as React from "react";
import { CalendarClock, Check, Copy, GraduationCap, Mail, Send, ThumbsDown, ThumbsUp, Wallet } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Async, ErrorNote, SuccessNote } from "@/components/ui/feedback";
import { api, useApi } from "@/lib/api";
import { useAction } from "@/lib/useAction";
import { dateTime, longDate, naira } from "@/lib/format";
import { EVENT_LABEL, STATUS_TONE, type ApplicationDetail } from "@/lib/admissions";

/** datetime-local value for a date, in the browser's time zone. */
function localInput(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function ScheduleDialog({ ids, onClose, onDone }: { ids: string[] | null; onClose: () => void; onDone: () => void | Promise<void> }) {
  const start = new Date();
  start.setDate(start.getDate() + ((6 - start.getDay() + 7) % 7 || 7));
  start.setHours(9, 0, 0, 0);
  const [opensAt, setOpensAt] = React.useState(localInput(start));
  const [closesAt, setClosesAt] = React.useState(localInput(new Date(start.getTime() + 8 * 3600_000)));
  const a = useAction();
  async function save(e: React.FormEvent) {
    e.preventDefault();
    const r = await a.run(() =>
      api<{ scheduled: number; skipped: { reference: string; reason: string }[] }>("admissions/schedule-exam", {
        method: "POST",
        body: { applicationIds: ids, opensAt: new Date(opensAt).toISOString(), closesAt: new Date(closesAt).toISOString() },
      }),
    );
    if (r) {
      if (r.skipped.length) alert(`${r.scheduled} invited. Skipped: ${r.skipped.map((s) => `${s.reference} (${s.reason})`).join(", ")}`);
      await onDone();
    }
  }
  return (
    <Dialog open={ids !== null} onClose={onClose} title="Schedule the entrance exam" subtitle={`${ids?.length ?? 0} applicant${ids?.length === 1 ? "" : "s"} will get an email invitation, a reminder the day before, and a last call before it closes.`}>
      <form onSubmit={save} className="flex flex-col gap-4">
        <ErrorNote>{a.error}</ErrorNote>
        <div className="grid gap-4 sm:grid-cols-2">
          <div><Label>Opens</Label><Input type="datetime-local" required value={opensAt} onChange={(e) => setOpensAt(e.target.value)} /></div>
          <div><Label>Closes</Label><Input type="datetime-local" required value={closesAt} onChange={(e) => setClosesAt(e.target.value)} /></div>
        </div>
        <p className="text-xs text-muted">Applicants can sit it at home on a phone, or at the school's CBT centre, any time in this window.</p>
        <Button disabled={a.busy}><CalendarClock className="h-4 w-4" /> {a.busy ? "Sending invitations…" : "Send invitations"}</Button>
      </form>
    </Dialog>
  );
}

export function ApplicationDialog({ id, onClose, onChanged }: { id: string | null; onClose: () => void; onChanged: () => void | Promise<void> }) {
  const d = useApi<ApplicationDetail>(id ? `admissions/applications/${id}` : null);
  const a = useAction();
  const [mode, setMode] = React.useState<null | "offer" | "reject" | "message" | "enrol" | "schedule">(null);
  const [note, setNote] = React.useState("");
  const [subject, setSubject] = React.useState("");
  const [admissionNumber, setAdmissionNumber] = React.useState("");
  const [method, setMethod] = React.useState("bank_transfer");
  const [comment, setComment] = React.useState("");
  const [copied, setCopied] = React.useState(false);

  React.useEffect(() => {
    setMode(null);
    setNote("");
    a.setError(null);
    a.setNotice(null);
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function act(path: string, body: unknown, done: string | ((r: any) => string)) {
    const r = await a.run(() => api(`admissions/applications/${id}/${path}`, { method: "POST", body }), done);
    if (r) {
      setMode(null);
      setNote("");
      await api("admissions/emails/dispatch", { method: "POST" }).catch(() => null);
      await Promise.all([d.reload(), onChanged()]);
    }
  }

  return (
    <Dialog open={id !== null} onClose={onClose} title={d.data?.childName ?? "Application"} subtitle={d.data ? `${d.data.reference} · ${d.data.className}` : undefined} wide>
      <Async data={d.data} error={d.error}>
        {(x) => (
          <div className="flex flex-col gap-5">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={STATUS_TONE[x.status]}>{x.statusLabel}</Badge>
              {x.feeKobo > 0 ? <Badge tone={x.feePaidAt ? "green" : "amber"}>{x.feePaidAt ? `Fee paid · ${x.feeMethod}` : `Fee of ${naira(x.feeKobo)} owing`}</Badge> : null}
              {x.student ? <Badge tone="green">Admission no. {x.student.admissionNumber}</Badge> : null}
              <button
                className="ml-auto flex items-center gap-1.5 text-xs font-semibold text-brand-700"
                onClick={async () => {
                  await navigator.clipboard.writeText(x.statusLink).catch(() => null);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                }}
              >
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} {copied ? "Copied" : "Copy family's status link"}
              </button>
            </div>
            <SuccessNote>{a.notice}</SuccessNote>
            <ErrorNote>{a.error}</ErrorNote>

            {/* Actions for the current stage */}
            <div className="flex flex-wrap gap-2">
              {x.status === "pending_payment" ? (
                <span className="flex items-center gap-2">
                  <Select value={method} onChange={(e) => setMethod(e.target.value)}><option value="bank_transfer">Bank transfer</option><option value="cash">Cash</option><option value="pos">POS</option></Select>
                  <Button variant="secondary" disabled={a.busy} onClick={() => act("mark-paid", { method }, "Form fee recorded. The family has been emailed.")}><Wallet className="h-4 w-4" /> Mark fee paid</Button>
                </span>
              ) : null}
              {x.entranceTestId && (x.status === "applied" || (x.status === "exam" && !x.exam?.submittedAt)) ? <Button variant="secondary" onClick={() => setMode("schedule")}><CalendarClock className="h-4 w-4" /> {x.status === "exam" ? "Reschedule exam" : "Schedule exam"}</Button> : null}
              {x.status === "applied" || x.status === "exam" ? <Button onClick={() => setMode("offer")}><ThumbsUp className="h-4 w-4" /> Offer a place</Button> : null}
              {x.status === "offered" || x.status === "accepted" ? <Button onClick={() => setMode("enrol")}><GraduationCap className="h-4 w-4" /> Enrol</Button> : null}
              {!["enrolled", "rejected", "withdrawn"].includes(x.status) ? <Button variant="danger" onClick={() => setMode("reject")}><ThumbsDown className="h-4 w-4" /> Decline</Button> : null}
              <Button variant="outline" onClick={() => setMode("message")}><Mail className="h-4 w-4" /> Email family</Button>
            </div>

            {mode === "offer" || mode === "reject" ? (
              <div className="rounded-2xl bg-canvas p-4">
                <Label>{mode === "offer" ? "Note in the offer email (optional)" : "Note in the email (optional)"}</Label>
                <Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder={mode === "offer" ? "Resumption date, what to bring, boarding…" : "You are welcome to apply again next session."} />
                <div className="mt-3 flex gap-2">
                  <Button disabled={a.busy} variant={mode === "offer" ? "primary" : "danger"} onClick={() => act(mode, { note: note || undefined }, mode === "offer" ? "Offer sent by email and SMS. Reminders follow after 3 and 7 days if not accepted." : "The family has been told by email.")}>
                    <Send className="h-4 w-4" /> {mode === "offer" ? "Send offer" : "Send decision"}
                  </Button>
                  <Button variant="ghost" onClick={() => setMode(null)}>Cancel</Button>
                </div>
              </div>
            ) : null}
            {mode === "enrol" ? (
              <div className="rounded-2xl bg-canvas p-4">
                <Label>Admission number (leave empty to create one)</Label>
                <Input value={admissionNumber} onChange={(e) => setAdmissionNumber(e.target.value)} placeholder="e.g. GCIS/J1/2601" />
                <p className="mt-2 text-xs text-muted">Creates the student in {x.className}, links the parent by phone, sets a portal PIN and emails the family a welcome letter.</p>
                <div className="mt-3 flex gap-2">
                  <Button disabled={a.busy} onClick={() => act("enrol", { admissionNumber: admissionNumber || undefined }, (r: { student: { admissionNumber: string }; pin: string }) => `Enrolled as ${r.student.admissionNumber}. Portal PIN ${r.pin} was emailed to the family.`)}><GraduationCap className="h-4 w-4" /> Enrol student</Button>
                  <Button variant="ghost" onClick={() => setMode(null)}>Cancel</Button>
                </div>
              </div>
            ) : null}
            {mode === "message" ? (
              <div className="rounded-2xl bg-canvas p-4">
                <Label>Subject</Label>
                <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="About your application" />
                <Label className="mt-3">Message</Label>
                <Textarea rows={4} value={note} onChange={(e) => setNote(e.target.value)} />
                <div className="mt-3 flex gap-2">
                  <Button disabled={a.busy || subject.length < 2 || note.length < 2} onClick={() => act("message", { subject, message: note }, `Email sent to ${x.parentEmail}.`)}><Send className="h-4 w-4" /> Send email</Button>
                  <Button variant="ghost" onClick={() => setMode(null)}>Cancel</Button>
                </div>
              </div>
            ) : null}
            <ScheduleDialog ids={mode === "schedule" ? [x.id] : null} onClose={() => setMode(null)} onDone={async () => { setMode(null); await Promise.all([d.reload(), onChanged()]); }} />

            <div className="grid gap-5 md:grid-cols-2">
              <div className="rounded-2xl border border-line p-4 text-sm">
                <p className="mb-2 font-semibold">Child</p>
                <p>{[x.firstName, x.otherNames, x.lastName].filter(Boolean).join(" ")}{x.gender ? ` · ${x.gender === "female" ? "Girl" : "Boy"}` : ""}</p>
                {x.dateOfBirth ? <p className="text-muted">Born {longDate(x.dateOfBirth)}</p> : null}
                {x.previousSchool ? <p className="text-muted">From {x.previousSchool}</p> : null}
                <p className="mt-3 mb-2 font-semibold">Parent</p>
                <p>{x.parentName}{x.relationship ? ` (${x.relationship})` : ""}</p>
                <p className="text-muted"><a href={`tel:+${x.parentPhone}`}>0{x.parentPhone.slice(3)}</a> · <a href={`mailto:${x.parentEmail}`}>{x.parentEmail}</a></p>
                {x.address ? <p className="text-muted">{x.address}</p> : null}
                {x.notes ? <p className="mt-3 rounded-xl bg-canvas p-2">{x.notes}</p> : null}
              </div>
              <div className="rounded-2xl border border-line p-4 text-sm">
                <p className="mb-2 font-semibold">Entrance exam</p>
                {x.exam ? (
                  x.exam.submittedAt ? (
                    <>
                      <p className="text-3xl font-bold">{Math.round(x.exam.percentage ?? 0)}%</p>
                      <p className="text-muted">{x.exam.score} of {x.exam.maxScore} marks · {x.exam.answered}/{x.exam.questions} answered{x.passMark !== null ? ` · pass mark ${x.passMark}%` : ""}</p>
                      <ul className="mt-3 flex flex-col gap-2">
                        {x.exam.subjects.map((s) => (
                          <li key={s.name}>
                            <div className="flex justify-between text-xs"><span>{s.name}</span><span className="font-semibold">{s.correct}/{s.questions}</span></div>
                            <Progress className="mt-1" value={s.percentage} barClassName={s.percentage >= (x.passMark ?? 50) ? "bg-emerald-500" : "bg-rose-400"} />
                          </li>
                        ))}
                      </ul>
                    </>
                  ) : (
                    <p className="text-muted">In progress since {dateTime(x.exam.startedAt)}</p>
                  )
                ) : x.examOpensAt ? (
                  <p className="text-muted">Booked: {dateTime(x.examOpensAt)} to {dateTime(x.examClosesAt)}</p>
                ) : x.entranceTestId ? (
                  <p className="text-muted">Not booked yet.</p>
                ) : (
                  <p className="text-muted">This class has no entrance exam.</p>
                )}
              </div>
            </div>

            <div className="grid gap-5 md:grid-cols-2">
              <div>
                <p className="mb-2 font-semibold">Timeline</p>
                <ul className="flex flex-col gap-2 text-sm">
                  {x.events.map((e) => (
                    <li key={e.id} className="flex gap-2">
                      <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand-500" />
                      <span><strong>{EVENT_LABEL[e.kind] ?? e.kind}</strong>{e.detail ? ` · ${e.detail}` : ""}<br /><span className="text-xs text-muted">{dateTime(e.createdAt)}</span></span>
                    </li>
                  ))}
                </ul>
                <form
                  className="mt-3 flex gap-2"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    if (!comment.trim()) return;
                    await act("notes", { text: comment }, "Note added.");
                    setComment("");
                  }}
                >
                  <Input value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Add a note for the team" />
                  <Button variant="outline" disabled={!comment.trim()}>Add</Button>
                </form>
              </div>
              <div>
                <p className="mb-2 font-semibold">Emails</p>
                <ul className="flex flex-col gap-2 text-sm">
                  {x.emails.map((m) => (
                    <li key={m.id} className="rounded-xl bg-canvas px-3 py-2">
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-medium">{m.subject}</span>
                        <Badge tone={m.status === "sent" ? "green" : m.status === "failed" ? "red" : m.status === "skipped" ? "gray" : "blue"}>
                          {m.status === "queued" && Date.parse(m.sendAfter) > Date.now() ? "Scheduled" : m.status === "skipped" ? "Not needed" : m.status[0].toUpperCase() + m.status.slice(1)}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted">{m.sentAt ? `Sent ${dateTime(m.sentAt)}` : `Due ${dateTime(m.sendAfter)}`} · {m.to}</p>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}
      </Async>
    </Dialog>
  );
}
