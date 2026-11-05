import { Download } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { grade, reportCard as rc, school } from "@/lib/mock";
import { buttonClass } from "@/components/ui/button";
import { PrintButton } from "./print-button";

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex gap-2 text-sm">
      <span className="w-28 shrink-0 text-muted">{k}</span>
      <span className="font-semibold">{v}</span>
    </div>
  );
}

/** A4 report card. Prints cleanly; the app chrome is hidden in print. */
export function ReportCardView({ title = "My Results", subtitle = "First Term · 2025/2026" }: { backHref?: string; title?: string; subtitle?: string }) {
  const rows = rc.rows.map((r) => {
    const total = r.ca1 + r.ca2 + r.exam;
    return { ...r, total, ...grade(total) };
  });
  return (
    <>
      <PageHeader
        title={title}
        subtitle={subtitle}
        actions={<><span className={buttonClass("outline")}><Download className="h-4 w-4" /> Download</span><PrintButton /></>}
      />
      <div className="print-sheet mx-auto max-w-[820px] rounded-3xl bg-white p-5 text-[13px] sm:p-10">
        <header className="flex flex-col items-center gap-3 border-b-2 border-brand-600 pb-5 text-center sm:flex-row sm:text-left">
          <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-brand-600 text-2xl font-bold text-white">LD</span>
          <div className="flex-1">
            <h2 className="text-xl font-bold tracking-tight text-brand-800 uppercase sm:text-2xl">{school.name}</h2>
            <p className="text-xs text-muted">{school.address} · {school.phone}</p>
            <p className="text-xs italic text-muted">Motto: {school.motto}</p>
          </div>
          <div className="rounded-xl bg-brand-50 px-4 py-2 text-center">
            <p className="text-[11px] font-semibold text-brand-700 uppercase">Report Sheet</p>
            <p className="text-xs font-semibold">{school.term} · {school.session}</p>
          </div>
        </header>

        <section className="grid gap-x-8 gap-y-1.5 py-5 sm:grid-cols-2">
          <Row k="Name" v={rc.student} />
          <Row k="Admission no." v={rc.admission} />
          <Row k="Class" v={rc.className} />
          <Row k="Position" v={`${rc.position} out of ${rc.outOf}`} />
          <Row k="Average" v={`${rc.average}%`} />
          <Row k="Class average" v={`${rc.classAverage}%`} />
          <Row k="Attendance" v={`${rc.attendance.present} of ${rc.attendance.total} days`} />
          <Row k="Next term" v={rc.nextTermBegins} />
        </section>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse text-left">
            <thead>
              <tr className="bg-brand-600 text-white">
                {["Subject", "1st CA (20)", "2nd CA (20)", "Exam (60)", "Total (100)", "Grade", "Remark"].map((h, i) => (
                  <th key={h} className={`px-3 py-2.5 text-xs font-semibold ${i === 0 ? "rounded-l-xl" : ""} ${i === 6 ? "rounded-r-xl" : ""} ${i > 0 && i < 6 ? "text-center" : ""}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.subject} className="border-b border-line">
                  <td className="px-3 py-2 font-semibold">{r.subject}</td>
                  <td className="px-3 py-2 text-center">{r.ca1}</td>
                  <td className="px-3 py-2 text-center">{r.ca2}</td>
                  <td className="px-3 py-2 text-center">{r.exam}</td>
                  <td className="px-3 py-2 text-center font-bold">{r.total}</td>
                  <td className="px-3 py-2 text-center"><span className="rounded-md bg-brand-50 px-2 py-0.5 font-bold text-brand-700">{r.g}</span></td>
                  <td className="px-3 py-2 text-muted">{r.remark}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <section className="mt-5 grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl bg-canvas p-4">
            <p className="text-xs font-semibold text-muted uppercase">Class teacher&apos;s comment</p>
            <p className="mt-1">{rc.teacherComment}</p>
            <p className="mt-6 border-t border-dashed border-muted/40 pt-1 text-xs text-muted">Signature</p>
          </div>
          <div className="rounded-2xl bg-canvas p-4">
            <p className="text-xs font-semibold text-muted uppercase">Principal&apos;s comment</p>
            <p className="mt-1">{rc.principalComment}</p>
            <p className="mt-6 border-t border-dashed border-muted/40 pt-1 text-xs text-muted">Signature & stamp</p>
          </div>
        </section>

        <p className="mt-5 text-[11px] text-muted">
          Grading: A1 75–100 · B2 70–74 · B3 65–69 · C4 60–64 · C5 55–59 · C6 50–54 · D7 45–49 · E8 40–44 · F9 0–39
        </p>
      </div>
    </>
  );
}
