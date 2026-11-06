"use client";
import * as React from "react";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { ErrorNote, SuccessNote } from "@/components/ui/feedback";
import { Input, Label } from "@/components/ui/input";
import { Tabs } from "@/components/ui/tabs";
import { api } from "@/lib/api";
import { phone } from "@/lib/format";
import { SessionContext, sessionUser, type SessionValue } from "@/lib/session";
import { useAction } from "@/lib/useAction";
import { cn } from "@/lib/utils";

export function Toggle({ label, hint, on, onChange, disabled }: { label: string; hint: string; on: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <div>
        <p className="text-sm font-semibold">{label}</p>
        <p className="text-xs text-muted">{hint}</p>
      </div>
      <button
        role="switch"
        aria-checked={on}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!on)}
        className={cn("relative h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-50", on ? "bg-brand-600" : "bg-line")}
      >
        <span className={cn("absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all", on ? "left-6" : "left-1")} />
      </button>
    </div>
  );
}

function Profile({ session }: { session: SessionValue }) {
  const user = sessionUser(session);
  const a = useAction();
  const staff = session.portal === "admin" || session.portal === "teacher" ? session.me.staff : null;
  const [name, setName] = React.useState(staff?.fullName ?? user.name);
  const [channel, setChannel] = React.useState<"sms" | "whatsapp" | null>(session.portal === "parent" ? session.me.parent.preferredChannel : null);

  const details: [string, string][] =
    session.portal === "parent"
      ? [["Phone", phone(session.me.parent.phone)], ["Email", session.me.parent.email ?? "Not given"], ["School", session.me.school.name]]
      : session.portal === "student"
        ? [["Admission number", session.me.student.admissionNumber], ["Class", user.subtitle], ["Subjects", String(session.me.subjects.length)]]
        : session.portal === "super-admin"
          ? [["Email", session.me.admin.email]]
          : [["Email", session.me.staff.email], ["School", session.me.school.name], ["School code", session.me.school.slug]];

  return (
    <Card className="max-w-3xl">
      <div className="mb-6 flex items-center gap-4">
        <Avatar name={user.name} size={72} />
        <div>
          <p className="text-lg font-semibold">{user.name}</p>
          <p className="text-sm text-muted">{user.subtitle}</p>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {details.map(([k, v]) => (
          <div key={k}><Label>{k}</Label><Input value={v} readOnly className="bg-canvas" /></div>
        ))}
      </div>
      {staff ? (
        <form
          className="mt-6 flex flex-col gap-3 border-t border-line pt-5"
          onSubmit={(e) => {
            e.preventDefault();
            void a.run(() => api("auth/me", { method: "PATCH", body: { fullName: name.trim() } }), "Name saved. It shows everywhere after the page reloads.");
          }}
        >
          <ErrorNote>{a.error}</ErrorNote>
          <SuccessNote>{a.notice}</SuccessNote>
          <div className="max-w-sm"><Label>Full name</Label><Input value={name} onChange={(e) => setName(e.target.value)} minLength={2} required /></div>
          <div><Button disabled={a.busy}>Save changes</Button></div>
        </form>
      ) : null}
      {session.portal === "parent" ? (
        <div className="mt-6 border-t border-line pt-5">
          <CardHeader title="How the school reaches you" subtitle="Results, absences, receipts and school notices." />
          <ErrorNote>{a.error}</ErrorNote>
          <SuccessNote>{a.notice}</SuccessNote>
          <Toggle
            label="WhatsApp instead of SMS"
            hint="Messages go to the same phone number on WhatsApp. Login codes always come by SMS."
            on={channel === "whatsapp"}
            disabled={a.busy}
            onChange={(v) => {
              const next = v ? "whatsapp" : "sms";
              void a.run(async () => { await api("parent/me", { method: "PATCH", body: { preferredChannel: next } }); setChannel(next); }, v ? "Messages will come on WhatsApp." : "Messages will come by SMS.");
            }}
          />
        </div>
      ) : null}
    </Card>
  );
}

function Security({ session }: { session: SessionValue }) {
  const a = useAction();
  if (session.portal === "parent") {
    return <Card className="max-w-3xl"><CardHeader title="Signing in" subtitle="You sign in with a one-time code texted to your phone, so there is no password to remember. If your number changes, tell the school." /></Card>;
  }
  if (session.portal === "student") {
    return <Card className="max-w-3xl"><CardHeader title="Your PIN" subtitle="You sign in with your admission number and the 6-digit PIN on your slip. If you forget it, ask your form teacher or the school office for a new one." /></Card>;
  }
  if (session.portal === "super-admin") {
    return <Card className="max-w-3xl"><CardHeader title="Password" subtitle="Platform accounts are managed by the Linx School team." /></Card>;
  }
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    if (f.get("newPassword") !== f.get("confirm")) {
      a.setError("The new passwords do not match");
      return;
    }
    const r = await a.run(() => api("auth/password", { method: "POST", body: { currentPassword: f.get("currentPassword"), newPassword: f.get("newPassword") } }), "Password changed.");
    if (r) form.reset();
  }
  return (
    <Card className="max-w-3xl">
      <CardHeader title="Change password" subtitle="Use at least 8 characters." />
      <form className="grid gap-4 sm:grid-cols-2" onSubmit={submit}>
        <ErrorNote className="sm:col-span-2">{a.error}</ErrorNote>
        <SuccessNote className="sm:col-span-2">{a.notice}</SuccessNote>
        <div className="sm:col-span-2"><Label>Current password</Label><Input name="currentPassword" type="password" required autoComplete="current-password" /></div>
        <div><Label>New password</Label><Input name="newPassword" type="password" minLength={8} required autoComplete="new-password" /></div>
        <div><Label>Confirm new password</Label><Input name="confirm" type="password" minLength={8} required autoComplete="new-password" /></div>
        <div className="flex justify-end sm:col-span-2"><Button disabled={a.busy}>Update password</Button></div>
      </form>
    </Card>
  );
}

/** Account settings for any portal. School leadership pass extra tabs (school profile, calendar, payments). */
export function SettingsPage({ extraTabs = {} }: { extraTabs?: Record<string, React.ReactNode> }) {
  const session = React.useContext(SessionContext)!;
  const [tab, setTab] = React.useState("Profile");
  return (
    <>
      <PageHeader title="Account Settings" subtitle={Object.keys(extraTabs).length ? "Your profile, and how the school is set up." : "Your profile and sign-in."} />
      <Tabs tabs={["Profile", "Security", ...Object.keys(extraTabs)]} value={tab} onChange={setTab} className="mb-5" />
      {tab === "Profile" ? <Profile session={session} /> : tab === "Security" ? <Security session={session} /> : extraTabs[tab]}
    </>
  );
}
