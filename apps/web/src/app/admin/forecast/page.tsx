"use client";
import { Suspense } from "react";
import { ForecastPage } from "@/components/insights/forecast";
import { Loading } from "@/components/ui/feedback";

export default function Page() {
  return (
    <Suspense fallback={<Loading />}>
      <ForecastPage base="/admin" />
    </Suspense>
  );
}
