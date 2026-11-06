"use client";
import * as React from "react";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { Card } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Async, ErrorNote, SuccessNote } from "@/components/ui/feedback";
import { Input, Label, Select } from "@/components/ui/input";
import { api, useApi } from "@/lib/api";
import { roleLabel, useStaff } from "@/lib/session";
import { useAction } from "@/lib/useAction";
import { className, type Assignment, type SchoolClass, type Staff } from "@/lib/types";

export default function StaffPage() {
  const me = useStaff();
  const staff = useApi<Staff[]>("staff");
  const { data: assignments } = useApi<Assignment[]>("my-assignments");
  const { data: classes } = useApi<SchoolClass[]>("classes");
  const [adding, setAdding] = React.useState(false);

  return (
    <>
      <PageHeader title="Staff" subtitle="Proprietor, admins and teachers who can sign in." actions={<Button onClick={() => setAdding(true)}><Plus className="h-4 w-4" /> Add staff</Button>} />
      <Async data={staff.data} error={staff.error}>
        {(rows) => (
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {rows.map((p) => {
              const mine = (assignments ?? []).filter((a) => a.teacherId === p.id);
              const subjects = [...new Set(mine.map((a) => a.subjectName))];
              const formOf = (classes ?? []).filter((c) => c.formTeacherId === p.id);
              return (
                <Card key={p.id}>
                  <div className="flex items-center gap-3">
                    <Avatar name={p.fullName.replace(/^(Mr|Mrs|Ms|Miss|Dr)\.?\s/, "")} size={48} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{p.fullName}</p>
                      <p className="truncate text-sm text-muted">{p.email}</p>
                    </div>
                    <Badge tone={p.role === "teacher" ? "brand" : "orchid"}>{roleLabel(p.role)}</Badge>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-3 rounded-2xl bg-canvas p-3 text-sm">
                    <div><p className="text-xs text-muted">Subjects</p><p className="font-semibold">{subjects.length ? subjects.join(", ") : "None"}</p></div>
                    <div><p className="text-xs text-muted">Form teacher of</p><p className="font-semibold">{formOf.length ? formOf.map(className).join(", ") : "None"}</p></div>
                  </div>
                  {mine.length ? (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {[...new Set(mine.map((a) => className({ name: a.className, arm: a.arm })))].map((c) => <Badge key={c} tone="brand">{c}</Badge>)}
                    </div>
                  ) : null}
                  {p.id === me.staff.id ? <p className="mt-3 text-xs text-muted">This is you.</p> : null}
                </Card>
              );
            })}
          </div>
        )}
      </Async>
      <AddStaff open={adding} onClose={() => setAdding(false)} onDone={() => void staff.reload()} />
    </>
  );
}

function AddStaff({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const a = useAction();
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const r = await a.run(
      () =>
        api<Staff>("staff", {
          method: "POST",
          body: { fullName: String(f.get("fullName")).trim(), email: String(f.get("email")).trim(), role: f.get("role"), password: String(f.get("password")) },
        }),
      (s) => `${s.fullName} can now sign in with their email and the password you set.`,
    );
    if (r) {
      form.reset();
      onDone();
    }
  }
  return (
    <Dialog open={open} onClose={onClose} title="Add a staff member" subtitle="Give them the school code, their email and this password. They can change it in Account Settings.">
      <form className="grid gap-4" onSubmit={submit}>
        <ErrorNote>{a.error}</ErrorNote>
        <SuccessNote>{a.notice}</SuccessNote>
        <div><Label>Full name</Label><Input name="fullName" required placeholder="Mrs. Amina Musa" /></div>
        <div><Label>Email</Label><Input name="email" type="email" required /></div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div><Label>Role</Label><Select name="role" className="w-full" defaultValue="teacher"><option value="teacher">Teacher</option><option value="admin">School admin</option></Select></div>
          <div><Label>First password</Label><Input name="password" type="text" minLength={8} required autoComplete="off" /></div>
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>Close</Button>
          <Button disabled={a.busy}>{a.busy ? "Saving…" : "Add staff"}</Button>
        </div>
      </form>
    </Dialog>
  );
}
