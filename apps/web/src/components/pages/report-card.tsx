import * as React from "react";
import type { ReportCard } from "@/lib/types";
import { initials } from "@/lib/utils";

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex gap-2 text-sm">
      <span className="w-28 shrink-0 text-muted">{k}</span>
      <span className="font-semibold">{v}</span>
    </div>
  );
}

function gradeTone(g: string) {
  if (g.startsWith("F") || g === "E" || g.startsWith("E")) return "bg-rose-50 text-rose-600";
  if (g.startsWith("A") || g.startsWith("B")) return "bg-brand-50 text-brand-700";
  return "bg-amber-50 text-amber-700";
}

/** A4 report card from the API's report-card payload. Prints cleanly; the app chrome is hidden in print. */
export function ReportCardSheet({ rc, comments }: { rc: ReportCard; comments?: React.ReactNode }) {
  const cls = rc.class.arm ? `${rc.class.name} ${rc.class.arm}` : rc.class.name;
  const att = rc.attendance;
  return (
    <div className="print-sheet mx-auto max-w-[820px] rounded-3xl bg-white p-5 text-[13px] sm:p-10">
      <header className="flex flex-col items-center gap-3 border-b-2 border-brand-600 pb-5 text-center sm:flex-row sm:text-left">
        <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-brand-600 text-2xl font-bold text-white">
          {initials(rc.school.name.replace(/\(.*\)/, ""))}
        </span>
        <div className="flex-1">
          <h2 className="text-xl font-bold tracking-tight text-brand-800 uppercase sm:text-2xl">{rc.school.name}</h2>
          {rc.school.address ? <p className="text-xs text-muted">{rc.school.address}</p> : null}
          {rc.school.motto ? <p className="text-xs text-muted italic">Motto: {rc.school.motto}</p> : null}
        </div>
        <div className="rounded-xl bg-brand-50 px-4 py-2 text-center">
          <p className="text-[11px] font-semibold text-brand-700 uppercase">Report Sheet</p>
          <p className="text-xs font-semibold">{rc.term} · {rc.session}</p>
        </div>
      </header>
      <section className="grid gap-x-8 gap-y-1.5 py-5 sm:grid-cols-2">
        <Row k="Name" v={rc.student.name} />
        <Row k="Admission no." v={rc.student.admissionNumber} />
        <Row k="Class" v={`${cls} · ${rc.class.section}`} />
        <Row k="Position" v={`${rc.summary.positionText} out of ${rc.summary.outOf}`} />
        <Row k="Average" v={`${rc.summary.average}%`} />
        <Row k="Class average" v={`${rc.summary.classAverage}%`} />
        <Row k="Total" v={String(rc.summary.grandTotal)} />
        <Row k="Attendance" v={att && att.opened ? `${att.present + att.late} of ${att.opened} days` : "Not recorded"} />
      </section>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-left">
          <thead>
            <tr className="bg-brand-600 text-white">
              <th className="rounded-l-xl px-3 py-2.5 text-xs font-semibold">Subject</th>
              {rc.components.map((c) => (
                <th key={c.key} className="px-2 py-2.5 text-center text-xs font-semibold">{c.label} ({c.maxScore})</th>
              ))}
              <th className="px-2 py-2.5 text-center text-xs font-semibold">Total</th>
              <th className="px-2 py-2.5 text-center text-xs font-semibold">Grade</th>
              <th className="px-2 py-2.5 text-center text-xs font-semibold">Pos.</th>
              <th className="px-2 py-2.5 text-center text-xs font-semibold">Class avg</th>
              <th className="rounded-r-xl px-3 py-2.5 text-xs font-semibold">Remark</th>
            </tr>
          </thead>
          <tbody>
            {rc.subjects.map((s) => (
              <tr key={s.subjectId} className="border-b border-line">
                <td className="px-3 py-2 font-semibold">{s.name}</td>
                {rc.components.map((c) => <td key={c.key} className="px-2 py-2 text-center">{s.scores[c.key] ?? "–"}</td>)}
                <td className="px-2 py-2 text-center font-bold">{s.total}</td>
                <td className="px-2 py-2 text-center"><span className={`rounded-md px-2 py-0.5 font-bold ${gradeTone(s.grade)}`}>{s.grade}</span></td>
                <td className="px-2 py-2 text-center">{s.positionText}</td>
                <td className="px-2 py-2 text-center text-muted">{s.classAverage}</td>
                <td className="px-3 py-2 text-muted">{s.remark}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {comments ?? (
        <section className="mt-5 grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl bg-canvas p-4">
            <p className="text-xs font-semibold text-muted uppercase">Class teacher&apos;s comment</p>
            <p className="mt-1">{rc.comments.teacher ?? "—"}</p>
            <p className="mt-6 border-t border-dashed border-muted/40 pt-1 text-xs text-muted">Signature</p>
          </div>
          <div className="rounded-2xl bg-canvas p-4">
            <p className="text-xs font-semibold text-muted uppercase">Principal&apos;s comment</p>
            <p className="mt-1">{rc.comments.head ?? "—"}</p>
            <p className="mt-6 border-t border-dashed border-muted/40 pt-1 text-xs text-muted">Signature & stamp</p>
          </div>
        </section>
      )}
      <p className="mt-5 text-[11px] text-muted">
        Grading: {rc.gradingScale.map((g) => `${g.grade} ${Math.round(g.min)}–${Math.floor(g.max)}`).join(" · ")}
      </p>
    </div>
  );
}
