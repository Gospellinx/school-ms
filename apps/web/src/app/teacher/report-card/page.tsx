"use client";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { StaffReportCard } from "@/components/pages/staff-report-card";
import { Loading } from "@/components/ui/feedback";

function Inner() {
  const q = useSearchParams();
  return <StaffReportCard termId={q.get("term") ?? ""} studentId={q.get("student") ?? ""} backHref="/teacher/classes" />;
}

export default function Page() {
  return <Suspense fallback={<Loading />}><Inner /></Suspense>;
}
