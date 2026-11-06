"use client";
import { Badge } from "@/components/ui/badge";
import { Empty } from "@/components/ui/feedback";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { naira } from "@/lib/format";
import type { SchoolSummary } from "@/lib/types";

/** Every school on the platform with headline counts. */
export function SchoolsTable({ schools }: { schools: SchoolSummary[] }) {
  if (!schools.length) return <Empty title="No schools yet">Schools appear here when they sign up.</Empty>;
  return (
      <Table className="min-w-[720px]">
        <THead>
          <tr><TH>School</TH><TH>Term</TH><TH>Students</TH><TH>Staff</TH><TH>Parents</TH><TH>Results released</TH><TH>Fees collected</TH><TH>Online payment</TH></tr>
        </THead>
        <tbody>
          {schools.map((s) => (
            <TR key={s.id}>
              <TD><span className="font-semibold">{s.name}</span><span className="block text-xs text-muted">{s.address ?? s.slug}</span></TD>
              <TD>{s.currentTerm ?? "–"}</TD>
              <TD>{s.students}</TD>
              <TD>{s.staff}</TD>
              <TD>{s.parents}</TD>
              <TD>{s.publishedResults}</TD>
              <TD>{naira(s.feesCollectedKobo, { compact: true })}</TD>
              <TD>{s.paystackConnected ? <Badge tone="green">Connected</Badge> : <Badge tone="gray">Not set up</Badge>}</TD>
            </TR>
          ))}
        </tbody>
      </Table>
  );
}
