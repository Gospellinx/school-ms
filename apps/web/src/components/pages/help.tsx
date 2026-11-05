import { MessageCircle, Phone } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { buttonClass } from "@/components/ui/button";
import type { Role } from "@/lib/roles";

const faqs: Record<Role, [string, string][]> = {
  "super-admin": [["How do I onboard a new school?", "Go to Schools, then Add school. The school admin gets an SMS with their login."], ["How are school payouts made?", "Each school has a Paystack subaccount. Fees settle into the school's bank account directly."]],
  admin: [["How do I import students?", "Open Students, then Import, and upload your class list saved as CSV from Excel."], ["When can parents see results?", "Only after you publish them from Results. Parents get a WhatsApp or SMS alert."]],
  teacher: [["Can I edit scores after saving?", "Yes, until the admin publishes the results for that term."], ["How do I set a CBT test?", "Open CBT Tests, then New test. Pick questions from the bank or add your own."]],
  student: [["How does AI Exam Prep work?", "Pick a subject and topic. You get practice questions and step-by-step explanations in WAEC style."], ["Can I retake a CBT test?", "Practice tests, yes. Tests set by your teacher can be taken once."]],
  parent: [["How do I pay school fees?", "Open Fees & Payments and tap Pay now. You can pay by card, bank transfer or USSD."], ["I didn't get the result alert", "Check that your phone number with the school is correct in Account Settings."]],
};

export function HelpPage({ role }: { role: Role }) {
  return (
    <>
      <PageHeader title="Help & FAQs" subtitle="Quick answers, or talk to our team." />
      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <Card>
          <CardHeader title="Frequently asked" />
          <div className="flex flex-col gap-2">
            {faqs[role].map(([q, a]) => (
              <details key={q} className="group rounded-2xl bg-canvas p-4 open:bg-brand-50">
                <summary className="cursor-pointer list-none font-semibold">{q}</summary>
                <p className="mt-2 text-sm text-muted">{a}</p>
              </details>
            ))}
          </div>
        </Card>
        <Card className="bg-brand-600 text-white">
          <h3 className="text-lg font-semibold">Need a hand?</h3>
          <p className="mt-1 text-sm text-white/85">We reply on WhatsApp within working hours, Monday to Saturday.</p>
          <div className="mt-5 flex flex-col gap-2">
            <span className={buttonClass("white", "md", "w-full")}><MessageCircle className="h-4 w-4" /> Chat on WhatsApp</span>
            <span className={buttonClass("white", "md", "w-full bg-white/15 text-white hover:bg-white/25")}><Phone className="h-4 w-4" /> 0700 LINX HELP</span>
          </div>
        </Card>
      </div>
    </>
  );
}
