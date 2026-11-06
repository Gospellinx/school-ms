import { PageHeader } from "@/components/shell/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import type { Role } from "@/lib/roles";

const faqs: Record<Role, [string, string][]> = {
  "super-admin": [["How does a new school join?", "The school registers itself from the sign-in page (Register your school) and gets its own school code. It then appears under Schools."], ["How are school payouts made?", "Each school connects its bank account once (Paystack subaccount). Fees settle into the school's bank account directly."]],
  admin: [["How do I import students?", "Open Students, then Import CSV, and upload your class list saved as CSV from Excel. Parents' phone numbers in the same file link them as parents."], ["When can parents see results?", "Only after you publish a class's results from Results. Parents get an SMS (or WhatsApp) alert."]],
  teacher: [["Can I edit scores after saving?", "Yes. If the school has already published that class's results, parents see the change straight away, so tell the admin."], ["How do I set a CBT test?", "Open CBT Tests, then New test. Pick questions from the school's question bank, then publish it to your class."]],
  student: [["How does AI Exam Prep work?", "It looks at your own report cards and CBT answers to find your weakest subjects and topics, then builds practice sets on them. Wrong answers get explained."], ["Can I retake a CBT test?", "Practice sets, yes, as many as you like. Tests set by your teacher can be taken once."]],
  parent: [["How do I pay school fees?", "Open Fees & Payments and tap Pay online. You can pay by card, bank transfer or USSD through Paystack."], ["I didn't get the result alert", "Alerts go to the phone number the school has for you. If it has changed, ask the school office to update it."]],
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
          <p className="mt-1 text-sm text-white/85">
            {role === "parent" || role === "student"
              ? "Your school office can help with sign-in, results and fees."
              : "Contact the Linx School team through your school's account manager."}
          </p>
        </Card>
      </div>
    </>
  );
}
