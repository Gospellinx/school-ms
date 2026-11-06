"use client";
import { PageHeader } from "@/components/shell/page-header";
import { Card } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { Async } from "@/components/ui/feedback";
import { useApi } from "@/lib/api";
import { shortDate } from "@/lib/format";

type Admin = { id: string; fullName: string; email: string; createdAt: string };

export default function Users() {
  const { data, error } = useApi<Admin[]>("platform/admins");
  return (
    <>
      <PageHeader title="Platform Users" subtitle="The Linx School team. New platform admins are added with the seed or a database script for now." />
      <Card>
        <Async data={data} error={error}>
          {(list) => (
            <Table>
              <THead><tr><TH>Name</TH><TH>Email</TH><TH>Added</TH></tr></THead>
              <tbody>
                {list.map((u) => (
                  <TR key={u.id}>
                    <TD><div className="flex items-center gap-3"><Avatar name={u.fullName} size={34} /><span className="font-semibold">{u.fullName}</span></div></TD>
                    <TD>{u.email}</TD>
                    <TD>{shortDate(u.createdAt)}</TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          )}
        </Async>
      </Card>
    </>
  );
}
