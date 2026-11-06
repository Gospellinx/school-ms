import { ReportCardView } from "@/components/pages/report-card";

export const metadata = { title: "My Results" };
export default function Page() {
  return <ReportCardView backHref="/student" />;
}
