import Link from "next/link";
import { Send } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Button, buttonClass } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { StatusBadge } from "@/components/widgets/status-badge";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { grade, students, subjects } from "@/lib/mock";

export const metadata = { title: "Results" };

const status = [
  { c: "SS 3 Gold", v: 100, s: "Published" }, { c: "SS 2 Gold", v: 78, s: "Draft" }, { c: "SS 1 Gold", v: 92, s: "Draft" },
  { c: "JSS 3 Blue", v: 64, s: "Draft" }, { c: "Primary 4", v: 45, s: "Draft" },
];

export default function Results() {
  const sub = subjects.slice(0, 6);
  const board = students.slice(0, 8).map((s, i) => {
    const scores = sub.map((_, j) => 42 + ((i * 13 + j * 7) % 50));
    const total = scores.reduce((a, b) => a + b, 0);
    return { ...s, scores, total, avg: total / sub.length };
  }).sort((a, b) => b.total - a.total);

  return (
    <>
      <PageHeader title="Results" subtitle="Check scores, view broadsheets and publish report cards." actions={<><Link href="/admin/results/report-card" className={buttonClass("outline")}>Sample report card</Link><Button><Send className="h-4 w-4" /> Publish SS 2 Gold</Button></>} />
      <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {status.map((s) => (
          <Card key={s.c} className="p-5 sm:p-5">
            <div className="flex items-center justify-between"><p className="font-semibold">{s.c}</p><StatusBadge status={s.s} /></div>
            <p className="mt-3 mb-1.5 text-xs text-muted">Scores entered {s.v}%</p>
            <Progress value={s.v} />
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader title="Broadsheet · SS 2 Gold" subtitle="First Term 2025/2026" action={<Select defaultValue="SS 2 Gold"><option>SS 2 Gold</option><option>SS 3 Gold</option></Select>} />
        <Table className="min-w-[900px]">
          <THead><tr><TH>Pos.</TH><TH>Student</TH>{sub.map((s) => <TH key={s} className="text-center">{s.split(" ")[0]}</TH>)}<TH className="text-center">Total</TH><TH className="text-center">Avg</TH></tr></THead>
          <tbody>
            {board.map((s, i) => (
              <TR key={s.id}>
                <TD className="font-bold text-brand-700">{i + 1}</TD>
                <TD><div className="flex items-center gap-2"><Avatar name={s.name} size={28} /><span className="font-semibold whitespace-nowrap">{s.name}</span></div></TD>
                {s.scores.map((v, j) => <TD key={j} className="text-center">{v} <span className="text-[10px] text-muted">{grade(v).g}</span></TD>)}
                <TD className="text-center font-bold">{s.total}</TD>
                <TD className="text-center">{s.avg.toFixed(1)}</TD>
              </TR>
            ))}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
