import Link from "next/link";
import { Users } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { Card } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { buttonClass } from "@/components/ui/button";
import { students } from "@/lib/mock";

export const metadata = { title: "My Classes" };

const mine = [
  { name: "SS 2 Gold", subject: "Mathematics", count: 29, avg: 63, entered: 62 },
  { name: "SS 3 Gold", subject: "Further Mathematics", count: 25, avg: 71, entered: 100 },
  { name: "JSS 3 Blue", subject: "Mathematics", count: 30, avg: 58, entered: 30 },
];

export default function MyClasses() {
  return (
    <>
      <PageHeader title="My Classes" subtitle="Classes and subjects assigned to you this term." />
      <div className="grid gap-5 lg:grid-cols-3">
        {mine.map((c) => (
          <Card key={c.name}>
            <div className="flex items-start justify-between">
              <div><p className="text-xl font-semibold">{c.name}</p><p className="text-sm text-muted">{c.subject}</p></div>
              <Badge tone="brand"><Users className="h-3.5 w-3.5" /> {c.count}</Badge>
            </div>
            <div className="mt-4 flex -space-x-2">{students.slice(0, 6).map((s) => <Avatar key={s.id} name={s.name} size={30} className="ring-2 ring-white" />)}</div>
            <div className="mt-5 grid grid-cols-2 gap-3 rounded-2xl bg-canvas p-3">
              <div><p className="text-xs text-muted">Class average</p><p className="text-lg font-bold">{c.avg}%</p></div>
              <div><p className="text-xs text-muted">Scores entered</p><p className="text-lg font-bold">{c.entered}%</p></div>
            </div>
            <Progress value={c.entered} className="mt-4" />
            <div className="mt-5 flex gap-2">
              <Link href="/teacher/scores" className={buttonClass("primary", "sm", "flex-1")}>Enter scores</Link>
              <Link href="/teacher/attendance" className={buttonClass("secondary", "sm", "flex-1")}>Register</Link>
            </div>
          </Card>
        ))}
      </div>
    </>
  );
}
