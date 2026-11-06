"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut } from "lucide-react";
import { roles, settingsFor, type NavItem, type Role } from "@/lib/roles";
import { signOut, type SessionValue } from "@/lib/session";
import { cn, initials } from "@/lib/utils";
import { Logo } from "./logo";
import { ProfileCard } from "./profile-switcher";

function NavLink({ item, active, onNavigate }: { item: NavItem; active: boolean; onNavigate?: () => void }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      className={cn(
        "group flex h-12 items-center gap-3.5 rounded-2xl px-4 text-[15px] transition-colors",
        active ? "bg-canvas font-semibold text-ink" : "text-muted hover:bg-canvas/70 hover:text-ink",
      )}
      aria-current={active ? "page" : undefined}
    >
      <Icon className={cn("h-5 w-5", active ? "text-ink" : "text-muted group-hover:text-ink")} strokeWidth={1.8} />
      <span className="flex-1 truncate">{item.label}</span>
    </Link>
  );
}

const TONES = ["bg-brand-600", "bg-orange-500", "bg-emerald-500", "bg-orchid-400", "bg-sky-500"];

/** The small list under the menu: the parent's children, the student's subjects, the staff member's school. */
function groupFor(session: SessionValue): { label: string; items: { label: string; href?: string }[] } | null {
  switch (session.portal) {
    case "parent":
      return {
        label: "My Children",
        items: session.me.children.map((c) => ({
          label: `${c.firstName} · ${[c.className, c.arm].filter(Boolean).join(" ")}`,
          href: `/parent?child=${c.id}`,
        })),
      };
    case "student":
      return { label: "My Subjects", items: session.me.subjects.slice(0, 6).map((s) => ({ label: s.name, href: "/student/subjects" })) };
    case "admin":
    case "teacher":
      return { label: "School", items: [{ label: session.me.school.name }] };
    default:
      return null;
  }
}

export function SidebarContent({ role, session, onNavigate }: { role: Role; session: SessionValue; onNavigate?: () => void }) {
  const pathname = usePathname();
  const cfg = roles[role];
  const isActive = (href: string) => (href === `/${role}` ? pathname === href : pathname === href || pathname.startsWith(href + "/"));
  const group = groupFor(session);

  return (
    <div className="flex h-full flex-col gap-6 px-5 py-7">
      <div className="flex items-center justify-between px-1">
        <Logo href={`/${role}`} />
      </div>

      <ProfileCard session={session} />

      <nav className="flex flex-col gap-1">
        <p className="mb-1 px-4 text-xs font-medium tracking-wider text-muted uppercase">Menu</p>
        {cfg.menu.map((item) => (
          <NavLink key={item.href} item={item} active={isActive(item.href)} onNavigate={onNavigate} />
        ))}
      </nav>

      <div className="mx-4 border-t border-line" />

      <nav className="flex flex-col gap-1">
        <p className="mb-1 px-4 text-xs font-medium tracking-wider text-muted uppercase">Settings</p>
        {settingsFor(role).map((item) => (
          <NavLink key={item.href} item={item} active={isActive(item.href)} onNavigate={onNavigate} />
        ))}
      </nav>

      {group && group.items.length ? (
        <>
          <div className="mx-4 border-t border-line" />
          <div>
            <p className="mb-2 px-4 text-xs font-medium tracking-wider text-muted uppercase">{group.label}</p>
            <ul className="flex flex-col gap-1">
              {group.items.map((g, i) => {
                const body = (
                  <>
                    <span className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[11px] font-bold text-white", TONES[i % TONES.length])}>
                      {initials(g.label.replace(/[^A-Za-z ]/g, " "))}
                    </span>
                    <span className="truncate">{g.label}</span>
                  </>
                );
                return (
                  <li key={g.label}>
                    {g.href ? (
                      <Link href={g.href} onClick={onNavigate} className="flex items-center gap-3 rounded-2xl px-4 py-2 text-sm font-medium hover:bg-canvas">
                        {body}
                      </Link>
                    ) : (
                      <span className="flex items-center gap-3 rounded-2xl px-4 py-2 text-sm font-medium">{body}</span>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        </>
      ) : null}

      <button onClick={signOut} className="mt-auto flex h-11 items-center gap-3 rounded-2xl px-4 text-sm font-medium text-muted hover:bg-canvas hover:text-ink">
        <LogOut className="h-5 w-5" strokeWidth={1.8} /> Log out
      </button>
    </div>
  );
}
