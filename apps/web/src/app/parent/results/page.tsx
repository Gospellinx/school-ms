"use client";
import { Suspense } from "react";
import { PublishedResults } from "@/components/pages/published-results";
import { Card } from "@/components/ui/card";
import { Empty, Loading } from "@/components/ui/feedback";
import { ChildPicker, childClass, childName, useChild } from "@/lib/child";

function Results() {
  const child = useChild();
  if (!child) return <Card><Empty title="No children linked yet" /></Card>;
  return <PublishedResults base={`parent/children/${child.id}/results`} title="Results" subtitle={`${childName(child)} · ${childClass(child)}`} picker={<ChildPicker current={child} />} />;
}

export default function Page() {
  return <Suspense fallback={<Loading />}><Results /></Suspense>;
}
