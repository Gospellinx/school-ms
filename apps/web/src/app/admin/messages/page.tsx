import { MessageCircle, Smartphone } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { messages } from "@/lib/mock";

export const metadata = { title: "Messages" };

export default function Messages() {
  return (
    <>
      <PageHeader title="Messages" subtitle="Send WhatsApp and SMS notices to parents and staff." />
      <div className="grid gap-5 xl:grid-cols-[1fr_1.2fr]">
        <Card>
          <CardHeader title="New message" />
          <div className="flex flex-col gap-4">
            <div><Label>To</Label><Select className="w-full"><option>All parents (602)</option><option>Owing parents (146)</option><option>SS 3 parents (25)</option><option>All staff (48)</option></Select></div>
            <div><Label>Title</Label><Input placeholder="e.g. Mid-term break notice" /></div>
            <div><Label>Message</Label><Textarea rows={5} placeholder="Dear parent, …" /></div>
            <div className="flex flex-wrap gap-2">
              <Badge tone="green" className="px-3 py-1.5"><MessageCircle className="h-3.5 w-3.5" /> WhatsApp first</Badge>
              <Badge tone="gray" className="px-3 py-1.5"><Smartphone className="h-3.5 w-3.5" /> SMS if no WhatsApp</Badge>
            </div>
            <div className="flex items-center justify-between rounded-2xl bg-canvas p-3 text-sm"><span className="text-muted">Estimated cost</span><span className="font-semibold">₦2,408</span></div>
            <Button>Send message</Button>
          </div>
        </Card>
        <Card>
          <CardHeader title="Sent" />
          <ul className="flex flex-col gap-3">
            {messages.map((m) => (
              <li key={m.title} className="rounded-2xl bg-canvas p-4">
                <div className="flex items-start justify-between gap-2">
                  <div><p className="font-semibold">{m.title}</p><p className="text-xs text-muted">{m.audience} · {m.sent}</p></div>
                  <Badge tone={m.channel === "WhatsApp" ? "green" : "blue"}>{m.channel}</Badge>
                </div>
                <div className="mt-3 mb-1 flex justify-between text-xs"><span className="text-muted">Delivered</span><span className="font-semibold">{m.delivered} / {m.total}</span></div>
                <Progress value={(m.delivered / m.total) * 100} barClassName="bg-emerald-500" className="bg-emerald-50" />
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}
