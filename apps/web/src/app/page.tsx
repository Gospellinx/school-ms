"use client";
import { clearOfflineData } from "@/lib/offline";
import * as React from "react";
import Link from "next/link";
import { BookOpen, CheckCircle2, GraduationCap, HeartHandshake, ShieldCheck } from "lucide-react";
import { Logo } from "@/components/shell/logo";
import { Input, Label } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ErrorNote, SuccessNote } from "@/components/ui/feedback";
import { cn } from "@/lib/utils";

type Kind = "staff" | "parent" | "student" | "platform";

const KINDS: { kind: Kind; label: string; icon: React.ElementType }[] = [
  { kind: "staff", label: "Staff", icon: BookOpen },
  { kind: "parent", label: "Parent", icon: HeartHandshake },
  { kind: "student", label: "Student", icon: GraduationCap },
];

const SHOW_DEMO = process.env.NEXT_PUBLIC_SHOW_DEMO_LOGINS === "true";

/** Demo accounts created by `pnpm db:seed`. Shown only when NEXT_PUBLIC_SHOW_DEMO_LOGINS=true. */
const DEMO: { kind: Kind; label: string; values: Record<string, string> }[] = [
  { kind: "staff", label: "Proprietor", values: { schoolSlug: "gcis-demo", email: "proprietor@demo.test", password: "demo-password" } },
  { kind: "staff", label: "Teacher", values: { schoolSlug: "gcis-demo", email: "teacher@demo.test", password: "demo-password" } },
  { kind: "parent", label: "Parent", values: { schoolSlug: "gcis-demo", phone: "0803 123 4567" } },
  { kind: "student", label: "Student", values: { schoolSlug: "gcis-demo", admissionNumber: "GCIS/S/001", pin: "123456" } },
  { kind: "platform", label: "Super admin", values: { email: "super@linxschool.test", password: "demo-password" } },
];

async function post(action: string, body: unknown) {
  const res = await fetch(`/session/${action}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const issues = (data as { issues?: { message: string }[] }).issues;
    throw new Error(issues?.length ? issues.map((i) => i.message).join("; ") : (data as { message?: string }).message ?? "Could not sign in");
  }
  return data as { home?: string; devCode?: string };
}

export default function SignIn() {
  const [kind, setKind] = React.useState<Kind>("staff");
  const [values, setValues] = React.useState<Record<string, string>>({ schoolSlug: "" });
  const [codeSent, setCodeSent] = React.useState(false);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const v = (k: string) => values[k] ?? "";
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setValues({ ...values, [k]: e.target.value });

  function choose(k: Kind) {
    setKind(k);
    setError(null);
    setNotice(null);
    setCodeSent(false);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const school = v("schoolSlug").trim().toLowerCase();
      let res: { home?: string; devCode?: string };
      if (kind === "staff") res = await post("login", { schoolSlug: school, email: v("email").trim(), password: v("password") });
      else if (kind === "student") res = await post("student", { schoolSlug: school, admissionNumber: v("admissionNumber").trim(), pin: v("pin").trim() });
      else if (kind === "platform") res = await post("platform", { email: v("email").trim(), password: v("password") });
      else if (!codeSent) {
        const sent = await post("parent-code", { schoolSlug: school, phone: v("phone") });
        setCodeSent(true);
        setNotice(
          sent.devCode
            ? `No SMS provider is set up, so here is the code instead: ${sent.devCode}`
            : "If this number is on the school's records, a 6-digit code is on its way by SMS.",
        );
        if (sent.devCode) setValues((cur) => ({ ...cur, code: sent.devCode! }));
        return;
      } else res = await post("parent", { schoolSlug: school, phone: v("phone"), code: v("code").trim() });
      // A new sign-in must not see offline copies of someone else's pages (queued changes stay with their owner).
      await clearOfflineData({ outbox: false });
      window.location.href = res.home ?? "/";
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      <section className="relative hidden overflow-hidden bg-brand-600 p-12 text-white lg:flex lg:flex-col">
        <div className="pointer-events-none absolute -top-32 -right-20 h-96 w-96 rounded-full bg-brand-500/70 blur-3xl" />
        <div className="pointer-events-none absolute bottom-0 left-10 h-80 w-80 rounded-full bg-orchid-400/30 blur-3xl" />
        <div className="relative flex items-center gap-2.5 text-xl font-bold">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-brand-600">L</span> Linx School
        </div>
        <div className="relative mt-auto max-w-lg">
          <h1 className="text-5xl leading-tight font-bold tracking-tight">Results, fees and WAEC prep in one place.</h1>
          <p className="mt-4 text-lg text-white/85">Built for Nigerian schools, from Nursery to SS 3. Works on any phone, even on slow data.</p>
          <ul className="mt-10 grid gap-3 text-white/90">
            {["Report cards, broadsheets and positions worked out for you", "Parents pay fees online and get results by SMS", "CBT tests and AI exam prep from each student's own results"].map((t) => (
              <li key={t} className="flex items-center gap-3"><CheckCircle2 className="h-5 w-5 shrink-0" /> {t}</li>
            ))}
          </ul>
        </div>
      </section>

      <section className="flex flex-col px-5 py-8 sm:px-10 lg:justify-center lg:px-16">
        <div className="lg:hidden"><Logo /></div>
        <div className="mx-auto mt-10 w-full max-w-md lg:mt-0">
          <h2 className="text-3xl font-bold tracking-tight">{kind === "platform" ? "Linx School staff" : "Welcome back"}</h2>
          <p className="mt-1 text-muted">{kind === "platform" ? "Sign in to manage all schools." : "Sign in to your school portal."}</p>

          {kind !== "platform" ? (
            <div className="mt-6 grid grid-cols-3 gap-1 rounded-2xl bg-white p-1" role="tablist">
              {KINDS.map(({ kind: k, label, icon: Icon }) => (
                <button
                  key={k}
                  type="button"
                  role="tab"
                  aria-selected={kind === k}
                  onClick={() => choose(k)}
                  className={cn("flex h-10 items-center justify-center gap-2 rounded-xl text-sm font-semibold", kind === k ? "bg-brand-600 text-white" : "text-muted hover:text-ink")}
                >
                  <Icon className="h-4 w-4" /> {label}
                </button>
              ))}
            </div>
          ) : null}

          <form className="mt-6 flex flex-col gap-4" onSubmit={submit}>
            <ErrorNote>{error}</ErrorNote>
            <SuccessNote>{notice}</SuccessNote>
            {kind !== "platform" ? (
              <div>
                <Label htmlFor="school">School code</Label>
                <Input id="school" placeholder="e.g. gcis" value={v("schoolSlug")} onChange={set("schoolSlug")} required autoComplete="organization" />
              </div>
            ) : null}
            {kind === "staff" || kind === "platform" ? (
              <>
                <div>
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" type="email" placeholder="you@school.ng" value={v("email")} onChange={set("email")} required autoComplete="email" />
                </div>
                <div>
                  <Label htmlFor="pw">Password</Label>
                  <Input id="pw" type="password" value={v("password")} onChange={set("password")} required autoComplete="current-password" />
                </div>
              </>
            ) : kind === "student" ? (
              <>
                <div>
                  <Label htmlFor="adm">Admission number</Label>
                  <Input id="adm" placeholder="e.g. GCIS/S/001" value={v("admissionNumber")} onChange={set("admissionNumber")} required />
                </div>
                <div>
                  <Label htmlFor="pin">PIN</Label>
                  <Input id="pin" type="password" inputMode="numeric" placeholder="6-digit PIN from your school" value={v("pin")} onChange={set("pin")} required />
                </div>
              </>
            ) : (
              <>
                <div>
                  <Label htmlFor="phone">Phone number the school has for you</Label>
                  <Input id="phone" type="tel" inputMode="tel" placeholder="0803 123 4567" value={v("phone")} onChange={set("phone")} required disabled={codeSent} />
                </div>
                {codeSent ? (
                  <div>
                    <Label htmlFor="code">6-digit code</Label>
                    <Input id="code" inputMode="numeric" autoComplete="one-time-code" value={v("code")} onChange={set("code")} required />
                    <button type="button" className="mt-2 text-sm font-semibold text-brand-600" onClick={() => { setCodeSent(false); setNotice(null); }}>
                      Use a different number
                    </button>
                  </div>
                ) : null}
              </>
            )}
            <Button size="lg" className="mt-2 w-full" disabled={busy}>
              {busy ? "Please wait…" : kind === "parent" && !codeSent ? "Text me a code" : "Sign in"}
            </Button>
          </form>

          <div className="mt-6 flex flex-col gap-2 text-center text-sm text-muted">
            {kind === "staff" ? <p>New school? <Link href="/register" className="font-semibold text-brand-600">Register your school</Link></p> : null}
            {kind === "platform" ? (
              <button type="button" className="font-semibold text-brand-600" onClick={() => choose("staff")}>Back to school sign-in</button>
            ) : (
              <button type="button" className="inline-flex items-center justify-center gap-1.5" onClick={() => choose("platform")}>
                <ShieldCheck className="h-4 w-4" /> Linx School staff sign-in
              </button>
            )}
          </div>

          {SHOW_DEMO ? (
            <div className="mt-8 rounded-2xl border border-dashed border-brand-200 bg-white p-4">
              <p className="mb-2 text-xs font-semibold tracking-wider text-muted uppercase">Demo accounts</p>
              <div className="flex flex-wrap gap-2">
                {DEMO.map((d) => (
                  <button
                    key={d.label}
                    type="button"
                    onClick={() => { choose(d.kind); setValues(d.values); }}
                    className="rounded-xl bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-700 hover:bg-brand-100"
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
