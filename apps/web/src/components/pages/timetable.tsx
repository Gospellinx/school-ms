import { CalendarDays } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Empty } from "@/components/ui/feedback";

/** Timetables are not in the backend yet; show what this person teaches or takes instead of a made-up week. */
export function TimetableView({ title, subtitle, items }: { title: string; subtitle: string; items: string[] }) {
  return (
    <>
      <PageHeader title={title} subtitle={subtitle} />
      <Card>
        <Empty icon={CalendarDays} title="Timetables are coming next">
          The school will be able to set periods for each class here. Until then, this page lists your subjects.
        </Empty>
        {items.length ? (
          <div className="mt-5">
            <CardHeader title="Your subjects" />
            <div className="flex flex-wrap gap-2">{items.map((s) => <Badge key={s} tone="brand" className="px-3 py-1.5 text-sm">{s}</Badge>)}</div>
          </div>
        ) : null}
      </Card>
    </>
  );
}
