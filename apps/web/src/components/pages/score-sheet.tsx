"use client";
import * as React from "react";
import { CheckCircle2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { grade, students } from "@/lib/mock";
import { cn } from "@/lib/utils";

type Row = { id: string; name: string; ca1: number; ca2: number; exam: number };

export function ScoreSheet() {
  const [rows, setRows] = React.useState<Row[]>(students.slice(0, 12).map(({ id, name, ca1, ca2, exam }) => ({ id, name, ca1, ca2, exam })));
  const [saved, setSaved] = React.useState(false);
  const set = (i: number, k: "ca1" | "ca2" | "exam", v: string, max: number) => {
    const n = Math.max(0, Math.min(max, Number(v.replace(/\D/g, "")) || 0));
    setSaved(false);
    setRows(rows.map((r, j) => (j === i ? { ...r, [k]: n } : r)));
  };
  const totals = rows.map((r) => r.ca1 + r.ca2 + r.exam);
  const avg = totals.reduce((a, b) => a + b, 0) / totals.length;

  const cell = "h-10 w-16 rounded-xl border border-line bg-white text-center font-semibold outline-none focus:border-brand-400 focus:ring-4 focus:ring-brand-100";
  return (
    <Card>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Select defaultValue="SS 2 Gold"><option>SS 2 Gold</option><option>SS 3 Gold</option><option>JSS 3 Blue</option></Select>
        <Select defaultValue="Mathematics"><option>Mathematics</option><option>Further Mathematics</option></Select>
        <Select defaultValue="First Term"><option>First Term</option><option>Second Term</option><option>Third Term</option></Select>
        <span className="ml-auto text-sm text-muted">Class average <strong className="text-ink">{avg.toFixed(1)}</strong></span>
      </div>
      <div className="-mx-5 overflow-x-auto sm:-mx-6">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="text-xs font-semibold text-muted uppercase">
            <tr className="border-b border-line">
              <th className="sticky left-0 z-10 bg-white py-3 pl-5 text-left sm:pl-6">Student</th>
              <th className="px-2 py-3">1st CA <span className="normal-case">/20</span></th>
              <th className="px-2 py-3">2nd CA <span className="normal-case">/20</span></th>
              <th className="px-2 py-3">Exam <span className="normal-case">/60</span></th>
              <th className="px-2 py-3">Total</th>
              <th className="py-3 pr-5 sm:pr-6">Grade</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const t = totals[i]!;
              const g = grade(t).g;
              return (
                <tr key={r.id} className="border-b border-line last:border-0">
                  <td className="sticky left-0 z-10 bg-white py-2 pr-2 pl-5 sm:pl-6"><span className="font-semibold">{r.name}</span><span className="block text-xs text-muted">{r.id}</span></td>
                  <td className="px-2 text-center"><input inputMode="numeric" className={cell} value={r.ca1} onChange={(e) => set(i, "ca1", e.target.value, 20)} aria-label={`${r.name} first CA`} /></td>
                  <td className="px-2 text-center"><input inputMode="numeric" className={cell} value={r.ca2} onChange={(e) => set(i, "ca2", e.target.value, 20)} aria-label={`${r.name} second CA`} /></td>
                  <td className="px-2 text-center"><input inputMode="numeric" className={cell} value={r.exam} onChange={(e) => set(i, "exam", e.target.value, 60)} aria-label={`${r.name} exam`} /></td>
                  <td className="px-2 text-center text-base font-bold">{t}</td>
                  <td className="pr-5 text-center sm:pr-6">
                    <span className={cn("rounded-lg px-2.5 py-1 text-xs font-bold", g === "F9" ? "bg-rose-50 text-rose-600" : g.startsWith("A") || g.startsWith("B") ? "bg-brand-50 text-brand-700" : "bg-amber-50 text-amber-700")}>{g}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="mt-4 flex flex-col-reverse items-stretch gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-muted">Scores save as a draft. The admin publishes results to parents.</p>
        <div className="flex items-center gap-3">
          {saved ? <span className="flex items-center gap-1.5 text-sm font-semibold text-emerald-600"><CheckCircle2 className="h-4 w-4" /> Saved</span> : null}
          <Button variant="outline">Import CSV</Button>
          <Button onClick={() => setSaved(true)}>Save scores</Button>
        </div>
      </div>
    </Card>
  );
}
