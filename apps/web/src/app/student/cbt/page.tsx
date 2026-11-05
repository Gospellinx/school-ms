import Link from "next/link";
import { Clock, FileQuestion } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/widgets/status-badge";
import { buttonClass } from "@/components/ui/button";
import { cbtTests } from "@/lib/mock";

export const metadata = { title: "CBT Tests" };

export default function Cbt() {
  return (
    <>
      <PageHeader title="CBT Tests" subtitle="Tests from your teachers and practice mocks." actions={<Link href="/student/cbt/take" className={buttonClass()}>Start a practice mock</Link>} />
      <div className="grid gap-5 md:grid-cols-2">
        {cbtTests.map((t) => (
          <Card key={t.title}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold text-brand-600 uppercase">{t.subject}</p>
                <h3 className="mt-1 text-lg font-semibold">{t.title}</h3>
              </div>
              <StatusBadge status={t.status} />
            </div>
            <div className="mt-4 flex flex-wrap gap-4 text-sm text-muted">
              <span className="flex items-center gap-1.5"><FileQuestion className="h-4 w-4" /> {t.questions} questions</span>
              <span className="flex items-center gap-1.5"><Clock className="h-4 w-4" /> {t.minutes} minutes</span>
              <span>Due {t.due}</span>
            </div>
            <div className="mt-5 flex items-center justify-between border-t border-line pt-4">
              {t.score !== null ? (
                <span className="text-sm">Your score <strong className="text-lg">{t.score}%</strong></span>
              ) : (
                <span className="text-sm text-muted">One attempt allowed</span>
              )}
              {t.status === "Open" ? (
                <Link href="/student/cbt/take" className={buttonClass("primary", "sm")}>Start test</Link>
              ) : (
                <span className={buttonClass("secondary", "sm")}>Review answers</span>
              )}
            </div>
          </Card>
        ))}
      </div>
    </>
  );
}
