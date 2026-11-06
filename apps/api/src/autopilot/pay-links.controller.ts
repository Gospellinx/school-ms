import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Post } from '@nestjs/common';
import { asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { Public } from '../auth/decorators';
import { config } from '../common/config';
import { parse } from '../common/validation';
import { DbService } from '../db/db.service';
import { guardians, invoices, payLinks, payments, schools, studentGuardians, students, terms } from '../db/schema';
import { FeesService } from '../fees/fees.service';
import { planFor } from './plans';

const token = z.string().regex(/^[A-Za-z0-9_-]{8,32}$/, 'Not a valid payment link');
const checkoutSchema = z.object({ option: z.enum(['due', 'full']).default('due') });

/**
 * The pay links in fee reminders (<portal>/pay/<token>). Anyone holding the link can see a
 * short summary of the bill and pay it; nothing else about the child is shown.
 */
@Public()
@Controller('pay-links')
export class PayLinksController {
  constructor(
    private readonly dbs: DbService,
    private readonly fees: FeesService,
  ) {}

  private async link(t: string) {
    const [row] = await this.dbs.db.select().from(payLinks).where(eq(payLinks.token, parse(token, t)));
    if (!row) throw new NotFoundException('This payment link is not valid. Please ask the school for a new one.');
    return row;
  }

  /** What is owed now: the overdue or next instalment on a plan, otherwise the whole balance. */
  private async bill(schoolId: string, invoiceId: string) {
    return this.dbs.withSchool(schoolId, async (tx) => {
      const [row] = await tx
        .select({ invoice: invoices, student: students, term: terms })
        .from(invoices)
        .innerJoin(students, eq(students.id, invoices.studentId))
        .innerJoin(terms, eq(terms.id, invoices.termId))
        .where(eq(invoices.id, invoiceId));
      if (!row) throw new NotFoundException('This bill no longer exists');
      const balanceKobo = row.invoice.totalKobo - row.invoice.paidKobo;
      const plan = await planFor(tx, invoiceId, row.invoice.paidKobo);
      const p = plan?.progress;
      const dueKobo = p ? (p.behindKobo > 0 ? p.behindKobo : (p.next?.outstandingKobo ?? balanceKobo)) : balanceKobo;
      const [payer] = await tx
        .select({ id: guardians.id })
        .from(studentGuardians)
        .innerJoin(guardians, eq(guardians.id, studentGuardians.guardianId))
        .where(eq(studentGuardians.studentId, row.student.id))
        .orderBy(asc(guardians.email))
        .limit(1);
      return {
        invoice: row.invoice,
        payerId: payer?.id,
        view: {
          student: `${row.student.firstName} ${row.student.lastName.charAt(0)}.`,
          term: row.term.name,
          totalKobo: row.invoice.totalKobo,
          paidKobo: row.invoice.paidKobo,
          balanceKobo,
          amountDueKobo: Math.min(dueKobo, balanceKobo),
          plan: plan ? { schedule: plan.schedule, onTrack: p!.onTrack, next: p!.next } : null,
        },
      };
    });
  }

  @Get(':token')
  async show(@Param('token') t: string) {
    const link = await this.link(t);
    const [school] = await this.dbs.db.select({ name: schools.name, phone: schools.phone }).from(schools).where(eq(schools.id, link.schoolId));
    const { view } = await this.bill(link.schoolId, link.invoiceId);
    return { school, ...view };
  }

  /** Starts a Paystack checkout and returns its URL. Paystack sends the payer back to <portal>/pay/<token>/done. */
  @Post(':token/checkout')
  async checkout(@Param('token') t: string, @Body() body: unknown) {
    const link = await this.link(t);
    const { option } = parse(checkoutSchema, body ?? {});
    const { view, payerId } = await this.bill(link.schoolId, link.invoiceId);
    if (view.balanceKobo <= 0) throw new BadRequestException('This bill is already fully paid. Thank you!');
    const amountKobo = option === 'full' ? view.balanceKobo : view.amountDueKobo;
    return this.fees.startPaystack(link.schoolId, link.invoiceId, {
      amountKobo,
      guardianId: payerId,
      callbackUrl: `${config.portalUrl()}/pay/${link.token}/done`,
    });
  }

  /** Confirms a payment made through this link, asking Paystack directly. */
  @Get(':token/payments/:reference')
  async verify(@Param('token') t: string, @Param('reference') reference: string) {
    const link = await this.link(t);
    const [payment] = await this.dbs.withSchool(link.schoolId, (tx) =>
      tx.select({ invoiceId: payments.invoiceId }).from(payments).where(eq(payments.reference, reference)),
    );
    if (!payment || payment.invoiceId !== link.invoiceId) throw new NotFoundException('Payment not found');
    const r = await this.fees.confirmPaystack(link.schoolId, reference);
    const { view } = await this.bill(link.schoolId, link.invoiceId);
    return { status: r.status, amountKobo: r.invoice.payments.find((p) => p.reference === reference)?.amountKobo ?? null, ...view };
  }
}
