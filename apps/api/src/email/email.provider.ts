import { Injectable, Logger } from '@nestjs/common';
import { config } from '../common/config';

export interface OutboundEmail {
  to: string;
  subject: string;
  text: string;
  html: string;
  /** Replies go to the school, not the sending address. */
  replyTo?: string;
  /** Shown as the sender name, e.g. "Grace of Christ International School". */
  fromName?: string;
}

/** Sends one email. Swap implementations with EMAIL_PROVIDER. */
export abstract class EmailProvider {
  abstract send(email: OutboundEmail): Promise<{ providerRef?: string }>;
}

/** Puts the school's name in front of the platform's sending address. */
export function fromHeader(fromName: string | undefined): string {
  const from = config.email().from;
  if (!fromName) return from;
  const address = from.match(/<([^>]+)>/)?.[1] ?? from;
  return `${fromName.replace(/["<>]/g, '')} <${address}>`;
}

/** Resend (https://resend.com/docs/api-reference/emails/send-email). Needs RESEND_API_KEY and a verified EMAIL_FROM domain. */
export class ResendProvider extends EmailProvider {
  async send(e: OutboundEmail) {
    const { resendApiKey } = config.email();
    if (!resendApiKey) throw new Error('RESEND_API_KEY is not set');
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${resendApiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: fromHeader(e.fromName),
        to: [e.to],
        subject: e.subject,
        text: e.text,
        html: e.html,
        reply_to: e.replyTo,
      }),
    });
    const data = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
    if (!res.ok) throw new Error(`Resend ${res.status}: ${data.message ?? 'send failed'}`);
    return { providerRef: data.id };
  }
}

/** Development and test provider: keeps emails in memory and logs them instead of sending. */
@Injectable()
export class LogEmailProvider extends EmailProvider {
  private readonly logger = new Logger('Email');
  readonly sent: OutboundEmail[] = [];

  async send(e: OutboundEmail) {
    this.sent.push(e);
    if (process.env.NODE_ENV !== 'test' && !process.env.VITEST) this.logger.log(`to ${e.to}: ${e.subject}\n${e.text}`);
    return { providerRef: `log-email-${this.sent.length}` };
  }
}

export function emailProviderFactory(): EmailProvider {
  if (config.email().provider === 'resend') return new ResendProvider();
  if (process.env.NODE_ENV === 'production') {
    new Logger('Email').warn('No email provider set (RESEND_API_KEY): admissions emails are only logged, not sent');
  }
  return new LogEmailProvider();
}
