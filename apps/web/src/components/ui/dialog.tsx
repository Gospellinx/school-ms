"use client";
import * as React from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/** A centred panel over the page (bottom sheet on phones). Closes on Escape or the backdrop. */
export function Dialog({ open, onClose, title, subtitle, children, wide }: { open: boolean; onClose: () => void; title: string; subtitle?: string; children: React.ReactNode; wide?: boolean }) {
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="no-print fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-ink/40" onClick={onClose} />
      <div className={cn("relative max-h-[92dvh] w-full overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl sm:rounded-3xl sm:p-7", wide ? "sm:max-w-3xl" : "sm:max-w-lg")}>
        <div className="mb-5 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold tracking-tight">{title}</h2>
            {subtitle ? <p className="mt-0.5 text-sm text-muted">{subtitle}</p> : null}
          </div>
          <button onClick={onClose} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-line" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
