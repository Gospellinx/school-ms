import * as React from "react";
import { cn } from "@/lib/utils";

const tones = {
  brand: "bg-brand-50 text-brand-700",
  orchid: "bg-orchid-100 text-fuchsia-700",
  green: "bg-emerald-50 text-emerald-700",
  amber: "bg-amber-50 text-amber-700",
  red: "bg-rose-50 text-rose-600",
  gray: "bg-canvas text-muted",
  blue: "bg-sky-50 text-sky-700",
} as const;

export type Tone = keyof typeof tones;

export function Badge({ tone = "brand", className, ...props }: React.HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return <span className={cn("inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold whitespace-nowrap", tones[tone], className)} {...props} />;
}
