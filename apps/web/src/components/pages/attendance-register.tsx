"use client";
import * as React from "react";
import { Card, CardHeader } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Async, Empty, ErrorNote, SuccessNote } from "@/components/ui/feedback";
import { Input, Select } from "@/components/ui/input";
import { api, useApi } from "@/lib/api";
import { longDate, todayLagos } from "@/lib/format";
import { useAction } from "@/lib/useAction";
import type { AttendanceStatus, Register } from "@/lib/types";
import { cn } from "@/lib/utils";

const states: { key: AttendanceStatus; label: string; on: string }[] = [
  { key: "present", label: "Present", on: "bg-emerald-500 text-white" },
  { key: "late", label: "Late", on: "bg-amber-400 text-white" },
  { key: "absent", label: "Absent", on: "bg-rose-500 text-white" },
  { key: "excused", label: "Excused", on: "bg-sky-500 text-white" },
];

/** The daily register for one class. Parents of students newly marked absent today get an SMS when it is saved. */
export function AttendanceRegister({ classes, onSaved }: { classes: { id: string; label: string }[]; onSaved?: () => void }) {
  const [classId, setClassId] = React.useState(classes[0]?.id ?? "");
  const [date, setDate] = React.useState(todayLagos());
  React.useEffect(() => {
    if (!classId && classes[0]) setClassId(classes[0].id);
  }, [classes, classId]);
  const reg = useApi<Register>(classId ? `classes/${classId}/attendance/${date}` : null);
  const [marks, setMarks] = React.useState<Record<string, AttendanceStatus>>({});
  const a = useAction();

  React.useEffect(() => {
    if (!reg.data) return;
    // A register not taken yet starts with everyone present; the teacher marks the exceptions.
    setMarks(Object.fromEntries(reg.data.rows.map((r) => [r.studentId, r.status ?? "present"])));
  }, [reg.data]);

  const count = (k: AttendanceStatus) => Object.values(marks).filter((v) => v === k).length;
  const save = () =>
    a.run(async () => {
      await api(`classes/${classId}/attendance/${date}`, {
        method: "PUT",
        body: { entries: Object.entries(marks).map(([studentId, status]) => ({ studentId, status })), notifyGuardians: date === todayLagos() },
      });
      await reg.reload();
      onSaved?.();
    }, date === todayLagos() ? "Register saved. Parents of absent students are being told." : "Register saved.");

  if (!classes.length) return <Card><Empty title="No classes to take a register for">You can take the register for your form class or any class you teach.</Empty></Card>;

  return (
    <Card>
      <CardHeader
        title="Daily register"
        subtitle={`${longDate(date)} · ${count("present")} present, ${count("late")} late, ${count("absent")} absent${reg.data && !reg.data.taken ? " · not saved yet" : ""}`}
        action={
          <div className="flex flex-wrap justify-end gap-2">
            <Input type="date" className="w-auto" value={date} max={todayLagos()} onChange={(e) => setDate(e.target.value)} aria-label="Date" />
            <Select value={classId} onChange={(e) => setClassId(e.target.value)} aria-label="Class">
              {classes.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </Select>
          </div>
        }
      />
      <Async data={reg.data} error={reg.error}>
        {(r) =>
          r.rows.length === 0 ? (
            <Empty title="No students in this class" />
          ) : (
            <ul className="divide-y divide-line">
              {r.rows.map((s) => (
                <li key={s.studentId} className="flex flex-wrap items-center gap-3 py-3">
                  <Avatar name={s.name} size={36} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{s.name}</span>
                    <span className="block text-xs text-muted">{s.admissionNumber}</span>
                  </span>
                  <span className="flex gap-1 rounded-xl bg-canvas p-1">
                    {states.map((st) => (
                      <button
                        key={st.key}
                        onClick={() => setMarks({ ...marks, [s.studentId]: st.key })}
                        className={cn("h-8 rounded-lg px-2.5 text-xs font-semibold sm:px-3", marks[s.studentId] === st.key ? st.on : "text-muted hover:text-ink")}
                        aria-pressed={marks[s.studentId] === st.key}
                      >
                        {st.label}
                      </button>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          )
        }
      </Async>
      <div className="mt-4 flex flex-col gap-2">
        <ErrorNote>{a.error}</ErrorNote>
        <SuccessNote>{a.notice}</SuccessNote>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-muted">Parents of students marked absent today get an SMS when you save.</p>
          <Button disabled={a.busy || !reg.data?.rows.length} onClick={save}>{a.busy ? "Saving…" : "Save register"}</Button>
        </div>
      </div>
    </Card>
  );
}
