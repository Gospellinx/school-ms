import { Injectable, Logger } from '@nestjs/common';
import { config } from '../common/config';

export interface OutboundEmail {
  to: string;
  subject: string;
  /** Plain text. An HTML version is built from it. */
  text: string;
  /** Shown as the sender name, e.g. the school's name. */
  fromName?: string;
  /** Replies go here, usually the school's own address. */
  replyTo?: string | null;
}

/** Sends one email. Swap implementations with EMAIL_PROVIDER (brevo, resend or log). */
export abstract class EmailProvider {
  /** True when messages only go to the log (no key set), so the school can see it is in sandbox mode. */
  abstract readonly sandbox: boolean;
  abstract readonly name: string;
  abstract send(email: OutboundEmail): Promise<{ providerRef?: string }>;
}

const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** A plain, mobile-friendly HTML email: paragraphs, clickable links and a footer naming the school. */
export function emailHtml(text: string, footer: string): string {
  const linkify = (s: string) => s.replace(/https?:\/\/[^\s<]+[^\s<.,;:!?)]/g, (u) => `<a href="${u}" style="color:#4f46e5">${u}</a>`);
  const paragraphs = text
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 14px">${linkify(escape(p)).replace(/\n/g, '<br>')}</p>`)
    .join('');
  return (
    '<!doctype html><html><body style="margin:0;background:#f5f5f7;font-family:Arial,Helvetica,sans-serif;color:#1f2937">' +
    '<div style="max-width:560px;margin:0 auto;padding:24px 16px">' +
    `<div style="background:#fff;border-radius:12px;padding:24px;font-size:15px;line-height:1.55">${paragraphs}</div>` +
    `<p style="font-size:12px;color:#6b7280;margin:14px 4px">${escape(footer)}</p>` +
    '</div></body></html>'
  );
}

function sender(e: OutboundEmail) {
  const { fromAddress, fromName } = config.email();
  return { email: fromAddress, name: e.fromName ?? fromName };
}

function recipient(to: string): string {
  return config.email().sandboxTo ?? to;
}

function footer(e: OutboundEmail) {
  return `Sent by ${e.fromName ?? config.email().fromName} through Linx School. Reply to this email to reach the school.`;
}

/**
 * Brevo (https://developers.brevo.com): works from Nigeria, accepts local cards, and the free
 * plan sends 300 emails a day, enough for a pilot school. Needs BREVO_API_KEY and a verified sender.
 */
export class BrevoEmailProvider extends EmailProvider {
  readonly sandbox = false;
  readonly name = 'brevo';

  async send(e: OutboundEmail) {
    const key = config.email().brevoApiKey;
    if (!key) throw new Error('BREVO_API_KEY is not set');
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': key, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        sender: sender(e),
        to: [{ email: recipient(e.to) }],
        replyTo: e.replyTo ? { email: e.replyTo } : undefined,
        subject: e.subject,
        textContent: e.text,
        htmlContent: emailHtml(e.text, footer(e)),
      }),
    });
    const data = (await res.json().catch(() => ({}))) as { messageId?: string; message?: string };
    if (!res.ok) throw new Error(`Brevo ${res.status}: ${data.message ?? 'send failed'}`);
    return { providerRef: data.messageId };
  }
}

/** Resend (https://resend.com): a simple alternative. Needs RESEND_API_KEY and a verified domain. */
export class ResendEmailProvider extends EmailProvider {
  readonly sandbox = false;
  readonly name = 'resend';

  async send(e: OutboundEmail) {
    const key = config.email().resendApiKey;
    if (!key) throw new Error('RESEND_API_KEY is not set');
    const from = sender(e);
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: `${from.name} <${from.email}>`,
        to: [recipient(e.to)],
        reply_to: e.replyTo ?? undefined,
        subject: e.subject,
        text: e.text,
        html: emailHtml(e.text, footer(e)),
      }),
    });
    const data = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
    if (!res.ok) throw new Error(`Resend ${res.status}: ${data.message ?? 'send failed'}`);
    return { providerRef: data.id };
  }
}

/** Sandbox: keeps emails in memory and logs them, so everything can be tried before keys exist. */
@Injectable()
export class LogEmailProvider extends EmailProvider {
  readonly sandbox = true;
  readonly name = 'sandbox';
  private readonly logger = new Logger('Email');
  readonly sent: OutboundEmail[] = [];

  async send(e: OutboundEmail) {
    this.sent.push(e);
    if (process.env.NODE_ENV !== 'test' && !process.env.VITEST) this.logger.log(`to ${e.to}: ${e.subject}`);
    return { providerRef: `log-email-${this.sent.length}` };
  }
}

export function emailProviderFactory(): EmailProvider {
  const which = config.email().provider;
  if (which === 'brevo') return new BrevoEmailProvider();
  if (which === 'resend') return new ResendEmailProvider();
  if (process.env.NODE_ENV === 'production') {
    new Logger('Email').warn('No email provider set (BREVO_API_KEY or RESEND_API_KEY): emails are only logged, not sent');
  }
  return new LogEmailProvider();
}
