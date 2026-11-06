"use client";
import * as React from "react";
import { Search } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Async } from "@/components/ui/feedback";
import { SchoolsTable } from "@/components/pages/schools-table";
import { useApi } from "@/lib/api";
import type { SchoolSummary } from "@/lib/types";

export default function Schools() {
  const { data, error } = useApi<SchoolSummary[]>("platform/schools");
  const [q, setQ] = React.useState("");
  return (
    <>
      <PageHeader title="Schools" subtitle="Every school on the platform. Schools sign up themselves from the Register page." />
      <Card>
        <div className="relative mb-4"><Search className="absolute top-3 left-3.5 h-4 w-4 text-muted" /><Input className="pl-10" placeholder="Search schools" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <Async data={data} error={error}>
          {(list) => <SchoolsTable schools={list.filter((s) => `${s.name} ${s.address ?? ""} ${s.slug}`.toLowerCase().includes(q.trim().toLowerCase()))} />}
        </Async>
      </Card>
    </>
  );
}
