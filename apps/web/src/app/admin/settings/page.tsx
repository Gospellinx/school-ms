"use client";
import * as React from "react";
import { CheckCircle2, Plus } from "lucide-react";
import { SettingsPage, Toggle } from "@/components/pages/settings";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Async, ErrorNote, SuccessNote } from "@/components/ui/feedback";
import { Input, Label, Select } from "@/components/ui/input";
import { api, useApi } from "@/lib/api";
import { useStaff } from "@/lib/session";
import { useAction } from "@/lib/useAction";
import type { School, Section, Session } from "@/lib/types";

function SchoolProfile() {
  const me = useStaff();
  const a = useAction();
  const [withhold, setWithhold] = React.useState(me.school.withholdResultsForDebt);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const s = (k: string) => String(f.get(k) ?? "").trim() || null;
    await a.run(() => api<School>("school", { method: "PATCH", body: { name: s("name"), motto: s("motto"), address: s("address"), phone: s("phone"), email: s("email") } }), "School details saved. They appear on report cards.");
  }
  return (
    <div className="grid max-w-3xl gap-5">
      <Card>
        <CardHeader title="School details" subtitle={`School code: ${me.school.slug}. Parents, students and staff type this to sign in.`} />
        <form className="grid gap-4 sm:grid-cols-2" onSubmit={submit}>
          <ErrorNote className="sm:col-span-2">{a.error}</ErrorNote>
          <SuccessNote className="sm:col-span-2">{a.notice}</SuccessNote>
          <div className="sm:col-span-2"><Label>Name</Label><Input name="name" defaultValue={me.school.name} required /></div>
          <div><Label>Motto</Label><Input name="motto" defaultValue={me.school.motto ?? ""} /></div>
          <div><Label>Phone</Label><Input name="phone" defaultValue={me.school.phone ?? ""} /></div>
          <div><Label>Email</Label><Input name="email" type="email" defaultValue={me.school.email ?? ""} /></div>
          <div><Label>Address</Label><Input name="address" defaultValue={me.school.address ?? ""} /></div>
          <div className="flex justify-end sm:col-span-2"><Button disabled={a.busy}>Save</Button></div>
        </form>
      </Card>
      <Card>
        <CardHeader title="Results and fees" />
        <Toggle
          label="Hold back report cards while fees are owed"
          hint="Parents and students cannot open a term's report card until that term's bill is paid. Staff still see everything."
          on={withhold}
          disabled={a.busy}
          onChange={(v) => void a.run(async () => { await api("school", { method: "PATCH", body: { withholdResultsForDebt: v } }); setWithhold(v); }, "Saved.")}
        />
      </Card>
    </div>
  );
}

function Calendar() {
  const sessions = useApi<Session[]>("sessions");
  const a = useAction();
  const ordered = [...(sessions.data ?? [])].sort((x, y) => y.name.localeCompare(x.name));
  async function addSession(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const name = String(new FormData(form).get("name")).trim();
    const r = await a.run(() => api("sessions", { method: "POST", body: { name } }), `${name} created with First, Second and Third term.`);
    if (r) {
      form.reset();
      await sessions.reload();
    }
  }
  const saveDates = (termId: string, startsOn: string, endsOn: string) =>
    a.run(async () => { await api(`terms/${termId}`, { method: "PATCH", body: { startsOn: startsOn || null, endsOn: endsOn || null } }); await sessions.reload(); }, "Term dates saved.");
  return (
    <div className="grid max-w-4xl gap-5">
      <ErrorNote>{a.error}</ErrorNote>
      <SuccessNote>{a.notice}</SuccessNote>
      <Card>
        <CardHeader title="New session" subtitle="Each session gets First, Second and Third term." />
        <form className="flex flex-wrap items-end gap-3" onSubmit={addSession}>
          <div><Label>Session</Label><Input name="name" required pattern="\d{4}/\d{4}" placeholder="2027/2028" /></div>
          <Button disabled={a.busy}><Plus className="h-4 w-4" /> Create</Button>
        </form>
      </Card>
      <Async data={sessions.data} error={sessions.error}>
        {() => (
          <>
            {ordered.map((s) => (
              <Card key={s.id}>
                <CardHeader title={s.name} subtitle="Term dates count school days for attendance on report cards." />
                <ul className="divide-y divide-line">
                  {s.terms.map((t) => (
                    <TermRow key={t.id} term={t} busy={a.busy} onSave={saveDates} onMakeCurrent={() => a.run(async () => { await api(`terms/${t.id}/make-current`, { method: "POST" }); await sessions.reload(); }, `${t.name} ${s.name} is now the current term.`)} />
                  ))}
                </ul>
              </Card>
            ))}
          </>
        )}
      </Async>
    </div>
  );
}

function TermRow({ term, busy, onSave, onMakeCurrent }: { term: Session["terms"][number]; busy: boolean; onSave: (id: string, s: string, e: string) => void; onMakeCurrent: () => void }) {
  const [start, setStart] = React.useState(term.startsOn ?? "");
  const [end, setEnd] = React.useState(term.endsOn ?? "");
  return (
    <li className="flex flex-wrap items-end gap-3 py-3">
      <div className="min-w-[130px] flex-1">
        <p className="font-semibold">{term.name}</p>
        {term.isCurrent ? <Badge tone="green"><CheckCircle2 className="h-3 w-3" /> Current</Badge> : null}
      </div>
      <div><Label className="text-xs">Starts</Label><Input type="date" value={start} onChange={(e) => setStart(e.target.value)} /></div>
      <div><Label className="text-xs">Ends</Label><Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} /></div>
      <Button variant="secondary" disabled={busy} onClick={() => onSave(term.id, start, end)}>Save dates</Button>
      {!term.isCurrent ? <Button variant="outline" disabled={busy} onClick={onMakeCurrent}>Make current</Button> : null}
    </li>
  );
}

function Grading() {
  const { data, error } = useApi<Section[]>("sections");
  return (
    <Async data={data} error={error}>
      {(sections) => (
        <div className="grid gap-5 lg:grid-cols-2">
          {sections.map((s) => (
            <Card key={s.id}>
              <CardHeader title={s.name} subtitle={s.components.map((c) => `${c.label} ${c.maxScore}`).join(" · ")} />
              <div className="flex flex-wrap gap-1.5">
                {s.gradingScale.map((g) => <Badge key={g.grade} tone="brand">{g.grade} {Math.round(g.min)}–{Math.floor(g.max)}</Badge>)}
              </div>
            </Card>
          ))}
        </div>
      )}
    </Async>
  );
}

function Payments() {
  const me = useStaff();
  const a = useAction();
  const [banks, setBanks] = React.useState<{ name: string; code: string }[] | null>(null);
  const connected = Boolean(me.school.paystackSubaccountCode);
  async function loadBanks() {
    const r = await a.run(() => api<{ name: string; code: string }[]>("fees/paystack/banks"));
    if (r) setBanks(r);
  }
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    await a.run(
      () => api<{ accountName: string | null }>("fees/paystack/subaccount", { method: "POST", body: { bankCode: f.get("bankCode"), accountNumber: String(f.get("accountNumber")).trim() } }),
      (r) => `Connected${r.accountName ? ` to ${r.accountName}` : ""}. Online fee payments now settle to this account.`,
    );
  }
  return (
    <Card className="max-w-3xl">
      <CardHeader
        title="Online fee payments (Paystack)"
        subtitle="Parents pay by card, bank transfer or USSD. Money settles straight to the school's bank account."
        action={connected ? <Badge tone="green">Connected</Badge> : <Badge tone="amber">Not connected</Badge>}
      />
      <ErrorNote className="mb-3">{a.error}</ErrorNote>
      <SuccessNote className="mb-3">{a.notice}</SuccessNote>
      {me.staff.role !== "proprietor" ? (
        <p className="text-sm text-muted">Only the proprietor can connect the school&apos;s bank account.</p>
      ) : banks ? (
        <form className="grid gap-4 sm:grid-cols-2" onSubmit={submit}>
          <div><Label>Bank</Label><Select name="bankCode" className="w-full" required>{banks.map((b) => <option key={b.code} value={b.code}>{b.name}</option>)}</Select></div>
          <div><Label>Account number (NUBAN)</Label><Input name="accountNumber" inputMode="numeric" pattern="\d{10}" required /></div>
          <div className="flex justify-end sm:col-span-2"><Button disabled={a.busy}>{connected ? "Change account" : "Connect account"}</Button></div>
        </form>
      ) : (
        <Button variant="secondary" disabled={a.busy} onClick={loadBanks}>{connected ? "Change bank account" : "Connect a bank account"}</Button>
      )}
    </Card>
  );
}

export default function Settings() {
  return <SettingsPage extraTabs={{ School: <SchoolProfile />, Calendar: <Calendar />, Grading: <Grading />, Payments: <Payments /> }} />;
}
