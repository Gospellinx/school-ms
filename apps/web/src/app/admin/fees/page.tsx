"use client";
import * as React from "react";
import { BellRing, FileStack, Plus, Search, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Async, Empty, ErrorNote, SuccessNote } from "@/components/ui/feedback";
import { Input, Label, Select } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Tabs } from "@/components/ui/tabs";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { StatCard } from "@/components/widgets/stat-card";
import { StatusBadge } from "@/components/widgets/status-badge";
import { Wallet } from "lucide-react";
import { api, useApi } from "@/lib/api";
import { TermSelect, useTerms } from "@/lib/terms";
import { useAction } from "@/lib/useAction";
import { dateTime, INVOICE_STATUS, naira, pct } from "@/lib/format";
import { className, type FeeItem, type FeeSummary, type Invoice, type InvoiceDetail, type SchoolClass, type Section } from "@/lib/types";

export default function Fees() {
  const { sessions, termId, setTermId, label } = useTerms();
  const summary = useApi<FeeSummary>(termId ? `terms/${termId}/fees/summary` : null);
  const invoices = useApi<Invoice[]>(termId ? `terms/${termId}/invoices` : null);
  const items = useApi<FeeItem[]>(termId ? `terms/${termId}/fees/items` : null);
  const { data: classes } = useApi<SchoolClass[]>("classes");
  const { data: sections } = useApi<Section[]>("sections");
  const [tab, setTab] = React.useState("Bills");
  const [q, setQ] = React.useState("");
  const [status, setStatus] = React.useState("");
  const [open, setOpen] = React.useState<string | null>(null);
  const a = useAction();

  const reload = () => {
    void summary.reload();
    void invoices.reload();
  };

  return (
    <>
      <PageHeader
        title="Fees"
        subtitle={`${label || "Choose a term"} · amounts in naira`}
        actions={
          <>
            <TermSelect sessions={sessions} value={termId} onChange={setTermId} />
            <Button
              variant="outline"
              disabled={a.busy || !termId}
              onClick={() => a.run(() => api<{ studentsOwing: number; messagesQueued: number }>(`terms/${termId}/fees/reminders`, { method: "POST", body: {} }), (r) => `Reminders queued for ${r.messagesQueued} parents of ${r.studentsOwing} students who owe.`)}
            >
              <BellRing className="h-4 w-4" /> Send reminders
            </Button>
          </>
        }
      />
      <ErrorNote className="mb-4">{a.error}</ErrorNote>
      <SuccessNote className="mb-4">{a.notice}</SuccessNote>

      <Async data={summary.data} error={summary.error}>
        {(s) => (
          <>
            <div className="mb-5 grid grid-cols-2 gap-4 xl:grid-cols-4">
              <StatCard icon={Wallet} label="Expected" value={naira(s.expectedKobo, { compact: true })} />
              <StatCard icon={Wallet} label="Collected" value={naira(s.collectedKobo, { compact: true })} delta={`${pct(s.collectedKobo, s.expectedKobo)}%`} tone="green" />
              <StatCard icon={Wallet} label="Outstanding" value={naira(s.outstandingKobo, { compact: true })} tone="orchid" />
              <StatCard icon={FileStack} label={`Bills: ${s.paid} paid, ${s.partPaid} part paid`} value={String(s.unpaid)} tone="amber" />
            </div>
            {s.byClass.length ? (
              <Card className="mb-5">
                <CardHeader title="By class" />
                <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {s.byClass.map((c) => (
                    <li key={c.classId} className="rounded-2xl bg-canvas p-4">
                      <div className="flex justify-between text-sm"><span className="font-semibold">{className({ name: c.className, arm: c.arm })}</span><span className="text-muted">{pct(c.collectedKobo, c.expectedKobo)}%</span></div>
                      <Progress className="my-2 bg-white" value={pct(c.collectedKobo, c.expectedKobo)} />
                      <p className="text-xs text-muted">{naira(c.collectedKobo)} of {naira(c.expectedKobo)} · {c.unpaid} not started paying</p>
                    </li>
                  ))}
                </ul>
              </Card>
            ) : null}
          </>
        )}
      </Async>

      <Tabs tabs={["Bills", "Fee items"]} value={tab} onChange={setTab} className="mb-4" />

      {tab === "Bills" ? (
        <Card>
          <div className="mb-4 flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <Search className="absolute top-3 left-3.5 h-4 w-4 text-muted" />
              <Input className="pl-10" placeholder="Search by name, admission or bill number" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <Select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
              <option value="">All bills</option>
              <option value="unpaid">Owing</option>
              <option value="part_paid">Part paid</option>
              <option value="paid">Paid</option>
            </Select>
          </div>
          <Async data={invoices.data} error={invoices.error}>
            {(rows) => {
              const needle = q.trim().toLowerCase();
              const shown = rows.filter((i) => (!status || i.status === status) && (!needle || `${i.student.name} ${i.student.admissionNumber} ${i.number}`.toLowerCase().includes(needle)));
              if (!rows.length) return <Empty title="No bills for this term">Add fee items, then generate bills from the Fee items tab.</Empty>;
              const cls = new Map((classes ?? []).map((c) => [c.id, className(c)]));
              return (
                <Table>
                  <THead><tr><TH>Student</TH><TH>Class</TH><TH className="text-right">Bill</TH><TH className="text-right">Paid</TH><TH className="text-right">Balance</TH><TH>Status</TH><TH /></tr></THead>
                  <tbody>
                    {shown.map((i) => (
                      <TR key={i.id}>
                        <TD><p className="font-semibold">{i.student.name}</p><p className="text-xs text-muted">{i.number}</p></TD>
                        <TD>{i.student.classId ? cls.get(i.student.classId) : ""}</TD>
                        <TD className="text-right">{naira(i.totalKobo)}</TD>
                        <TD className="text-right">{naira(i.paidKobo)}</TD>
                        <TD className="text-right font-semibold">{naira(i.balanceKobo)}</TD>
                        <TD><StatusBadge status={INVOICE_STATUS[i.status]} /></TD>
                        <TD className="text-right"><Button size="sm" variant="ghost" onClick={() => setOpen(i.id)}>{i.status === "paid" ? "View" : "Record payment"}</Button></TD>
                      </TR>
                    ))}
                  </tbody>
                </Table>
              );
            }}
          </Async>
        </Card>
      ) : (
        <FeeItems termId={termId} items={items} classes={classes ?? []} sections={sections ?? []} onGenerated={reload} />
      )}

      {open ? <InvoiceDialog id={open} onClose={() => setOpen(null)} onPaid={reload} /> : null}
    </>
  );
}

function FeeItems({
  termId,
  items,
  classes,
  sections,
  onGenerated,
}: {
  termId: string;
  items: ReturnType<typeof useApi<FeeItem[]>>;
  classes: SchoolClass[];
  sections: Section[];
  onGenerated: () => void;
}) {
  const a = useAction();
  const scopeOf = (i: FeeItem) =>
    i.classId ? className(classes.find((c) => c.id === i.classId) ?? { name: "A class" }) : i.sectionId ? sections.find((s) => s.id === i.sectionId)?.name ?? "A section" : "Whole school";

  async function add(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const scope = String(f.get("scope"));
    const r = await a.run(
      () =>
        api("fees/items", {
          method: "POST",
          body: {
            termId,
            name: String(f.get("name")).trim(),
            amountKobo: Math.round(Number(f.get("amount")) * 100),
            sectionId: scope.startsWith("s:") ? scope.slice(2) : undefined,
            classId: scope.startsWith("c:") ? scope.slice(2) : undefined,
          },
        }),
      "Fee item added. Generate bills to apply it.",
    );
    if (r) {
      form.reset();
      await items.reload();
    }
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[1.4fr_1fr]">
      <Card>
        <CardHeader
          title="Fee items this term"
          subtitle="Each student's bill is the sum of the items for the school, their section and their class."
          action={
            <Button
              disabled={a.busy || !items.data?.length}
              onClick={() =>
                a.run(async () => {
                  const r = await api<{ created: number; updated: number; lockedBecausePaid: number }>(`terms/${termId}/invoices/generate`, { method: "POST", body: {} });
                  onGenerated();
                  return r;
                }, (r) => `Bills: ${r.created} new, ${r.updated} updated${r.lockedBecausePaid ? `, ${r.lockedBecausePaid} left alone because they are fully paid` : ""}.`)
              }
            >
              <FileStack className="h-4 w-4" /> Generate bills
            </Button>
          }
        />
        <ErrorNote className="mb-3">{a.error}</ErrorNote>
        <SuccessNote className="mb-3">{a.notice}</SuccessNote>
        <Async data={items.data} error={items.error}>
          {(rows) =>
            rows.length === 0 ? (
              <Empty title="No fee items yet" />
            ) : (
              <ul className="divide-y divide-line">
                {rows.map((i) => (
                  <li key={i.id} className="flex items-center gap-3 py-3">
                    <span className="flex-1"><span className="block font-semibold">{i.name}</span><span className="text-xs text-muted">{scopeOf(i)}</span></span>
                    <span className="font-semibold">{naira(i.amountKobo)}</span>
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={`Remove ${i.name}`}
                      onClick={() => a.run(async () => { await api(`fees/items/${i.id}`, { method: "DELETE" }); await items.reload(); }, "Removed. Generate bills again to update them.")}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </li>
                ))}
              </ul>
            )
          }
        </Async>
      </Card>
      <Card>
        <CardHeader title="Add a fee item" />
        <form className="grid gap-4" onSubmit={add}>
          <div><Label>Name</Label><Input name="name" required placeholder="Tuition" /></div>
          <div><Label>Amount (₦)</Label><Input name="amount" type="number" min={1} step="0.01" required placeholder="150000" /></div>
          <div>
            <Label>Who pays it</Label>
            <Select name="scope" className="w-full" defaultValue="">
              <option value="">Whole school</option>
              <optgroup label="Section">{sections.map((s) => <option key={s.id} value={`s:${s.id}`}>{s.name}</option>)}</optgroup>
              <optgroup label="Class">{classes.map((c) => <option key={c.id} value={`c:${c.id}`}>{className(c)}</option>)}</optgroup>
            </Select>
          </div>
          <Button disabled={a.busy || !termId}><Plus className="h-4 w-4" /> Add item</Button>
        </form>
      </Card>
    </div>
  );
}

function InvoiceDialog({ id, onClose, onPaid }: { id: string; onClose: () => void; onPaid: () => void }) {
  const inv = useApi<InvoiceDetail>(`invoices/${id}`);
  const a = useAction();
  async function record(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const r = await a.run(
      () => api(`invoices/${id}/payments`, { method: "POST", body: { amountKobo: Math.round(Number(f.get("amount")) * 100), method: f.get("method"), note: String(f.get("note") || "") || undefined } }),
      "Payment recorded. The parent gets a receipt by SMS.",
    );
    if (r) {
      form.reset();
      await inv.reload();
      onPaid();
    }
  }
  return (
    <Dialog open onClose={onClose} wide title={inv.data ? inv.data.student.name : "Bill"} subtitle={inv.data ? `${inv.data.number} · ${inv.data.term} ${inv.data.session}` : undefined}>
      <Async data={inv.data} error={inv.error}>
        {(d) => (
          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <p className="mb-2 text-xs font-semibold tracking-wider text-muted uppercase">Bill</p>
              <ul className="divide-y divide-line rounded-2xl bg-canvas px-4">
                {d.lines.map((l) => <li key={l.id} className="flex justify-between py-2 text-sm"><span>{l.name}</span><span className="font-semibold">{naira(l.amountKobo)}</span></li>)}
                <li className="flex justify-between py-2 text-sm font-bold"><span>Total</span><span>{naira(d.totalKobo)}</span></li>
              </ul>
              <p className="mt-4 mb-2 text-xs font-semibold tracking-wider text-muted uppercase">Payments</p>
              {d.payments.length ? (
                <ul className="flex flex-col gap-2">
                  {d.payments.map((p) => (
                    <li key={p.id} className="flex items-center justify-between rounded-2xl border border-line px-3 py-2 text-sm">
                      <span><span className="font-semibold">{naira(p.amountKobo)}</span> <span className="text-muted">· {p.method.replace("_", " ")} · {dateTime(p.paidAt ?? p.createdAt)}</span></span>
                      <StatusBadge status={p.status === "success" ? "Successful" : p.status === "pending" ? "Pending" : "Failed"} />
                    </li>
                  ))}
                </ul>
              ) : <p className="text-sm text-muted">Nothing paid yet.</p>}
            </div>
            <div>
              <div className="mb-4 rounded-2xl bg-brand-50 p-4">
                <p className="text-sm text-brand-700">Balance</p>
                <p className="text-2xl font-bold">{naira(d.balanceKobo)}</p>
              </div>
              {d.balanceKobo > 0 ? (
                <form className="grid gap-3" onSubmit={record}>
                  <ErrorNote>{a.error}</ErrorNote>
                  <SuccessNote>{a.notice}</SuccessNote>
                  <div><Label>Amount received (₦)</Label><Input name="amount" type="number" min={1} step="0.01" max={d.balanceKobo / 100} defaultValue={d.balanceKobo / 100} required /></div>
                  <div><Label>Paid by</Label><Select name="method" className="w-full"><option value="bank_transfer">Bank transfer</option><option value="cash">Cash</option><option value="pos">POS</option></Select></div>
                  <div><Label>Note</Label><Input name="note" placeholder="Teller number, receipt book…" /></div>
                  <Button disabled={a.busy}>Record payment</Button>
                </form>
              ) : <SuccessNote>Fully paid.</SuccessNote>}
            </div>
          </div>
        )}
      </Async>
    </Dialog>
  );
}
