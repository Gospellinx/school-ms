"use client";
import * as React from "react";
import { KeyRound, Plus, Printer, Search, Upload } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { Card } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { Async, Empty, ErrorNote, SuccessNote } from "@/components/ui/feedback";
import { StatusBadge } from "@/components/widgets/status-badge";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { api, useApi } from "@/lib/api";
import { useAction } from "@/lib/useAction";
import { currentTermId } from "@/lib/terms";
import { INVOICE_STATUS, naira, phone } from "@/lib/format";
import { className, type Guardian, type Invoice, type SchoolClass, type Session, type Student, type StudentAttendance } from "@/lib/types";

const CSV_EXAMPLE = `admission_number,first_name,last_name,gender,parent_name,parent_phone,parent_email
GCIS/S/101,Ada,Okafor,F,Mrs Okafor,0803 123 4567,
GCIS/S/102,Bayo,Adeyemi,M,Mr Adeyemi,08051112222,`;

type Slip = { admissionNumber: string; name: string; pin: string };

export default function Students() {
  const students = useApi<Student[]>("students");
  const { data: classes } = useApi<SchoolClass[]>("classes");
  const guardians = useApi<Guardian[]>("guardians");
  const { data: sessions } = useApi<Session[]>("sessions");
  const termId = currentTermId(sessions);
  const { data: invoices } = useApi<Invoice[]>(termId ? `terms/${termId}/invoices` : null);

  const [q, setQ] = React.useState("");
  const [classId, setClassId] = React.useState("");
  const [dialog, setDialog] = React.useState<"add" | "import" | "pins" | null>(null);
  const [viewing, setViewing] = React.useState<Student | null>(null);
  const [slips, setSlips] = React.useState<Slip[] | null>(null);

  const classById = new Map((classes ?? []).map((c) => [c.id, c]));
  const parentsOf = (id: string) => (guardians.data ?? []).filter((g) => g.students.some((s) => s.studentId === id));
  const invoiceOf = new Map((invoices ?? []).map((i) => [i.studentId, i]));
  const reloadAll = () => {
    void students.reload();
    void guardians.reload();
  };

  return (
    <>
      <PageHeader
        title="Students"
        subtitle={students.data ? `${students.data.length} students across ${classes?.length ?? 0} classes.` : "Loading…"}
        actions={
          <>
            <Button variant="outline" onClick={() => setDialog("pins")}><KeyRound className="h-4 w-4" /> Login PINs</Button>
            <Button variant="outline" onClick={() => setDialog("import")}><Upload className="h-4 w-4" /> Import CSV</Button>
            <Button onClick={() => setDialog("add")}><Plus className="h-4 w-4" /> Add student</Button>
          </>
        }
      />
      <Card>
        <div className="mb-4 flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <Search className="absolute top-3 left-3.5 h-4 w-4 text-muted" />
            <Input className="pl-10" placeholder="Search by name or admission number" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <Select value={classId} onChange={(e) => setClassId(e.target.value)} aria-label="Class">
            <option value="">All classes</option>
            {(classes ?? []).map((c) => <option key={c.id} value={c.id}>{className(c)}</option>)}
          </Select>
        </div>
        <Async data={students.data} error={students.error}>
          {(rows) => {
            const needle = q.trim().toLowerCase();
            const shown = rows.filter(
              (s) =>
                (!classId || s.classId === classId) &&
                (!needle || `${s.firstName} ${s.lastName} ${s.admissionNumber}`.toLowerCase().includes(needle)),
            );
            if (!rows.length) return <Empty title="No students yet">Add students one at a time, or import a class from a spreadsheet saved as CSV.</Empty>;
            return (
              <Table>
                <THead><tr><TH>Student</TH><TH>Class</TH><TH>Parent / guardian</TH><TH>Fees this term</TH><TH>PIN</TH><TH /></tr></THead>
                <tbody>
                  {shown.map((s) => {
                    const p = parentsOf(s.id)[0];
                    const inv = invoiceOf.get(s.id);
                    const cls = s.classId ? classById.get(s.classId) : undefined;
                    return (
                      <TR key={s.id}>
                        <TD>
                          <div className="flex items-center gap-3">
                            <Avatar name={`${s.firstName} ${s.lastName}`} size={34} />
                            <div><p className="font-semibold">{s.lastName} {s.firstName}</p><p className="text-xs text-muted">{s.admissionNumber}</p></div>
                          </div>
                        </TD>
                        <TD>{cls ? className(cls) : <span className="text-muted">No class</span>}</TD>
                        <TD>{p ? <><p>{p.fullName}</p><p className="text-xs text-muted">{phone(p.phone)}</p></> : <span className="text-muted">None</span>}</TD>
                        <TD>{inv ? <StatusBadge status={INVOICE_STATUS[inv.status]} /> : <span className="text-muted">No bill</span>}</TD>
                        <TD>{s.hasPin ? <Badge tone="green">Set</Badge> : <Badge tone="gray">None</Badge>}</TD>
                        <TD className="text-right"><Button size="sm" variant="ghost" onClick={() => setViewing(s)}>View</Button></TD>
                      </TR>
                    );
                  })}
                </tbody>
              </Table>
            );
          }}
        </Async>
      </Card>

      <AddStudent open={dialog === "add"} onClose={() => setDialog(null)} classes={classes ?? []} onDone={reloadAll} />
      <ImportStudents open={dialog === "import"} onClose={() => setDialog(null)} classes={classes ?? []} onDone={reloadAll} />
      <IssuePins
        open={dialog === "pins"}
        onClose={() => setDialog(null)}
        classes={classes ?? []}
        onDone={(s) => {
          setSlips(s);
          setDialog(null);
          void students.reload();
        }}
      />
      <PinSlips slips={slips} onClose={() => setSlips(null)} />
      {viewing ? (
        <StudentDetail
          student={viewing}
          cls={viewing.classId ? classById.get(viewing.classId) : undefined}
          parents={parentsOf(viewing.id)}
          invoice={invoiceOf.get(viewing.id)}
          termId={termId}
          onClose={() => setViewing(null)}
          onPin={(slip) => setSlips([slip])}
        />
      ) : null}
    </>
  );
}

function AddStudent({ open, onClose, classes, onDone }: { open: boolean; onClose: () => void; classes: SchoolClass[]; onDone: () => void }) {
  const a = useAction();
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const s = (k: string) => String(f.get(k) ?? "").trim();
    const form = e.currentTarget;
    const ok = await a.run(async () => {
      const student = await api<Student>("students", {
        method: "POST",
        body: {
          admissionNumber: s("admissionNumber"),
          firstName: s("firstName"),
          lastName: s("lastName"),
          otherNames: s("otherNames") || undefined,
          gender: s("gender") || undefined,
          classId: s("classId") || undefined,
        },
      });
      if (s("parentPhone")) {
        await api("guardians", {
          method: "POST",
          body: { fullName: s("parentName"), phone: s("parentPhone"), email: s("parentEmail") || undefined, students: [{ studentId: student.id }] },
        });
      }
      return student;
    }, (st) => `${st.lastName} ${st.firstName} added.`);
    if (ok) {
      form.reset();
      onDone();
    }
  }
  return (
    <Dialog open={open} onClose={onClose} title="Add a student" subtitle="The parent's phone number is how they sign in and get results by SMS.">
      <form className="grid gap-4 sm:grid-cols-2" onSubmit={submit}>
        <ErrorNote className="sm:col-span-2">{a.error}</ErrorNote>
        <SuccessNote className="sm:col-span-2">{a.notice}</SuccessNote>
        <div><Label>Admission number</Label><Input name="admissionNumber" required /></div>
        <div>
          <Label>Class</Label>
          <Select name="classId" className="w-full" defaultValue={classes[0]?.id}>
            {classes.map((c) => <option key={c.id} value={c.id}>{className(c)}</option>)}
          </Select>
        </div>
        <div><Label>First name</Label><Input name="firstName" required /></div>
        <div><Label>Surname</Label><Input name="lastName" required /></div>
        <div><Label>Other names</Label><Input name="otherNames" /></div>
        <div>
          <Label>Gender</Label>
          <Select name="gender" className="w-full" defaultValue=""><option value="">Not given</option><option value="female">Female</option><option value="male">Male</option></Select>
        </div>
        <div className="sm:col-span-2 border-t border-line pt-3 font-semibold">Parent or guardian (optional)</div>
        <div><Label>Full name</Label><Input name="parentName" placeholder="Mrs. Ada Okafor" /></div>
        <div><Label>Phone</Label><Input name="parentPhone" type="tel" placeholder="0803 123 4567" /></div>
        <div className="sm:col-span-2"><Label>Email</Label><Input name="parentEmail" type="email" /></div>
        <div className="flex justify-end gap-2 sm:col-span-2">
          <Button type="button" variant="outline" onClick={onClose}>Close</Button>
          <Button disabled={a.busy}>{a.busy ? "Saving…" : "Add student"}</Button>
        </div>
      </form>
    </Dialog>
  );
}

function ImportStudents({ open, onClose, classes, onDone }: { open: boolean; onClose: () => void; classes: SchoolClass[]; onDone: () => void }) {
  const a = useAction();
  const [csv, setCsv] = React.useState("");
  const [classId, setClassId] = React.useState("");
  const [problems, setProblems] = React.useState<{ row: number; message: string }[]>([]);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setProblems([]);
    const r = await a.run(
      () => api<{ imported: number; parentsLinked: number; errors: { row: number; message: string }[] }>("students/import", { method: "POST", body: { classId: classId || classes[0]?.id, csv } }),
      (r) => (r.errors.length ? "" : `Imported ${r.imported} students and linked ${r.parentsLinked} parents.`),
    );
    if (r?.errors.length) setProblems(r.errors);
    else if (r) {
      setCsv("");
      onDone();
    }
  }
  return (
    <Dialog open={open} onClose={onClose} wide title="Import a class from CSV" subtitle="Save your spreadsheet as CSV. Re-uploading the same file updates students instead of duplicating them.">
      <form className="flex flex-col gap-4" onSubmit={submit}>
        <ErrorNote>{a.error}</ErrorNote>
        <SuccessNote>{a.notice}</SuccessNote>
        {problems.length ? (
          <ErrorNote>
            Nothing was imported. Fix these rows and try again:
            <ul className="mt-1 list-disc pl-5">{problems.slice(0, 8).map((p, i) => <li key={i}>{p.row ? `Row ${p.row}: ` : ""}{p.message}</li>)}</ul>
          </ErrorNote>
        ) : null}
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label>Class</Label>
            <Select className="w-full" value={classId} onChange={(e) => setClassId(e.target.value)}>
              {classes.map((c) => <option key={c.id} value={c.id}>{className(c)}</option>)}
            </Select>
          </div>
          <div>
            <Label>CSV file</Label>
            <Input type="file" accept=".csv,text/csv" className="pt-2" onChange={async (e) => { const file = e.target.files?.[0]; if (file) setCsv(await file.text()); }} />
          </div>
        </div>
        <div>
          <Label>Or paste the rows</Label>
          <Textarea rows={8} className="font-mono text-xs" value={csv} onChange={(e) => setCsv(e.target.value)} placeholder={CSV_EXAMPLE} required />
          <p className="mt-1 text-xs text-muted">Columns: admission_number, first_name, last_name, other_names, gender, date_of_birth, parent_name, parent_phone, parent_email.</p>
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>Close</Button>
          <Button disabled={a.busy || !csv.trim()}>{a.busy ? "Importing…" : "Import"}</Button>
        </div>
      </form>
    </Dialog>
  );
}

function IssuePins({ open, onClose, classes, onDone }: { open: boolean; onClose: () => void; classes: SchoolClass[]; onDone: (slips: Slip[]) => void }) {
  const a = useAction();
  const [classId, setClassId] = React.useState("");
  const [reset, setReset] = React.useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const r = await a.run(() => api<{ issued: number; slips: Slip[] }>(`students/pins/class/${classId || classes[0]?.id}`, { method: "POST", body: { resetExisting: reset } }));
    if (r) {
      if (r.issued) onDone(r.slips);
      else a.setNotice("Every student in this class already has a PIN. Tick the box to give them new ones.");
    }
  }
  return (
    <Dialog open={open} onClose={onClose} title="Student login PINs" subtitle="Students use their admission number and a 6-digit PIN for CBT tests and exam prep. PINs are shown once, so print the slips.">
      <form className="flex flex-col gap-4" onSubmit={submit}>
        <ErrorNote>{a.error}</ErrorNote>
        <SuccessNote>{a.notice}</SuccessNote>
        <div>
          <Label>Class</Label>
          <Select className="w-full" value={classId} onChange={(e) => setClassId(e.target.value)}>
            {classes.map((c) => <option key={c.id} value={c.id}>{className(c)}</option>)}
          </Select>
        </div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={reset} onChange={(e) => setReset(e.target.checked)} /> Also give new PINs to students who already have one</label>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>Close</Button>
          <Button disabled={a.busy}>{a.busy ? "Issuing…" : "Issue PINs"}</Button>
        </div>
      </form>
    </Dialog>
  );
}

function PinSlips({ slips, onClose }: { slips: Slip[] | null; onClose: () => void }) {
  return (
    <Dialog open={Boolean(slips)} onClose={onClose} wide title="Login slips" subtitle="Cut along the lines and hand each student their slip. These PINs will not be shown again.">
      <div className="print-sheet grid gap-2 sm:grid-cols-2">
        {(slips ?? []).map((s) => (
          <div key={s.admissionNumber} className="rounded-2xl border border-dashed border-line p-4">
            <p className="font-semibold">{s.name}</p>
            <p className="text-sm text-muted">Admission number: <strong className="text-ink">{s.admissionNumber}</strong></p>
            <p className="text-sm text-muted">PIN: <strong className="font-mono text-lg text-ink">{s.pin}</strong></p>
          </div>
        ))}
      </div>
      <div className="mt-4 flex justify-end"><Button onClick={() => window.print()}><Printer className="h-4 w-4" /> Print slips</Button></div>
    </Dialog>
  );
}

function StudentDetail({
  student,
  cls,
  parents,
  invoice,
  termId,
  onClose,
  onPin,
}: {
  student: Student;
  cls?: SchoolClass;
  parents: Guardian[];
  invoice?: Invoice;
  termId: string;
  onClose: () => void;
  onPin: (slip: Slip) => void;
}) {
  const { data: att } = useApi<StudentAttendance>(`students/${student.id}/attendance`);
  const a = useAction();
  const name = `${student.lastName} ${student.firstName}`;
  return (
    <Dialog open onClose={onClose} title={name} subtitle={`${student.admissionNumber}${cls ? ` · ${className(cls)}` : ""}`}>
      <ErrorNote className="mb-3">{a.error}</ErrorNote>
      <div className="grid gap-3">
        <div className="rounded-2xl bg-canvas p-4">
          <p className="text-xs font-semibold tracking-wider text-muted uppercase">Parents</p>
          {parents.length ? parents.map((p) => (
            <p key={p.id} className="mt-1 text-sm"><strong>{p.fullName}</strong> · {phone(p.phone)} · {p.preferredChannel === "whatsapp" ? "WhatsApp" : "SMS"}</p>
          )) : <p className="mt-1 text-sm text-muted">No parent linked.</p>}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-canvas p-4">
            <p className="text-xs font-semibold tracking-wider text-muted uppercase">Attendance this year</p>
            <p className="mt-1 text-sm">{att ? `${att.summary.present + att.summary.late} of ${att.summary.opened} days present` : "…"}</p>
            {att?.summary.absent ? <p className="text-xs text-rose-600">{att.summary.absent} absent</p> : null}
          </div>
          <div className="rounded-2xl bg-canvas p-4">
            <p className="text-xs font-semibold tracking-wider text-muted uppercase">Fees this term</p>
            <p className="mt-1 text-sm">{invoice ? `${naira(invoice.paidKobo)} of ${naira(invoice.totalKobo)}` : "No bill"}</p>
            {invoice ? <StatusBadge status={INVOICE_STATUS[invoice.status]} /> : null}
          </div>
        </div>
      </div>
      <div className="mt-5 flex flex-wrap justify-end gap-2">
        {termId ? <a className="inline-flex h-10 items-center rounded-xl bg-brand-50 px-4 text-sm font-semibold text-brand-700" href={`/admin/results/report-card?term=${termId}&student=${student.id}`}>Report card</a> : null}
        <Button
          variant="outline"
          disabled={a.busy}
          onClick={async () => {
            const r = await a.run(() => api<{ pin: string }>(`students/${student.id}/reset-pin`, { method: "POST" }));
            if (r) onPin({ admissionNumber: student.admissionNumber, name, pin: r.pin });
          }}
        >
          <KeyRound className="h-4 w-4" /> {student.hasPin ? "Reset PIN" : "Give PIN"}
        </Button>
      </div>
    </Dialog>
  );
}
