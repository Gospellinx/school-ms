import * as React from "react";
import { cn } from "@/lib/utils";

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn("h-10 w-full rounded-xl border border-line bg-white px-3.5 text-sm outline-none placeholder:text-muted/70 focus:border-brand-400 focus:ring-4 focus:ring-brand-100", className)}
      {...props}
    />
  );
}

export function Select({ className, children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn("h-10 rounded-xl border border-line bg-white px-3 pr-8 text-sm font-medium outline-none focus:border-brand-400 focus:ring-4 focus:ring-brand-100", className)}
      {...props}
    >
      {children}
    </select>
  );
}

export function Textarea({ className, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn("w-full rounded-xl border border-line bg-white px-3.5 py-2.5 text-sm outline-none placeholder:text-muted/70 focus:border-brand-400 focus:ring-4 focus:ring-brand-100", className)}
      {...props}
    />
  );
}

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("mb-1.5 block text-sm font-semibold", className)} {...props} />;
}
