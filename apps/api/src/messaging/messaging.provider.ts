import { Injectable, Logger } from '@nestjs/common';
import { config } from '../common/config';

export type Channel = 'sms' | 'whatsapp';

export interface OutboundMessage {
  channel: Channel;
  /** International form without the plus sign, e.g. 2348031234567. */
  to: string;
  body: string;
  /** Transactional messages (login codes) use Termii's DND route so they reach numbers on Do-Not-Disturb. */
  transactional?: boolean;
}

/** Sends one SMS or WhatsApp message. Swap implementations with MESSAGING_PROVIDER. */
export abstract class MessagingProvider {
  abstract send(message: OutboundMessage): Promise<{ providerRef?: string }>;
}

/**
 * Termii (https://developers.termii.com): Nigerian SMS gateway that also sends WhatsApp
 * through the same endpoint. Needs TERMII_API_KEY and an approved TERMII_SENDER_ID.
 */
export class TermiiProvider extends MessagingProvider {
  async send(m: OutboundMessage) {
    const { apiKey, senderId, baseUrl } = config.termii();
    if (!apiKey) throw new Error('TERMII_API_KEY is not set');
    const res = await fetch(`${baseUrl}/api/sms/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: apiKey,
        to: m.to,
        from: senderId,
        sms: m.body,
        type: 'plain',
        channel: m.channel === 'whatsapp' ? 'whatsapp' : m.transactional ? 'dnd' : 'generic',
      }),
    });
    const data = (await res.json().catch(() => ({}))) as { message_id?: string; message?: string };
    if (!res.ok) throw new Error(`Termii ${res.status}: ${data.message ?? 'send failed'}`);
    return { providerRef: data.message_id };
  }
}

/** Development and test provider: keeps messages in memory and logs them instead of sending. */
@Injectable()
export class LogProvider extends MessagingProvider {
  private readonly logger = new Logger('Messages');
  readonly sent: OutboundMessage[] = [];

  async send(m: OutboundMessage) {
    this.sent.push(m);
    if (process.env.NODE_ENV !== 'test' && !process.env.VITEST) this.logger.log(`[${m.channel}] to ${m.to}: ${m.body}`);
    return { providerRef: `log-${this.sent.length}` };
  }
}

export function messagingProviderFactory(): MessagingProvider {
  if (config.messagingProvider() === 'termii') return new TermiiProvider();
  if (process.env.NODE_ENV === 'production') {
    new Logger('Messages').warn('No SMS provider set (TERMII_API_KEY): parent messages and login codes are only logged, not sent');
  }
  return new LogProvider();
}
