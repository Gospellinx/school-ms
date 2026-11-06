"use client";
import * as React from "react";
import { Camera } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { Tabs } from "@/components/ui/tabs";
import { roles, type Role } from "@/lib/roles";
import { cn } from "@/lib/utils";

function Toggle({ label, hint, defaultOn = false }: { label: string; hint: string; defaultOn?: boolean }) {
  const [on, setOn] = React.useState(defaultOn);
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <div>
        <p className="text-sm font-semibold">{label}</p>
        <p className="text-xs text-muted">{hint}</p>
      </div>
      <button
        role="switch"
        aria-checked={on}
        onClick={() => setOn(!on)}
        className={cn("relative h-7 w-12 shrink-0 rounded-full transition-colors", on ? "bg-brand-600" : "bg-line")}
      >
        <span className={cn("absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all", on ? "left-6" : "left-1")} />
      </button>
    </div>
  );
}

export function SettingsPage({ role }: { role: Role }) {
  const cfg = roles[role];
  const [tab, setTab] = React.useState("Profile");
  return (
    <>
      <PageHeader title="Account Settings" subtitle="Your profile, password and alerts." />
      <Tabs tabs={["Profile", "Security", "Notifications"]} value={tab} onChange={setTab} className="mb-5" />
      {tab === "Profile" ? (
        <Card className="max-w-3xl">
          <div className="mb-6 flex items-center gap-4">
            <div className="relative">
              <Avatar name={cfg.user.name} size={72} />
              <span className="absolute -right-1 -bottom-1 flex h-7 w-7 items-center justify-center rounded-full bg-brand-600 text-white"><Camera className="h-3.5 w-3.5" /></span>
            </div>
            <div>
              <p className="text-lg font-semibold">{cfg.user.name}</p>
              <p className="text-sm text-muted">{cfg.user.subtitle}</p>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div><Label>Full name</Label><Input defaultValue={cfg.user.name} /></div>
            <div><Label>Email</Label><Input defaultValue={cfg.user.email} /></div>
            <div><Label>Phone number</Label><Input defaultValue="0803 555 0142" /></div>
            <div><Label>Language</Label><Select className="w-full" defaultValue="en"><option value="en">English</option><option>Hausa</option><option>Yoruba</option><option>Igbo</option></Select></div>
          </div>
          <div className="mt-6 flex justify-end gap-2"><Button variant="outline">Cancel</Button><Button>Save changes</Button></div>
        </Card>
      ) : tab === "Security" ? (
        <Card className="max-w-3xl">
          <CardHeader title="Change password" subtitle="Use at least 8 characters." />
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2"><Label>Current password</Label><Input type="password" /></div>
            <div><Label>New password</Label><Input type="password" /></div>
            <div><Label>Confirm new password</Label><Input type="password" /></div>
          </div>
          <div className="mt-6 flex justify-end"><Button>Update password</Button></div>
        </Card>
      ) : (
        <Card className="max-w-3xl">
          <CardHeader title="Alerts" subtitle="Choose how we reach you." />
          <div className="divide-y divide-line">
            <Toggle label="WhatsApp messages" hint="Results, fees and school notices" defaultOn />
            <Toggle label="SMS" hint="Used when WhatsApp is not available" defaultOn />
            <Toggle label="Email" hint="Weekly summary" />
            <Toggle label="Low data mode" hint="Hide images and charts to save data" />
          </div>
        </Card>
      )}
    </>
  );
}
