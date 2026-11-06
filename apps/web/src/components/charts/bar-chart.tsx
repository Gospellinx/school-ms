"use client";
import * as React from "react";
import { cn } from "@/lib/utils";

export interface BarDatum { label: string; value: number }

export type Unit = "number" | "hours" | "percent" | "naira-k";

function formatter(unit: Unit) {
  return (v: number) => {
    if (unit === "hours") {
      const h = Math.floor(v);
      const m = Math.round((v - h) * 60);
      return m ? `${h}h ${m}m` : `${h}h`;
    }
    if (unit === "percent") return `${Math.round(v)}%`;
    if (unit === "naira-k") return v >= 1000 ? `₦${(v / 1000).toFixed(1)}m` : `₦${Math.round(v)}k`;
    return String(Math.round(v * 10) / 10);
  };
}

/** Light, dependency-free bar chart in the soft lilac style. */
export function BarChart({
  data,
  max,
  height = 200,
  unit = "number",
  ticks = 5,
  highlight,
}: {
  data: BarDatum[];
  max?: number;
  height?: number;
  unit?: Unit;
  ticks?: number;
  highlight?: number;
}) {
  const format = formatter(unit);
  const top = max ?? Math.ceil(Math.max(...data.map((d) => d.value)) * 1.15);
  const peak = highlight ?? data.reduce((best, d, i) => (d.value > data[best]!.value ? i : best), 0);
  const [active, setActive] = React.useState<number>(peak);
  const tickValues = Array.from({ length: ticks }, (_, i) => Math.round((top / (ticks - 1)) * (ticks - 1 - i)));

  return (
    <div className="flex gap-3" style={{ height }}>
      <div className="flex flex-col justify-between pb-6 text-xs text-muted">
        {tickValues.map((t) => (
          <span key={t} className="leading-none">{format(t)}</span>
        ))}
      </div>
      <div className="relative flex-1">
        <div className="absolute inset-x-0 top-0 bottom-6 flex flex-col justify-between">
          {tickValues.map((t) => (
            <div key={t} className="border-t border-dashed border-brand-200/60" />
          ))}
        </div>
        <div className="absolute inset-0 flex items-end justify-around gap-2">
          {data.map((d, i) => {
            const h = (d.value / top) * (height - 24);
            const on = i === active;
            return (
              <button
                key={d.label}
                type="button"
                onMouseEnter={() => setActive(i)}
                onFocus={() => setActive(i)}
                onClick={() => setActive(i)}
                className="group relative flex h-full w-full max-w-11 flex-col items-center justify-end"
                aria-label={`${d.label}: ${format(d.value)}`}
              >
                {on ? (
                  <span className="absolute z-10 rounded-lg bg-ink px-2.5 py-1 text-xs font-semibold whitespace-nowrap text-white" style={{ bottom: h + 30 }}>
                    {format(d.value)}
                  </span>
                ) : null}
                <span
                  className={cn(
                    "w-full rounded-t-xl transition-all",
                    on ? "bg-gradient-to-b from-brand-500 to-brand-400" : "bg-gradient-to-b from-orchid-200 to-brand-100 group-hover:from-orchid-300",
                  )}
                  style={{ height: Math.max(4, h) }}
                />
                <span className="mt-2 h-4 text-[11px] font-medium text-muted">{d.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
