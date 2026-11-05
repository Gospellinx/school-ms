import { BadGatewayException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { config } from '../common/config';

export interface InitializeParams {
  email: string;
  amountKobo: number;
  reference: string;
  callbackUrl?: string;
  subaccount?: string;
  bearer?: 'account' | 'subaccount';
  metadata: Record<string, unknown>;
}

export interface PaystackTransaction {
  status: 'success' | 'failed' | 'abandoned' | 'ongoing' | 'pending' | 'reversed' | string;
  reference: string;
  amount: number;
  currency: string;
  channel?: string;
  paid_at?: string | null;
  metadata?: Record<string, unknown> | null;
  [key: string]: unknown;
}

/**
 * Thin client for the Paystack API (https://paystack.com/docs/api). Use a test secret key
 * (sk_test_...) in development: payments go through Paystack's sandbox and no money moves.
 */
@Injectable()
export class PaystackClient {
  private key(): string {
    const key = config.paystack().secretKey;
    if (!key) throw new ServiceUnavailableException('Online payment is not set up yet (PAYSTACK_SECRET_KEY is missing)');
    return key;
  }

  private async call<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${config.paystack().baseUrl}${path}`, {
      method,
      headers: { Authorization: `Bearer ${this.key()}`, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const json = (await res.json().catch(() => ({}))) as { status?: boolean; message?: string; data?: T };
    if (!res.ok || !json.status) throw new BadGatewayException(`Paystack: ${json.message ?? res.statusText}`);
    return json.data as T;
  }

  initialize(p: InitializeParams) {
    return this.call<{ authorization_url: string; access_code: string; reference: string }>('POST', '/transaction/initialize', {
      email: p.email,
      amount: p.amountKobo,
      currency: 'NGN',
      reference: p.reference,
      callback_url: p.callbackUrl,
      subaccount: p.subaccount,
      bearer: p.subaccount ? p.bearer : undefined,
      metadata: p.metadata,
    });
  }

  verify(reference: string) {
    return this.call<PaystackTransaction>('GET', `/transaction/verify/${encodeURIComponent(reference)}`);
  }

  listBanks() {
    return this.call<{ name: string; code: string; slug: string }[]>('GET', '/bank?country=nigeria&perPage=100');
  }

  /** Creates the subaccount a school's fees settle into. percentageCharge is the platform's share. */
  createSubaccount(p: { businessName: string; bankCode: string; accountNumber: string; percentageCharge: number }) {
    return this.call<{ subaccount_code: string; account_name?: string; settlement_bank: string }>('POST', '/subaccount', {
      business_name: p.businessName,
      settlement_bank: p.bankCode,
      account_number: p.accountNumber,
      percentage_charge: p.percentageCharge,
    });
  }

  /** Paystack signs webhooks with HMAC-SHA512 of the raw body using the secret key. */
  isValidSignature(rawBody: Buffer | undefined, signature: string | undefined): boolean {
    const key = config.paystack().secretKey;
    if (!key || !rawBody || !signature) return false;
    const expected = createHmac('sha512', key).update(rawBody).digest('hex');
    const a = Buffer.from(expected);
    const b = Buffer.from(signature);
    return a.length === b.length && timingSafeEqual(a, b);
  }
}
