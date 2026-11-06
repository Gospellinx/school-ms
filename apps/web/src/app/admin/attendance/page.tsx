"use client";
import * as React from "react";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { AttendanceRegister } from "@/components/pages/attendance-register";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/input";
import { Async, Empty } from "@/components/ui/feedback";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { useApi } from "@/lib/api";
import { pct, shortDate } from "@/lib/format";
import { className, type ClassAttendance, type Dashboard } from "@/lib/types";

export default function Attendance() {
  const dash = useApi<Dashboard>("dashboard");
  const classes = (dash.data?.classes ?? []).map((c) => ({ id: c.id, label: className(c) }));
  const [summaryClass, setSummaryClass] = React.useState("");
  const termId = dash.data?.currentTerm?.id;
  const cid = summaryClass || classes[0]?.id || "";
  const summary = useApi<ClassAttendance>(termId && cid ? `terms/${termId}/classes/${cid}/attendance` : null);

  return (
    <>
      <PageHeader title="Attendance" subtitle="Today's registers across the school, and term totals for report cards." />
      <div className="grid gap-5 xl:grid-cols-[1.4fr_1fr]">
        {dash.data ? <AttendanceRegister classes={classes} onSaved={() => void dash.reload()} /> : <Card><Async data={null} error={dash.error}>{() => null}</Async></Card>}
        <Card>
          <CardHeader title="By class" subtitle="Present today" />
          <ul className="flex flex-col gap-4">
            {(dash.data?.classes ?? []).map((c) => {
              const v = pct(c.presentToday, c.markedToday);
              return (
                <li key={c.id}>
                  <div className="mb-1.5 flex justify-between text-sm">
                    <span className="font-semibold">{className(c)}</span>
                    {c.markedToday ? <span className="text-muted">{c.presentToday} of {c.students} · {v}%</span> : <Badge tone="amber">Not taken</Badge>}
                  </div>
                  <Progress value={c.markedToday ? v : 0} barClassName={v < 90 ? "bg-orchid-400" : undefined} />
                </li>
              );
            })}
          </ul>
        </Card>
      </div>
      <Card className="mt-5">
        <CardHeader
          title="This term"
          subtitle={summary.data ? `Totals from ${shortDate(summary.data.from)} to ${shortDate(summary.data.to)}, as printed on report cards` : "Set term dates in Account Settings to count school days."}
          action={
            <Select value={cid} onChange={(e) => setSummaryClass(e.target.value)} aria-label="Class">
              {classes.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </Select>
          }
        />
        <Async data={termId ? summary.data : []} error={summary.error}>
          {(s) =>
            Array.isArray(s) || s.students.length === 0 ? (
              <Empty title="No attendance yet" />
            ) : (
              <Table>
                <THead><tr><TH>Student</TH><TH className="text-center">School opened</TH><TH className="text-center">Present</TH><TH className="text-center">Late</TH><TH className="text-center">Absent</TH><TH className="text-center">Excused</TH><TH className="text-center">Rate</TH></tr></THead>
                <tbody>
                  {s.students.map((r) => (
                    <TR key={r.studentId}>
                      <TD><p className="font-semibold">{r.name}</p><p className="text-xs text-muted">{r.admissionNumber}</p></TD>
                      <TD className="text-center">{r.opened}</TD>
                      <TD className="text-center">{r.present}</TD>
                      <TD className="text-center">{r.late}</TD>
                      <TD className={r.absent ? "text-center font-semibold text-rose-600" : "text-center"}>{r.absent}</TD>
                      <TD className="text-center">{r.excused}</TD>
                      <TD className="text-center font-semibold">{pct(r.present + r.late, r.opened)}%</TD>
                    </TR>
                  ))}
                </tbody>
              </Table>
            )
          }
        </Async>
      </Card>
    </>
  );
}
