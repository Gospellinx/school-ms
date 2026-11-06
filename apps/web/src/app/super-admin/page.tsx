"use client";
import Link from "next/link";
import { BookOpenCheck, GraduationCap, School, Users, Wallet } from "lucide-react";
import { Hero } from "@/components/widgets/hero";
import { StatCard } from "@/components/widgets/stat-card";
import { Card, CardHeader } from "@/components/ui/card";
import { BarChart } from "@/components/charts/bar-chart";
import { Donut, Legend } from "@/components/charts/donut";
import { SchoolsTable } from "@/components/pages/schools-table";
import { buttonClass } from "@/components/ui/button";
import { Async, Empty } from "@/components/ui/feedback";
import { useApi } from "@/lib/api";
import { usePlatform } from "@/lib/session";
import { naira } from "@/lib/format";
import type { SchoolSummary } from "@/lib/types";

const EXAM_COLORS: Record<string, string> = { waec: "#6a3bf0", neco: "#e879f9", bece: "#f5d0fe", jamb: "#c4b5fd", school: "#ebe5ff" };
const EXAM_LABELS: Record<string, string> = { waec: "WAEC", neco: "NECO", bece: "BECE", jamb: "JAMB", school: "School" };

export default function SuperAdminDashboard() {
  const me = usePlatform();
  const { data, error } = useApi<SchoolSummary[]>("platform/schools");
  return (
    <Async data={data} error={error}>
      {(schools) => {
        const sum = (f: (s: SchoolSummary) => number) => schools.reduce((n, s) => n + f(s), 0);
        const byExam = new Map<string, number>();
        for (const s of schools) for (const [k, v] of Object.entries(s.questionsByExam)) byExam.set(k, (byExam.get(k) ?? 0) + v);
        const slices = [...byExam.entries()].map(([k, v]) => ({ label: EXAM_LABELS[k] ?? k, value: v, color: EXAM_COLORS[k] ?? "#ddd" }));
        return (
          <>
            <h1 className="mb-5 text-[28px] font-bold tracking-tight sm:text-4xl">Dashboard</h1>
            <Hero
              name={me.admin.fullName}
              line={`Linx School platform · ${schools.length} schools`}
              stats={[
                { icon: School, value: String(schools.length), label: "Schools" },
                { icon: GraduationCap, value: sum((s) => s.students).toLocaleString(), label: "Students" },
              ]}
              asideTitle="Payments"
              aside={
                <div>
                  <p className="text-lg font-semibold">{schools.filter((s) => s.paystackConnected).length} of {schools.length} schools</p>
                  <p className="mt-1 text-sm text-muted">have Paystack connected, so parents can pay online.</p>
                  <Link href="/super-admin/schools" className={buttonClass("primary", "sm", "mt-4 w-full")}>View schools</Link>
                </div>
              }
            />
            <div className="mb-5 grid grid-cols-2 gap-4 xl:grid-cols-4">
              <StatCard icon={Users} label="Staff" value={String(sum((s) => s.staff))} />
              <StatCard icon={Users} label="Parents" value={String(sum((s) => s.parents))} tone="orchid" />
              <StatCard icon={Wallet} label="Fees collected (all time)" value={naira(sum((s) => s.feesCollectedKobo), { compact: true })} tone="green" />
              <StatCard icon={BookOpenCheck} label="Questions in banks" value={String(sum((s) => s.questions))} tone="amber" />
            </div>
            <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
              <Card className="bg-gradient-to-b from-orchid-100/70 to-white">
                <CardHeader title="Students per school" />
                {schools.length ? <BarChart data={schools.map((s) => ({ label: s.name.replace(/\s*\(.*\)/, ""), value: s.students }))} height={220} /> : <Empty title="No schools yet" />}
              </Card>
              <Card>
                <CardHeader title="Question bank" subtitle="By exam" action={<Link href="/super-admin/question-bank" className="text-sm font-semibold text-brand-600">View</Link>} />
                {slices.length ? (
                  <>
                    <Donut slices={slices} centerValue={String(sum((s) => s.questions))} centerLabel="Questions" />
                    <Legend slices={slices} />
                  </>
                ) : (
                  <Empty title="No questions yet" />
                )}
              </Card>
            </div>
            <Card className="mt-5">
              <CardHeader title="Schools" action={<Link href="/super-admin/schools" className="text-sm font-semibold text-brand-600">See all</Link>} />
              <SchoolsTable schools={schools} />
            </Card>
          </>
        );
      }}
    </Async>
  );
}
