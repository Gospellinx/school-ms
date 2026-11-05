/** Reads optional settings from the environment. Keys for Paystack, Termii and Claude are never hard-coded. */
export const config = {
  portalUrl: () => process.env.PORTAL_URL ?? 'http://localhost:3000',
  messagingProvider: () => process.env.MESSAGING_PROVIDER ?? (process.env.TERMII_API_KEY ? 'termii' : 'log'),
  termii: () => ({
    apiKey: process.env.TERMII_API_KEY,
    senderId: process.env.TERMII_SENDER_ID ?? 'LinxSchool',
    baseUrl: process.env.TERMII_BASE_URL ?? 'https://api.ng.termii.com',
  }),
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
    dailyLimitPerStudent: Number(process.env.AI_DAILY_LIMIT_PER_STUDENT ?? 30),
  }),
};
