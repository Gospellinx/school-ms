"use client";
import { Suspense } from "react";
import Link from "next/link";
import { CalendarCheck, FileText, MessageSquare, Wallet } from "lucide-react";
import { Hero } from "@/components/widgets/hero";
import { MiniCalendar } from "@/components/widgets/schedule-rail";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Donut, Legend } from "@/components/charts/donut";
import { buttonClass } from "@/components/ui/button";
import { Empty, Loading } from "@/components/ui/feedback";
import { useApi } from "@/lib/api";
import { useParent } from "@/lib/session";
import { ChildPicker, childClass, childName, useChild } from "@/lib/child";
import { dateTime, longDate, MESSAGE_KINDS, naira, pct, todayLagos } from "@/lib/format";
import type { InvoiceDetail, Notification, PublishedTerm, StudentAttendance } from "@/lib/types";

function Dashboard() {
  const me = useParent();
  const child = useChild();
  const id = child?.id;
  const invoices = useApi<InvoiceDetail[]>(id ? `parent/children/${id}/invoices` : null);
  const att = useApi<StudentAttendance>(id ? `parent/children/${id}/attendance` : null);
  const results = useApi<PublishedTerm[]>(id ? `parent/children/${id}/results` : null);
  const messages = useApi<Notification[]>("parent/messages");

  if (!child) return <Card><Empty title="No children linked yet">Ask the school office to link your phone number to your child.</Empty></Card>;

  const owing = (invoices.data ?? []).reduce((n, i) => n + i.balanceKobo, 0);
  const s = att.data?.summary;
  const slices = s
    ? [
        { label: "Present", value: s.present, color: "#6a3bf0" },
        { label: "Late", value: s.late, color: "#e879f9" },
        { label: "Absent", value: s.absent, color: "#f5d0fe" },
        ...(s.excused ? [{ label: "Excused", value: s.excused, color: "#ebe5ff" }] : []),
      ]
    : [];
  const attended = s ? s.present + s.late : 0;
  const latest = results.data?.[0];
  const mine = (messages.data ?? []).filter((m) => !m.studentId || m.studentId === child.id).slice(0, 4);

  return (
    <div className="grid gap-6 2xl:grid-cols-[1fr_340px]">
      <div className="min-w-0">
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-[28px] font-bold tracking-tight sm:text-4xl">Dashboard</h1>
          <ChildPicker current={child} />
        </div>
        <Hero
          name={me.parent.fullName}
          line={`${childName(child)} · ${childClass(child)} · ${me.school.name}`}
          stats={[
            { icon: CalendarCheck, value: s && s.opened ? `${pct(attended, s.opened)}%` : "–", label: "Attendance this year" },
            { icon: Wallet, value: invoices.data ? naira(owing, { compact: true }) : "…", label: "Fees owing" },
          ]}
          asideTitle="Latest report card"
          aside={
            latest ? (
              <div>
                <Badge tone="green">Released</Badge>
                <p className="mt-3 text-lg leading-snug font-semibold">{latest.name} {latest.session}</p>
                <p className="mt-2 text-sm text-muted">{childName(child)}&apos;s full report card with scores, grades and teacher comments.</p>
                <Link href={`/parent/results?child=${child.id}`} className={buttonClass("primary", "sm", "mt-4 w-full")}><FileText className="h-4 w-4" /> Open report card</Link>
              </div>
            ) : (
              <div>
                <p className="text-lg font-semibold">No results released yet</p>
                <p className="mt-2 text-sm text-muted">You get an SMS as soon as the school publishes them.</p>
              </div>
            )
          }
        />

        <div className="grid gap-5 lg:grid-cols-[1fr_1fr]">
          <Card>
            <CardHeader title="Attendance" subtitle={att.data ? `Since ${longDate(att.data.from)}` : undefined} action={<Link href={`/parent/attendance?child=${child.id}`} className="text-sm font-semibold text-brand-600">Details</Link>} />
            {s && s.opened ? (
              <>
                <Donut slices={slices} centerValue={String(s.opened)} centerLabel="School days" />
                <Legend slices={slices} />
              </>
            ) : att.data ? (
              <Empty title="No registers yet" />
            ) : (
              <Loading />
            )}
          </Card>
          <Card>
            <CardHeader title="School fees" action={<Link href={`/parent/fees?child=${child.id}`} className="text-sm font-semibold text-brand-600">Pay</Link>} />
            {invoices.data ? (
              invoices.data.length ? (
                <ul className="flex flex-col gap-2">
                  {invoices.data.map((i) => (
                    <li key={i.id} className="rounded-2xl bg-canvas px-3.5 py-3 text-sm">
                      <span className="flex items-center justify-between gap-2"><span className="font-semibold">{i.term} {i.session}</span><Badge tone={i.status === "paid" ? "green" : i.status === "part_paid" ? "amber" : "red"}>{i.status === "paid" ? "Paid" : `${naira(i.balanceKobo)} owing`}</Badge></span>
                      <span className="block text-xs text-muted">Bill {i.number} · {naira(i.totalKobo)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <Empty title="No bills yet" />
              )
            ) : (
              <Loading />
            )}
          </Card>
        </div>

        <Card className="mt-5">
          <CardHeader title="Messages from school" action={<Link href="/parent/messages" className="text-sm font-semibold text-brand-600">View all</Link>} />
          {mine.length ? (
            <ul className="grid gap-3 sm:grid-cols-2">
              {mine.map((m) => (
                <li key={m.id} className="flex items-start gap-3 rounded-2xl bg-canvas p-3.5">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-brand-600"><MessageSquare className="h-4 w-4" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs text-muted"><span className="font-semibold text-ink">{MESSAGE_KINDS[m.kind] ?? m.kind}</span> · {dateTime(m.createdAt)}</span>
                    <span className="mt-0.5 line-clamp-2 block text-sm">{m.body}</span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <Empty title="No messages yet" />
          )}
        </Card>
      </div>
      <div className="2xl:pt-[68px]">
        <aside className="rounded-3xl bg-white p-5 sm:p-6">
          <h3 className="mb-4 text-xl font-semibold tracking-tight">Calendar</h3>
          <MiniCalendar />
          <p className="mt-5 border-t border-line pt-4 text-sm text-muted">Today is <strong className="text-ink">{longDate(todayLagos())}</strong></p>
        </aside>
      </div>
    </div>
  );
}

export default function Page() {
  return <Suspense fallback={<Loading />}><Dashboard /></Suspense>;
}
