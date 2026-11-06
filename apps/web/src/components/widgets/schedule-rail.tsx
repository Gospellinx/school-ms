"use client";
import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

const days = ["S", "M", "T", "W", "T", "F", "S"];

export function MiniCalendar({ marked = [] }: { marked?: number[] }) {
  const [offset, setOffset] = React.useState(0);
  const now = new Date();
  const base = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const month = base.toLocaleString("en-GB", { month: "long", year: "numeric" });
  const startDay = base.getDay();
  const daysInMonth = new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate();
  const prevDays = new Date(base.getFullYear(), base.getMonth(), 0).getDate();
  const cells: { d: number; muted: boolean }[] = [];
  for (let i = startDay - 1; i >= 0; i--) cells.push({ d: prevDays - i, muted: true });
  for (let d = 1; d <= daysInMonth; d++) cells.push({ d, muted: false });
  while (cells.length % 7) cells.push({ d: cells.length - daysInMonth - startDay + 1, muted: true });
  const today = offset === 0 ? now.getDate() : -1;

  return (
    <div>
      <div className="mb-4 flex items-center justify-between rounded-2xl bg-canvas p-1.5">
        <button onClick={() => setOffset((o) => o - 1)} className="flex h-9 w-9 items-center justify-center rounded-xl hover:bg-white" aria-label="Previous month">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="text-sm font-semibold">{month}</span>
        <button onClick={() => setOffset((o) => o + 1)} className="flex h-9 w-9 items-center justify-center rounded-xl hover:bg-white" aria-label="Next month">
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-y-1 text-center text-sm">
        {days.map((d, i) => <span key={i} className="py-1 text-xs font-medium text-muted">{d}</span>)}
        {cells.map((c, i) => (
          <span key={i} className="flex justify-center">
            <span
              className={cn(
                "flex h-9 w-9 items-center justify-center rounded-full",
                c.muted && "text-muted/50",
                !c.muted && c.d === today && "bg-brand-600 font-semibold text-white",
                !c.muted && c.d !== today && offset === 0 && marked.includes(c.d) && "bg-canvas font-semibold",
              )}
            >
              {c.d}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}
