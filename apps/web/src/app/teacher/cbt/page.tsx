import { Plus, Sparkles } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/widgets/status-badge";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { cbtQuestions, cbtTests } from "@/lib/mock";

export const metadata = { title: "CBT Tests" };

export default function TeacherCbt() {
  return (
    <>
      <PageHeader title="CBT Tests" subtitle="Set computer-based tests. Marking is automatic." actions={<Button><Plus className="h-4 w-4" /> New test</Button>} />
      <div className="grid gap-5 xl:grid-cols-[1fr_1.3fr]">
        <Card>
          <CardHeader title="New test" subtitle="Draft" />
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2"><Label>Title</Label><Input defaultValue="SS 2 Maths: Quadratic Equations" /></div>
            <div><Label>Class</Label><Select className="w-full"><option>SS 2 Gold</option><option>SS 3 Gold</option></Select></div>
            <div><Label>Duration</Label><Select className="w-full"><option>30 minutes</option><option>45 minutes</option><option>60 minutes</option></Select></div>
            <div><Label>Opens</Label><Input type="date" defaultValue="2026-11-10" /></div>
            <div><Label>Closes</Label><Input type="date" defaultValue="2026-11-12" /></div>
          </div>
          <div className="mt-5 rounded-2xl bg-brand-50 p-4">
            <p className="flex items-center gap-2 font-semibold text-brand-700"><Sparkles className="h-4 w-4" /> Pick from the question bank</p>
            <p className="mt-1 text-sm text-muted">312 WAEC-style questions on quadratic equations. Choose by hand or let us pick a balanced mix.</p>
            <div className="mt-3 flex gap-2"><Button size="sm">Auto-pick 20</Button><Button size="sm" variant="outline">Browse</Button></div>
          </div>
          <ul className="mt-4 flex flex-col gap-2">
            {cbtQuestions.slice(0, 3).map((q, i) => (
              <li key={q.q} className="flex items-start gap-3 rounded-2xl border border-line p-3 text-sm">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-canvas text-xs font-bold">{i + 1}</span>
                <span className="flex-1">{q.q}</span>
                <Badge tone="gray">{q.topic}</Badge>
              </li>
            ))}
          </ul>
          <div className="mt-5 flex justify-end gap-2"><Button variant="outline">Save draft</Button><Button>Publish to class</Button></div>
        </Card>
        <Card>
          <CardHeader title="My tests" />
          <Table>
            <THead><tr><TH>Test</TH><TH>Class</TH><TH>Taken</TH><TH>Avg</TH><TH>Status</TH></tr></THead>
            <tbody>
              {cbtTests.map((t, i) => (
                <TR key={t.title}>
                  <TD><p className="font-semibold">{t.title}</p><p className="text-xs text-muted">{t.questions} Qs · {t.minutes} min</p></TD>
                  <TD>{["SS 3 Gold", "SS 2 Gold", "SS 2 Gold", "JSS 3 Blue"][i]}</TD>
                  <TD>{t.status === "Done" ? "29/29" : `${12 + i}/29`}</TD>
                  <TD>{t.score ? `${t.score}%` : "—"}</TD>
                  <TD><StatusBadge status={t.status} /></TD>
                </TR>
              ))}
            </tbody>
          </Table>
        </Card>
      </div>
    </>
  );
}
