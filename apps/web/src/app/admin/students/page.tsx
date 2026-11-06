import { Plus, Search, Upload } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { Card } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Input, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/widgets/status-badge";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { students } from "@/lib/mock";

export const metadata = { title: "Students" };

export default function Students() {
  return (
    <>
      <PageHeader title="Students" subtitle="642 students across 4 sections." actions={<><Button variant="outline"><Upload className="h-4 w-4" /> Import CSV</Button><Button><Plus className="h-4 w-4" /> Add student</Button></>} />
      <Card>
        <div className="mb-4 flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1"><Search className="absolute top-3 left-3.5 h-4 w-4 text-muted" /><Input className="pl-10" placeholder="Search by name or admission number" /></div>
          <Select><option>All classes</option><option>SS 2 Gold</option><option>SS 3 Gold</option><option>JSS 3 Blue</option><option>Primary 4</option></Select>
          <Select><option>All fee statuses</option><option>Paid</option><option>Part paid</option><option>Owing</option></Select>
        </div>
        <Table>
          <THead><tr><TH>Student</TH><TH>Class</TH><TH>Parent / guardian</TH><TH>Attendance</TH><TH>Fees</TH><TH /></tr></THead>
          <tbody>
            {students.map((s) => (
              <TR key={s.id}>
                <TD><div className="flex items-center gap-3"><Avatar name={s.name} size={34} /><div><p className="font-semibold">{s.name}</p><p className="text-xs text-muted">{s.id}</p></div></div></TD>
                <TD>{s.className}</TD>
                <TD><p>{s.guardian}</p><p className="text-xs text-muted">{s.phone}</p></TD>
                <TD>{s.attendance}%</TD>
                <TD><StatusBadge status={s.feeStatus} /></TD>
                <TD className="text-right"><Button size="sm" variant="ghost">View</Button></TD>
              </TR>
            ))}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
