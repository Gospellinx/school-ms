import Link from "next/link";
import type { PublicSchool } from "@/lib/admissions";

function initials(name: string) {
  return name
    .replace(/\(.*?\)/g, "")
    .split(/\s+/)
    .filter((w) => /^[A-Z]/.test(w))
    .slice(0, 4)
    .map((w) => w[0])
    .join("");
}

/** Top bar of a school's public pages. Colours come from the --accent variable set by the page. */
export function SiteHeader({ school, logoUrl, admissionsOpen, minimal }: { school: Pick<PublicSchool, "name" | "slug">; logoUrl?: string | null; admissionsOpen?: boolean; minimal?: boolean }) {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-white/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
        <Link href={`/s/${school.slug}`} className="flex min-w-0 items-center gap-2.5">
          {logoUrl ? (
            <img src={logoUrl} alt="" className="h-9 w-9 rounded-xl object-cover" />
          ) : (
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-xs font-bold text-white" style={{ background: "var(--accent)" }}>{initials(school.name)}</span>
          )}
          <span className="truncate font-bold">{school.name}</span>
        </Link>
        {minimal ? null : (
          <nav className="flex items-center gap-1 text-sm font-semibold">
            <a href={`/s/${school.slug}#about`} className="hidden rounded-xl px-3 py-2 text-muted hover:text-ink sm:block">About</a>
            <a href={`/s/${school.slug}#admissions`} className="hidden rounded-xl px-3 py-2 text-muted hover:text-ink sm:block">Admissions</a>
            <a href={`/s/${school.slug}#contact`} className="hidden rounded-xl px-3 py-2 text-muted hover:text-ink sm:block">Contact</a>
            {admissionsOpen ? (
              <Link href={`/s/${school.slug}/apply`} className="rounded-xl px-4 py-2 text-white" style={{ background: "var(--accent)" }}>Apply</Link>
            ) : null}
          </nav>
        )}
      </div>
    </header>
  );
}

export function SiteFooter({ school }: { school: Pick<PublicSchool, "name" | "motto"> }) {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-8 text-sm text-muted sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p>© {new Date().getFullYear()} {school.name}{school.motto ? ` · ${school.motto}` : ""}</p>
        <p>Website and admissions by <Link href="/" className="font-semibold text-ink">Linx School</Link></p>
      </div>
    </footer>
  );
}
