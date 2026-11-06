"use client";
import Link from "next/link";
import { Avatar } from "@/components/ui/avatar";
import { sessionUser, type SessionValue } from "@/lib/session";

/** The signed-in person, linking to their account settings. */
export function ProfileCard({ session }: { session: SessionValue }) {
  const user = sessionUser(session);
  return (
    <Link href={`/${session.portal}/settings`} className="flex w-full items-center gap-3 rounded-2xl border border-line bg-white p-3 text-left hover:border-brand-200">
      <Avatar name={user.name} size={42} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">{user.name}</span>
        <span className="block truncate text-xs text-muted">{user.subtitle}</span>
      </span>
    </Link>
  );
}
