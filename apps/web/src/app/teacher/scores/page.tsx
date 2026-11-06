"use client";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/shell/page-header";
import { ScoreSheet } from "@/components/pages/score-sheet";
import { Loading } from "@/components/ui/feedback";

function Inner() {
  const q = useSearchParams();
  return <ScoreSheet initial={{ classId: q.get("class") ?? undefined, subjectId: q.get("subject") ?? undefined }} />;
}

export default function Page() {
  return (
    <>
      <PageHeader title="Score Entry" subtitle="Type scores like a spreadsheet. Totals and grades update as you type." />
      <Suspense fallback={<Loading />}><Inner /></Suspense>
    </>
  );
}
