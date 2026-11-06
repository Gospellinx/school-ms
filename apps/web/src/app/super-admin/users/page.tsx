import { PageHeader } from "@/components/shell/page-header";
import { Card } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";

export const metadata = { title: "Platform Users" };

const users = [
  ["Gospel Ocheni", "Owner", "gospel@linxschool.ng", "Today"],
  ["Adaeze Nnaji", "Support", "adaeze@linxschool.ng", "Today"],
  ["Samuel Ojo", "Content editor", "samuel@linxschool.ng", "Yesterday"],
  ["Halima Garba", "Sales", "halima@linxschool.ng", "Nov 2"],
];

export default function Users() {
  return (
    <>
      <PageHeader title="Platform Users" subtitle="The Linx School team and what they can access." actions={<Button>Invite user</Button>} />
      <Card>
        <Table>
          <THead><tr><TH>Name</TH><TH>Role</TH><TH>Email</TH><TH>Last active</TH><TH /></tr></THead>
          <tbody>
            {users.map(([n, r, e, l]) => (
              <TR key={n}>
                <TD><div className="flex items-center gap-3"><Avatar name={n!} size={34} /><span className="font-semibold">{n}</span></div></TD>
                <TD><Badge tone={r === "Owner" ? "brand" : "gray"}>{r}</Badge></TD><TD>{e}</TD><TD>{l}</TD>
                <TD className="text-right"><Button size="sm" variant="ghost">Edit</Button></TD>
              </TR>
            ))}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
