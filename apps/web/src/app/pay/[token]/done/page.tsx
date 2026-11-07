import Link from "next/link";
import { CheckCircle2, Clock, XCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { buttonClass } from "@/components/ui/button";
import { naira } from "@/lib/format";
import { API_URL } from "@/lib/server";

export const dynamic = "force-dynamic";

/** Paystack returns the parent here with ?reference=. The API confirms with Paystack directly. */
export default async function PayDone({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ reference?: string; trxref?: string }> }) {
  const { token } = await params;
  const q = await searchParams;
  const reference = q.reference ?? q.trxref;
  let r: { status: string; student: string; balanceKobo: number; amountKobo: number | null; message?: string } | null = null;
  if (reference) {
    const res = await fetch(`${API_URL}/pay-links/${encodeURIComponent(token)}/payments/${encodeURIComponent(reference)}`, { cache: "no-store" });
    r = await res.json().catch(() => null);
    if (!res.ok) r = null;
  }
  const status = r?.status ?? "unknown";
  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas p-4">
      <Card className="w-full max-w-md text-center">
        {status === "success" ? <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600" /> : status === "pending" ? <Clock className="mx-auto h-12 w-12 text-amber-500" /> : <XCircle className="mx-auto h-12 w-12 text-rose-500" />}
        <h1 className="mt-4 text-2xl font-bold">{status === "success" ? "Payment received" : status === "pending" ? "Payment is processing" : "Payment did not go through"}</h1>
        <p className="mt-2 text-sm text-muted">
          {r && status === "success"
            ? `Thank you. ${r.amountKobo ? `${naira(r.amountKobo)} was paid for ${r.student}. ` : ""}The balance is now ${naira(r.balanceKobo)}. A receipt is on its way.`
            : status === "pending"
              ? "Your bank has not confirmed it yet. The school will see it as soon as it does."
              : "No money was taken. You can try again."}
        </p>
        <Link href={`/pay/${token}`} className={buttonClass("primary", "md", "mt-6 w-full")}>Back to the bill</Link>
      </Card>
    </main>
  );
}
