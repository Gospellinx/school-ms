"use client";
import { PublishedResults } from "@/components/pages/published-results";
import { useStudent } from "@/lib/session";

export default function Page() {
  const me = useStudent();
  return <PublishedResults base="student/results" title="My Results" subtitle={`${me.student.firstName} ${me.student.lastName} · ${me.student.admissionNumber}`} />;
}
