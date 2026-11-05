import { Send } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { Card } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const metadata = { title: "Messages" };

const threads = [
  { who: "Linx Demo College", last: "First term report card is ready", time: "Today", unread: true },
  { who: "Mr. Ibrahim Musa", last: "Chiamaka did very well in the practical", time: "Mon", unread: false },
  { who: "Bursary", last: "Payment of ₦130,000 received", time: "Nov 2", unread: false },
];
const chat = [
  { me: false, t: "Good afternoon Mr. Okafor. Chiamaka did very well in the Physics practical this week." },
  { me: true, t: "Thank you sir. Is there anything she should practise at home?" },
  { me: false, t: "Projectile motion. She can use the AI Exam Prep on her portal, it has WAEC past questions." },
];

export default function ParentMessages() {
  return (
    <>
      <PageHeader title="Messages" subtitle="Talk to teachers and the school office." />
      <div className="grid gap-5 lg:grid-cols-[340px_1fr]">
        <Card className="p-3 sm:p-3">
          {threads.map((t, i) => (
            <div key={t.who} className={cn("flex items-center gap-3 rounded-2xl p-3", i === 1 && "bg-canvas")}>
              <Avatar name={t.who} size={42} />
              <div className="min-w-0 flex-1">
                <div className="flex justify-between"><p className="truncate text-sm font-semibold">{t.who}</p><span className="text-xs text-muted">{t.time}</span></div>
                <p className={cn("truncate text-xs", t.unread ? "font-semibold text-ink" : "text-muted")}>{t.last}</p>
              </div>
            </div>
          ))}
        </Card>
        <Card className="flex min-h-[460px] flex-col">
          <div className="flex items-center gap-3 border-b border-line pb-4"><Avatar name="Ibrahim Musa" size={40} /><div><p className="font-semibold">Mr. Ibrahim Musa</p><p className="text-xs text-muted">Physics · SS 2 Gold</p></div></div>
          <div className="flex flex-1 flex-col gap-3 py-5">
            {chat.map((m, i) => (
              <p key={i} className={cn("max-w-[80%] rounded-2xl px-4 py-2.5 text-sm", m.me ? "self-end rounded-br-md bg-brand-600 text-white" : "self-start rounded-bl-md bg-canvas")}>{m.t}</p>
            ))}
          </div>
          <div className="flex items-center gap-2 rounded-2xl border border-line p-1.5 pl-4">
            <input className="flex-1 bg-transparent text-sm outline-none" placeholder="Write a message…" />
            <Button size="icon" aria-label="Send"><Send className="h-4 w-4" /></Button>
          </div>
        </Card>
      </div>
    </>
  );
}
