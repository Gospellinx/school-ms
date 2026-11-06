"use client";
import { TimetableView } from "@/components/pages/timetable";
import { useApi } from "@/lib/api";
import { className, type Assignment } from "@/lib/types";

export default function Page() {
  const { data } = useApi<Assignment[]>("my-assignments");
  return <TimetableView title="Timetable" subtitle="Your periods for the week." items={(data ?? []).map((a) => `${a.subjectName} · ${className({ name: a.className, arm: a.arm })}`)} />;
}
