import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function StatCard({ icon: Icon, label, value, delta, tone = "brand" }: { icon: LucideIcon; label: string; value: string; delta?: string; tone?: "brand" | "orchid" | "amber" | "green" }) {
  const tones = {
    brand: "bg-brand-50 text-brand-600",
    orchid: "bg-orchid-100 text-fuchsia-600",
    amber: "bg-amber-50 text-amber-600",
    green: "bg-emerald-50 text-emerald-600",
  };
  return (
    <div className="rounded-3xl bg-white p-5">
      <div className="flex items-center justify-between">
        <span className={cn("flex h-11 w-11 items-center justify-center rounded-2xl", tones[tone])}>
          <Icon className="h-5 w-5" strokeWidth={1.8} />
        </span>
        {delta ? <span className="rounded-lg bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">{delta}</span> : null}
      </div>
      <p className="mt-4 text-2xl font-bold tracking-tight sm:text-[28px]">{value}</p>
      <p className="text-sm text-muted">{label}</p>
    </div>
  );
}
