import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { and, asc, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { AttendanceService } from '../attendance/attendance.service';
import { ParentPrincipal } from '../auth/auth.types';
import { CurrentUser, ForAudience } from '../auth/decorators';
import { todayInLagos } from '../common/access';
import { found, parse, uuidParam } from '../common/validation';
import { DbService } from '../db/db.service';
import { classes, guardians, invoices, notifications, schools, studentGuardians, students } from '../db/schema';
import { FeesService } from '../fees/fees.service';
import { PortalResultsService } from './portal-results.service';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');
const rangeSchema = z.object({ from: isoDate, to: isoDate });
const paySchema = z.object({ amountKobo: z.number().int().positive().optional() });
const prefsSchema = z.object({ preferredChannel: z.enum(['sms', 'whatsapp']) });

/** The parent portal: a parent's children, their released results, attendance and fees. */
@ForAudience('parent')
@Controller('parent')
export class ParentController {
  constructor(
    private readonly dbs: DbService,
    private readonly portal: PortalResultsService,
    private readonly attendance: AttendanceService,
    private readonly fees: FeesService,
  ) {}

  @Get('me')
  me(@CurrentUser() p: ParentPrincipal) {
    return this.dbs.withSchool(p.schoolId, async (tx) => {
      const [g] = await tx.select().from(guardians).where(eq(guardians.id, p.guardianId));
      found(g, 'Parent');
      const [school] = await this.dbs.db
        .select({ id: schools.id, name: schools.name, motto: schools.motto, phone: schools.phone })
        .from(schools)
        .where(eq(schools.id, p.schoolId));
      const children = await tx
        .select({
          id: students.id,
          firstName: students.firstName,
          lastName: students.lastName,
          admissionNumber: students.admissionNumber,
          className: classes.name,
          arm: classes.arm,
          relationship: studentGuardians.relationship,
        })
        .from(studentGuardians)
        .innerJoin(students, eq(students.id, studentGuardians.studentId))
        .leftJoin(classes, eq(classes.id, students.classId))
        .where(eq(studentGuardians.guardianId, p.guardianId))
        .orderBy(asc(students.firstName));
      return { parent: { id: g.id, fullName: g.fullName, phone: g.phone, email: g.email, preferredChannel: g.preferredChannel }, school, children };
    });
  }

  /** How the school reaches this parent: SMS or WhatsApp. */
  @Patch('me')
  updateMe(@CurrentUser() p: ParentPrincipal, @Body() body: unknown) {
    const input = parse(prefsSchema, body);
    return this.dbs.withSchool(p.schoolId, async (tx) => {
      const [g] = await tx.update(guardians).set(input).where(eq(guardians.id, p.guardianId)).returning();
      found(g, 'Parent');
      return { id: g.id, preferredChannel: g.preferredChannel };
    });
  }

  /** Messages the school has sent this parent (results, absences, receipts, notices). */
  @Get('messages')
  messages(@CurrentUser() p: ParentPrincipal) {
    return this.dbs.withSchool(p.schoolId, (tx) =>
      tx
        .select({
          id: notifications.id,
          kind: notifications.kind,
          channel: notifications.channel,
          body: notifications.body,
          status: notifications.status,
          studentId: notifications.studentId,
          createdAt: notifications.createdAt,
        })
        .from(notifications)
        .where(eq(notifications.guardianId, p.guardianId))
        .orderBy(desc(notifications.createdAt))
        .limit(100),
    );
  }

  @Get('children/:studentId/results')
  terms(@CurrentUser() p: ParentPrincipal, @Param('studentId') s: string) {
    const studentId = parse(uuidParam, s);
    return this.dbs.withSchool(p.schoolId, async (tx) => {
      await this.portal.assertGuardianOf(tx, p.guardianId, studentId);
      return this.portal.publishedTerms(tx, studentId);
    });
  }

  @Get('children/:studentId/results/:termId')
  async reportCard(@CurrentUser() p: ParentPrincipal, @Param('studentId') s: string, @Param('termId') t: string) {
    const studentId = parse(uuidParam, s);
    await this.dbs.withSchool(p.schoolId, (tx) => this.portal.assertGuardianOf(tx, p.guardianId, studentId));
    return this.portal.reportCard(p.schoolId, studentId, parse(uuidParam, t));
  }

  @Get('children/:studentId/attendance')
  async attendanceHistory(@CurrentUser() p: ParentPrincipal, @Param('studentId') s: string, @Query() q: unknown) {
    const studentId = parse(uuidParam, s);
    await this.dbs.withSchool(p.schoolId, (tx) => this.portal.assertGuardianOf(tx, p.guardianId, studentId));
    const today = todayInLagos();
    const range = parse(rangeSchema, { from: `${today.slice(0, 4)}-01-01`, to: today, ...(q as object) });
    return this.attendance.studentHistory(p.schoolId, studentId, range.from, range.to);
  }

  @Get('children/:studentId/invoices')
  invoices(@CurrentUser() p: ParentPrincipal, @Param('studentId') s: string) {
    const studentId = parse(uuidParam, s);
    return this.dbs.withSchool(p.schoolId, async (tx) => {
      await this.portal.assertGuardianOf(tx, p.guardianId, studentId);
      const rows = await tx.select({ id: invoices.id }).from(invoices).where(eq(invoices.studentId, studentId));
      const details = [];
      for (const r of rows) details.push(await this.fees.invoiceDetail(tx, r.id));
      return details.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    });
  }

  /** Starts a Paystack checkout. Send the parent to authorizationUrl; they come back to PAYSTACK_CALLBACK_URL. */
  @Post('invoices/:invoiceId/pay')
  async pay(@CurrentUser() p: ParentPrincipal, @Param('invoiceId') i: string, @Body() body: unknown) {
    const invoiceId = parse(uuidParam, i);
    const input = parse(paySchema, body ?? {});
    await this.assertOwnInvoice(p, invoiceId);
    return this.fees.startPaystack(p.schoolId, invoiceId, { amountKobo: input.amountKobo, guardianId: p.guardianId });
  }

  /** Called from the payment return page to confirm the payment straight away. */
  @Get('payments/:reference/verify')
  verify(@CurrentUser() p: ParentPrincipal, @Param('reference') reference: string) {
    return this.fees.confirmPaystack(p.schoolId, reference);
  }

  private async assertOwnInvoice(p: ParentPrincipal, invoiceId: string) {
    await this.dbs.withSchool(p.schoolId, async (tx) => {
      const [inv] = await tx
        .select({ id: invoices.id })
        .from(invoices)
        .innerJoin(studentGuardians, eq(studentGuardians.studentId, invoices.studentId))
        .where(and(eq(invoices.id, invoiceId), eq(studentGuardians.guardianId, p.guardianId)));
      found(inv, 'Invoice');
    });
  }
}

