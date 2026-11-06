import { Body, Controller, Delete, Get, Headers, HttpCode, Param, Post, Query, Req, UnauthorizedException } from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import { z } from 'zod';
import { Principal } from '../auth/auth.types';
import { CurrentUser, LEADERSHIP, Public, Roles } from '../auth/decorators';
import { parse, uuidParam } from '../common/validation';
import { AdmissionsService } from '../admissions/admissions.service';
import { FeesService } from './fees.service';
import { PaystackClient } from './paystack.client';

/** Amounts are in kobo (₦1 = 100 kobo), the unit Paystack uses. */
const kobo = z.number().int().positive();

const feeItemSchema = z.object({
  termId: z.string().uuid(),
  name: z.string().min(1).max(80),
  amountKobo: kobo,
  sectionId: z.string().uuid().optional(),
  classId: z.string().uuid().optional(),
});

const generateSchema = z.object({ classId: z.string().uuid().optional() });

const listSchema = z.object({
  classId: z.string().uuid().optional(),
  /** Comma-separated: unpaid, part_paid, paid */
  status: z
    .string()
    .optional()
    .transform((v) => (v ? v.split(',') : undefined))
    .pipe(z.array(z.enum(['unpaid', 'part_paid', 'paid'])).optional()),
});

const manualSchema = z.object({
  amountKobo: kobo,
  method: z.enum(['cash', 'bank_transfer', 'pos']),
  note: z.string().max(200).optional(),
  paidAt: z.string().datetime({ offset: true }).optional(),
});

const paystackStartSchema = z.object({ amountKobo: kobo.optional(), email: z.string().email().optional() });

const subaccountSchema = z.object({
  bankCode: z.string().min(2),
  accountNumber: z.string().regex(/^\d{10}$/, 'NUBAN account numbers have 10 digits'),
  businessName: z.string().min(2).optional(),
  /** The platform's share of each payment, in percent. */
  percentageCharge: z.number().min(0).max(100).default(0),
});

const remindersSchema = z.object({ classId: z.string().uuid().optional() });

@Controller()
export class FeesController {
  constructor(
    private readonly fees: FeesService,
    private readonly paystack: PaystackClient,
    private readonly admissions: AdmissionsService,
  ) {}

  @Roles(...LEADERSHIP)
  @Post('fees/items')
  createItem(@CurrentUser() u: Principal, @Body() body: unknown) {
    return this.fees.createFeeItem(u, parse(feeItemSchema, body));
  }

  @Roles(...LEADERSHIP)
  @Get('terms/:termId/fees/items')
  listItems(@CurrentUser() u: Principal, @Param('termId') t: string) {
    return this.fees.listFeeItems(u, parse(uuidParam, t));
  }

  @Roles(...LEADERSHIP)
  @Delete('fees/items/:id')
  deleteItem(@CurrentUser() u: Principal, @Param('id') id: string) {
    return this.fees.deleteFeeItem(u, parse(uuidParam, id));
  }

  @Roles(...LEADERSHIP)
  @Post('terms/:termId/invoices/generate')
  generate(@CurrentUser() u: Principal, @Param('termId') t: string, @Body() body: unknown) {
    return this.fees.generateInvoices(u, parse(uuidParam, t), parse(generateSchema, body ?? {}).classId);
  }

  @Roles(...LEADERSHIP)
  @Get('terms/:termId/invoices')
  list(@CurrentUser() u: Principal, @Param('termId') t: string, @Query() q: unknown) {
    return this.fees.listInvoices(u.schoolId, parse(uuidParam, t), parse(listSchema, q));
  }

  @Roles(...LEADERSHIP)
  @Get('terms/:termId/fees/summary')
  summary(@CurrentUser() u: Principal, @Param('termId') t: string) {
    return this.fees.summary(u, parse(uuidParam, t));
  }

  @Roles(...LEADERSHIP)
  @Post('terms/:termId/fees/reminders')
  reminders(@CurrentUser() u: Principal, @Param('termId') t: string, @Body() body: unknown) {
    return this.fees.sendReminders(u, parse(uuidParam, t), parse(remindersSchema, body ?? {}).classId);
  }

  @Roles(...LEADERSHIP)
  @Get('invoices/:id')
  get(@CurrentUser() u: Principal, @Param('id') id: string) {
    return this.fees.getInvoice(u.schoolId, parse(uuidParam, id));
  }

  @Roles(...LEADERSHIP)
  @Post('invoices/:id/payments')
  recordPayment(@CurrentUser() u: Principal, @Param('id') id: string, @Body() body: unknown) {
    return this.fees.recordManualPayment(u, parse(uuidParam, id), parse(manualSchema, body));
  }

  /** The bursar can also start an online payment, e.g. to send the link to a parent. */
  @Roles(...LEADERSHIP)
  @Post('invoices/:id/paystack')
  startPaystack(@CurrentUser() u: Principal, @Param('id') id: string, @Body() body: unknown) {
    return this.fees.startPaystack(u.schoolId, parse(uuidParam, id), parse(paystackStartSchema, body ?? {}));
  }

  @Get('payments/paystack/:reference/verify')
  verify(@CurrentUser() u: Principal, @Param('reference') reference: string) {
    return this.fees.confirmPaystack(u.schoolId, reference);
  }

  @Roles(...LEADERSHIP)
  @Get('fees/paystack/banks')
  banks() {
    return this.fees.listBanks();
  }

  /** Connects the school's bank account, so fee payments settle directly to the school. */
  @Roles('proprietor')
  @Post('fees/paystack/subaccount')
  subaccount(@CurrentUser() u: Principal, @Body() body: unknown) {
    return this.fees.createSubaccount(u, parse(subaccountSchema, body));
  }

  /** Paystack calls this after a payment. Set the URL in the Paystack dashboard: <api>/api/webhooks/paystack */
  @Public()
  @HttpCode(200)
  @Post('webhooks/paystack')
  webhook(@Req() req: RawBodyRequest<{ body: unknown }>, @Headers('x-paystack-signature') signature?: string) {
    if (!this.paystack.isValidSignature(req.rawBody, signature)) throw new UnauthorizedException('Bad signature');
    const event = req.body as Parameters<AdmissionsService['handleWebhook']>[0] & { data?: { metadata?: { purpose?: string } } };
    // One Paystack account, one webhook: admission form fees are routed to admissions.
    if (AdmissionsService.isAdmissionCharge(event)) return this.admissions.handleWebhook(event);
    return this.fees.handleWebhook(req.body as Parameters<FeesService['handleWebhook']>[0]);
  }
}
