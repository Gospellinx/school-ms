"use client";
import * as React from "react";
import { BookOpen, Plus, Users } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Async, Empty, ErrorNote, SuccessNote } from "@/components/ui/feedback";
import { Input, Label, Select } from "@/components/ui/input";
import { api, useApi } from "@/lib/api";
import { useAction } from "@/lib/useAction";
import { className, type ClassSubject, type Dashboard, type SchoolClass, type Section, type Staff, type Subject } from "@/lib/types";

export default function Classes() {
  const classes = useApi<SchoolClass[]>("classes");
  const { data: sections } = useApi<Section[]>("sections");
  const subjects = useApi<Subject[]>("subjects");
  const { data: staff } = useApi<Staff[]>("staff");
  const dash = useApi<Dashboard>("dashboard");
  const [dialog, setDialog] = React.useState<"class" | "subject" | null>(null);
  const [managing, setManaging] = React.useState<SchoolClass | null>(null);

  const stats = new Map((dash.data?.classes ?? []).map((c) => [c.id, c]));
  const subjectCount = new Map<string, number>();
  for (const s of dash.data?.scoreSheets ?? []) subjectCount.set(s.classId, (subjectCount.get(s.classId) ?? 0) + 1);
  const teacherName = (id: string | null) => (staff ?? []).find((s) => s.id === id)?.fullName;

  return (
    <>
      <PageHeader
        title="Classes & Subjects"
        subtitle={dash.data?.currentTerm ? `${dash.data.currentTerm.name} · ${dash.data.currentTerm.sessionName}` : "Set up classes, subjects and who teaches what."}
        actions={
          <>
            <Button variant="outline" onClick={() => setDialog("subject")}><Plus className="h-4 w-4" /> New subject</Button>
            <Button onClick={() => setDialog("class")}><Plus className="h-4 w-4" /> New class</Button>
          </>
        }
      />
      <Async data={classes.data && sections ? { classes: classes.data, sections } : null} error={classes.error}>
        {({ classes: list, sections: secs }) =>
          list.length === 0 ? (
            <Empty title="No classes yet">Create your classes (for example JSS 1 Gold), then add subjects and teachers to each.</Empty>
          ) : (
            <>
              {secs.map((sec) => {
                const inSection = list.filter((c) => c.sectionId === sec.id);
                if (!inSection.length) return null;
                return (
                  <section key={sec.id} className="mb-6">
                    <h2 className="mb-3 text-lg font-semibold">{sec.name}</h2>
                    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                      {inSection.map((c) => (
                        <button key={c.id} onClick={() => setManaging(c)} className="text-left">
                          <Card className="h-full p-5 transition-shadow hover:shadow-lg hover:shadow-brand-900/5 sm:p-5">
                            <p className="text-lg font-semibold">{className(c)}</p>
                            <p className="text-sm text-muted">{teacherName(c.formTeacherId) ?? "No form teacher yet"}</p>
                            <div className="mt-4 flex gap-4 text-sm">
                              <span className="flex items-center gap-1.5"><Users className="h-4 w-4 text-brand-600" /> {stats.get(c.id)?.students ?? 0}</span>
                              <span className="flex items-center gap-1.5"><BookOpen className="h-4 w-4 text-brand-600" /> {subjectCount.get(c.id) ?? 0} subjects</span>
                            </div>
                          </Card>
                        </button>
                      ))}
                    </div>
                  </section>
                );
              })}
            </>
          )
        }
      </Async>
      <Card>
        <CardHeader title="Subjects" subtitle="All subjects the school offers. Add them to classes by opening a class." action={<Button size="sm" variant="secondary" onClick={() => setDialog("subject")}>Add subject</Button>} />
        <div className="flex flex-wrap gap-2">
          {(subjects.data ?? []).map((s) => <Badge key={s.id} tone="brand" className="px-3 py-1.5 text-sm">{s.name} <span className="text-brand-400">{s.code}</span></Badge>)}
        </div>
      </Card>

      <NewClass open={dialog === "class"} onClose={() => setDialog(null)} sections={sections ?? []} onDone={() => { void classes.reload(); void dash.reload(); }} />
      <NewSubject open={dialog === "subject"} onClose={() => setDialog(null)} onDone={() => void subjects.reload()} />
      {managing ? (
        <ManageClass
          cls={managing}
          subjects={subjects.data ?? []}
          staff={staff ?? []}
          onClose={() => setManaging(null)}
          onChanged={() => { void classes.reload(); void dash.reload(); }}
        />
      ) : null}
    </>
  );
}

function NewClass({ open, onClose, sections, onDone }: { open: boolean; onClose: () => void; sections: Section[]; onDone: () => void }) {
  const a = useAction();
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const r = await a.run(
      () => api<SchoolClass>("classes", { method: "POST", body: { sectionId: f.get("sectionId"), name: String(f.get("name")).trim(), arm: String(f.get("arm")).trim(), sortOrder: Number(f.get("sortOrder") || 0) } }),
      (c) => `${className(c)} created. Open it to add subjects and teachers.`,
    );
    if (r) {
      form.reset();
      onDone();
    }
  }
  return (
    <Dialog open={open} onClose={onClose} title="New class">
      <form className="grid gap-4 sm:grid-cols-2" onSubmit={submit}>
        <ErrorNote className="sm:col-span-2">{a.error}</ErrorNote>
        <SuccessNote className="sm:col-span-2">{a.notice}</SuccessNote>
        <div className="sm:col-span-2"><Label>Section</Label><Select name="sectionId" className="w-full">{sections.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></div>
        <div><Label>Class</Label><Input name="name" required placeholder="JSS 1" /></div>
        <div><Label>Arm</Label><Input name="arm" placeholder="Gold" /></div>
        <div><Label>Order on lists</Label><Input name="sortOrder" type="number" defaultValue={0} /></div>
        <div className="flex items-end justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>Close</Button>
          <Button disabled={a.busy}>Create</Button>
        </div>
      </form>
    </Dialog>
  );
}

function NewSubject({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const a = useAction();
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const r = await a.run(() => api<Subject>("subjects", { method: "POST", body: { name: String(f.get("name")).trim(), code: String(f.get("code")).trim() } }), (s) => `${s.name} added.`);
    if (r) {
      form.reset();
      onDone();
    }
  }
  return (
    <Dialog open={open} onClose={onClose} title="New subject">
      <form className="grid gap-4 sm:grid-cols-[1fr_120px]" onSubmit={submit}>
        <ErrorNote className="sm:col-span-2">{a.error}</ErrorNote>
        <SuccessNote className="sm:col-span-2">{a.notice}</SuccessNote>
        <div><Label>Name</Label><Input name="name" required placeholder="Further Mathematics" /></div>
        <div><Label>Code</Label><Input name="code" required maxLength={12} placeholder="FMT" /></div>
        <div className="flex justify-end gap-2 sm:col-span-2">
          <Button type="button" variant="outline" onClick={onClose}>Close</Button>
          <Button disabled={a.busy}>Add</Button>
        </div>
      </form>
    </Dialog>
  );
}

function ManageClass({ cls, subjects, staff, onClose, onChanged }: { cls: SchoolClass; subjects: Subject[]; staff: Staff[]; onClose: () => void; onChanged: () => void }) {
  const list = useApi<ClassSubject[]>(`classes/${cls.id}/subjects`);
  const a = useAction();
  const teachers = staff.filter((s) => s.role === "teacher" || s.role === "admin");
  const [formTeacher, setFormTeacher] = React.useState(cls.formTeacherId ?? "");
  const [newSubject, setNewSubject] = React.useState("");
  const [newTeacher, setNewTeacher] = React.useState("");
  const taken = new Set((list.data ?? []).map((s) => s.subjectId));

  const assign = (subjectId: string, teacherId: string) =>
    a.run(async () => {
      await api(`classes/${cls.id}/subjects`, { method: "POST", body: { subjectId, teacherId: teacherId || null } });
      await list.reload();
      onChanged();
    }, "Saved.");

  return (
    <Dialog open onClose={onClose} wide title={className(cls)} subtitle="Subjects taught in this class and who teaches them. Teachers can only enter scores for their own subjects.">
      <ErrorNote className="mb-3">{a.error}</ErrorNote>
      <SuccessNote className="mb-3">{a.notice}</SuccessNote>
      <div className="mb-5 flex flex-wrap items-end gap-2 rounded-2xl bg-canvas p-4">
        <div className="min-w-[200px] flex-1">
          <Label>Form teacher (takes the daily register)</Label>
          <Select className="w-full" value={formTeacher} onChange={(e) => setFormTeacher(e.target.value)}>
            <option value="">None</option>
            {teachers.map((t) => <option key={t.id} value={t.id}>{t.fullName}</option>)}
          </Select>
        </div>
        <Button
          variant="secondary"
          disabled={a.busy}
          onClick={() => a.run(async () => { await api(`classes/${cls.id}`, { method: "PATCH", body: { formTeacherId: formTeacher || null } }); onChanged(); }, "Form teacher saved.")}
        >
          Save
        </Button>
      </div>
      <Async data={list.data} error={list.error}>
        {(rows) => (
          <ul className="divide-y divide-line">
            {rows.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-3 py-2.5">
                <span className="min-w-[160px] flex-1 font-semibold">{s.name} <span className="text-xs text-muted">{s.code}</span></span>
                <Select value={s.teacherId ?? ""} onChange={(e) => void assign(s.subjectId, e.target.value)} aria-label={`Teacher for ${s.name}`}>
                  <option value="">No teacher</option>
                  {teachers.map((t) => <option key={t.id} value={t.id}>{t.fullName}</option>)}
                </Select>
              </li>
            ))}
            {rows.length === 0 ? <li className="py-3 text-sm text-muted">No subjects in this class yet.</li> : null}
          </ul>
        )}
      </Async>
      <div className="mt-4 flex flex-wrap items-end gap-2 border-t border-line pt-4">
        <div className="min-w-[180px] flex-1">
          <Label>Add a subject</Label>
          <Select className="w-full" value={newSubject} onChange={(e) => setNewSubject(e.target.value)}>
            <option value="">Choose…</option>
            {subjects.filter((s) => !taken.has(s.id)).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        </div>
        <div className="min-w-[180px] flex-1">
          <Label>Teacher</Label>
          <Select className="w-full" value={newTeacher} onChange={(e) => setNewTeacher(e.target.value)}>
            <option value="">No teacher yet</option>
            {teachers.map((t) => <option key={t.id} value={t.id}>{t.fullName}</option>)}
          </Select>
        </div>
        <Button disabled={!newSubject || a.busy} onClick={async () => { await assign(newSubject, newTeacher); setNewSubject(""); }}>Add</Button>
      </div>
    </Dialog>
  );
}
