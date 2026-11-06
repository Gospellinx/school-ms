"use client";
import { PageHeader } from "@/components/shell/page-header";
import { AttendanceRegister } from "@/components/pages/attendance-register";
import { Async } from "@/components/ui/feedback";
import { useApi } from "@/lib/api";
import { className, type Dashboard } from "@/lib/types";

export default function Page() {
  const { data, error } = useApi<Dashboard>("dashboard");
  return (
    <>
      <PageHeader title="Attendance" subtitle="Mark the register in a few taps. Everyone starts as present." />
      <div className="max-w-3xl">
        <Async data={data} error={error}>
          {(d) => (
            <AttendanceRegister
              classes={[...d.classes].sort((x, y) => Number(y.isFormClass) - Number(x.isFormClass)).map((c) => ({ id: c.id, label: `${className(c)}${c.isFormClass ? " (form class)" : ""}` }))}
            />
          )}
        </Async>
      </div>
    </>
  );
}
