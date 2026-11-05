import { Plus, Search } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { Card } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Input, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/widgets/status-badge";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { schools } from "@/lib/mock";
import { naira } from "@/lib/utils";

export const metadata = { title: "Schools" };

export default function Schools() {
  return (
    <>
      <PageHeader title="Schools" subtitle="Every school on the platform." actions={<Button><Plus className="h-4 w-4" /> Add school</Button>} />
      <Card>
        <div className="mb-4 flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1"><Search className="absolute top-3 left-3.5 h-4 w-4 text-muted" /><Input className="pl-10" placeholder="Search schools" /></div>
          <Select><option>All plans</option><option>Premium</option><option>Standard</option><option>Basic</option></Select>
          <Select><option>All statuses</option><option>Active</option><option>Trial</option><option>Overdue</option></Select>
        </div>
        <Table>
          <THead><tr><TH>School</TH><TH>City</TH><TH>Plan</TH><TH>Students</TH><TH>Monthly</TH><TH>Status</TH><TH className="text-right">Action</TH></tr></THead>
          <tbody>
            {schools.map((s) => (
              <TR key={s.name}>
                <TD><div className="flex items-center gap-3"><Avatar name={s.name} size={34} /><span className="font-semibold">{s.name}</span></div></TD>
                <TD>{s.city}</TD>
                <TD>{s.plan}</TD>
                <TD>{s.students.toLocaleString()}</TD>
                <TD>{s.mrr ? naira(s.mrr) : "—"}</TD>
                <TD><StatusBadge status={s.status} /></TD>
                <TD className="text-right">{s.status === "Pending" ? <Button size="sm">Approve</Button> : <Button size="sm" variant="ghost">Manage</Button>}</TD>
              </TR>
            ))}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
