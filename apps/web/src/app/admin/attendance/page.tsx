import { PageHeader } from "@/components/shell/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { AttendanceRegister } from "@/components/pages/attendance-register";
import { Progress } from "@/components/ui/progress";
import { classes } from "@/lib/mock";

export const metadata = { title: "Attendance" };

export default function Attendance() {
  return (
    <>
      <PageHeader title="Attendance" subtitle="Today's registers across the school." />
      <div className="grid gap-5 xl:grid-cols-[1.4fr_1fr]">
        <AttendanceRegister />
        <Card>
          <CardHeader title="By class" subtitle="Present today" />
          <ul className="flex flex-col gap-4">
            {classes.map((c, i) => {
              const v = 86 + ((i * 7) % 14);
              return (
                <li key={c.name}>
                  <div className="mb-1.5 flex justify-between text-sm"><span className="font-semibold">{c.name}</span><span className="text-muted">{v}%</span></div>
                  <Progress value={v} barClassName={v < 90 ? "bg-orchid-400" : undefined} />
                </li>
              );
            })}
          </ul>
        </Card>
      </div>
    </>
  );
}
