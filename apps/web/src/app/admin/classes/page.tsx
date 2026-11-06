import { BookOpen, Plus, Users } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { classes, subjects } from "@/lib/mock";

export const metadata = { title: "Classes & Subjects" };

const sections = ["Nursery", "Primary", "Junior Secondary", "Senior Secondary"];

export default function Classes() {
  return (
    <>
      <PageHeader title="Classes & Subjects" subtitle="Session 2025/2026 · First Term" actions={<Button><Plus className="h-4 w-4" /> New class</Button>} />
      {sections.map((sec) => (
        <section key={sec} className="mb-6">
          <h2 className="mb-3 text-lg font-semibold">{sec}</h2>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {classes.filter((c) => c.section === sec).map((c) => (
              <Card key={c.name} className="p-5 sm:p-5">
                <p className="text-lg font-semibold">{c.name}</p>
                <p className="text-sm text-muted">{c.teacher}</p>
                <div className="mt-4 flex gap-4 text-sm">
                  <span className="flex items-center gap-1.5"><Users className="h-4 w-4 text-brand-600" /> {c.students}</span>
                  <span className="flex items-center gap-1.5"><BookOpen className="h-4 w-4 text-brand-600" /> {c.subjects} subjects</span>
                </div>
              </Card>
            ))}
          </div>
        </section>
      ))}
      <Card>
        <CardHeader title="Subjects" subtitle="Senior Secondary" action={<Button size="sm" variant="secondary">Add subject</Button>} />
        <div className="flex flex-wrap gap-2">{subjects.map((s) => <Badge key={s} tone="brand" className="px-3 py-1.5 text-sm">{s}</Badge>)}</div>
      </Card>
    </>
  );
}
