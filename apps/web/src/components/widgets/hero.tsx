import * as React from "react";
import type { LucideIcon } from "lucide-react";

export interface HeroStat { icon: LucideIcon; value: string; label: string }

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

/** The big purple welcome card with an overlapping white card on the right. */
export function Hero({ name, line, stats, asideTitle, aside }: { name: string; line: string; stats: HeroStat[]; asideTitle?: string; aside?: React.ReactNode }) {
  return (
    <section className={aside ? "relative mb-6 xl:mb-28" : "relative mb-6 lg:mb-8"}>
      <div className="relative rounded-3xl bg-brand-600 p-6 text-white sm:p-9">
        <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-3xl">
          <div className="absolute -top-24 -right-10 h-72 w-72 rounded-full bg-brand-500/60 blur-2xl" />
          <div className="absolute -bottom-28 left-1/3 h-64 w-64 rounded-full bg-orchid-400/25 blur-3xl" />
        </div>
        <div className="relative grid gap-8 xl:grid-cols-[1fr_300px]">
          <div className="flex flex-col">
            <h2 className="text-3xl leading-tight font-medium tracking-tight sm:text-5xl" suppressHydrationWarning>
              {greeting()},<br />
              <span className="font-bold">{name}.</span>
            </h2>
            <p className="mt-3 text-sm text-white/85 sm:text-base">{line}</p>
            <div className="mt-8 flex flex-wrap gap-x-10 gap-y-5 sm:mt-14">
              {stats.map((s) => {
                const Icon = s.icon;
                return (
                  <div key={s.label} className="flex items-center gap-3">
                    <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-brand-600">
                      <Icon className="h-6 w-6" strokeWidth={1.8} />
                    </span>
                    <span>
                      <span className="block text-3xl leading-none font-bold">{s.value}</span>
                      <span className="mt-1 block text-sm text-white/85">{s.label}</span>
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
          {aside ? (
            <div className="xl:-mb-28">
              {asideTitle ? <p className="mb-3 text-lg font-semibold">{asideTitle}</p> : null}
              <div className="relative">
                <div className="absolute inset-x-4 -bottom-3 top-6 rounded-3xl bg-white/25" />
                <div className="relative rounded-3xl bg-white p-5 text-ink shadow-xl shadow-brand-900/20">{aside}</div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
