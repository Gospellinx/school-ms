import { PageHeader } from "@/components/shell/page-header";
import { ScoreSheet } from "@/components/pages/score-sheet";

export const metadata = { title: "Score Entry" };
export default function Page() {
  return (
    <>
      <PageHeader title="Score Entry" subtitle="Type scores like a spreadsheet. Totals and grades update as you type." />
      <ScoreSheet />
    </>
  );
}
