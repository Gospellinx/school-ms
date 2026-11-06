"use client";
import * as React from "react";
import { cn } from "@/lib/utils";

export function Tabs({ tabs, value, onChange, className }: { tabs: string[]; value: string; onChange: (t: string) => void; className?: string }) {
  return (
    <div className={cn("scrollbar-none inline-flex max-w-full gap-1 overflow-x-auto rounded-2xl bg-white p-1", className)} role="tablist">
      {tabs.map((t) => (
        <button
          key={t}
          role="tab"
          aria-selected={t === value}
          onClick={() => onChange(t)}
          className={cn(
            "h-9 rounded-xl px-4 text-sm font-semibold whitespace-nowrap transition-colors",
            t === value ? "bg-brand-600 text-white" : "text-muted hover:text-ink",
          )}
        >
          {t}
        </button>
      ))}
    </div>
  );
}
