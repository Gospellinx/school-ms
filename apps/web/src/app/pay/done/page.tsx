"use client";
import * as React from "react";
import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, Clock, XCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { buttonClass } from "@/components/ui/button";
import { ErrorNote, Loading } from "@/components/ui/feedback";
import { api } from "@/lib/api";
import { naira } from "@/lib/format";
import type { InvoiceDetail } from "@/lib/types";

/** Paystack sends the parent back here with ?reference=. We confirm with the API, which asks Paystack directly. */
function Done() {
  const q = useSearchParams();
  const reference = q.get("reference") ?? q.get("trxref");
  const [res, setRes] = React.useState<{ status: string; invoice: InvoiceDetail } | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (!reference) return setError("No payment reference was returned.");
    api<{ status: string; invoice: InvoiceDetail }>(`parent/payments/${encodeURIComponent(reference)}/verify`).then(setRes, (e: Error) => setError(e.message));
  }, [reference]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas p-4">
      <Card className="w-full max-w-md text-center">
        {error ? (
          <ErrorNote>{error}</ErrorNote>
        ) : !res ? (
          <Loading label="Confirming your payment…" />
        ) : (
          <>
            {res.status === "success" ? <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600" /> : res.status === "pending" ? <Clock className="mx-auto h-12 w-12 text-amber-500" /> : <XCircle className="mx-auto h-12 w-12 text-rose-500" />}
            <h1 className="mt-4 text-2xl font-bold">{res.status === "success" ? "Payment received" : res.status === "pending" ? "Payment is processing" : "Payment did not go through"}</h1>
            <p className="mt-2 text-sm text-muted">
              {res.status === "success"
                ? `Thank you. ${res.invoice.student.name}'s balance is now ${naira(res.invoice.balanceKobo)}. A receipt is on its way by SMS.`
                : res.status === "pending"
                  ? "Your bank has not confirmed it yet. We will update the bill as soon as it does."
                  : "No money was taken. You can try again from the fees page."}
            </p>
          </>
        )}
        <Link href="/parent/fees" className={buttonClass("primary", "md", "mt-6 w-full")}>Back to fees</Link>
      </Card>
    </main>
  );
}

export default function Page() {
  return <Suspense fallback={<Loading />}><Done /></Suspense>;
}
