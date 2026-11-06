import * as React from "react";
import { cn } from "@/lib/utils";

export function Table({ className, ...props }: React.TableHTMLAttributes<HTMLTableElement>) {
  return (
    <div className="-mx-5 overflow-x-auto sm:-mx-6">
      <table className={cn("w-full min-w-[560px] text-left text-sm", className)} {...props} />
    </div>
  );
}
export function THead(props: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className="text-xs font-semibold uppercase tracking-wide text-muted" {...props} />;
}
export function TH({ className, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return <th className={cn("border-b border-line px-3 py-3 font-semibold first:pl-5 last:pr-5 sm:first:pl-6 sm:last:pr-6", className)} {...props} />;
}
export function TR({ className, ...props }: React.HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={cn("border-b border-line last:border-0 hover:bg-canvas/60", className)} {...props} />;
}
export function TD({ className, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn("px-3 py-3 align-middle first:pl-5 last:pr-5 sm:first:pl-6 sm:last:pr-6", className)} {...props} />;
}
