"use client";
import * as React from "react";
import { usePathname } from "next/navigation";
import { Bell, Menu, X } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { ErrorNote, Loading } from "@/components/ui/feedback";
import { useApi } from "@/lib/api";
import { type Role } from "@/lib/roles";
import { SessionContext, sessionUser, signOut, type SessionValue } from "@/lib/session";
import { Logo } from "./logo";
import { SidebarContent } from "./sidebar";
import { OfflineBar } from "./offline-bar";
import { setOutboxOwner } from "@/lib/offline";

/** Where each portal finds out who is signed in. */
const ME_PATH: Record<Role, string> = {
  admin: "auth/me",
  teacher: "auth/me",
  parent: "parent/me",
  student: "student/me",
  "super-admin": "platform/me",
};

export function AppShell({ role, children }: { role: Role; children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  const pathname = usePathname();
  const { data: me, error } = useApi<SessionValue["me"]>(ME_PATH[role]);
  React.useEffect(() => setOpen(false), [pathname]);
  const staffId = me && "staff" in me ? me.staff.id : null;
  React.useEffect(() => setOutboxOwner(staffId), [staffId]);
  React.useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
  }, [open]);

  if (error) {
    return (
      <div className="mx-auto max-w-md p-8">
        <ErrorNote>{error}</ErrorNote>
        <button onClick={signOut} className="mt-4 text-sm font-semibold text-brand-600">Sign in again</button>
      </div>
    );
  }
  if (!me) return <Loading className="min-h-dvh" />;

  const session = { portal: role, me } as SessionValue;
  const user = sessionUser(session);

  return (
    <SessionContext.Provider value={session}>
      <div className="min-h-dvh">
        {/* Desktop sidebar */}
        <aside className="no-print fixed inset-y-0 left-0 z-30 hidden w-[300px] overflow-y-auto bg-white lg:block">
          <SidebarContent role={role} session={session} />
        </aside>

        {/* Mobile top bar */}
        <header className="no-print sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-line bg-white/90 px-4 backdrop-blur lg:hidden">
          <button onClick={() => setOpen(true)} className="flex h-10 w-10 items-center justify-center rounded-xl border border-line" aria-label="Open menu">
            <Menu className="h-5 w-5" />
          </button>
          <Logo href={`/${role}`} />
          <Avatar name={user.name} size={36} className="ml-auto" />
        </header>

        {/* Mobile drawer */}
        {open ? (
          <div className="no-print fixed inset-0 z-50 lg:hidden">
            <div className="absolute inset-0 bg-ink/40" onClick={() => setOpen(false)} />
            <div className="absolute inset-y-0 left-0 w-[86%] max-w-[320px] overflow-y-auto bg-white shadow-2xl">
              <button onClick={() => setOpen(false)} className="absolute top-7 right-4 z-10 flex h-9 w-9 items-center justify-center rounded-xl border border-line bg-white" aria-label="Close menu">
                <X className="h-4 w-4" />
              </button>
              <SidebarContent role={role} session={session} onNavigate={() => setOpen(false)} />
            </div>
          </div>
        ) : null}

        <div className="print-area lg:pl-[300px]">
          <div className="no-print hidden items-center justify-end gap-3 px-8 pt-6 lg:flex">
            <span className="text-sm text-muted">{"school" in me ? me.school.name : null}</span>
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-muted" aria-hidden>
              <Bell className="h-5 w-5" />
            </span>
          </div>
          <main className="px-4 pt-5 pb-16 sm:px-6 lg:px-8 lg:pt-2">
            {role === "teacher" || role === "admin" ? <OfflineBar /> : null}
            {children}
          </main>
        </div>
      </div>
    </SessionContext.Provider>
  );
}
