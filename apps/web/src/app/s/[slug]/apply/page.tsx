"use client";
import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { ErrorNote, Loading } from "@/components/ui/feedback";
import { SiteFooter, SiteHeader } from "@/components/admissions/site-chrome";
import { publicApi, rememberKey, type PublicSite } from "@/lib/admissions";

const naira = (kobo: number) => `₦${(kobo / 100).toLocaleString("en-NG")}`;

export default function Apply() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();
  const [site, setSite] = React.useState<PublicSite | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [f, setF] = React.useState({
    admissionClassId: "",
    firstName: "",
    lastName: "",
    otherNames: "",
    gender: "",
    dateOfBirth: "",
    previousSchool: "",
    parentName: "",
    relationship: "Mother",
    parentPhone: "",
    parentEmail: "",
    address: "",
    notes: "",
    website: "",
  });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });

  React.useEffect(() => {
    publicApi<PublicSite>(`schools/${slug}`).then(
      (s) => {
        setSite(s);
        if (s.admissions.classes.length === 1) setF((x) => ({ ...x, admissionClassId: s.admissions.classes[0].id }));
      },
      (e: Error) => setError(e.message),
    );
  }, [slug]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const body = Object.fromEntries(Object.entries(f).filter(([k, v]) => v !== "" || k === "website"));
      const res = await publicApi<{ reference: string; key: string; status: string; feeKobo: number }>(`schools/${slug}/applications`, { method: "POST", body });
      rememberKey(res.reference, res.key);
      if (res.status === "pending_payment") {
        // Straight on to Paystack; the status page is where they come back to.
        const pay = await publicApi<{ authorizationUrl: string }>(`schools/${slug}/applications/${res.reference}/pay?key=${res.key}`, { method: "POST" }).catch(() => null);
        if (pay) {
          window.location.href = pay.authorizationUrl;
          return;
        }
      }
      router.push(`/s/${slug}/application?ref=${res.reference}&key=${res.key}&new=1`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  const accent = site?.site.accentColor ?? "#6a3bf0";
  const chosen = site?.admissions.classes.find((c) => c.id === f.admissionClassId);

  return (
    <div style={{ ["--accent" as string]: accent }} className="min-h-screen bg-canvas">
      {site ? <SiteHeader school={site.school} logoUrl={site.site.logoUrl} minimal /> : null}
      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
        {!site ? (
          error ? <ErrorNote>{error}</ErrorNote> : <Loading />
        ) : !site.admissions.open ? (
          <Card className="text-center">
            <h1 className="text-2xl font-bold">Admissions are closed</h1>
            <p className="mt-2 text-muted">Please contact {site.school.name} for the next intake.</p>
          </Card>
        ) : (
          <>
            <p className="text-sm font-semibold" style={{ color: accent }}>Admissions {site.admissions.session ?? ""}</p>
            <h1 className="mt-1 text-3xl font-bold tracking-tight sm:text-4xl">Apply to {site.school.name}</h1>
            <p className="mt-2 text-muted">
              It takes about five minutes.{site.admissions.feeKobo > 0 ? ` The application form fee is ${naira(site.admissions.feeKobo)}, paid securely online.` : ""} We will email you at every step.
            </p>
            <form onSubmit={submit} className="mt-8 flex flex-col gap-5">
              <Card>
                <h2 className="mb-4 text-lg font-semibold">The child</h2>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <Label htmlFor="cls">Class applying for</Label>
                    <Select id="cls" className="w-full" required value={f.admissionClassId} onChange={set("admissionClassId")}>
                      <option value="">Choose a class</option>
                      {site.admissions.classes.map((c) => <option key={c.id} value={c.id}>{c.className}</option>)}
                    </Select>
                    {chosen?.hasExam ? <p className="mt-1.5 text-xs text-muted">{chosen.className} has a {chosen.examMinutes}-minute computer-based entrance exam. We will email you the date and link.</p> : null}
                  </div>
                  <div><Label htmlFor="fn">First name</Label><Input id="fn" required autoComplete="off" value={f.firstName} onChange={set("firstName")} /></div>
                  <div><Label htmlFor="ln">Surname</Label><Input id="ln" required autoComplete="off" value={f.lastName} onChange={set("lastName")} /></div>
                  <div><Label htmlFor="on">Other names (optional)</Label><Input id="on" autoComplete="off" value={f.otherNames} onChange={set("otherNames")} /></div>
                  <div>
                    <Label htmlFor="g">Gender</Label>
                    <Select id="g" className="w-full" value={f.gender} onChange={set("gender")}>
                      <option value="">Choose</option><option value="female">Girl</option><option value="male">Boy</option>
                    </Select>
                  </div>
                  <div><Label htmlFor="dob">Date of birth</Label><Input id="dob" type="date" value={f.dateOfBirth} onChange={set("dateOfBirth")} /></div>
                  <div><Label htmlFor="ps">Current or last school</Label><Input id="ps" value={f.previousSchool} onChange={set("previousSchool")} /></div>
                </div>
              </Card>
              <Card>
                <h2 className="mb-4 text-lg font-semibold">Parent or guardian</h2>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div><Label htmlFor="pn">Full name</Label><Input id="pn" required autoComplete="name" value={f.parentName} onChange={set("parentName")} /></div>
                  <div>
                    <Label htmlFor="rel">Relationship</Label>
                    <Select id="rel" className="w-full" value={f.relationship} onChange={set("relationship")}>
                      {["Mother", "Father", "Guardian", "Other"].map((r) => <option key={r}>{r}</option>)}
                    </Select>
                  </div>
                  <div><Label htmlFor="ph">Phone number</Label><Input id="ph" required type="tel" inputMode="tel" autoComplete="tel" placeholder="0803 123 4567" value={f.parentPhone} onChange={set("parentPhone")} /></div>
                  <div><Label htmlFor="em">Email</Label><Input id="em" required type="email" autoComplete="email" placeholder="you@example.com" value={f.parentEmail} onChange={set("parentEmail")} /></div>
                  <div className="sm:col-span-2"><Label htmlFor="ad">Home address</Label><Input id="ad" autoComplete="street-address" value={f.address} onChange={set("address")} /></div>
                  <div className="sm:col-span-2"><Label htmlFor="nt">Anything we should know? (optional)</Label><Textarea id="nt" rows={3} placeholder="Medical needs, boarding interest, siblings in the school…" value={f.notes} onChange={set("notes")} /></div>
                  {/* Hidden from people; bots fill it in. */}
                  <input type="text" name="website" tabIndex={-1} autoComplete="off" value={f.website} onChange={set("website")} className="hidden" aria-hidden="true" />
                </div>
              </Card>
              <ErrorNote>{error}</ErrorNote>
              <button disabled={busy} className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl px-6 font-semibold text-white disabled:opacity-60" style={{ background: accent }}>
                {busy ? "Submitting…" : site.admissions.feeKobo > 0 ? `Continue to pay ${naira(site.admissions.feeKobo)}` : "Submit application"} <ArrowRight className="h-4 w-4" />
              </button>
              <p className="flex items-center justify-center gap-2 text-center text-xs text-muted">
                <ShieldCheck className="h-4 w-4" /> Your details go only to {site.school.name}. Payments are processed by Paystack.
              </p>
            </form>
          </>
        )}
      </main>
      {site ? <SiteFooter school={site.school} /> : null}
    </div>
  );
}
