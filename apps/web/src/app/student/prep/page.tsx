"use client";
import * as React from "react";
import { Lightbulb, Send, Sparkles } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const topics = ["Mole concept", "Projectile motion", "Quadratic equations", "Comprehension", "Logarithms", "Organic chemistry"];

export default function Prep() {
  const [picked, setPicked] = React.useState<number | null>(null);
  return (
    <>
      <PageHeader title="AI Exam Prep" subtitle="Practise WAEC, NECO and JAMB questions with step-by-step help." />
      <div className="grid gap-5 xl:grid-cols-[1fr_340px]">
        <Card>
          <div className="mb-5 flex flex-wrap gap-2">
            <Select defaultValue="Chemistry"><option>Chemistry</option><option>Mathematics</option><option>Physics</option><option>English Language</option></Select>
            <Select defaultValue="WAEC"><option>WAEC</option><option>NECO</option><option>JAMB UTME</option><option>School exam</option></Select>
            <Select defaultValue="Mole concept">{topics.map((t) => <option key={t}>{t}</option>)}</Select>
          </div>

          <div className="rounded-2xl bg-canvas p-5">
            <div className="mb-3 flex items-center gap-2"><Badge tone="brand">WAEC 2019</Badge><Badge tone="gray">Question 3 of 10</Badge></div>
            <p className="font-semibold">How many moles of oxygen molecules are in 64 g of oxygen gas? [O = 16]</p>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {["1 mole", "2 moles", "4 moles", "0.5 mole"].map((o, i) => (
                <button
                  key={o}
                  onClick={() => setPicked(i)}
                  className={cn(
                    "rounded-2xl border bg-white px-4 py-3 text-left text-sm font-medium transition-colors",
                    picked === null && "border-line hover:border-brand-300",
                    picked !== null && i === 1 && "border-emerald-400 bg-emerald-50",
                    picked !== null && picked === i && i !== 1 && "border-rose-300 bg-rose-50",
                    picked !== null && picked !== i && i !== 1 && "border-line opacity-60",
                  )}
                >
                  <span className="mr-2 font-bold text-muted">{"ABCD"[i]}.</span>{o}
                </button>
              ))}
            </div>
          </div>

          {picked !== null ? (
            <div className="mt-5 rounded-2xl border border-brand-100 bg-brand-50/60 p-5">
              <p className="mb-2 flex items-center gap-2 font-semibold text-brand-700"><Sparkles className="h-4 w-4" /> Step-by-step</p>
              <ol className="list-decimal space-y-1.5 pl-5 text-sm">
                <li>Oxygen gas is O₂, so its molar mass is 2 × 16 = 32 g/mol.</li>
                <li>Number of moles = mass ÷ molar mass = 64 ÷ 32.</li>
                <li>So there are <strong>2 moles</strong> of O₂. The answer is B.</li>
              </ol>
              <p className="mt-3 text-xs text-muted">Common mistake: using 16 instead of 32 gives 4 moles (option C).</p>
            </div>
          ) : null}

          <div className="mt-5 flex items-center gap-2 rounded-2xl border border-line p-1.5 pl-4">
            <input className="flex-1 bg-transparent text-sm outline-none" placeholder="Ask anything about this question…" />
            <Button size="icon" aria-label="Send"><Send className="h-4 w-4" /></Button>
          </div>
          <div className="mt-4 flex justify-between">
            <Button variant="outline">Previous</Button>
            <Button onClick={() => setPicked(null)}>Next question</Button>
          </div>
        </Card>

        <div className="flex flex-col gap-5">
          <Card className="bg-brand-600 text-white">
            <p className="text-sm text-white/80">Readiness for WAEC Chemistry</p>
            <p className="mt-1 text-4xl font-bold">62%</p>
            <p className="mt-2 text-sm text-white/85">Up 8% this month. Two more weak topics to fix.</p>
          </Card>
          <Card>
            <CardHeader title="Focus topics" subtitle="Picked from your test mistakes" />
            <ul className="flex flex-col gap-2">
              {topics.slice(0, 4).map((t, i) => (
                <li key={t} className="flex items-center gap-3 rounded-2xl bg-canvas p-3 text-sm">
                  <Lightbulb className={cn("h-4 w-4", i < 2 ? "text-amber-500" : "text-brand-500")} />
                  <span className="flex-1 font-medium">{t}</span>
                  <span className="text-xs text-muted">{40 + i * 12}%</span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}
