import { Badge, type Tone } from "@/components/ui/badge";

const map: Record<string, Tone> = {
  Paid: "green", Successful: "green", Active: "green", Present: "green", Published: "green", Done: "green", Delivered: "green",
  "Part paid": "amber", Trial: "amber", Pending: "amber", Draft: "amber", Late: "amber", Open: "brand", "On leave": "amber",
  Owing: "red", Failed: "red", Overdue: "red", Absent: "red",
};

export function StatusBadge({ status }: { status: string }) {
  return <Badge tone={map[status] ?? "gray"}>{status}</Badge>;
}
