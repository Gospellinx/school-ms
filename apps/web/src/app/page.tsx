import Link from "next/link";
import { ArrowRight, BookOpen, GraduationCap, HeartHandshake, School, ShieldCheck } from "lucide-react";
import { Logo } from "@/components/shell/logo";
import { Input, Label } from "@/components/ui/input";
import { buttonClass } from "@/components/ui/button";

const portals = [
  { href: "/super-admin", title: "Super Admin", text: "All schools, billing and the question bank", icon: ShieldCheck },
  { href: "/admin", title: "School Admin", text: "Students, staff, results, fees and messages", icon: School },
  { href: "/teacher", title: "Teacher", text: "Score entry, attendance and CBT tests", icon: BookOpen },
  { href: "/student", title: "Student", text: "Subjects, AI exam prep, CBT and results", icon: GraduationCap },
  { href: "/parent", title: "Parent", text: "Results, fees, attendance and messages", icon: HeartHandshake },
];

export default function Home() {
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
          <div className="mt-10 grid grid-cols-3 gap-4">
            {[["642", "Students"], ["98%", "Report cards on time"], ["₦12.4m", "Fees collected"]].map(([v, l]) => (
              <div key={l} className="rounded-2xl bg-white/10 p-4 backdrop-blur">
                <p className="text-2xl font-bold">{v}</p>
                <p className="text-sm text-white/80">{l}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="flex flex-col px-5 py-8 sm:px-10 lg:justify-center lg:px-16">
        <div className="lg:hidden"><Logo /></div>
        <div className="mx-auto mt-10 w-full max-w-md lg:mt-0">
          <h2 className="text-3xl font-bold tracking-tight">Welcome back</h2>
          <p className="mt-1 text-muted">Sign in to your school portal.</p>

          <form className="mt-8 flex flex-col gap-4" action="/admin">
            <div>
              <Label htmlFor="school">School code</Label>
              <Input id="school" placeholder="e.g. linx-demo" defaultValue="linx-demo" />
            </div>
            <div>
              <Label htmlFor="email">Email or phone number</Label>
              <Input id="email" placeholder="you@school.ng or 0803…" />
            </div>
            <div>
              <Label htmlFor="pw">Password</Label>
              <Input id="pw" type="password" placeholder="••••••••" />
            </div>
            <button className={buttonClass("primary", "lg", "mt-2 w-full")}>Sign in</button>
            <p className="text-center text-sm text-muted">Parent? <span className="font-semibold text-brand-600">Sign in with an SMS code</span></p>
          </form>

          <div className="mt-10">
            <p className="mb-3 text-xs font-semibold tracking-wider text-muted uppercase">Design preview: open a portal</p>
            <div className="flex flex-col gap-2">
              {portals.map((p) => {
                const Icon = p.icon;
                return (
                  <Link key={p.href} href={p.href} className="group flex items-center gap-4 rounded-2xl border border-line bg-white p-3.5 hover:border-brand-300">
                    <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 text-brand-600"><Icon className="h-5 w-5" /></span>
                    <span className="flex-1">
                      <span className="block font-semibold">{p.title}</span>
                      <span className="block text-sm text-muted">{p.text}</span>
                    </span>
                    <ArrowRight className="h-4 w-4 text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-brand-600" />
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
