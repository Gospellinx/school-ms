import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { formatNaira, invoiceStatus } from '@school-ms/core';
import { and, asc, eq, inArray, isNotNull, or, sql } from 'drizzle-orm';
import { randomBytes } from 'node:crypto';
import { Principal } from '../auth/auth.types';
import { config } from '../common/config';
import { assertOwned } from '../common/owned';
import { found } from '../common/validation';
import { Tx } from '../db/client';
import { DbService } from '../db/db.service';
import {
  academicSessions,
  classes,
  feeItems,
  guardians,
  invoiceLines,
  invoices,
  payments,
  schools,
  sections,
  students,
  terms,
} from '../db/schema';
import { NotificationsService } from '../messaging/notifications.service';
import { planFor } from '../autopilot/plans';
import { PaystackClient, PaystackTransaction } from './paystack.client';

export interface FeeItemInput {
  termId: string;
  name: string;
  amountKobo: number;
  sectionId?: string;
  classId?: string;
}

type Invoice = typeof invoices.$inferSelect;

function newReference(): string {
  return `LNX-${Date.now().toString(36).toUpperCase()}-${randomBytes(4).toString('hex').toUpperCase()}`;
}

@Injectable()
export class FeesService {
  private readonly logger = new Logger(FeesService.name);

  constructor(
    private readonly dbs: DbService,
    private readonly paystack: PaystackClient,
    private readonly notifications: NotificationsService,
  ) {}

  // ------------------------------------------------------------ Fee structure

  createFeeItem(user: Principal, input: FeeItemInput) {
    if (input.sectionId && input.classId) throw new BadRequestException('Give a section or a class, not both');
    return this.dbs.withSchool(user.schoolId, async (tx) => {
      await assertOwned(tx, terms, input.termId, 'Term');
      if (input.sectionId) await assertOwned(tx, sections, input.sectionId, 'Section');
      if (input.classId) await assertOwned(tx, classes, input.classId, 'Class');
      const [row] = await tx.insert(feeItems).values({ ...input, schoolId: user.schoolId }).returning();
      return row;
    });
  }

  listFeeItems(user: Principal, termId: string) {
    return this.dbs.withSchool(user.schoolId, (tx) =>
      tx.select().from(feeItems).where(eq(feeItems.termId, termId)).orderBy(asc(feeItems.createdAt)),
    );
  }

  deleteFeeItem(user: Principal, id: string) {
    return this.dbs.withSchool(user.schoolId, async (tx) => {
      const [row] = await tx.delete(feeItems).where(eq(feeItems.id, id)).returning();
      found(row, 'Fee item');
      return { deleted: true };
    });
  }

  // ------------------------------------------------------------ Invoices

  /**
   * Builds each student's term bill from the fee items that apply to them (school-wide,
   * their section, or their class). Safe to run again after changing fees: bills with no
   * payments yet are rebuilt, bills already part-paid are left alone and reported.
   */
  generateInvoices(user: Principal, termId: string, classId?: string) {
    return this.dbs.withSchool(user.schoolId, async (tx) => {
      const [term] = await tx
        .select({ term: terms, session: academicSessions })
        .from(terms)
        .innerJoin(academicSessions, eq(academicSessions.id, terms.sessionId))
        .where(eq(terms.id, termId));
      found(term, 'Term');
      if (classId) await assertOwned(tx, classes, classId, 'Class');

      const items = await tx.select().from(feeItems).where(eq(feeItems.termId, termId));
      if (items.length === 0) throw new BadRequestException('Add fee items for this term first');
      const roster = await tx
        .select({ student: students, sectionId: classes.sectionId })
        .from(students)
        .innerJoin(classes, eq(classes.id, students.classId))
        .where(classId ? eq(students.classId, classId) : isNotNull(students.classId));
      const existing = await tx.select().from(invoices).where(eq(invoices.termId, termId));
      const byStudent = new Map(existing.map((i) => [i.studentId, i]));

      let created = 0;
      let updated = 0;
      const locked: string[] = [];
      for (const { student, sectionId } of roster) {
        const lines = items.filter(
          (i) => i.classId === student.classId || (!i.classId && (!i.sectionId || i.sectionId === sectionId)),
        );
        const total = lines.reduce((s, l) => s + l.amountKobo, 0);
        if (total === 0) continue;
        const current = byStudent.get(student.id);
        if (current && current.paidKobo > 0) {
          if (current.totalKobo !== total) locked.push(student.admissionNumber);
          continue;
        }
        let invoiceId: string;
        if (current) {
          await tx.delete(invoiceLines).where(eq(invoiceLines.invoiceId, current.id));
          await tx.update(invoices).set({ totalKobo: total, updatedAt: new Date() }).where(eq(invoices.id, current.id));
          invoiceId = current.id;
          updated++;
        } else {
          const [inv] = await tx
            .insert(invoices)
            .values({
              schoolId: user.schoolId,
              termId,
              studentId: student.id,
              number: `${term.session.name}-T${term.term.number}-${student.admissionNumber}`,
              totalKobo: total,
            })
            .returning();
          invoiceId = inv.id;
          created++;
        }
        await tx.insert(invoiceLines).values(
          lines.map((l) => ({ schoolId: user.schoolId, invoiceId, feeItemId: l.id, name: l.name, amountKobo: l.amountKobo })),
        );
      }
      return { created, updated, lockedBecausePaid: locked };
    });
  }

  listInvoices(schoolId: string, termId: string, filter: { classId?: string; status?: Invoice['status'][] }) {
    return this.dbs.withSchool(schoolId, async (tx) => {
      const rows = await tx
        .select({ invoice: invoices, student: students })
        .from(invoices)
        .innerJoin(students, eq(students.id, invoices.studentId))
        .where(
          and(
            eq(invoices.termId, termId),
            filter.classId ? eq(students.classId, filter.classId) : undefined,
            filter.status?.length ? inArray(invoices.status, filter.status) : undefined,
          ),
        )
        .orderBy(asc(students.lastName), asc(students.firstName));
      return rows.map((r) => ({
        ...r.invoice,
        balanceKobo: r.invoice.totalKobo - r.invoice.paidKobo,
        student: { id: r.student.id, name: `${r.student.lastName} ${r.student.firstName}`, admissionNumber: r.student.admissionNumber, classId: r.student.classId },
      }));
    });
  }

  async invoiceDetail(tx: Tx, invoiceId: string) {
    const [row] = await tx
      .select({ invoice: invoices, student: students, term: terms, session: academicSessions })
      .from(invoices)
      .innerJoin(students, eq(students.id, invoices.studentId))
      .innerJoin(terms, eq(terms.id, invoices.termId))
      .innerJoin(academicSessions, eq(academicSessions.id, terms.sessionId))
      .where(eq(invoices.id, invoiceId));
    found(row, 'Invoice');
    const lines = await tx.select().from(invoiceLines).where(eq(invoiceLines.invoiceId, invoiceId));
    const paid = await tx
      .select({
        id: payments.id,
        amountKobo: payments.amountKobo,
        method: payments.method,
        status: payments.status,
        reference: payments.reference,
        channel: payments.channel,
        paidAt: payments.paidAt,
        createdAt: payments.createdAt,
      })
      .from(payments)
      .where(eq(payments.invoiceId, invoiceId))
      .orderBy(asc(payments.createdAt));
    return {
      ...row.invoice,
      balanceKobo: row.invoice.totalKobo - row.invoice.paidKobo,
      term: row.term.name,
      session: row.session.name,
      student: { id: row.student.id, name: `${row.student.lastName} ${row.student.firstName}`, admissionNumber: row.student.admissionNumber },
      lines,
      payments: paid,
      plan: await planFor(tx, invoiceId, row.invoice.paidKobo),
    };
  }

  getInvoice(schoolId: string, invoiceId: string) {
    return this.dbs.withSchool(schoolId, (tx) => this.invoiceDetail(tx, invoiceId));
  }

  /** Totals for the bursar: expected, collected and outstanding, overall and per class. */
  summary(user: Principal, termId: string) {
    return this.dbs.withSchool(user.schoolId, async (tx) => {
      await assertOwned(tx, terms, termId, 'Term');
      const rows = await tx
        .select({
          classId: classes.id,
          className: classes.name,
          arm: classes.arm,
          invoices: sql<number>`count(*)::int`,
          expectedKobo: sql<number>`coalesce(sum(${invoices.totalKobo}), 0)::bigint`,
          collectedKobo: sql<number>`coalesce(sum(${invoices.paidKobo}), 0)::bigint`,
          paid: sql<number>`count(*) filter (where ${invoices.status} = 'paid')::int`,
          partPaid: sql<number>`count(*) filter (where ${invoices.status} = 'part_paid')::int`,
          unpaid: sql<number>`count(*) filter (where ${invoices.status} = 'unpaid')::int`,
        })
        .from(invoices)
        .innerJoin(students, eq(students.id, invoices.studentId))
        .leftJoin(classes, eq(classes.id, students.classId))
        .where(eq(invoices.termId, termId))
        .groupBy(classes.id, classes.name, classes.arm)
        .orderBy(asc(classes.name), asc(classes.arm));
      const byClass = rows.map((r) => ({
        ...r,
        expectedKobo: Number(r.expectedKobo),
        collectedKobo: Number(r.collectedKobo),
        outstandingKobo: Number(r.expectedKobo) - Number(r.collectedKobo),
      }));
      const sum = (k: 'expectedKobo' | 'collectedKobo' | 'outstandingKobo' | 'paid' | 'partPaid' | 'unpaid' | 'invoices') =>
        byClass.reduce((s, r) => s + Number(r[k]), 0);
      return {
        expectedKobo: sum('expectedKobo'),
        collectedKobo: sum('collectedKobo'),
        outstandingKobo: sum('outstandingKobo'),
        invoices: sum('invoices'),
        paid: sum('paid'),
        partPaid: sum('partPaid'),
        unpaid: sum('unpaid'),
        byClass,
      };
    });
  }

  /** Total still owed by a student for a term (0 when there is no bill). */
  async balanceFor(tx: Tx, termId: string, studentId: string): Promise<number> {
    const [inv] = await tx.select().from(invoices).where(and(eq(invoices.termId, termId), eq(invoices.studentId, studentId)));
    return inv ? Math.max(0, inv.totalKobo - inv.paidKobo) : 0;
  }

  // ------------------------------------------------------------ Payments

  /** Recomputes what has been paid from successful payments, so applying a payment twice is harmless. */
  private async refreshInvoice(tx: Tx, invoiceId: string) {
    const [{ paid }] = await tx
      .select({ paid: sql<number>`coalesce(sum(${payments.amountKobo}), 0)::int` })
      .from(payments)
      .where(and(eq(payments.invoiceId, invoiceId), eq(payments.status, 'success')));
    const [inv] = await tx.select().from(invoices).where(eq(invoices.id, invoiceId));
    const [updated] = await tx
      .update(invoices)
      .set({ paidKobo: paid, status: invoiceStatus(inv.totalKobo, paid), updatedAt: new Date() })
      .where(eq(invoices.id, invoiceId))
      .returning();
    return updated;
  }

  private async queueReceipt(tx: Tx, schoolId: string, invoice: Invoice, amountKobo: number) {
    const balance = Math.max(0, invoice.totalKobo - invoice.paidKobo);
    await this.notifications.queueForGuardians(
      tx,
      schoolId,
      [invoice.studentId],
      'payment_received',
      (s) =>
        `Payment of ${formatNaira(amountKobo)} received for ${s.firstName} ${s.lastName} (${invoice.number}). ` +
        (balance > 0 ? `Balance: ${formatNaira(balance)}.` : 'Fees fully paid. Thank you.'),
      { emailSubject: `Payment received: ${formatNaira(amountKobo)}` },
    );
  }

  /** Cash, bank transfer or POS payments recorded by the bursar. */
  recordManualPayment(
    user: Principal,
    invoiceId: string,
    input: { amountKobo: number; method: 'cash' | 'bank_transfer' | 'pos'; note?: string; paidAt?: string },
  ) {
    return this.dbs.withSchool(user.schoolId, async (tx) => {
      const [inv] = await tx.select().from(invoices).where(eq(invoices.id, invoiceId)).for('update');
      found(inv, 'Invoice');
      if (input.amountKobo > inv.totalKobo - inv.paidKobo) throw new BadRequestException('That is more than the balance on this bill');
      await tx.insert(payments).values({
        schoolId: user.schoolId,
        invoiceId,
        amountKobo: input.amountKobo,
        method: input.method,
        status: 'success',
        reference: newReference(),
        recordedBy: user.staffId,
        note: input.note,
        paidAt: input.paidAt ? new Date(input.paidAt) : new Date(),
      });
      const updated = await this.refreshInvoice(tx, invoiceId);
      await this.queueReceipt(tx, user.schoolId, updated, input.amountKobo);
      return this.invoiceDetail(tx, invoiceId);
    });
  }

  /**
   * Starts a Paystack checkout for all or part of a bill. Returns the URL to send the
   * payer to. Money settles into the school's Paystack subaccount when one is set up.
   */
  startPaystack(schoolId: string, invoiceId: string, opts: { amountKobo?: number; email?: string; guardianId?: string; callbackUrl?: string }) {
    return this.dbs.withSchool(schoolId, async (tx) => {
      const detail = await this.invoiceDetail(tx, invoiceId);
      const balance = detail.totalKobo - detail.paidKobo;
      if (balance <= 0) throw new BadRequestException('This bill is already fully paid');
      const amountKobo = opts.amountKobo ?? balance;
      if (amountKobo > balance) throw new BadRequestException(`You can pay at most ${formatNaira(balance)}`);
      if (amountKobo < 100_00) throw new BadRequestException('The smallest online payment is ₦100');

      const [school] = await this.dbs.db.select().from(schools).where(eq(schools.id, schoolId));
      let email = opts.email;
      if (!email && opts.guardianId) {
        const [g] = await tx.select().from(guardians).where(eq(guardians.id, opts.guardianId));
        email = g?.email ?? `${opts.guardianId}@${config.paystack().fallbackEmailDomain}`;
      }
      if (!email) email = school.email ?? `bursar+${school.slug}@${config.paystack().fallbackEmailDomain}`;

      const reference = newReference();
      const [payment] = await tx
        .insert(payments)
        .values({ schoolId, invoiceId, amountKobo, method: 'paystack', status: 'pending', reference, guardianId: opts.guardianId })
        .returning();
      const checkout = await this.paystack.initialize({
        email,
        amountKobo,
        reference,
        callbackUrl: opts.callbackUrl ?? config.paystack().callbackUrl,
        subaccount: school.paystackSubaccountCode ?? undefined,
        bearer: config.paystack().feeBearer,
        metadata: {
          school_id: schoolId,
          invoice_id: invoiceId,
          payment_id: payment.id,
          custom_fields: [
            { display_name: 'Student', variable_name: 'student', value: detail.student.name },
            { display_name: 'Bill', variable_name: 'invoice', value: detail.number },
          ],
        },
      });
      return { reference, amountKobo, authorizationUrl: checkout.authorization_url, accessCode: checkout.access_code };
    });
  }

  /**
   * Confirms a Paystack payment by asking Paystack directly (never trusting the browser),
   * then applies it to the bill. Idempotent: webhooks and the return page can both call it.
   */
  confirmPaystack(schoolId: string, reference: string) {
    return this.dbs.withSchool(schoolId, async (tx) => {
      const [payment] = await tx.select().from(payments).where(eq(payments.reference, reference)).for('update');
      if (!payment || payment.method !== 'paystack') throw new NotFoundException('Payment not found');
      if (payment.status === 'success') return { status: payment.status, invoice: await this.invoiceDetail(tx, payment.invoiceId) };

      const trx: PaystackTransaction = await this.paystack.verify(reference);
      const metaSchool = (trx.metadata as { school_id?: string } | null)?.school_id;
      let status: 'pending' | 'success' | 'failed' | 'abandoned' = 'pending';
      if (trx.status === 'success') {
        const matches = trx.amount === payment.amountKobo && trx.currency === 'NGN' && (!metaSchool || metaSchool === schoolId);
        status = matches ? 'success' : 'failed';
        if (!matches) this.logger.warn(`Paystack ${reference} does not match our record (amount ${trx.amount} ${trx.currency})`);
      } else if (trx.status === 'failed' || trx.status === 'reversed') status = 'failed';
      else if (trx.status === 'abandoned') status = 'abandoned';

      await tx
        .update(payments)
        .set({
          status,
          channel: trx.channel ?? null,
          paidAt: status === 'success' ? (trx.paid_at ? new Date(trx.paid_at) : new Date()) : null,
          providerData: { status: trx.status, amount: trx.amount, currency: trx.currency, channel: trx.channel, paid_at: trx.paid_at },
        })
        .where(eq(payments.id, payment.id));
      if (status === 'success') {
        const updated = await this.refreshInvoice(tx, payment.invoiceId);
        await this.queueReceipt(tx, schoolId, updated, payment.amountKobo);
      }
      return { status, invoice: await this.invoiceDetail(tx, payment.invoiceId) };
    });
  }

  /** Handles a verified Paystack webhook. Only charge.success matters for school fees. */
  async handleWebhook(event: { event?: string; data?: { reference?: string; metadata?: { school_id?: string } } }) {
    if (event.event !== 'charge.success' || !event.data?.reference) return { handled: false };
    const schoolId = event.data.metadata?.school_id;
    if (!schoolId || !/^[0-9a-f-]{36}$/i.test(schoolId)) return { handled: false };
    const [school] = await this.dbs.db.select({ id: schools.id }).from(schools).where(eq(schools.id, schoolId));
    if (!school) return { handled: false };
    try {
      const r = await this.confirmPaystack(schoolId, event.data.reference);
      return { handled: true, status: r.status };
    } catch (err) {
      if (err instanceof NotFoundException) return { handled: false };
      throw err;
    }
  }

  /** Texts parents of students who still owe for the term. */
  sendReminders(user: Principal, termId: string, classId?: string) {
    return this.dbs.withSchool(user.schoolId, async (tx) => {
      const [term] = await tx.select().from(terms).where(eq(terms.id, termId));
      found(term, 'Term');
      const owing = await tx
        .select({ invoice: invoices })
        .from(invoices)
        .innerJoin(students, eq(students.id, invoices.studentId))
        .where(
          and(
            eq(invoices.termId, termId),
            or(eq(invoices.status, 'unpaid'), eq(invoices.status, 'part_paid')),
            classId ? eq(students.classId, classId) : undefined,
          ),
        );
      const balances = new Map(owing.map((o) => [o.invoice.studentId, o.invoice.totalKobo - o.invoice.paidKobo]));
      const queued = await this.notifications.queueForGuardians(
        tx,
        user.schoolId,
        [...balances.keys()],
        'fee_reminder',
        (s) =>
          `Dear parent, ${s.firstName} ${s.lastName}'s ${term.name} fees balance is ${formatNaira(balances.get(s.id)!)}. ` +
          `Pay online at ${config.portalUrl()} or at the school bursary.`,
        { emailSubject: `${term.name} fees reminder` },
      );
      return { studentsOwing: balances.size, messagesQueued: queued };
    });
  }

  // ------------------------------------------------------------ School settlement account

  listBanks() {
    return this.paystack.listBanks();
  }

  async createSubaccount(
    user: Principal,
    input: { bankCode: string; accountNumber: string; businessName?: string; percentageCharge: number },
  ) {
    if (user.role !== 'proprietor') throw new ForbiddenException('Only the proprietor can set the school bank account');
    const [school] = await this.dbs.db.select().from(schools).where(eq(schools.id, user.schoolId));
    const sub = await this.paystack.createSubaccount({
      businessName: input.businessName ?? school.name,
      bankCode: input.bankCode,
      accountNumber: input.accountNumber,
      percentageCharge: input.percentageCharge,
    });
    await this.dbs.db.update(schools).set({ paystackSubaccountCode: sub.subaccount_code }).where(eq(schools.id, user.schoolId));
    return { subaccountCode: sub.subaccount_code, accountName: sub.account_name ?? null };
  }
}

