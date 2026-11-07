"use client";
import * as React from "react";
import { Suspense } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { CalendarClock, Check, CheckCircle2, Clock, CreditCard, Mail, MonitorCheck, PartyPopper } from "lucide-react";
import { Card } from "@/components/ui/card";
import { ErrorNote, Loading, SuccessNote } from "@/components/ui/feedback";
import { SiteFooter, SiteHeader } from "@/components/admissions/site-chrome";
import { publicApi, recallKey, rememberKey, type PublicStatus } from "@/lib/admissions";
import { cn } from "@/lib/utils";

const naira = (kobo: number) => `₦${(kobo / 100).toLocaleString("en-NG")}`;
const when = (v: string) => new Date(v).toLocaleString("en-NG", { timeZone: "Africa/Lagos", weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

function Status() {
  const { slug } = useParams<{ slug: string }>();
  const q = useSearchParams();
  const ref = q.get("ref") ?? "";
  const paystackRef = q.get("reference") ?? q.get("trxref");
  const [key, setKey] = React.useState<string | null>(q.get("key"));
  const [data, setData] = React.useState<PublicStatus | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(q.get("new") ? "Application received. We have emailed you a copy of this link." : null);
  const [busy, setBusy] = React.useState(false);

  const load = React.useCallback(async (k: string) => {
    try {
      setData(await publicApi<PublicStatus>(`schools/${slug}/applications/${encodeURIComponent(ref)}?key=${encodeURIComponent(k)}`));
    } catch (e) {
      setError((e as Error).message);
    }
  }, [slug, ref]);

  React.useEffect(() => {
    const k = key ?? recallKey(ref);
    if (!k) {
      setError("Open this page from the link in your email.");
      return;
    }
    rememberKey(ref, k);
    setKey(k);
    (async () => {
      if (paystackRef) {
        try {
          const r = await publicApi<{ status: string }>(`schools/${slug}/payments/${encodeURIComponent(paystackRef)}/verify`);
          setNotice(r.status === "success" ? "Payment received. Your application is now with the admissions office." : r.status === "pending" ? "Your bank has not confirmed the payment yet. This page will update once it does." : null);
          if (r.status === "failed") setError("The payment did not go through. No money was taken. You can try again below.");
        } catch (e) {
          setError((e as Error).message);
        }
      }
      await load(k);
    })();
  }, [ref, paystackRef, slug, load]); // eslint-disable-line react-hooks/exhaustive-deps

  async function pay() {
    if (!key) return;
    setBusy(true);
    try {
      const r = await publicApi<{ authorizationUrl: string }>(`schools/${slug}/applications/${ref}/pay?key=${key}`, { method: "POST" });
      window.location.href = r.authorizationUrl;
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  async function accept() {
    if (!key || !confirm("Accept the offer of admission?")) return;
    setBusy(true);
    try {
      await publicApi(`schools/${slug}/applications/${ref}/accept?key=${key}`, { method: "POST" });
      setNotice("Thank you. The offer is accepted and the school has been told.");
      await load(key);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const accent = data?.accentColor ?? "#6a3bf0";
  const a = data?.application;
  const now = Date.now();

  return (
    <div style={{ ["--accent" as string]: accent }} className="min-h-screen bg-canvas">
      {data ? <SiteHeader school={data.school} minimal /> : null}
      <main className="mx-auto max-w-2xl px-4 py-8 sm:px-6 sm:py-12">
        {!a ? (
          error ? <ErrorNote>{error}</ErrorNote> : <Loading label="Opening your application…" />
        ) : (
          <div className="flex flex-col gap-5">
            <SuccessNote>{notice}</SuccessNote>
            <ErrorNote>{error}</ErrorNote>
            <Card>
              <p className="text-sm text-muted">Application {a.reference}</p>
              <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">{a.childName}</h1>
              <p className="text-muted">{a.className} · {data!.school.name}</p>
              <span className="mt-4 inline-flex items-center gap-2 rounded-xl px-3 py-1.5 text-sm font-semibold text-white" style={{ background: a.status === "rejected" ? "#e11d48" : accent }}>{a.statusLabel}</span>
              <ol className="mt-6 flex flex-col gap-0">
                {a.steps.map((s, i) => {
                  const current = !s.done && (i === 0 || a.steps[i - 1].done) && a.status !== "rejected";
                  return (
                    <li key={s.key} className="flex gap-3">
                      <div className="flex flex-col items-center">
                        <span className={cn("flex h-7 w-7 items-center justify-center rounded-full border-2 text-xs font-bold", s.done ? "border-transparent text-white" : current ? "bg-white" : "border-line bg-white text-muted")} style={s.done ? { background: accent } : current ? { borderColor: accent, color: accent } : undefined}>
                          {s.done ? <Check className="h-4 w-4" /> : i + 1}
                        </span>
                        {i < a.steps.length - 1 ? <span className="my-1 h-6 w-0.5 bg-line" /> : null}
                      </div>
                      <p className={cn("pt-0.5 text-sm", s.done || current ? "font-semibold" : "text-muted")}>{s.label}{current ? " · next" : ""}</p>
                    </li>
                  );
                })}
              </ol>
            </Card>

            {a.status === "pending_payment" ? (
              <Card>
                <div className="flex items-start gap-3">
                  <CreditCard className="mt-0.5 h-5 w-5 shrink-0" style={{ color: accent }} />
                  <div className="flex-1">
                    <p className="font-semibold">Pay the application form fee</p>
                    <p className="mt-1 text-sm text-muted">{naira(a.fee.amountKobo)}, by card, bank transfer or USSD. Your application goes to the school as soon as it is paid.</p>
                    <button disabled={busy} onClick={pay} className="mt-4 inline-flex h-11 items-center rounded-2xl px-5 font-semibold text-white disabled:opacity-60" style={{ background: accent }}>{busy ? "Opening Paystack…" : `Pay ${naira(a.fee.amountKobo)}`}</button>
                  </div>
                </div>
              </Card>
            ) : null}

            {a.exam && a.status === "exam" ? (
              <Card>
                <div className="flex items-start gap-3">
                  <MonitorCheck className="mt-0.5 h-5 w-5 shrink-0" style={{ color: accent }} />
                  <div className="flex-1">
                    <p className="font-semibold">{a.exam.title}</p>
                    {a.exam.submitted ? (
                      <p className="mt-1 flex items-center gap-1.5 text-sm text-emerald-700"><CheckCircle2 className="h-4 w-4" /> Completed. The school will email you a decision.</p>
                    ) : (
                      <>
                        <p className="mt-1 text-sm text-muted">
                          {a.exam.durationMinutes} minutes on a phone or computer. {a.exam.opensAt ? `Opens ${when(a.exam.opensAt)}` : ""}{a.exam.closesAt ? `, closes ${when(a.exam.closesAt)}.` : ""}
                        </p>
                        {a.exam.isOpen ? (
                          <Link href={`/s/${slug}/exam?ref=${a.reference}&key=${key}`} className="mt-4 inline-flex h-11 items-center rounded-2xl px-5 font-semibold text-white" style={{ background: accent }}>{a.exam.started ? "Continue the exam" : "Start the exam"}</Link>
                        ) : a.exam.opensAt && Date.parse(a.exam.opensAt) > now ? (
                          <p className="mt-3 flex items-center gap-1.5 text-sm font-semibold"><CalendarClock className="h-4 w-4" /> Come back when the exam opens. We will remind you by email the day before.</p>
                        ) : (
                          <p className="mt-3 text-sm font-semibold text-rose-600">The exam window has closed. Please contact the school.</p>
                        )}
                        <p className="mt-3 text-xs text-muted">Once started, the timer keeps running even if the page is closed. Answers save as you go.</p>
                      </>
                    )}
                  </div>
                </div>
              </Card>
            ) : null}

            {a.status === "applied" ? (
              <Card className="flex items-start gap-3">
                <Clock className="mt-0.5 h-5 w-5 shrink-0" style={{ color: accent }} />
                <p className="text-sm">The admissions office is reviewing the application. {a.exam ? "We will email you the entrance exam date and link." : "We will email you with the next step."}</p>
              </Card>
            ) : null}

            {a.offer && (a.status === "offered" || a.status === "accepted" || a.status === "enrolled") ? (
              <Card>
                <div className="flex items-start gap-3">
                  <PartyPopper className="mt-0.5 h-5 w-5 shrink-0" style={{ color: accent }} />
                  <div className="flex-1">
                    <p className="font-semibold">{a.status === "enrolled" ? `${a.childName.split(" ")[0]} is enrolled. Welcome!` : "Congratulations! A place has been offered."}</p>
                    {a.offer.note ? <p className="mt-1 text-sm whitespace-pre-line text-muted">{a.offer.note}</p> : null}
                    {a.status === "offered" ? (
                      <button disabled={busy} onClick={accept} className="mt-4 inline-flex h-11 items-center rounded-2xl px-5 font-semibold text-white disabled:opacity-60" style={{ background: accent }}>Accept the offer</button>
                    ) : a.status === "accepted" ? (
                      <p className="mt-2 text-sm text-emerald-700">You accepted on {when(a.offer.acceptedAt!)}. The school will send the admission number and portal login.</p>
                    ) : (
                      <p className="mt-2 text-sm text-muted">The admission number and portal login were sent to {a.parentEmail}.</p>
                    )}
                  </div>
                </div>
              </Card>
            ) : null}

            {a.status === "rejected" ? (
              <Card>
                <p className="font-semibold">We are unable to offer a place this time</p>
                {a.decisionNote ? <p className="mt-1 text-sm text-muted">{a.decisionNote}</p> : null}
              </Card>
            ) : null}

            <p className="flex items-center justify-center gap-1.5 text-center text-xs text-muted"><Mail className="h-3.5 w-3.5" /> Updates go to {a.parentEmail}. Keep this link private.</p>
          </div>
        )}
      </main>
      {data ? <SiteFooter school={data.school} /> : null}
    </div>
  );
}

export default function Page() {
  return <Suspense fallback={<Loading />}><Status /></Suspense>;
}
