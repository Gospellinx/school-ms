"use client";
import * as React from "react";
import Link from "next/link";
import { Logo } from "@/components/shell/logo";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ErrorNote } from "@/components/ui/feedback";
import { Input, Label } from "@/components/ui/input";

/** Registers a school and its proprietor account, then opens the school admin portal. */
export default function RegisterSchool() {
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [slug, setSlug] = React.useState("");

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const str = (k: string) => String(f.get(k) ?? "").trim();
    setBusy(true);
    setError(null);
    const res = await fetch("/session/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        school: { name: str("name"), slug: slug.toLowerCase(), motto: str("motto") || undefined, address: str("address") || undefined },
        owner: { fullName: str("fullName"), email: str("email"), password: String(f.get("password")) },
      }),
    });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.ok) {
      window.location.href = body.home ?? "/admin";
      return;
    }
    setError(body.issues?.map((i: { path: string; message: string }) => `${i.path}: ${i.message}`).join("; ") ?? body.message ?? "Could not register");
  }

  return (
    <div className="min-h-dvh px-4 py-8 sm:py-14">
      <div className="mx-auto max-w-xl">
        <Logo />
        <h1 className="mt-8 text-3xl font-bold tracking-tight">Register your school</h1>
        <p className="mt-1 text-muted">You get Nursery, Primary, JSS and SS sections with standard grading. You can change them later.</p>
        <Card className="mt-6">
          <form className="grid gap-4 sm:grid-cols-2" onSubmit={submit}>
            <ErrorNote className="sm:col-span-2">{error}</ErrorNote>
            <div className="sm:col-span-2">
              <Label htmlFor="name">School name</Label>
              <Input
                id="name"
                name="name"
                required
                placeholder="e.g. Grace of Christ International School"
                onBlur={(e) => !slug && setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40))}
              />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="slug">School code (used to sign in)</Label>
              <Input id="slug" required value={slug} onChange={(e) => setSlug(e.target.value)} pattern="[a-z0-9-]+" placeholder="e.g. gcis" />
              <p className="mt-1 text-xs text-muted">Lowercase letters, numbers and dashes. Parents, students and staff type this when they sign in.</p>
            </div>
            <div><Label htmlFor="motto">Motto</Label><Input id="motto" name="motto" /></div>
            <div><Label htmlFor="address">Address</Label><Input id="address" name="address" /></div>
            <div className="sm:col-span-2 mt-2 border-t border-line pt-4"><p className="font-semibold">Proprietor account</p></div>
            <div className="sm:col-span-2"><Label htmlFor="fullName">Your full name</Label><Input id="fullName" name="fullName" required /></div>
            <div><Label htmlFor="email">Email</Label><Input id="email" name="email" type="email" required autoComplete="email" /></div>
            <div><Label htmlFor="password">Password</Label><Input id="password" name="password" type="password" minLength={8} required autoComplete="new-password" /></div>
            <div className="flex items-center justify-between gap-3 sm:col-span-2">
              <Link href="/" className="text-sm font-semibold text-brand-600">Back to sign in</Link>
              <Button disabled={busy}>{busy ? "Creating…" : "Create school"}</Button>
            </div>
          </form>
        </Card>
      </div>
    </div>
  );
}
