import Link from "next/link";
import { BookOpen, PlayCircle } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { buttonClass } from "@/components/ui/button";
import { subjects } from "@/lib/mock";
import { cn } from "@/lib/utils";

export const metadata = { title: "My Subjects" };

const covers = ["from-brand-200 to-brand-400", "from-orchid-200 to-orchid-400", "from-amber-100 to-orange-300", "from-emerald-100 to-emerald-300", "from-sky-100 to-sky-300"];
const teachers = ["Mr. Tunde Bakare", "Mrs. Folake Adeyemi", "Mr. Ibrahim Musa", "Dr. Chinedu Obi", "Mr. Kunle Lawal", "Mrs. Amaka Nwosu", "Mr. Peter Danjuma", "Mr. Tunde Bakare", "Mrs. Joy Uche"];

export default function Subjects() {
  return (
    <>
      <PageHeader title="My Subjects" subtitle="SS 2 Gold · First Term 2025/2026" />
      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {subjects.map((s, i) => {
          const done = 30 + ((i * 17) % 60);
          return (
            <Card key={s} className="flex flex-col">
              <div className={cn("relative flex h-28 items-end rounded-2xl bg-gradient-to-br p-4", covers[i % covers.length])}>
                <BookOpen className="absolute top-4 right-4 h-6 w-6 text-white/80" />
                <Badge tone="gray" className="bg-white/80 text-ink">{12 + i * 2} topics</Badge>
              </div>
              <h3 className="mt-4 text-lg font-semibold">{s}</h3>
              <p className="text-sm text-muted">{teachers[i]}</p>
              <div className="mt-4 mb-1.5 flex justify-between text-xs"><span className="text-muted">Syllabus covered</span><span className="font-semibold">{done}%</span></div>
              <Progress value={done} />
              <div className="mt-5 flex gap-2">
                <Link href="/student/prep" className={buttonClass("primary", "sm", "flex-1")}><PlayCircle className="h-4 w-4" /> Continue</Link>
                <Link href="/student/cbt" className={buttonClass("secondary", "sm", "flex-1")}>Past questions</Link>
              </div>
            </Card>
          );
        })}
      </div>
    </>
  );
}
