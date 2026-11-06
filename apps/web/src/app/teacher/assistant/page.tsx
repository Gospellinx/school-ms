"use client";
import * as React from "react";
import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { GraduationCap } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { Card } from "@/components/ui/card";
import { Select } from "@/components/ui/input";
import { Tabs } from "@/components/ui/tabs";
import { Empty, ErrorNote, Loading } from "@/components/ui/feedback";
import { LessonTab } from "@/components/assistant/lesson";
import { TestsTab } from "@/components/assistant/tests";
import { EssayPrefill, MarkingTab, rubricToText } from "@/components/assistant/marking";
import { RemarksTab, WatchTab } from "@/components/assistant/remarks";
import { useApi } from "@/lib/api";
import type { Assignment, AssistantContext } from "@/lib/types";

const TABS = ["Lesson notes & plans", "Tests & exams", "Mark answers", "Report remarks", "Students to watch"] as const;
type Tab = (typeof TABS)[number];
const SLUG: Record<Tab, string> = {
  "Lesson notes & plans": "lessons",
  "Tests & exams": "tests",
  "Mark answers": "marking",
  "Report remarks": "remarks",
  "Students to watch": "watch",
};

function Inner() {
  const router = useRouter();
  const q = useSearchParams();
  const { data: assignments, error } = useApi<Assignment[]>("my-assignments");
  const options = assignments ?? [];
  const pick = q.get("cs") ?? (options[0] ? `${options[0].classId}:${options[0].subjectId}` : "");
  const [classId, subjectId] = pick.split(":");
  const tab = (TABS.find((t) => SLUG[t] === q.get("tab")) ?? TABS[0]) as Tab;
  const ctx = useApi<AssistantContext>(classId && subjectId ? `assistant/context?classId=${classId}&subjectId=${subjectId}` : null);
  const [prefill, setPrefill] = React.useState<EssayPrefill | null>(null);

  const go = (next: { cs?: string; tab?: Tab }) => {
    const p = new URLSearchParams(q.toString());
    if (next.cs) p.set("cs", next.cs);
    if (next.tab) p.set("tab", SLUG[next.tab]);
    router.replace(`/teacher/assistant?${p.toString()}`);
  };

  if (error) return <ErrorNote>{error}</ErrorNote>;
  if (!assignments) return <Loading />;
  if (options.length === 0) return <Card><Empty title="No subjects yet" icon={GraduationCap}>Ask the school admin to assign you the subjects you teach.</Empty></Card>;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <Select aria-label="Class and subject" className="lg:w-80" value={pick} onChange={(e) => go({ cs: e.target.value })}>
          {options.map((a) => (
            <option key={`${a.classId}:${a.subjectId}`} value={`${a.classId}:${a.subjectId}`}>
              {a.className} {a.arm} · {a.subjectName}
            </option>
          ))}
        </Select>
        <Tabs tabs={[...TABS]} value={tab} onChange={(t) => go({ tab: t as Tab })} />
      </div>
      {ctx.error ? <ErrorNote>{ctx.error}</ErrorNote> : null}
      {ctx.data ? (
        <div key={`${ctx.data.class.id}:${ctx.data.subject.id}`}>
          {tab === "Lesson notes & plans" ? <LessonTab ctx={ctx.data} /> : null}
          {tab === "Tests & exams" ? (
            <TestsTab
              ctx={ctx.data}
              onMarkTheory={(t, title) => {
                setPrefill({ title: `${title}: theory`, question: t.question, rubricText: rubricToText(t.points) });
                go({ tab: "Mark answers" });
              }}
            />
          ) : null}
          {tab === "Mark answers" ? <MarkingTab ctx={ctx.data} prefill={prefill} clearPrefill={() => setPrefill(null)} /> : null}
          {tab === "Report remarks" ? <RemarksTab ctx={ctx.data} /> : null}
          {tab === "Students to watch" ? <WatchTab ctx={ctx.data} /> : null}
        </div>
      ) : !ctx.error ? (
        <Loading />
      ) : null}
    </div>
  );
}

export default function Page() {
  return (
    <>
      <PageHeader
        title="Teaching Assistant"
        subtitle="Lesson notes and plans from your scheme of work, tests with marking schemes, help marking written answers, report remarks, and who is falling behind."
      />
      <Suspense fallback={<Loading />}>
        <Inner />
      </Suspense>
    </>
  );
}
