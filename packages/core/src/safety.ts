/**
 * First-line safety check on what a child types into the AI tutor, before anything is sent
 * to the model. It is deliberately simple and errs towards flagging: a flagged message gets a
 * caring, fixed reply and is shown to the school's leadership, never silently dropped.
 * The model's own instructions are the second line.
 */

export type SafetyCategory = 'safeguarding' | 'inappropriate' | 'personal_info';

export interface SafetyResult {
  category: SafetyCategory | null;
  /** Message with phone numbers and email addresses masked, safe to store and send. */
  cleaned: string;
}

const SAFEGUARDING = [
  /\b(kill|hurt|harm|cut)\s+(my ?self|myself)\b/i,
  /\b(suicide|suicidal)\b/i,
  /\bwant\s+to\s+die\b/i,
  /\b(end|take)\s+my\s+(own\s+)?life\b/i,
  /\bno\s+reason\s+to\s+live\b/i,
  /\b(he|she|they|someone|uncle|teacher|man|woman)\s+(touched|touches|touch)\s+me\b/i,
  /\b(being|been|am|was)\s+(abused|molested|raped)\b/i,
  /\b(beats?|beating|flogs?)\s+me\s+(every|always|badly)\b/i,
  /\b(being|am|was)\s+bullied\b/i,
];

const INAPPROPRIATE = [
  /\b(porn|pornography|nude|nudes|naked\s+pictures?|sex\s*chat)\b/i,
  /\b(make|build|buy)\s+(a\s+)?(bomb|gun|explosive)s?\b/i,
  /\b(buy|smoke|sell)\s+(weed|igbo|cocaine|codeine|tramadol)\b/i,
  /\byahoo\s*(boy|plus)\b/i,
];

const PHONE = /(?:\+?234|0)[789][01]\d[\s-]?\d{3}[\s-]?\d{4}\b/g;
const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;

export function screenStudentMessage(text: string): SafetyResult {
  let category: SafetyCategory | null = null;
  if (SAFEGUARDING.some((r) => r.test(text))) category = 'safeguarding';
  else if (INAPPROPRIATE.some((r) => r.test(text))) category = 'inappropriate';
  const cleaned = text.replace(PHONE, '[number removed]').replace(EMAIL, '[email removed]');
  if (!category && cleaned !== text) category = 'personal_info';
  return { category, cleaned };
}

/** Fixed replies for flagged messages. Warm, short, and pointing to a trusted adult. */
export const SAFETY_REPLIES: Record<SafetyCategory, string> = {
  safeguarding:
    'Thank you for telling me. What you are going through matters, and you do not have to face it alone. ' +
    'Please talk to an adult you trust today: a parent, your form teacher, the school counsellor or your principal. ' +
    'If you are in danger right now, tell the nearest adult or call 112. ' +
    'I have let your school know you might need someone to talk to. When you are ready, I am here to help with your studies.',
  inappropriate:
    'I can only help with your school subjects and exam preparation. Let’s get back to your studies. Which topic shall we work on?',
  personal_info:
    'Please do not share phone numbers, email addresses or other personal details here. I removed them to keep you safe. ' +
    'Now, how can I help with your studies?',
};
