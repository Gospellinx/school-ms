import { cn } from "@/lib/utils";

export function Progress({ value, className, barClassName }: { value: number; className?: string; barClassName?: string }) {
  return (
    <div className={cn("h-2 w-full overflow-hidden rounded-full bg-brand-50", className)}>
      <div className={cn("h-full rounded-full bg-brand-600", barClassName)} style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
    </div>
  );
}
