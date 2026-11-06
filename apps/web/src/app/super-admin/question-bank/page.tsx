import { Plus, Upload } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { StatusBadge } from "@/components/widgets/status-badge";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { cbtQuestions, subjects } from "@/lib/mock";

export const metadata = { title: "Question Bank" };

export default function QuestionBank() {
  return (
    <>
      <PageHeader title="Question Bank" subtitle="WAEC, NECO, BECE and JAMB questions shared by every school." actions={<><Button variant="outline"><Upload className="h-4 w-4" /> Import CSV</Button><Button><Plus className="h-4 w-4" /> Add question</Button></>} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {subjects.slice(0, 6).map((s, i) => {
          const n = 1200 + i * 347;
          return (
            <Card key={s}>
              <div className="flex items-center justify-between"><p className="font-semibold">{s}</p><Badge tone="gray">{n.toLocaleString()} Qs</Badge></div>
              <p className="mt-3 mb-1.5 text-xs text-muted">With AI explanations: {70 + i * 4}%</p>
              <Progress value={70 + i * 4} />
            </Card>
          );
        })}
      </div>
      <Card className="mt-5">
        <CardHeader title="Waiting for review" subtitle="Questions with AI explanations to check before students see them" />
        <Table>
          <THead><tr><TH>Question</TH><TH>Topic</TH><TH>Source</TH><TH>Status</TH><TH /></tr></THead>
          <tbody>
            {cbtQuestions.map((q, i) => (
              <TR key={q.q}>
                <TD className="max-w-[340px] truncate font-medium">{q.q}</TD><TD>{q.topic}</TD><TD>{["WAEC 2019", "NECO 2021", "WAEC 2022", "JAMB 2020", "WAEC 2018"][i]}</TD>
                <TD><StatusBadge status="Pending" /></TD><TD className="text-right"><Button size="sm" variant="secondary">Review</Button></TD>
              </TR>
            ))}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
