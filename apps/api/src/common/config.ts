/** Reads optional settings from the environment. Keys for Paystack, Termii and Claude are never hard-coded. */
export const config = {
  portalUrl: () => process.env.PORTAL_URL ?? 'http://localhost:3000',
  messagingProvider: () => process.env.MESSAGING_PROVIDER ?? (process.env.TERMII_API_KEY ? 'termii' : 'log'),
  termii: () => ({
    apiKey: process.env.TERMII_API_KEY,
    senderId: process.env.TERMII_SENDER_ID ?? 'LinxSchool',
    baseUrl: process.env.TERMII_BASE_URL ?? 'https://api.ng.termii.com',
  }),
  email: () => ({
    /** brevo, resend or log (sandbox). Picks a provider from whichever key is set when left out. */
    provider: process.env.EMAIL_PROVIDER ?? (process.env.BREVO_API_KEY ? 'brevo' : process.env.RESEND_API_KEY ? 'resend' : 'log'),
    brevoApiKey: process.env.BREVO_API_KEY,
    resendApiKey: process.env.RESEND_API_KEY,
    fromAddress: process.env.EMAIL_FROM ?? 'no-reply@linxschool.ng',
    fromName: process.env.EMAIL_FROM_NAME ?? 'Linx School',
    /** When set, every email goes to this address instead: for trying real keys safely. */
    sandboxTo: process.env.EMAIL_SANDBOX_TO || undefined,
  }),
  /** How often due admissions emails (including scheduled follow-ups) are sent. 0 turns the worker off. */
  admissionsEmailPollMs: () => Number(process.env.ADMISSIONS_EMAIL_POLL_MS ?? process.env.NOTIFICATIONS_POLL_MS ?? 15000),
  /** How often the outbox worker sends queued SMS and WhatsApp messages. 0 turns the worker off. */
  notificationsPollMs: () => Number(process.env.NOTIFICATIONS_POLL_MS ?? 5000),
  paystack: () => ({
    secretKey: process.env.PAYSTACK_SECRET_KEY,
    baseUrl: process.env.PAYSTACK_BASE_URL ?? 'https://api.paystack.co',
    callbackUrl: process.env.PAYSTACK_CALLBACK_URL,
    /** Who pays Paystack's charges on split payments: the school's subaccount, or the platform account. */
    feeBearer: (process.env.PAYSTACK_FEE_BEARER ?? 'subaccount') as 'account' | 'subaccount',
    /** Paystack needs an email; parents without one get <guardianId>@<this domain>. */
    fallbackEmailDomain: process.env.PAYSTACK_FALLBACK_EMAIL_DOMAIN ?? 'parents.linxschool.ng',
  }),
  ai: () => ({
    apiKey: process.env.ANTHROPIC_API_KEY,
    model: process.env.AI_MODEL ?? 'claude-opus-5-5',
    /** Model for the student tutor chat, the busiest feature. Defaults to AI_MODEL. */
    tutorModel: process.env.AI_TUTOR_MODEL ?? process.env.AI_MODEL ?? 'claude-opus-5-5',
    dailyLimitPerStudent: Number(process.env.AI_DAILY_LIMIT_PER_STUDENT ?? 30),
  }),
  /** Largest file a teacher can add to the knowledge base. */
  kbMaxUploadBytes: () => Number(process.env.KB_MAX_UPLOAD_MB ?? 15) * 1024 * 1024,
  /** Naira per US dollar, only for showing AI spend in naira. */
  usdToNgn: () => Number(process.env.USD_NGN_RATE ?? 1500),
};

/** List prices in US dollars per million tokens (input, output). Unknown models are priced as Opus. */
const PRICES: [prefix: string, input: number, output: number][] = [
  ['claude-fable-5', 10, 50],
  ['claude-opus-5-5', 4, 20],
  ['claude-opus', 5, 25],
  ['claude-sonnet-5', 2, 10],
  ['claude-sonnet', 3, 15],
  ['claude-haiku-5-5', 0.1, 0.5],
  ['claude-haiku', 1, 5],
];

/** Estimated cost of one call in millionths of a dollar ($ per million tokens x tokens). */
export function costMicroUsd(model: string, inputTokens: number, outputTokens: number): number {
  const [, inp, out] = PRICES.find(([p]) => model.startsWith(p)) ?? ['', 5, 25];
  return Math.round(inputTokens * inp + outputTokens * out);
}
