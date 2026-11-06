"use client";
import * as React from "react";
import Link from "next/link";
import { Check, ChevronDown } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { roleOrder, roles, type Role } from "@/lib/roles";
import { cn } from "@/lib/utils";

/** Profile card. In this design build it also lets you jump between roles. */
export function ProfileSwitcher({ role }: { role: Role }) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  const cfg = roles[role];

  React.useEffect(() => {
    const close = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-3 rounded-2xl border border-line bg-white p-3 text-left hover:border-brand-200"
        aria-expanded={open}
      >
        <Avatar name={cfg.user.name} size={42} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold">{cfg.user.name}</span>
          <span className="block truncate text-xs text-muted">{cfg.user.subtitle}</span>
        </span>
        <ChevronDown className={cn("h-4 w-4 text-muted transition-transform", open && "rotate-180")} />
      </button>
      {open ? (
        <div className="absolute inset-x-0 top-full z-50 mt-2 rounded-2xl border border-line bg-white p-1.5 shadow-xl shadow-brand-900/10">
          <p className="px-3 pt-2 pb-1 text-[11px] font-semibold tracking-wider text-muted uppercase">View as</p>
          {roleOrder.map((r) => (
            <Link
              key={r}
              href={`/${r}`}
              onClick={() => setOpen(false)}
              className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm hover:bg-canvas"
            >
              <Avatar name={roles[r].user.name} size={28} />
              <span className="flex-1">
                <span className="block font-semibold">{roles[r].title}</span>
                <span className="block text-xs text-muted">{roles[r].user.name}</span>
              </span>
              {r === role ? <Check className="h-4 w-4 text-brand-600" /> : null}
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}
