"use client";
import * as React from "react";
import { Card, CardHeader } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { students } from "@/lib/mock";
import { cn } from "@/lib/utils";

const states = ["Present", "Late", "Absent"] as const;
type S = (typeof states)[number];
const style: Record<S, string> = {
  Present: "bg-emerald-500 text-white",
  Late: "bg-amber-400 text-white",
  Absent: "bg-rose-500 text-white",
};

export function AttendanceRegister() {
  const list = students.slice(0, 10);
  const [marks, setMarks] = React.useState<Record<string, S>>(() => Object.fromEntries(list.map((s, i) => [s.id, i === 3 ? "Absent" : i === 6 ? "Late" : "Present"])));
  const count = (k: S) => Object.values(marks).filter((v) => v === k).length;
  return (
    <Card>
      <CardHeader
        title="Daily register"
        subtitle={`Thursday, 5 November · ${count("Present")} present, ${count("Late")} late, ${count("Absent")} absent`}
        action={<Select defaultValue="SS 2 Gold"><option>SS 2 Gold</option><option>SS 3 Gold</option><option>JSS 3 Blue</option></Select>}
      />
      <ul className="divide-y divide-line">
        {list.map((s) => (
          <li key={s.id} className="flex flex-wrap items-center gap-3 py-3">
            <Avatar name={s.name} size={36} />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-semibold">{s.name}</span>
              <span className="block text-xs text-muted">{s.id}</span>
            </span>
            <span className="flex gap-1 rounded-xl bg-canvas p-1">
              {states.map((st) => (
                <button
                  key={st}
                  onClick={() => setMarks({ ...marks, [s.id]: st })}
                  className={cn("h-8 rounded-lg px-3 text-xs font-semibold", marks[s.id] === st ? style[st] : "text-muted hover:text-ink")}
                >
                  {st}
                </button>
              ))}
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
        <p className="text-xs text-muted">Parents of absent students get an SMS when you save.</p>
        <Button>Save register</Button>
      </div>
    </Card>
  );
}
