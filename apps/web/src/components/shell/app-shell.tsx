"use client";
import * as React from "react";
import { usePathname } from "next/navigation";
import { Bell, Menu, Search, X } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { roles, type Role } from "@/lib/roles";
import { Logo } from "./logo";
import { SidebarContent } from "./sidebar";

export function AppShell({ role, children }: { role: Role; children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  const pathname = usePathname();
  React.useEffect(() => setOpen(false), [pathname]);
  React.useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
  }, [open]);

  return (
    <div className="min-h-dvh">
      {/* Desktop sidebar */}
      <aside className="no-print fixed inset-y-0 left-0 z-30 hidden w-[300px] overflow-y-auto bg-white lg:block">
        <SidebarContent role={role} />
      </aside>

      {/* Mobile top bar */}
      <header className="no-print sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-line bg-white/90 px-4 backdrop-blur lg:hidden">
        <button onClick={() => setOpen(true)} className="flex h-10 w-10 items-center justify-center rounded-xl border border-line" aria-label="Open menu">
          <Menu className="h-5 w-5" />
        </button>
        <Logo href={`/${role}`} />
        <button className="ml-auto flex h-10 w-10 items-center justify-center rounded-xl text-muted" aria-label="Notifications">
          <Bell className="h-5 w-5" />
        </button>
        <Avatar name={roles[role].user.name} size={36} />
      </header>

      {/* Mobile drawer */}
      {open ? (
        <div className="no-print fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-ink/40" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-[86%] max-w-[320px] overflow-y-auto bg-white shadow-2xl">
            <button onClick={() => setOpen(false)} className="absolute top-7 right-4 z-10 flex h-9 w-9 items-center justify-center rounded-xl border border-line bg-white" aria-label="Close menu">
              <X className="h-4 w-4" />
            </button>
            <SidebarContent role={role} onNavigate={() => setOpen(false)} />
          </div>
        </div>
      ) : null}

      <div className="print-area lg:pl-[300px]">
        <div className="no-print hidden items-center justify-end gap-3 px-8 pt-6 lg:flex">
          <label className="flex h-11 w-80 items-center gap-2 rounded-2xl bg-white px-4 text-sm text-muted">
            <Search className="h-4 w-4" />
            <input className="w-full bg-transparent outline-none placeholder:text-muted" placeholder="Search students, classes, results…" />
          </label>
          <button className="relative flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-muted" aria-label="Notifications">
            <Bell className="h-5 w-5" />
            <span className="absolute top-3 right-3 h-2 w-2 rounded-full bg-orchid-400" />
          </button>
        </div>
        <main className="px-4 pt-5 pb-16 sm:px-6 lg:px-8 lg:pt-2">{children}</main>
      </div>
    </div>
  );
}
