import { Plus } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { Card } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/widgets/status-badge";
import { staff } from "@/lib/mock";

export const metadata = { title: "Staff" };

export default function Staff() {
  return (
    <>
      <PageHeader title="Staff" subtitle="Teachers, class teachers and office staff." actions={<Button><Plus className="h-4 w-4" /> Add staff</Button>} />
      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {staff.map((p) => (
          <Card key={p.name}>
            <div className="flex items-center gap-3">
              <Avatar name={p.name.replace(/^(Mr|Mrs|Miss|Dr)\.\s/, "")} size={48} />
              <div className="min-w-0 flex-1"><p className="truncate font-semibold">{p.name}</p><p className="text-sm text-muted">{p.role}</p></div>
              <StatusBadge status={p.status} />
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 rounded-2xl bg-canvas p-3 text-sm">
              <div><p className="text-xs text-muted">Subject</p><p className="font-semibold">{p.subject}</p></div>
              <div><p className="text-xs text-muted">Phone</p><p className="font-semibold">{p.phone}</p></div>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">{p.classes.split(", ").map((c) => c !== "—" && <Badge key={c} tone="brand">{c}</Badge>)}</div>
          </Card>
        ))}
      </div>
    </>
  );
}
