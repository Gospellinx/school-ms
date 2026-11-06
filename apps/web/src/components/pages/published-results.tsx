"use client";
import * as React from "react";
import { Printer } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { Async, Empty, ErrorNote } from "@/components/ui/feedback";
import { useApi } from "@/lib/api";
import { ReportCardSheet } from "@/components/pages/report-card";
import type { PublishedTerm, ReportCard } from "@/lib/types";

/**
 * Released report cards for one student. `base` is the API path that lists the published terms;
 * `${base}/${termId}` returns the report card.
 */
export function PublishedResults({ base, title, subtitle, picker }: { base: string; title: string; subtitle?: string; picker?: React.ReactNode }) {
  const terms = useApi<PublishedTerm[]>(base);
  const [termId, setTermId] = React.useState("");
  React.useEffect(() => {
    setTermId("");
  }, [base]);
  React.useEffect(() => {
    if (!termId && terms.data?.length) setTermId(terms.data[0]!.id);
  }, [terms.data, termId]);
  const rc = useApi<ReportCard>(termId ? `${base}/${termId}` : null);

  return (
    <>
      <PageHeader
        title={title}
        subtitle={subtitle}
        actions={
          <>
            {picker}
            {terms.data?.length ? (
              <Select value={termId} onChange={(e) => setTermId(e.target.value)} aria-label="Term">
                {terms.data.map((t) => <option key={t.id} value={t.id}>{t.name} {t.session}</option>)}
              </Select>
            ) : null}
            {rc.data ? <Button variant="outline" onClick={() => window.print()}><Printer className="h-4 w-4" /> Print</Button> : null}
          </>
        }
      />
      <Async data={terms.data} error={terms.error}>
        {(list) =>
          list.length === 0 ? (
            <Card><Empty title="No results released yet">Report cards show here as soon as the school publishes them.</Empty></Card>
          ) : rc.error ? (
            <ErrorNote>{rc.error}</ErrorNote>
          ) : (
            <Async data={rc.data} error={null} loadingLabel="Loading report card…">
              {(r) => <ReportCardSheet rc={r} />}
            </Async>
          )
        }
      </Async>
    </>
  );
}
