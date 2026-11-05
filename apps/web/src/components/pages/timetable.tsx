import { PageHeader } from "@/components/shell/page-header";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const periods = ["8:00", "8:40", "9:20", "10:00", "11:00", "11:40", "12:20", "1:00"];
const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
const plan = [
  ["Mathematics", "English", "Physics", "Physics", "Break", "Chemistry", "Biology", "Civic Ed."],
  ["English", "Mathematics", "Economics", "Chemistry", "Break", "Further Maths", "Computer", "Sports"],
  ["Physics", "Biology", "Mathematics", "English", "Break", "Economics", "Civic Ed.", "CBT Lab"],
  ["Mathematics", "Physics lab", "Physics lab", "English", "Break", "Chemistry", "Further Maths", "Clubs"],
  ["Chemistry", "Mathematics", "Biology", "Computer", "Break", "English", "Economics", "Assembly"],
];
const tone = (s: string) =>
  s === "Break" ? "bg-canvas text-muted" :
  s.startsWith("Math") || s.startsWith("Further") ? "bg-brand-50 text-brand-800" :
  s.startsWith("Physics") || s.startsWith("Chem") || s.startsWith("Bio") ? "bg-orchid-100 text-fuchsia-800" :
  s.startsWith("English") ? "bg-amber-50 text-amber-800" : "bg-emerald-50 text-emerald-800";

export function TimetableView({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <>
      <PageHeader title={title} subtitle={subtitle} />
      <Card className="p-0 sm:p-0">
        <div className="overflow-x-auto p-5 sm:p-6">
          <div className="grid min-w-[760px] grid-cols-[96px_repeat(8,1fr)] gap-2 text-sm">
            <span />
            {periods.map((p) => <span key={p} className="px-2 text-xs font-semibold text-muted">{p}</span>)}
            {days.map((d, r) => (
              <div key={d} className="contents">
                <span className="flex items-center font-semibold">{d}</span>
                {plan[r]!.map((s, c) => (
                  <span key={c} className={cn("rounded-xl px-2.5 py-3 text-xs font-semibold", tone(s))}>{s}</span>
                ))}
              </div>
            ))}
          </div>
        </div>
      </Card>
    </>
  );
}
