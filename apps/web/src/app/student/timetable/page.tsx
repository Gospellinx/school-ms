"use client";
import { TimetableView } from "@/components/pages/timetable";
import { useStudent } from "@/lib/session";

export default function Page() {
  const me = useStudent();
  return <TimetableView title="Timetable" subtitle={[me.className, me.arm].filter(Boolean).join(" ")} items={me.subjects.map((s) => s.name)} />;
}
