import { PageHeader } from "@/components/shell/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { StatCard } from "@/components/widgets/stat-card";
import { CalendarCheck, CalendarX, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

export const metadata = { title: "Attendance" };

const weeks = Array.from({ length: 9 }, (_, w) => Array.from({ length: 5 }, (_, d) => ((w * 5 + d) === 17 || (w * 5 + d) === 31 ? "A" : (w * 5 + d) === 8 || (w * 5 + d) === 40 ? "L" : "P")));

export default function ParentAttendance() {
  return (
    <>
      <PageHeader title="Attendance" subtitle="Chiamaka Okafor · First Term" />
      <div className="mb-5 grid grid-cols-3 gap-4">
        <StatCard icon={CalendarCheck} label="Present" value="41" tone="green" />
        <StatCard icon={Clock} label="Late" value="2" tone="amber" />
        <StatCard icon={CalendarX} label="Absent" value="2" tone="orchid" />
      </div>
      <Card>
        <CardHeader title="Day by day" subtitle="Weeks 1 to 9" />
        <div className="overflow-x-auto">
          <div className="grid min-w-[420px] grid-cols-[70px_repeat(5,1fr)] gap-2 text-center text-xs">
            <span />{["Mon", "Tue", "Wed", "Thu", "Fri"].map((d) => <span key={d} className="font-semibold text-muted">{d}</span>)}
            {weeks.map((w, i) => (
              <div key={i} className="contents">
                <span className="flex items-center text-left font-semibold text-muted">Week {i + 1}</span>
                {w.map((s, j) => (
                  <span key={j} className={cn("rounded-lg py-2.5 font-bold", s === "P" ? "bg-brand-100 text-brand-700" : s === "L" ? "bg-amber-100 text-amber-700" : "bg-rose-100 text-rose-600")}>{s === "P" ? "✓" : s}</span>
                ))}
              </div>
            ))}
          </div>
        </div>
      </Card>
    </>
  );
}
