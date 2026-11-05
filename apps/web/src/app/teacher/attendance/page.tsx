import { PageHeader } from "@/components/shell/page-header";
import { AttendanceRegister } from "@/components/pages/attendance-register";

export const metadata = { title: "Attendance" };
export default function Page() {
  return (
    <>
      <PageHeader title="Attendance" subtitle="Mark today's register in a few taps." />
      <div className="max-w-3xl"><AttendanceRegister /></div>
    </>
  );
}
