"use client";
import * as React from "react";
import { MessageSquare } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs } from "@/components/ui/tabs";
import { Async, Empty } from "@/components/ui/feedback";
import { useApi } from "@/lib/api";
import { useParent } from "@/lib/session";
import { dateTime, MESSAGE_KINDS } from "@/lib/format";
import type { Notification } from "@/lib/types";

export default function ParentMessages() {
  const me = useParent();
  const { data, error } = useApi<Notification[]>("parent/messages");
  const [tab, setTab] = React.useState("All");
  const names = new Map(me.children.map((c) => [c.id, c.firstName]));
  const tabs = ["All", ...me.children.map((c) => c.firstName)];
  return (
    <>
      <PageHeader title="Messages" subtitle={`What ${me.school.name} has sent you by ${me.parent.preferredChannel === "whatsapp" ? "WhatsApp" : "SMS"}.`} />
      {me.children.length > 1 ? <Tabs tabs={tabs} value={tab} onChange={setTab} className="mb-4" /> : null}
      <Async data={data} error={error}>
        {(list) => {
          const shown = tab === "All" ? list : list.filter((m) => !m.studentId || names.get(m.studentId) === tab);
          return shown.length ? (
            <Card className="p-3 sm:p-3">
              <ul className="flex flex-col">
                {shown.map((m) => (
                  <li key={m.id} className="flex items-start gap-3 rounded-2xl p-3 hover:bg-canvas">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600"><MessageSquare className="h-4 w-4" /></span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2 text-xs text-muted">
                        <span className="font-semibold text-ink">{MESSAGE_KINDS[m.kind] ?? m.kind}</span>
                        {m.studentId && names.get(m.studentId) ? <Badge tone="gray">{names.get(m.studentId)}</Badge> : null}
                        <span>{dateTime(m.createdAt)}</span>
                        <span className="uppercase">{m.channel}</span>
                        {m.status === "failed" ? <Badge tone="red">Not delivered</Badge> : null}
                      </span>
                      <span className="mt-1 block text-sm whitespace-pre-line">{m.body}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          ) : (
            <Card><Empty title="No messages yet">Results, absences, receipts and school notices arrive here and on your phone.</Empty></Card>
          );
        }}
      </Async>
    </>
  );
}
