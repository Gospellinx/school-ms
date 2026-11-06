"use client";
import * as React from "react";
import { MessageCircle, Send, Smartphone } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label, Select, Textarea } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Async, Empty, ErrorNote, SuccessNote } from "@/components/ui/feedback";
import { api, useApi } from "@/lib/api";
import { useAction } from "@/lib/useAction";
import { dateTime, MESSAGE_KINDS } from "@/lib/format";
import { className, type Notification, type SchoolClass } from "@/lib/types";

/** One outbox row per parent; show them grouped into the message that was sent. */
function group(rows: Notification[]) {
  const by = new Map<string, { key: string; kind: string; body: string; channel: Set<string>; createdAt: string; total: number; sent: number; failed: number }>();
  for (const r of rows) {
    const key = `${r.kind}|${r.body}|${r.createdAt.slice(0, 16)}`;
    const g = by.get(key) ?? { key, kind: r.kind, body: r.body, channel: new Set<string>(), createdAt: r.createdAt, total: 0, sent: 0, failed: 0 };
    g.total++;
    g.channel.add(r.channel);
    if (r.status === "sent") g.sent++;
    if (r.status === "failed") g.failed++;
    by.set(key, g);
  }
  return [...by.values()];
}

export default function Messages() {
  const { data: classes } = useApi<SchoolClass[]>("classes");
  const log = useApi<Notification[]>("notifications?limit=500");
  const [classId, setClassId] = React.useState("");
  const [message, setMessage] = React.useState("");
  const a = useAction();

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const r = await a.run(
      async () => {
        const q = await api<{ queued: number }>("notifications/broadcast", { method: "POST", body: { classId: classId || undefined, message } });
        await api("notifications/dispatch", { method: "POST" });
        return q;
      },
      (q) => `Sent to ${q.queued} parents.`,
    );
    if (r) {
      setMessage("");
      await log.reload();
    }
  }

  return (
    <>
      <PageHeader title="Messages" subtitle="Send SMS and WhatsApp notices to parents, and see everything the school has sent." />
      <div className="grid gap-5 xl:grid-cols-[1fr_1.2fr]">
        <Card>
          <CardHeader title="New message" />
          <form className="flex flex-col gap-4" onSubmit={send}>
            <ErrorNote>{a.error}</ErrorNote>
            <SuccessNote>{a.notice}</SuccessNote>
            <div>
              <Label>To</Label>
              <Select className="w-full" value={classId} onChange={(e) => setClassId(e.target.value)}>
                <option value="">All parents</option>
                {(classes ?? []).map((c) => <option key={c.id} value={c.id}>Parents in {className(c)}</option>)}
              </Select>
            </div>
            <div>
              <Label>Message</Label>
              <Textarea rows={5} maxLength={480} required placeholder="Dear parent, …" value={message} onChange={(e) => setMessage(e.target.value)} />
              <p className="mt-1 text-xs text-muted">{message.length}/480 characters · {Math.max(1, Math.ceil(message.length / 160))} SMS page{message.length > 160 ? "s" : ""}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge tone="green" className="px-3 py-1.5"><MessageCircle className="h-3.5 w-3.5" /> WhatsApp for parents who chose it</Badge>
              <Badge tone="gray" className="px-3 py-1.5"><Smartphone className="h-3.5 w-3.5" /> SMS for everyone else</Badge>
            </div>
            <Button disabled={a.busy || message.trim().length < 3}><Send className="h-4 w-4" /> {a.busy ? "Sending…" : "Send message"}</Button>
          </form>
        </Card>
        <Card>
          <CardHeader title="Sent" subtitle="Results releases, absence alerts, receipts and notices" />
          <Async data={log.data} error={log.error}>
            {(rows) =>
              rows.length === 0 ? (
                <Empty title="Nothing sent yet" />
              ) : (
                <ul className="flex flex-col gap-3">
                  {group(rows).slice(0, 30).map((m) => (
                    <li key={m.key} className="rounded-2xl bg-canvas p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-semibold">{MESSAGE_KINDS[m.kind] ?? m.kind}</p>
                          <p className="text-xs text-muted">{dateTime(m.createdAt)} · {m.total} {m.total === 1 ? "parent" : "parents"}</p>
                        </div>
                        <Badge tone={m.channel.has("whatsapp") ? "green" : "blue"}>{[...m.channel].map((c) => (c === "sms" ? "SMS" : "WhatsApp")).join(" + ")}</Badge>
                      </div>
                      <p className="mt-2 line-clamp-3 text-sm">{m.body}</p>
                      <div className="mt-3 mb-1 flex justify-between text-xs">
                        <span className="text-muted">Sent{m.failed ? ` · ${m.failed} failed` : ""}</span>
                        <span className="font-semibold">{m.sent} / {m.total}</span>
                      </div>
                      <Progress value={(m.sent / m.total) * 100} barClassName="bg-emerald-500" className="bg-emerald-50" />
                    </li>
                  ))}
                </ul>
              )
            }
          </Async>
        </Card>
      </div>
    </>
  );
}
