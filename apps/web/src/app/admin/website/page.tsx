"use client";
import * as React from "react";
import { ExternalLink, Globe, Plus, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { Button, buttonClass } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { Async, Empty, ErrorNote, SuccessNote } from "@/components/ui/feedback";
import { api, useApi } from "@/lib/api";
import { useAction } from "@/lib/useAction";
import { className, type SchoolClass, type Subject } from "@/lib/types";
import type { AdmissionClass, EntranceExam, SiteSettings } from "@/lib/admissions";

type Site = NonNullable<SiteSettings["site"]>;
const EMPTY: Site = {
  published: false, tagline: "", about: "", heroImageUrl: "", logoUrl: "", accentColor: "#6a3bf0", highlights: [], gallery: [], whatsapp: "", mapUrl: "",
  admissionsOpen: false, admissionSession: "", applicationFeeKobo: 0, admissionInstructions: "", admissionsEmail: "",
};

function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} onClick={() => onChange(!on)} className="flex items-center gap-3 text-sm font-semibold">
      <span className={`relative h-6 w-11 rounded-full transition-colors ${on ? "bg-brand-600" : "bg-line"}`}><span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${on ? "left-[22px]" : "left-0.5"}`} /></span>
      {label}
    </button>
  );
}

export default function Website() {
  const settings = useApi<SiteSettings>("admissions/site");
  const [s, setS] = React.useState<Site | null>(null);
  const save = useAction();
  React.useEffect(() => {
    if (settings.data) setS({ ...EMPTY, ...(settings.data.site ?? {}) });
  }, [settings.data]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!s) return;
    const blank = (v: string | null) => (v && v.trim() ? v.trim() : null);
    await save.run(
      () =>
        api("admissions/site", {
          method: "PUT",
          body: {
            ...s,
            tagline: blank(s.tagline), about: blank(s.about), heroImageUrl: blank(s.heroImageUrl), logoUrl: blank(s.logoUrl), accentColor: blank(s.accentColor),
            whatsapp: blank(s.whatsapp), mapUrl: blank(s.mapUrl), admissionSession: blank(s.admissionSession), admissionInstructions: blank(s.admissionInstructions),
            admissionsEmail: blank(s.admissionsEmail), highlights: s.highlights.filter((h) => h.title.trim()), gallery: s.gallery.filter((g) => g.trim()),
          },
        }),
      "Saved. Changes are live on your website.",
    );
    await settings.reload();
  }
  const set = <K extends keyof Site>(k: K, v: Site[K]) => setS((x) => (x ? { ...x, [k]: v } : x));

  return (
    <>
      <PageHeader
        title="Website & admissions"
        subtitle="Your school's public website, the online admission form, and entrance exams."
        actions={settings.data ? <a href={settings.data.url} target="_blank" rel="noreferrer" className={buttonClass("outline")}><ExternalLink className="h-4 w-4" /> Open website</a> : null}
      />
      <Async data={s} error={settings.error}>
        {(s) => (
          <form onSubmit={submit} className="grid gap-5 xl:grid-cols-2">
            <Card>
              <CardHeader title="Website" subtitle={settings.data?.url} action={<Globe className="h-5 w-5 text-brand-600" />} />
              <div className="flex flex-col gap-4">
                <Toggle on={s.published} onChange={(v) => set("published", v)} label={s.published ? "Published: anyone can see it" : "Not published"} />
                <div><Label>Tagline</Label><Input value={s.tagline ?? ""} onChange={(e) => set("tagline", e.target.value)} placeholder="Excellence in Learning and Character" /></div>
                <div><Label>About the school</Label><Textarea rows={6} value={s.about ?? ""} onChange={(e) => set("about", e.target.value)} placeholder="Who you are, what makes the school special. Leave a blank line between paragraphs." /></div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div><Label>Brand colour</Label><div className="flex gap-2"><input type="color" aria-label="Pick colour" value={s.accentColor ?? "#6a3bf0"} onChange={(e) => set("accentColor", e.target.value)} className="h-10 w-12 rounded-xl border border-line" /><Input value={s.accentColor ?? ""} onChange={(e) => set("accentColor", e.target.value)} /></div></div>
                  <div><Label>WhatsApp number</Label><Input value={s.whatsapp ? (s.whatsapp.startsWith("234") ? `0${s.whatsapp.slice(3)}` : s.whatsapp) : ""} onChange={(e) => set("whatsapp", e.target.value)} placeholder="0803 123 4567" /></div>
                  <div><Label>Logo image link</Label><Input value={s.logoUrl ?? ""} onChange={(e) => set("logoUrl", e.target.value)} placeholder="https://…" /></div>
                  <div><Label>Banner photo link</Label><Input value={s.heroImageUrl ?? ""} onChange={(e) => set("heroImageUrl", e.target.value)} placeholder="https://…" /></div>
                  <div className="sm:col-span-2"><Label>Google Maps link</Label><Input value={s.mapUrl ?? ""} onChange={(e) => set("mapUrl", e.target.value)} placeholder="https://maps.app.goo.gl/…" /></div>
                </div>
                <div>
                  <Label>Highlights</Label>
                  <div className="flex flex-col gap-2">
                    {s.highlights.map((h, i) => (
                      <div key={i} className="flex gap-2">
                        <Input className="w-40 shrink-0" value={h.title} onChange={(e) => set("highlights", s.highlights.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} placeholder="Title" />
                        <Input value={h.text} onChange={(e) => set("highlights", s.highlights.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))} placeholder="One line" />
                        <Button type="button" variant="ghost" size="icon" aria-label="Remove" onClick={() => set("highlights", s.highlights.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></Button>
                      </div>
                    ))}
                    {s.highlights.length < 8 ? <Button type="button" variant="secondary" size="sm" className="self-start" onClick={() => set("highlights", [...s.highlights, { title: "", text: "" }])}><Plus className="h-3.5 w-3.5" /> Add highlight</Button> : null}
                  </div>
                </div>
                <div><Label>Photo gallery links (one per line)</Label><Textarea rows={3} value={s.gallery.join("\n")} onChange={(e) => set("gallery", e.target.value.split("\n"))} placeholder="https://…" /></div>
              </div>
            </Card>
            <div className="flex flex-col gap-5">
              <Card>
                <CardHeader title="Online admissions" />
                <div className="flex flex-col gap-4">
                  <Toggle on={s.admissionsOpen} onChange={(v) => set("admissionsOpen", v)} label={s.admissionsOpen ? "Taking applications" : "Admissions closed"} />
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div><Label>Session</Label><Input value={s.admissionSession ?? ""} onChange={(e) => set("admissionSession", e.target.value)} placeholder="2026/2027" /></div>
                    <div><Label>Application form fee (₦)</Label><Input type="number" min={0} step={100} value={s.applicationFeeKobo / 100} onChange={(e) => set("applicationFeeKobo", Math.round(Number(e.target.value || 0) * 100))} /></div>
                    <div className="sm:col-span-2"><Label>Admissions office email (gets an alert for each new application)</Label><Input type="email" value={s.admissionsEmail ?? ""} onChange={(e) => set("admissionsEmail", e.target.value)} placeholder="admissions@yourschool.com" /></div>
                  </div>
                  <div><Label>What families should know</Label><Textarea rows={3} value={s.admissionInstructions ?? ""} onChange={(e) => set("admissionInstructions", e.target.value)} placeholder="Documents to bring, resumption date…" /></div>
                  <p className="text-xs text-muted">Form fees are paid by Paystack into the school's own bank account (set up under Fees).</p>
                </div>
              </Card>
              <ErrorNote>{save.error}</ErrorNote>
              <SuccessNote>{save.notice}</SuccessNote>
              <Button disabled={save.busy} className="self-start">{save.busy ? "Saving…" : "Save website and admissions"}</Button>
            </div>
          </form>
        )}
      </Async>
      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <EntryClasses />
        <EntranceExams />
      </div>
    </>
  );
}

function EntryClasses() {
  const rows = useApi<AdmissionClass[]>("admissions/classes");
  const { data: classes } = useApi<SchoolClass[]>("classes");
  const { data: exams } = useApi<EntranceExam[]>("admissions/entrance-exams");
  const [f, setF] = React.useState({ classId: "", entranceTestId: "", passMark: "50", seats: "" });
  const a = useAction();
  async function add(e: React.FormEvent) {
    e.preventDefault();
    const r = await a.run(() =>
      api("admissions/classes", {
        method: "POST",
        body: { classId: f.classId, entranceTestId: f.entranceTestId || null, passMark: f.entranceTestId && f.passMark ? Number(f.passMark) : null, seats: f.seats ? Number(f.seats) : null, open: true },
      }),
    );
    if (r) {
      setF({ classId: "", entranceTestId: "", passMark: "50", seats: "" });
      await rows.reload();
    }
  }
  async function toggle(c: AdmissionClass) {
    await a.run(() => api("admissions/classes", { method: "POST", body: { classId: c.classId, entranceTestId: c.entranceTest?.id ?? null, passMark: c.passMark, seats: c.seats, open: !c.open } }));
    await rows.reload();
  }
  async function remove(c: AdmissionClass) {
    if (!confirm(`Stop taking applications for ${c.className}?`)) return;
    await a.run(() => api(`admissions/classes/${c.id}`, { method: "DELETE" }));
    await rows.reload();
  }
  return (
    <Card>
      <CardHeader title="Classes taking applications" subtitle="Usually the entry classes: Nursery 1, Primary 1, JSS 1, SS 1" />
      <ErrorNote>{a.error}</ErrorNote>
      <Async data={rows.data} error={rows.error}>
        {(list) =>
          list.length === 0 ? (
            <Empty title="No classes yet">Add the classes families can apply into.</Empty>
          ) : (
            <ul className="flex flex-col gap-2">
              {list.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-3 rounded-2xl bg-canvas px-4 py-3">
                  <div>
                    <p className="font-semibold">{c.className} {c.open ? null : <Badge tone="gray">Closed</Badge>}</p>
                    <p className="text-xs text-muted">{c.entranceTest ? `${c.entranceTest.title} · pass mark ${c.passMark ?? "-"}%` : "No entrance exam"} · {c.seatsTaken}{c.seats ? `/${c.seats}` : ""} places offered</p>
                  </div>
                  <div className="flex gap-1">
                    <Button size="sm" variant="outline" onClick={() => toggle(c)}>{c.open ? "Close" : "Open"}</Button>
                    <Button size="sm" variant="ghost" aria-label="Remove" onClick={() => remove(c)}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </div>
                </li>
              ))}
            </ul>
          )
        }
      </Async>
      <form onSubmit={add} className="mt-4 grid gap-3 rounded-2xl border border-line p-4 sm:grid-cols-2">
        <div><Label>Class</Label><Select className="w-full" required value={f.classId} onChange={(e) => setF({ ...f, classId: e.target.value })}><option value="">Choose</option>{(classes ?? []).map((c) => <option key={c.id} value={c.id}>{className(c)}</option>)}</Select></div>
        <div><Label>Entrance exam</Label><Select className="w-full" value={f.entranceTestId} onChange={(e) => setF({ ...f, entranceTestId: e.target.value })}><option value="">None</option>{(exams ?? []).map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}</Select></div>
        <div><Label>Pass mark (%)</Label><Input type="number" min={0} max={100} disabled={!f.entranceTestId} value={f.passMark} onChange={(e) => setF({ ...f, passMark: e.target.value })} /></div>
        <div><Label>Places (optional)</Label><Input type="number" min={1} value={f.seats} onChange={(e) => setF({ ...f, seats: e.target.value })} /></div>
        <Button disabled={a.busy} className="sm:col-span-2"><Plus className="h-4 w-4" /> Add class</Button>
      </form>
    </Card>
  );
}

function EntranceExams() {
  const exams = useApi<EntranceExam[]>("admissions/entrance-exams");
  const { data: subjects } = useApi<Subject[]>("subjects");
  const [title, setTitle] = React.useState("");
  const [minutes, setMinutes] = React.useState("30");
  const [parts, setParts] = React.useState<{ subjectId: string; count: string }[]>([{ subjectId: "", count: "10" }]);
  const a = useAction();
  async function create(e: React.FormEvent) {
    e.preventDefault();
    const r = await a.run(
      () => api<{ questions: number }>("admissions/entrance-exams", { method: "POST", body: { title, durationMinutes: Number(minutes), parts: parts.filter((p) => p.subjectId).map((p) => ({ subjectId: p.subjectId, count: Number(p.count) })) } }),
      (r) => `Created with ${r.questions} questions from your question bank. Link it to a class on the left.`,
    );
    if (r) {
      setTitle("");
      setParts([{ subjectId: "", count: "10" }]);
      await exams.reload();
    }
  }
  return (
    <Card>
      <CardHeader title="Entrance exams" subtitle="Computer-based tests built from your question bank. Applicants sit them online." />
      <Async data={exams.data} error={exams.error}>
        {(list) =>
          list.length === 0 ? (
            <Empty title="No entrance exam yet" />
          ) : (
            <ul className="flex flex-col gap-2">
              {list.map((x) => (
                <li key={x.id} className="rounded-2xl bg-canvas px-4 py-3">
                  <p className="font-semibold">{x.title}</p>
                  <p className="text-xs text-muted">{x.durationMinutes} min · {x.subjects.map((s) => `${s.name} ${s.questions}`).join(", ")} · {x.sittings} sat{x.averagePercentage !== null ? ` · average ${x.averagePercentage}%` : ""}</p>
                </li>
              ))}
            </ul>
          )
        }
      </Async>
      <form onSubmit={create} className="mt-4 flex flex-col gap-3 rounded-2xl border border-line p-4">
        <ErrorNote>{a.error}</ErrorNote>
        <SuccessNote>{a.notice}</SuccessNote>
        <div className="grid gap-3 sm:grid-cols-[1fr_120px]">
          <div><Label>Title</Label><Input required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="JSS 1 Entrance Examination" /></div>
          <div><Label>Minutes</Label><Input type="number" min={5} max={180} required value={minutes} onChange={(e) => setMinutes(e.target.value)} /></div>
        </div>
        {parts.map((p, i) => (
          <div key={i} className="flex gap-2">
            <Select className="flex-1" value={p.subjectId} onChange={(e) => setParts(parts.map((x, j) => (j === i ? { ...x, subjectId: e.target.value } : x)))}><option value="">Subject</option>{(subjects ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select>
            <Input className="w-24" type="number" min={1} max={100} value={p.count} onChange={(e) => setParts(parts.map((x, j) => (j === i ? { ...x, count: e.target.value } : x)))} aria-label="Questions" />
            {parts.length > 1 ? <Button type="button" variant="ghost" size="icon" aria-label="Remove" onClick={() => setParts(parts.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></Button> : null}
          </div>
        ))}
        <Button type="button" variant="secondary" size="sm" className="self-start" onClick={() => setParts([...parts, { subjectId: "", count: "10" }])}><Plus className="h-3.5 w-3.5" /> Add subject</Button>
        <Button disabled={a.busy || !parts.some((p) => p.subjectId)}>{a.busy ? "Building…" : "Create entrance exam"}</Button>
      </form>
    </Card>
  );
}
