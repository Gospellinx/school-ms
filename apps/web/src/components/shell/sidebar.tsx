"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, PanelLeft, Plus } from "lucide-react";
import { roles, settingsFor, type NavItem, type Role } from "@/lib/roles";
import { cn } from "@/lib/utils";
import { Logo } from "./logo";
import { ProfileSwitcher } from "./profile-switcher";

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
      {item.badge ? (
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-orchid-200 text-xs font-bold text-ink">{item.badge}</span>
      ) : null}
    </Link>
  );
}

export function SidebarContent({ role, onNavigate }: { role: Role; onNavigate?: () => void }) {
  const pathname = usePathname();
  const cfg = roles[role];
  const isActive = (href: string) => (href === `/${role}` ? pathname === href : pathname === href || pathname.startsWith(href + "/"));

  return (
    <div className="flex h-full flex-col gap-6 px-5 py-7">
      <div className="flex items-center justify-between px-1">
        <Logo href={`/${role}`} />
        <span className="hidden h-9 w-9 items-center justify-center rounded-xl border border-line text-muted lg:flex" aria-hidden>
          <PanelLeft className="h-4 w-4" />
        </span>
      </div>

      <ProfileSwitcher role={role} />

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

      <div className="mx-4 border-t border-line" />

      <div>
        <div className="mb-2 flex items-center justify-between px-4">
          <p className="text-xs font-medium tracking-wider text-muted uppercase">{cfg.groupLabel}</p>
          <Plus className="h-4 w-4 text-muted" />
        </div>
        <ul className="flex flex-col gap-1">
          {cfg.group.map((g) => (
            <li key={g.label} className="flex items-center gap-3 rounded-2xl px-4 py-2 text-sm font-medium">
              <span className={cn("flex h-7 w-7 items-center justify-center rounded-lg text-[11px] font-bold text-white", g.tone)}>{g.tag}</span>
              <span className="truncate">{g.label}</span>
            </li>
          ))}
        </ul>
      </div>

      <Link href="/" className="mt-auto flex h-11 items-center gap-3 rounded-2xl px-4 text-sm font-medium text-muted hover:bg-canvas hover:text-ink">
        <LogOut className="h-5 w-5" strokeWidth={1.8} /> Log out
      </Link>
    </div>
  );
}
