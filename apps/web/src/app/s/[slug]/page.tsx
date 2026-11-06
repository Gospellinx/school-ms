import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, CheckCircle2, ClipboardList, CreditCard, GraduationCap, Mail, MapPin, MessageCircle, MonitorCheck, Phone, Sparkles } from "lucide-react";
import { API_URL } from "@/lib/server";
import type { PublicSite } from "@/lib/admissions";
import { SiteFooter, SiteHeader } from "@/components/admissions/site-chrome";

async function load(slug: string): Promise<PublicSite | null> {
  const res = await fetch(`${API_URL}/public/schools/${encodeURIComponent(slug)}`, { cache: "no-store" });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Could not load the school (${res.status})`);
  return res.json();
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const data = await load((await params).slug);
  if (!data) return { title: "School not found" };
  return {
    title: { absolute: data.school.name },
    description: data.site.tagline ?? data.school.motto ?? `Admissions and information for ${data.school.name}.`,
  };
}

const naira = (kobo: number) => `₦${(kobo / 100).toLocaleString("en-NG")}`;
const SECTION_LABEL: Record<string, string> = { nursery: "Nursery", primary: "Primary", junior_secondary: "Junior Secondary", senior_secondary: "Senior Secondary" };

export default async function SchoolSite({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const data = await load(slug);
  if (!data) notFound();
  const { school, site, sections, admissions } = data;
  const accent = site.accentColor ?? "#6a3bf0";
  const wa = site.whatsapp ? `https://wa.me/${site.whatsapp}` : null;
  const steps = [
    { icon: ClipboardList, title: "Fill the form", text: "Takes five minutes on your phone." },
    ...(admissions.feeKobo > 0 ? [{ icon: CreditCard, title: `Pay ${naira(admissions.feeKobo)} form fee`, text: "Card, bank transfer or USSD through Paystack." }] : []),
    ...(admissions.classes.some((c) => c.hasExam) ? [{ icon: MonitorCheck, title: "Sit the entrance exam online", text: "A short computer-based test, from home or at the school." }] : []),
    { icon: GraduationCap, title: "Get your offer by email", text: "Accept online and we complete enrolment." },
  ];

  return (
    <div style={{ ["--accent" as string]: accent }} className="min-h-screen bg-white">
      <SiteHeader school={school} logoUrl={site.logoUrl} admissionsOpen={admissions.open} />

      {/* Hero */}
      <section className="relative overflow-hidden text-white" style={{ background: `linear-gradient(135deg, ${accent} 0%, color-mix(in srgb, ${accent} 55%, #0b0a12) 100%)` }}>
        {site.heroImageUrl ? <img src={site.heroImageUrl} alt="" className="absolute inset-0 h-full w-full object-cover opacity-25" /> : null}
        <div className="relative mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
          {admissions.open ? (
            <span className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1.5 text-xs font-semibold backdrop-blur">
              <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-300" /> Admissions open{admissions.session ? ` for ${admissions.session}` : ""}
            </span>
          ) : null}
          <h1 className="mt-5 max-w-3xl text-4xl font-bold tracking-tight sm:text-6xl">{school.name}</h1>
          <p className="mt-4 max-w-2xl text-lg text-white/85 sm:text-xl">{site.tagline ?? school.motto}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            {admissions.open ? (
              <Link href={`/s/${slug}/apply`} className="inline-flex h-12 items-center gap-2 rounded-2xl bg-white px-6 font-semibold" style={{ color: accent }}>
                Apply for admission <ArrowRight className="h-4 w-4" />
              </Link>
            ) : null}
            <a href="#about" className="inline-flex h-12 items-center rounded-2xl border border-white/40 px-6 font-semibold text-white hover:bg-white/10">About the school</a>
          </div>
          {school.address ? (
            <p className="mt-8 flex items-center gap-2 text-sm text-white/75"><MapPin className="h-4 w-4" /> {school.address}</p>
          ) : null}
        </div>
      </section>

      {/* About and highlights */}
      <section id="about" className="mx-auto grid max-w-6xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[1.1fr_1fr]">
        <div>
          <p className="text-sm font-semibold tracking-wide uppercase" style={{ color: accent }}>About us</p>
          <h2 className="mt-2 text-3xl font-bold tracking-tight">{school.motto ?? "Welcome"}</h2>
          {(site.about ?? "").split(/\n{2,}/).filter(Boolean).map((p, i) => (
            <p key={i} className="mt-4 leading-relaxed text-muted">{p}</p>
          ))}
          {sections.length ? (
            <div className="mt-6 flex flex-wrap gap-2">
              {sections.map((s) => (
                <span key={s.name} className="rounded-xl bg-canvas px-3 py-1.5 text-sm font-semibold">{SECTION_LABEL[s.kind] ?? s.name}</span>
              ))}
            </div>
          ) : null}
        </div>
        {site.highlights.length ? (
          <div className="grid gap-4 sm:grid-cols-2">
            {site.highlights.map((h) => (
              <div key={h.title} className="rounded-3xl bg-canvas p-5">
                <Sparkles className="h-5 w-5" style={{ color: accent }} />
                <p className="mt-3 font-semibold">{h.title}</p>
                <p className="mt-1 text-sm text-muted">{h.text}</p>
              </div>
            ))}
          </div>
        ) : null}
      </section>

      {site.gallery.length ? (
        <section className="mx-auto max-w-6xl px-4 pb-16 sm:px-6">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {site.gallery.map((src) => (
              <img key={src} src={src} alt="" className="aspect-[4/3] w-full rounded-2xl object-cover" loading="lazy" />
            ))}
          </div>
        </section>
      ) : null}

      {/* Admissions */}
      <section id="admissions" className="bg-canvas">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <p className="text-sm font-semibold tracking-wide uppercase" style={{ color: accent }}>Admissions{admissions.session ? ` ${admissions.session}` : ""}</p>
          <h2 className="mt-2 text-3xl font-bold tracking-tight">{admissions.open ? "Apply online in four simple steps" : "Admissions are closed for now"}</h2>
          {admissions.open ? (
            <>
              <ol className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {steps.map((s, i) => (
                  <li key={s.title} className="rounded-3xl bg-white p-5">
                    <span className="flex h-10 w-10 items-center justify-center rounded-2xl text-white" style={{ background: accent }}><s.icon className="h-5 w-5" /></span>
                    <p className="mt-4 text-xs font-semibold text-muted">Step {i + 1}</p>
                    <p className="font-semibold">{s.title}</p>
                    <p className="mt-1 text-sm text-muted">{s.text}</p>
                  </li>
                ))}
              </ol>
              <div className="mt-8 rounded-3xl bg-white p-6">
                <p className="font-semibold">Classes taking new pupils</p>
                <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                  {admissions.classes.map((c) => (
                    <li key={c.id} className="flex items-center justify-between gap-3 rounded-2xl bg-canvas px-4 py-3">
                      <span className="flex items-center gap-2 font-semibold"><CheckCircle2 className="h-4 w-4 text-emerald-600" /> {c.className}</span>
                      <span className="text-sm text-muted">{c.hasExam ? `${c.examMinutes}-min entrance exam` : "No entrance exam"}</span>
                    </li>
                  ))}
                </ul>
                {admissions.instructions ? <p className="mt-4 text-sm text-muted">{admissions.instructions}</p> : null}
                <Link href={`/s/${slug}/apply`} className="mt-6 inline-flex h-12 items-center gap-2 rounded-2xl px-6 font-semibold text-white" style={{ background: accent }}>
                  Start an application <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </>
          ) : (
            <p className="mt-4 max-w-xl text-muted">Please check back soon, or contact the school office for the next intake.</p>
          )}
        </div>
      </section>

      {/* Contact */}
      <section id="contact" className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <h2 className="text-3xl font-bold tracking-tight">Visit or contact us</h2>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {school.address ? (
            <a href={site.mapUrl ?? `https://www.google.com/maps/search/${encodeURIComponent(school.address)}`} target="_blank" rel="noreferrer" className="rounded-3xl bg-canvas p-5 hover:bg-line/60">
              <MapPin className="h-5 w-5" style={{ color: accent }} /><p className="mt-3 font-semibold">Address</p><p className="text-sm text-muted">{school.address}</p>
            </a>
          ) : null}
          {school.phone ? (
            <a href={`tel:${school.phone}`} className="rounded-3xl bg-canvas p-5 hover:bg-line/60">
              <Phone className="h-5 w-5" style={{ color: accent }} /><p className="mt-3 font-semibold">Call</p><p className="text-sm text-muted">{school.phone}</p>
            </a>
          ) : null}
          {wa ? (
            <a href={wa} target="_blank" rel="noreferrer" className="rounded-3xl bg-canvas p-5 hover:bg-line/60">
              <MessageCircle className="h-5 w-5 text-emerald-600" /><p className="mt-3 font-semibold">WhatsApp</p><p className="text-sm text-muted">Chat with the admissions office</p>
            </a>
          ) : null}
          {school.email ? (
            <a href={`mailto:${school.email}`} className="rounded-3xl bg-canvas p-5 hover:bg-line/60">
              <Mail className="h-5 w-5" style={{ color: accent }} /><p className="mt-3 font-semibold">Email</p><p className="text-sm break-all text-muted">{school.email}</p>
            </a>
          ) : null}
        </div>
      </section>

      <SiteFooter school={school} />
    </div>
  );
}
