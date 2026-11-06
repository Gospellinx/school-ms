import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { formatNaira, gradeAttempt, seededShuffle } from '@school-ms/core';
import bcrypt from 'bcryptjs';
import { and, asc, desc, eq, gte, ilike, inArray, isNull, or, sql } from 'drizzle-orm';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { Principal } from '../auth/auth.types';
import { newPin } from '../auth/portal-auth.service';
import { CbtService } from '../cbt/cbt.service';
import { config } from '../common/config';
import { found } from '../common/validation';
import { Tx } from '../db/client';
import { DbService } from '../db/db.service';
import {
  admissionClasses,
  applicantExamAttempts,
  applicationEvents,
  applications,
  cbtTestQuestions,
  cbtTests,
  classes,
  emailOutbox,
  guardians,
  notifications,
  questions,
  schools,
  schoolSites,
  sections,
  studentGuardians,
  students,
  subjects,
} from '../db/schema';
import { AdmissionsEmailService, QueuedEmail } from './admissions-email.service';
import { PaystackClient, PaystackTransaction } from '../fees/paystack.client';

type School = typeof schools.$inferSelect;
type Site = typeof schoolSites.$inferSelect;
type Application = typeof applications.$inferSelect;
type Attempt = typeof applicantExamAttempts.$inferSelect;
export type ApplicationStatus = Application['status'];

/** Answers saved this long after the deadline still count, to allow for slow networks (same as CBT). */
const GRACE_MS = 30_000;
const HOUR = 60 * 60 * 1000;
/** Scheduled nudges; each is also skipped at send time if the application has moved on. */
const FOLLOW_UPS = ['admission_fee_reminder', 'admission_exam_reminder', 'admission_exam_missed', 'admission_offer_reminder'];
const DAY = 24 * HOUR;

export const STATUS_LABEL: Record<ApplicationStatus, string> = {
  pending_payment: 'Awaiting form fee',
  applied: 'Applied',
  exam: 'Entrance exam',
  offered: 'Offered a place',
  accepted: 'Offer accepted',
  enrolled: 'Enrolled',
  rejected: 'Not successful',
  withdrawn: 'Withdrawn',
};

export interface SiteInput {
  published?: boolean;
  tagline?: string | null;
  about?: string | null;
  heroImageUrl?: string | null;
  logoUrl?: string | null;
  accentColor?: string | null;
  highlights?: { title: string; text: string }[];
  gallery?: string[];
  whatsapp?: string | null;
  mapUrl?: string | null;
  admissionsOpen?: boolean;
  admissionSession?: string | null;
  applicationFeeKobo?: number;
  admissionInstructions?: string | null;
  admissionsEmail?: string | null;
}

export interface ApplyInput {
  admissionClassId: string;
  firstName: string;
  lastName: string;
  otherNames?: string;
  gender?: 'male' | 'female';
  dateOfBirth?: string;
  previousSchool?: string;
  parentName: string;
  parentEmail: string;
  parentPhone: string;
  relationship?: string;
  address?: string;
  notes?: string;
}

function accessSecret(): string {
  return process.env.JWT_SECRET ?? 'dev-only-secret-change-me';
}

/** The secret in a family's status link. Derived from the id, so it never needs storing and can go in any later email. */
export function accessKey(applicationId: string): string {
  return createHmac('sha256', accessSecret()).update(`application:${applicationId}`).digest('base64url').slice(0, 32);
}

function keyMatches(applicationId: string, key: string | undefined): boolean {
  if (!key) return false;
  const a = Buffer.from(accessKey(applicationId));
  const b = Buffer.from(key);
  return a.length === b.length && timingSafeEqual(a, b);
}

function newFeeReference(): string {
  return `ADM-${Date.now().toString(36).toUpperCase()}-${randomBytes(4).toString('hex').toUpperCase()}`;
}

const fullName = (a: Pick<Application, 'firstName' | 'lastName' | 'otherNames'>) => [a.firstName, a.otherNames, a.lastName].filter(Boolean).join(' ');
const className = (c: { name: string; arm: string }) => (c.arm ? `${c.name} ${c.arm}` : c.name);
const lagosTime = (d: Date) =>
  d.toLocaleString('en-NG', { timeZone: 'Africa/Lagos', weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });

/**
 * The school's public website and online admissions: the form, the application fee
 * (Paystack, settled to the school's subaccount), the CBT entrance exam, offers, enrolment
 * and the email follow-ups that keep families moving through each step.
 */
@Injectable()
export class AdmissionsService {
  private readonly logger = new Logger(AdmissionsService.name);

  constructor(
    private readonly dbs: DbService,
    private readonly cbt: CbtService,
    private readonly email: AdmissionsEmailService,
    private readonly paystack: PaystackClient,
  ) {}

  // ------------------------------------------------------------ Shared helpers

  private async schoolBySlug(slug: string): Promise<School> {
    const [school] = await this.dbs.db.select().from(schools).where(eq(schools.slug, slug));
    if (!school) throw new NotFoundException('School not found');
    return school;
  }

  private async schoolById(id: string): Promise<School> {
    const [school] = await this.dbs.db.select().from(schools).where(eq(schools.id, id));
    return found(school, 'School');
  }

  private async siteOf(tx: Tx, schoolId: string): Promise<Site | undefined> {
    const [site] = await tx.select().from(schoolSites).where(eq(schoolSites.schoolId, schoolId));
    return site;
  }

  statusLink(school: Pick<School, 'slug'>, a: Pick<Application, 'id' | 'reference'>) {
    return `${config.portalUrl()}/s/${school.slug}/application?ref=${encodeURIComponent(a.reference)}&key=${accessKey(a.id)}`;
  }

  private async event(tx: Tx, a: Pick<Application, 'id' | 'schoolId'>, kind: string, detail?: string, staffId?: string) {
    await tx.insert(applicationEvents).values({ schoolId: a.schoolId, applicationId: a.id, kind, detail, staffId });
  }

  private async mail(tx: Tx, school: School, site: Site | undefined, a: Application, e: Omit<QueuedEmail, 'to' | 'applicationId'>) {
    await this.email.queue(tx, school.id, { ...e, to: a.parentEmail, applicationId: a.id });
  }

  private async sms(tx: Tx, a: Application, kind: string, body: string) {
    await tx.insert(notifications).values({ schoolId: a.schoolId, channel: 'sms', to: a.parentPhone, body, kind });
  }

  private async setStatus(tx: Tx, a: Application, status: ApplicationStatus, extra: Partial<Application> = {}) {
    const [row] = await tx
      .update(applications)
      .set({ ...extra, status, updatedAt: new Date() })
      .where(eq(applications.id, a.id))
      .returning();
    return row;
  }

  // ------------------------------------------------------------ Website (staff)

  getSite(user: Principal) {
    return this.dbs.withSchool(user.schoolId, async (tx) => {
      const school = await this.schoolById(user.schoolId);
      const site = await this.siteOf(tx, user.schoolId);
      return { school: publicSchool(school), site: site ?? null, url: `${config.portalUrl()}/s/${school.slug}` };
    });
  }

  saveSite(user: Principal, input: SiteInput) {
    return this.dbs.withSchool(user.schoolId, async (tx) => {
      const [row] = await tx
        .insert(schoolSites)
        .values({ schoolId: user.schoolId, ...input })
        .onConflictDoUpdate({ target: schoolSites.schoolId, set: { ...input, updatedAt: new Date() } })
        .returning();
      return row;
    });
  }

  // ------------------------------------------------------------ Entry classes and entrance exams (staff)

  listAdmissionClasses(user: Principal) {
    return this.dbs.withSchool(user.schoolId, (tx) => this.admissionClassRows(tx));
  }

  private async admissionClassRows(tx: Tx, onlyOpen = false) {
    const rows = await tx
      .select({ ac: admissionClasses, cls: classes, test: cbtTests })
      .from(admissionClasses)
      .innerJoin(classes, eq(classes.id, admissionClasses.classId))
      .leftJoin(cbtTests, eq(cbtTests.id, admissionClasses.entranceTestId))
      .where(onlyOpen ? eq(admissionClasses.open, true) : undefined)
      .orderBy(asc(classes.sortOrder), asc(classes.name));
    const taken = await tx
      .select({ id: applications.admissionClassId, n: sql<number>`count(*)::int` })
      .from(applications)
      .where(inArray(applications.status, ['offered', 'accepted', 'enrolled']))
      .groupBy(applications.admissionClassId);
    const takenBy = new Map(taken.map((t) => [t.id, t.n]));
    return rows.map(({ ac, cls, test }) => ({
      id: ac.id,
      classId: cls.id,
      className: className(cls),
      open: ac.open,
      seats: ac.seats,
      seatsTaken: takenBy.get(ac.id) ?? 0,
      passMark: ac.passMark,
      entranceTest: test ? { id: test.id, title: test.title, durationMinutes: test.durationMinutes } : null,
    }));
  }

  private async assertEntranceTest(tx: Tx, testId: string | null | undefined) {
    if (!testId) return;
    const [t] = await tx.select().from(cbtTests).where(eq(cbtTests.id, testId));
    if (!t || t.purpose !== 'entrance') throw new BadRequestException('Choose an entrance exam');
  }

  saveAdmissionClass(user: Principal, input: { classId: string; entranceTestId?: string | null; passMark?: number | null; seats?: number | null; open?: boolean }) {
    return this.dbs.withSchool(user.schoolId, async (tx) => {
      const [cls] = await tx.select().from(classes).where(eq(classes.id, input.classId));
      found(cls, 'Class');
      await this.assertEntranceTest(tx, input.entranceTestId);
      const values = { entranceTestId: input.entranceTestId ?? null, passMark: input.passMark ?? null, seats: input.seats ?? null, open: input.open ?? true };
      await tx
        .insert(admissionClasses)
        .values({ schoolId: user.schoolId, classId: input.classId, ...values })
        .onConflictDoUpdate({ target: [admissionClasses.schoolId, admissionClasses.classId], set: values });
      return this.admissionClassRows(tx);
    });
  }

  removeAdmissionClass(user: Principal, id: string) {
    return this.dbs.withSchool(user.schoolId, async (tx) => {
      const [used] = await tx.select({ id: applications.id }).from(applications).where(eq(applications.admissionClassId, id)).limit(1);
      if (used) {
        // Keep it for the applications that point at it; just stop taking new ones.
        await tx.update(admissionClasses).set({ open: false }).where(eq(admissionClasses.id, id));
      } else {
        await tx.delete(admissionClasses).where(eq(admissionClasses.id, id));
      }
      return this.admissionClassRows(tx);
    });
  }

  /** Entrance exams: CBT tests with purpose 'entrance', with how many questions each subject has. */
  listEntranceExams(user: Principal) {
    return this.dbs.withSchool(user.schoolId, async (tx) => {
      const tests = await tx.select().from(cbtTests).where(eq(cbtTests.purpose, 'entrance')).orderBy(desc(cbtTests.createdAt));
      if (!tests.length) return [];
      const parts = await tx
        .select({ testId: cbtTestQuestions.testId, subject: subjects.name, n: sql<number>`count(*)::int`, marks: sql<number>`sum(${cbtTestQuestions.marks})::int` })
        .from(cbtTestQuestions)
        .innerJoin(questions, eq(questions.id, cbtTestQuestions.questionId))
        .innerJoin(subjects, eq(subjects.id, questions.subjectId))
        .where(inArray(cbtTestQuestions.testId, tests.map((t) => t.id)))
        .groupBy(cbtTestQuestions.testId, subjects.name);
      const sat = await tx
        .select({ testId: applicantExamAttempts.testId, n: sql<number>`count(*)::int`, avg: sql<number | null>`avg(${applicantExamAttempts.percentage})` })
        .from(applicantExamAttempts)
        .where(inArray(applicantExamAttempts.testId, tests.map((t) => t.id)))
        .groupBy(applicantExamAttempts.testId);
      const satBy = new Map(sat.map((s) => [s.testId, s]));
      return tests.map((t) => {
        const mine = parts.filter((p) => p.testId === t.id);
        const s = satBy.get(t.id);
        return {
          id: t.id,
          title: t.title,
          durationMinutes: t.durationMinutes,
          status: t.status,
          questions: mine.reduce((n, p) => n + p.n, 0),
          totalMarks: mine.reduce((n, p) => n + p.marks, 0),
          subjects: mine.map((p) => ({ name: p.subject, questions: p.n })),
          sittings: s?.n ?? 0,
          averagePercentage: s?.avg != null ? Math.round(Number(s.avg) * 10) / 10 : null,
        };
      });
    });
  }

  /**
   * Builds an entrance exam from the school's question bank: `count` questions per subject,
   * picked at random (school-made questions first, then any). Created through the CBT module and published.
   */
  async createEntranceExam(user: Principal, input: { title: string; durationMinutes: number; parts: { subjectId: string; count: number }[] }) {
    const questionIds = await this.dbs.withSchool(user.schoolId, async (tx) => {
      const picked: string[] = [];
      for (const part of input.parts) {
        const pool = await tx
          .select({ id: questions.id })
          .from(questions)
          .where(eq(questions.subjectId, part.subjectId))
          .orderBy(sql`random()`)
          .limit(part.count);
        if (pool.length < part.count) {
          const [sub] = await tx.select({ name: subjects.name }).from(subjects).where(eq(subjects.id, part.subjectId));
          throw new BadRequestException(`The question bank has only ${pool.length} ${sub?.name ?? ''} questions; add more or ask for fewer`.replace('  ', ' '));
        }
        picked.push(...pool.map((q) => q.id));
      }
      return picked;
    });
    const test = await this.cbt.createTest(user, {
      title: input.title,
      subjectId: input.parts[0].subjectId,
      durationMinutes: input.durationMinutes,
      classIds: [],
      questionIds,
      shuffleQuestions: true,
      showResults: false,
      purpose: 'entrance',
    });
    await this.cbt.setStatus(user, test.id, 'published');
    return { id: test.id, title: test.title, questions: test.questions.length, totalMarks: test.totalMarks };
  }

  // ------------------------------------------------------------ Public website

  async publicSite(slug: string) {
    const school = await this.schoolBySlug(slug);
    return this.dbs.withSchool(school.id, async (tx) => {
      const site = await this.siteOf(tx, school.id);
      if (!site?.published) throw new NotFoundException('This school has no public website yet');
      const secs = await tx.select({ name: sections.name, kind: sections.kind }).from(sections).orderBy(asc(sections.sortOrder));
      const entry = site.admissionsOpen ? await this.admissionClassRows(tx, true) : [];
      return {
        school: publicSchool(school),
        site: {
          tagline: site.tagline,
          about: site.about,
          heroImageUrl: site.heroImageUrl,
          logoUrl: site.logoUrl,
          accentColor: site.accentColor,
          highlights: site.highlights,
          gallery: site.gallery,
          whatsapp: site.whatsapp,
          mapUrl: site.mapUrl,
        },
        sections: secs,
        admissions: {
          open: site.admissionsOpen && entry.length > 0,
          session: site.admissionSession,
          feeKobo: site.applicationFeeKobo,
          instructions: site.admissionInstructions,
          classes: entry
            .filter((c) => c.seats === null || c.seatsTaken < c.seats)
            .map((c) => ({ id: c.id, className: c.className, hasExam: Boolean(c.entranceTest), examMinutes: c.entranceTest?.durationMinutes ?? null })),
        },
      };
    });
  }

  /** The public admission form. Returns the reference and the private key for the family's status page. */
  async apply(slug: string, input: ApplyInput) {
    const school = await this.schoolBySlug(slug);
    return this.dbs.withSchool(school.id, async (tx) => {
      const site = await this.siteOf(tx, school.id);
      if (!site?.published || !site.admissionsOpen) throw new BadRequestException('Admissions are closed at the moment');
      const [ac] = await tx.select().from(admissionClasses).where(and(eq(admissionClasses.id, input.admissionClassId), eq(admissionClasses.open, true)));
      if (!ac) throw new BadRequestException('Applications for that class are closed');

      // One open application per child per class: a second submit (double tap, slow network) returns the first.
      const [dup] = await tx
        .select()
        .from(applications)
        .where(
          and(
            eq(applications.admissionClassId, ac.id),
            eq(applications.parentPhone, input.parentPhone),
            sql`lower(${applications.firstName}) = lower(${input.firstName})`,
            sql`lower(${applications.lastName}) = lower(${input.lastName})`,
            inArray(applications.status, ['pending_payment', 'applied', 'exam', 'offered', 'accepted']),
          ),
        );
      if (dup) return { reference: dup.reference, key: accessKey(dup.id), status: dup.status, feeKobo: dup.feeKobo, existing: true };

      // Sequential references per school and year (ADM-2026-0001); the lock stops two forms taking one number.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`admissions:${school.id}`}))`);
      const year = new Date().getFullYear();
      const [{ n }] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(applications)
        .where(sql`${applications.reference} like ${`ADM-${year}-%`}`);
      const reference = `ADM-${year}-${String(n + 1).padStart(4, '0')}`;

      const fee = site.applicationFeeKobo;
      const [a] = await tx
        .insert(applications)
        .values({
          schoolId: school.id,
          reference,
          admissionClassId: ac.id,
          classId: ac.classId,
          status: fee > 0 ? 'pending_payment' : 'applied',
          firstName: input.firstName.trim(),
          lastName: input.lastName.trim(),
          otherNames: input.otherNames?.trim() || null,
          gender: input.gender,
          dateOfBirth: input.dateOfBirth,
          previousSchool: input.previousSchool,
          parentName: input.parentName.trim(),
          parentEmail: input.parentEmail.toLowerCase(),
          parentPhone: input.parentPhone,
          relationship: input.relationship,
          address: input.address,
          notes: input.notes,
          feeKobo: fee,
        })
        .returning();
      await this.event(tx, a, 'submitted', `Applied for ${await this.classLabel(tx, a.classId)}`);

      if (fee > 0) {
        const link = this.statusLink(school, a);
        await this.mail(tx, school, site, a, {
          subject: `Complete ${a.firstName}'s application (${reference})`,
          kind: 'admission_started',
          body: [
            `Dear ${a.parentName},`,
            `Thank you for starting an application for ${fullName(a)}. Your reference is ${reference}.`,
            `To submit it, please pay the application form fee of ${formatNaira(fee)} online. You can pay by card, bank transfer or USSD.`,
            `Pay the form fee: ${link}`,
          ],
        });
        // Gentle follow-ups if the fee is still unpaid after a day, and again after three days.
        for (const [after, label] of [
          [DAY, 'a reminder'],
          [3 * DAY, 'a last reminder'],
        ] as const) {
          await this.mail(tx, school, site, a, {
            subject: `Reminder: ${a.firstName}'s application is not complete yet`,
            kind: 'admission_fee_reminder',
            onlyIfStatus: 'pending_payment',
            sendAfter: new Date(Date.now() + after),
            body: [
              `Dear ${a.parentName},`,
              `This is ${label} that ${fullName(a)}'s application (${reference}) is waiting for the ${formatNaira(fee)} form fee. We can only review applications once it is paid.`,
              `Pay the form fee: ${link}`,
              `If you have already paid at the school, please ignore this email.`,
            ],
          });
        }
      } else {
        await this.onSubmitted(tx, school, site, a);
      }
      return { reference, key: accessKey(a.id), status: a.status, feeKobo: fee, existing: false };
    });
  }

  private async classLabel(tx: Tx, classId: string) {
    const [c] = await tx.select().from(classes).where(eq(classes.id, classId));
    return c ? className(c) : 'a class';
  }

  /** The application is complete (fee paid or free): confirm to the family and tell the admissions office. */
  private async onSubmitted(tx: Tx, school: School, site: Site | undefined, a: Application) {
    const cls = await this.classLabel(tx, a.classId);
    const [ac] = await tx.select().from(admissionClasses).where(eq(admissionClasses.id, a.admissionClassId));
    await this.mail(tx, school, site, a, {
      subject: `Application received: ${fullName(a)} (${a.reference})`,
      kind: 'admission_received',
      body: [
        `Dear ${a.parentName},`,
        `We have received ${fullName(a)}'s application for ${cls}. Your reference is ${a.reference}.`,
        ac?.entranceTestId
          ? `The next step is a short computer-based entrance exam. We will email you the date and a link to sit it online.`
          : `Our admissions team will review it and email you with the next step.`,
        `Track the application: ${this.statusLink(school, a)}`,
      ],
    });
    await this.sms(tx, a, 'admission', `${school.name}: we received ${a.firstName}'s application (${a.reference}). We will email ${a.parentEmail} with the next step.`);
    const office = site?.admissionsEmail ?? school.email;
    if (office) {
      await this.email.queue(tx, school.id, {
          to: office,
          subject: `New application: ${fullName(a)} for ${cls}`,
          kind: 'admission_office_alert',
          applicationId: a.id,
          body: [`${fullName(a)} has applied for ${cls} (${a.reference}).`, `Parent: ${a.parentName}, ${a.parentPhone}, ${a.parentEmail}.`, `Open admissions: ${config.portalUrl()}/admin/admissions`],
      });
    }
  }

  // ------------------------------------------------------------ Public: the family's status page

  private async byReference(tx: Tx, reference: string, key: string | undefined) {
    const [a] = await tx.select().from(applications).where(eq(applications.reference, reference));
    // Same answer for a wrong key and a wrong reference, so references cannot be probed.
    if (!a || !keyMatches(a.id, key)) throw new NotFoundException('Application not found. Check the link in your email.');
    return a;
  }

  async publicStatus(slug: string, reference: string, key: string | undefined) {
    const school = await this.schoolBySlug(slug);
    return this.dbs.withSchool(school.id, async (tx) => {
      let a = await this.byReference(tx, reference, key);
      const attempt = await this.attemptFor(tx, a);
      if (attempt && !attempt.submittedAt && Date.now() > attempt.deadline.getTime() + GRACE_MS) {
        await this.gradeAttempt(tx, school, a, attempt);
        a = (await tx.select().from(applications).where(eq(applications.id, a.id)))[0];
      }
      const site = await this.siteOf(tx, school.id);
      const [ac] = await tx.select().from(admissionClasses).where(eq(admissionClasses.id, a.admissionClassId));
      const [test] = a.examTestId ? await tx.select().from(cbtTests).where(eq(cbtTests.id, a.examTestId)) : [];
      const fresh = await this.attemptFor(tx, a);
      const now = new Date();
      return {
        school: publicSchool(school),
        accentColor: site?.accentColor ?? null,
        application: {
          reference: a.reference,
          status: a.status,
          statusLabel: STATUS_LABEL[a.status],
          childName: fullName(a),
          className: await this.classLabel(tx, a.classId),
          parentName: a.parentName,
          parentEmail: a.parentEmail,
          createdAt: a.createdAt,
          fee: { amountKobo: a.feeKobo, paid: Boolean(a.feePaidAt) || a.feeKobo === 0, paidAt: a.feePaidAt },
          exam:
            a.examTestId && test
              ? {
                  title: test.title,
                  durationMinutes: test.durationMinutes,
                  opensAt: a.examOpensAt,
                  closesAt: a.examClosesAt,
                  isOpen: a.status === 'exam' && (!a.examOpensAt || a.examOpensAt <= now) && (!a.examClosesAt || a.examClosesAt > now),
                  started: Boolean(fresh),
                  submitted: Boolean(fresh?.submittedAt),
                }
              : ac?.entranceTestId && ['applied', 'pending_payment'].includes(a.status)
                ? { title: 'Entrance exam', durationMinutes: null, opensAt: null, closesAt: null, isOpen: false, started: false, submitted: false }
                : null,
          offer: a.offeredAt ? { note: a.offerNote, offeredAt: a.offeredAt, acceptedAt: a.acceptedAt } : null,
          decisionNote: a.status === 'rejected' ? a.decisionNote : null,
          steps: progressSteps(a, Boolean(ac?.entranceTestId || a.examTestId)),
        },
      };
    });
  }

  // ------------------------------------------------------------ Application fee (Paystack)

  async startPayment(slug: string, reference: string, key: string | undefined) {
    const school = await this.schoolBySlug(slug);
    return this.dbs.withSchool(school.id, async (tx) => {
      const a = await this.byReference(tx, reference, key);
      if (a.status !== 'pending_payment' || a.feePaidAt) throw new BadRequestException('The form fee is already paid');
      const feeReference = newFeeReference();
      await tx.update(applications).set({ feeReference, updatedAt: new Date() }).where(eq(applications.id, a.id));
      const checkout = await this.paystack.initialize({
        email: a.parentEmail,
        amountKobo: a.feeKobo,
        reference: feeReference,
        callbackUrl: `${config.portalUrl()}/s/${school.slug}/application?ref=${encodeURIComponent(a.reference)}`,
        subaccount: school.paystackSubaccountCode ?? undefined,
        bearer: config.paystack().feeBearer,
        metadata: {
          school_id: school.id,
          purpose: 'admission_fee',
          application_id: a.id,
          custom_fields: [
            { display_name: 'Applicant', variable_name: 'applicant', value: fullName(a) },
            { display_name: 'Application', variable_name: 'application', value: a.reference },
          ],
        },
      });
      return { reference: feeReference, amountKobo: a.feeKobo, authorizationUrl: checkout.authorization_url };
    });
  }

  /** Asks Paystack whether the form fee was paid (never trusting the browser). Idempotent: the webhook and return page both call it. */
  async confirmPayment(schoolId: string, feeReference: string) {
    const school = await this.schoolById(schoolId);
    return this.dbs.withSchool(schoolId, async (tx) => {
      const [a] = await tx.select().from(applications).where(eq(applications.feeReference, feeReference)).for('update');
      if (!a) throw new NotFoundException('Payment not found');
      if (a.feePaidAt) return { status: 'success' as const, reference: a.reference };
      const trx: PaystackTransaction = await this.paystack.verify(feeReference);
      const metaSchool = (trx.metadata as { school_id?: string } | null)?.school_id;
      if (trx.status !== 'success') return { status: trx.status === 'abandoned' || trx.status === 'failed' ? ('failed' as const) : ('pending' as const), reference: a.reference };
      if (trx.amount !== a.feeKobo || trx.currency !== 'NGN' || (metaSchool && metaSchool !== schoolId)) {
        this.logger.warn(`Admission fee ${feeReference} does not match (amount ${trx.amount} ${trx.currency})`);
        return { status: 'failed' as const, reference: a.reference };
      }
      const paidAt = trx.paid_at ? new Date(trx.paid_at) : new Date();
      const updated = await this.setStatus(tx, a, a.status === 'pending_payment' ? 'applied' : a.status, { feePaidAt: paidAt, feeMethod: `paystack${trx.channel ? ` (${trx.channel})` : ''}` });
      await this.event(tx, a, 'fee_paid', `${formatNaira(a.feeKobo)} paid online`);
      await this.email.cancel(tx, a.id, ['admission_fee_reminder']);
      if (a.status === 'pending_payment') await this.onSubmitted(tx, school, await this.siteOf(tx, schoolId), updated);
      return { status: 'success' as const, reference: a.reference };
    });
  }

  async confirmPaymentBySlug(slug: string, feeReference: string) {
    const school = await this.schoolBySlug(slug);
    return this.confirmPayment(school.id, feeReference);
  }

  /** For the shared Paystack webhook: true if this charge was an application fee. */
  static isAdmissionCharge(event: { data?: { metadata?: { purpose?: string } } }): boolean {
    return event.data?.metadata?.purpose === 'admission_fee';
  }

  async handleWebhook(event: { event?: string; data?: { reference?: string; metadata?: { school_id?: string } } }) {
    if (event.event !== 'charge.success' || !event.data?.reference) return { handled: false };
    const schoolId = event.data.metadata?.school_id;
    if (!schoolId || !/^[0-9a-f-]{36}$/i.test(schoolId)) return { handled: false };
    try {
      const r = await this.confirmPayment(schoolId, event.data.reference);
      return { handled: true, status: r.status };
    } catch (err) {
      if (err instanceof NotFoundException) return { handled: false };
      throw err;
    }
  }

  // ------------------------------------------------------------ Public: entrance exam

  private async attemptFor(tx: Tx, a: Application): Promise<Attempt | undefined> {
    if (!a.examTestId) return undefined;
    const [row] = await tx
      .select()
      .from(applicantExamAttempts)
      .where(and(eq(applicantExamAttempts.applicationId, a.id), eq(applicantExamAttempts.testId, a.examTestId)));
    return row;
  }

  async startExam(slug: string, reference: string, key: string | undefined) {
    const school = await this.schoolBySlug(slug);
    return this.dbs.withSchool(school.id, async (tx) => {
      const a = await this.byReference(tx, reference, key);
      const existing = await this.attemptFor(tx, a);
      if (existing) return this.examView(tx, school, a, existing);
      if (a.status !== 'exam' || !a.examTestId) throw new BadRequestException('There is no entrance exam to sit yet');
      const now = new Date();
      if (a.examOpensAt && a.examOpensAt > now) throw new BadRequestException(`The exam opens on ${lagosTime(a.examOpensAt)}`);
      if (a.examClosesAt && a.examClosesAt <= now) throw new BadRequestException('The exam window has closed. Please contact the school.');
      const [test] = await tx.select().from(cbtTests).where(eq(cbtTests.id, a.examTestId));
      if (!test || test.status !== 'published') throw new BadRequestException('The exam is not available. Please contact the school.');
      const qRows = await tx
        .select({ id: cbtTestQuestions.questionId })
        .from(cbtTestQuestions)
        .where(eq(cbtTestQuestions.testId, test.id))
        .orderBy(asc(cbtTestQuestions.position));
      let order = qRows.map((q) => q.id);
      if (test.shuffleQuestions) order = seededShuffle(order, `${test.id}:${a.id}`);
      let deadline = new Date(now.getTime() + test.durationMinutes * 60_000);
      if (a.examClosesAt && a.examClosesAt < deadline) deadline = a.examClosesAt;
      const [attempt] = await tx
        .insert(applicantExamAttempts)
        .values({ schoolId: school.id, applicationId: a.id, testId: test.id, questionIds: order, deadline })
        .onConflictDoNothing()
        .returning();
      if (!attempt) return this.examView(tx, school, a, (await this.attemptFor(tx, a))!);
      await this.event(tx, a, 'exam_started');
      return this.examView(tx, school, a, attempt);
    });
  }

  async getExam(slug: string, reference: string, key: string | undefined) {
    const school = await this.schoolBySlug(slug);
    return this.dbs.withSchool(school.id, async (tx) => {
      const a = await this.byReference(tx, reference, key);
      let attempt = await this.attemptFor(tx, a);
      if (!attempt) throw new NotFoundException('The exam has not been started');
      if (!attempt.submittedAt && Date.now() > attempt.deadline.getTime() + GRACE_MS) attempt = await this.gradeAttempt(tx, school, a, attempt);
      return this.examView(tx, school, a, attempt);
    });
  }

  async saveExamAnswers(slug: string, reference: string, key: string | undefined, answers: Record<string, string | null>) {
    const school = await this.schoolBySlug(slug);
    return this.dbs.withSchool(school.id, async (tx) => {
      const a = await this.byReference(tx, reference, key);
      const attempt = await this.attemptFor(tx, a);
      if (!attempt) throw new NotFoundException('The exam has not been started');
      if (attempt.submittedAt) throw new BadRequestException('The exam has already been submitted');
      if (Date.now() > attempt.deadline.getTime() + GRACE_MS) {
        return this.examView(tx, school, a, await this.gradeAttempt(tx, school, a, attempt));
      }
      const allowed = new Set(attempt.questionIds);
      const merged = { ...attempt.answers };
      for (const [qid, k] of Object.entries(answers)) {
        if (!allowed.has(qid)) throw new BadRequestException('That question is not in this exam');
        if (k === null) delete merged[qid];
        else merged[qid] = k.toUpperCase();
      }
      await tx.update(applicantExamAttempts).set({ answers: merged }).where(eq(applicantExamAttempts.id, attempt.id));
      return { saved: Object.keys(merged).length, deadline: attempt.deadline };
    });
  }

  async submitExam(slug: string, reference: string, key: string | undefined) {
    const school = await this.schoolBySlug(slug);
    return this.dbs.withSchool(school.id, async (tx) => {
      const a = await this.byReference(tx, reference, key);
      const attempt = await this.attemptFor(tx, a);
      if (!attempt) throw new NotFoundException('The exam has not been started');
      return this.examView(tx, school, a, attempt.submittedAt ? attempt : await this.gradeAttempt(tx, school, a, attempt));
    });
  }

  /** Marks the exam with the same CBT engine as class tests, records the score and thanks the family. */
  private async gradeAttempt(tx: Tx, school: School, a: Application, attempt: Attempt): Promise<Attempt> {
    const qs = await tx.select().from(questions).where(inArray(questions.id, attempt.questionIds));
    const marks = await tx.select().from(cbtTestQuestions).where(eq(cbtTestQuestions.testId, attempt.testId));
    const markBy = new Map(marks.map((m) => [m.questionId, m.marks]));
    const graded = gradeAttempt(
      qs.map((q) => ({ id: q.id, answer: q.answer, marks: markBy.get(q.id) ?? 1 })),
      attempt.answers,
    );
    const [updated] = await tx
      .update(applicantExamAttempts)
      .set({ submittedAt: new Date(), score: graded.score, maxScore: graded.maxScore, percentage: graded.percentage })
      .where(and(eq(applicantExamAttempts.id, attempt.id), isNull(applicantExamAttempts.submittedAt)))
      .returning();
    if (!updated) return (await tx.select().from(applicantExamAttempts).where(eq(applicantExamAttempts.id, attempt.id)))[0];

    await tx.update(applications).set({ examPercentage: graded.percentage, updatedAt: new Date() }).where(eq(applications.id, a.id));
    const [ac] = await tx.select().from(admissionClasses).where(eq(admissionClasses.id, a.admissionClassId));
    const verdict = ac?.passMark != null ? (graded.percentage >= ac.passMark ? ` · at or above the ${ac.passMark}% pass mark` : ` · below the ${ac.passMark}% pass mark`) : '';
    await this.event(tx, a, 'exam_submitted', `Scored ${graded.percentage}% (${graded.score}/${graded.maxScore})${verdict}`);
    await this.email.cancel(tx, a.id, ['admission_exam_reminder', 'admission_exam_missed']);
    await this.mail(tx, school, await this.siteOf(tx, school.id), a, {
      subject: `${a.firstName} has completed the entrance exam`,
      kind: 'admission_exam_done',
      body: [
        `Dear ${a.parentName},`,
        `${fullName(a)} has completed the entrance exam for application ${a.reference}. Thank you.`,
        `Our admissions team will review the result and email you with a decision, usually within a few working days.`,
        `Track the application: ${this.statusLink(school, a)}`,
      ],
    });
    return updated;
  }

  /** What the applicant sees: questions without answers. Scores are for the school, not shown to applicants. */
  private async examView(tx: Tx, school: School, a: Application, attempt: Attempt) {
    const [test] = await tx.select().from(cbtTests).where(eq(cbtTests.id, attempt.testId));
    const qs = await tx.select().from(questions).where(inArray(questions.id, attempt.questionIds));
    const subj = await tx.select({ id: subjects.id, name: subjects.name }).from(subjects);
    const subjectName = new Map(subj.map((s) => [s.id, s.name]));
    const byId = new Map(qs.map((q) => [q.id, q]));
    const submitted = Boolean(attempt.submittedAt);
    return {
      id: attempt.id,
      title: test?.title ?? 'Entrance exam',
      schoolName: school.name,
      childName: fullName(a),
      deadline: attempt.deadline,
      secondsLeft: submitted ? null : Math.max(0, Math.round((attempt.deadline.getTime() - Date.now()) / 1000)),
      submitted,
      questions: submitted
        ? []
        : attempt.questionIds.map((qid, i) => {
            const q = byId.get(qid)!;
            return { number: i + 1, id: q.id, subject: subjectName.get(q.subjectId) ?? '', body: q.body, options: q.options, chosen: attempt.answers[qid] ?? null };
          }),
    };
  }

  // ------------------------------------------------------------ Public: accept the offer

  async acceptOffer(slug: string, reference: string, key: string | undefined) {
    const school = await this.schoolBySlug(slug);
    return this.dbs.withSchool(school.id, async (tx) => {
      const a = await this.byReference(tx, reference, key);
      if (a.status === 'accepted' || a.status === 'enrolled') return { status: a.status };
      if (a.status !== 'offered') throw new BadRequestException('There is no offer to accept');
      const updated = await this.setStatus(tx, a, 'accepted', { acceptedAt: new Date() });
      await this.event(tx, a, 'accepted', 'The family accepted the offer online');
      await this.email.cancel(tx, a.id, ['admission_offer_reminder']);
      const site = await this.siteOf(tx, school.id);
      await this.mail(tx, school, site, updated, {
        subject: `Offer accepted: welcome to ${school.name}`,
        kind: 'admission_accepted',
        body: [
          `Dear ${a.parentName},`,
          `Thank you for accepting the offer for ${fullName(a)}. The school will complete enrolment and send ${a.firstName}'s admission number and portal login.`,
          site?.admissionInstructions ?? 'Please keep this email for your records.',
        ],
      });
      return { status: updated.status };
    });
  }

  // ------------------------------------------------------------ Staff: pipeline

  /** Submits entrance exams whose time ran out (the applicant closed the browser mid-exam). */
  private async finaliseExpired(tx: Tx, school: School) {
    const open = await tx
      .select({ attempt: applicantExamAttempts, app: applications })
      .from(applicantExamAttempts)
      .innerJoin(applications, eq(applications.id, applicantExamAttempts.applicationId))
      .where(and(isNull(applicantExamAttempts.submittedAt), sql`${applicantExamAttempts.deadline} < now() - interval '30 seconds'`));
    for (const { attempt, app } of open) await this.gradeAttempt(tx, school, app, attempt);
  }

  /** The admissions dashboard: funnel, money, seats, follow-ups and the live activity feed. */
  overview(user: Principal) {
    return this.dbs.withSchool(user.schoolId, async (tx) => {
      const school = await this.schoolById(user.schoolId);
      await this.finaliseExpired(tx, school);
      const site = await this.siteOf(tx, user.schoolId);
      const byStatus = await tx
        .select({ status: applications.status, n: sql<number>`count(*)::int` })
        .from(applications)
        .groupBy(applications.status);
      const counts = Object.fromEntries(Object.keys(STATUS_LABEL).map((k) => [k, 0])) as Record<ApplicationStatus, number>;
      for (const r of byStatus) counts[r.status] = r.n;
      const [money] = await tx
        .select({ collected: sql<number>`coalesce(sum(${applications.feeKobo}) filter (where ${applications.feePaidAt} is not null), 0)::int`, paid: sql<number>`count(*) filter (where ${applications.feePaidAt} is not null)::int` })
        .from(applications);
      const since = new Date(Date.now() - 7 * DAY);
      const daily = await tx
        .select({ day: sql<string>`to_char(${applications.createdAt} at time zone 'Africa/Lagos', 'YYYY-MM-DD')`, n: sql<number>`count(*)::int` })
        .from(applications)
        .where(gte(applications.createdAt, since))
        .groupBy(sql`1`)
        .orderBy(sql`1`);
      const [exam] = await tx
        .select({ sat: sql<number>`count(*) filter (where ${applicantExamAttempts.submittedAt} is not null)::int`, avg: sql<number | null>`avg(${applicantExamAttempts.percentage})` })
        .from(applicantExamAttempts);
      const emails = await tx.select({ status: emailOutbox.status, n: sql<number>`count(*)::int` }).from(emailOutbox).groupBy(emailOutbox.status);
      const emailCounts = Object.fromEntries(emails.map((e) => [e.status, e.n]));
      const [{ upcoming }] = await tx
        .select({ upcoming: sql<number>`count(*)::int` })
        .from(emailOutbox)
        .where(and(eq(emailOutbox.status, 'queued'), sql`${emailOutbox.sendAfter} > now()`));
      const activity = await tx
        .select({ event: applicationEvents, app: { id: applications.id, reference: applications.reference, firstName: applications.firstName, lastName: applications.lastName } })
        .from(applicationEvents)
        .innerJoin(applications, eq(applications.id, applicationEvents.applicationId))
        .orderBy(desc(applicationEvents.createdAt))
        .limit(25);
      const total = Object.values(counts).reduce((s, n) => s + n, 0);
      return {
        site: { published: site?.published ?? false, admissionsOpen: site?.admissionsOpen ?? false, feeKobo: site?.applicationFeeKobo ?? 0, url: `${config.portalUrl()}/s/${school.slug}` },
        total,
        counts,
        funnel: [
          { key: 'applied', label: 'Applied', n: total - counts.pending_payment - counts.withdrawn },
          { key: 'exam', label: 'Sat the exam', n: exam?.sat ?? 0 },
          { key: 'offered', label: 'Offered', n: counts.offered + counts.accepted + counts.enrolled },
          { key: 'accepted', label: 'Accepted', n: counts.accepted + counts.enrolled },
          { key: 'enrolled', label: 'Enrolled', n: counts.enrolled },
        ],
        fees: { collectedKobo: money?.collected ?? 0, paid: money?.paid ?? 0, awaiting: counts.pending_payment },
        exam: { sat: exam?.sat ?? 0, averagePercentage: exam?.avg != null ? Math.round(Number(exam.avg) * 10) / 10 : null },
        daily,
        classes: await this.admissionClassRows(tx),
        emails: { sent: emailCounts.sent ?? 0, queued: emailCounts.queued ?? 0, scheduled: upcoming, failed: emailCounts.failed ?? 0, skipped: emailCounts.skipped ?? 0 },
        activity: activity.map((r) => ({ ...r.event, reference: r.app.reference, childName: `${r.app.firstName} ${r.app.lastName}` })),
        serverTime: new Date(),
      };
    });
  }

  list(user: Principal, filter: { status?: ApplicationStatus; admissionClassId?: string; q?: string }) {
    return this.dbs.withSchool(user.schoolId, async (tx) => {
      const school = await this.schoolById(user.schoolId);
      await this.finaliseExpired(tx, school);
      const q = filter.q?.trim();
      const rows = await tx
        .select({ app: applications, cls: classes, passMark: admissionClasses.passMark, hasExam: sql<boolean>`${admissionClasses.entranceTestId} is not null` })
        .from(applications)
        .innerJoin(classes, eq(classes.id, applications.classId))
        .innerJoin(admissionClasses, eq(admissionClasses.id, applications.admissionClassId))
        .where(
          and(
            filter.status ? eq(applications.status, filter.status) : undefined,
            filter.admissionClassId ? eq(applications.admissionClassId, filter.admissionClassId) : undefined,
            q
              ? or(
                  ilike(applications.reference, `%${q}%`),
                  ilike(applications.firstName, `%${q}%`),
                  ilike(applications.lastName, `%${q}%`),
                  ilike(applications.parentName, `%${q}%`),
                  ilike(applications.parentPhone, `%${q.replace(/^0/, '')}%`),
                )
              : undefined,
          ),
        )
        .orderBy(desc(applications.createdAt))
        .limit(500);
      return rows.map(({ app, cls, passMark, hasExam }) => ({
        id: app.id,
        reference: app.reference,
        childName: fullName(app),
        className: className(cls),
        admissionClassId: app.admissionClassId,
        status: app.status,
        parentName: app.parentName,
        parentPhone: app.parentPhone,
        parentEmail: app.parentEmail,
        feeKobo: app.feeKobo,
        feePaid: Boolean(app.feePaidAt) || app.feeKobo === 0,
        hasExam,
        examOpensAt: app.examOpensAt,
        examPercentage: app.examPercentage,
        passMark,
        recommended: app.examPercentage != null && passMark != null ? app.examPercentage >= passMark : null,
        createdAt: app.createdAt,
        updatedAt: app.updatedAt,
      }));
    });
  }

  detail(user: Principal, id: string) {
    return this.dbs.withSchool(user.schoolId, async (tx) => {
      const [a] = await tx.select().from(applications).where(eq(applications.id, id));
      found(a, 'Application');
      const school = await this.schoolById(user.schoolId);
      const events = await tx.select().from(applicationEvents).where(eq(applicationEvents.applicationId, id)).orderBy(desc(applicationEvents.createdAt));
      const emails = await tx
        .select({ id: emailOutbox.id, subject: emailOutbox.subject, kind: emailOutbox.kind, status: emailOutbox.status, to: emailOutbox.to, sendAfter: emailOutbox.sendAfter, sentAt: emailOutbox.sentAt, error: emailOutbox.error })
        .from(emailOutbox)
        .where(eq(emailOutbox.applicationId, id))
        .orderBy(desc(emailOutbox.sendAfter));
      const [ac] = await tx.select().from(admissionClasses).where(eq(admissionClasses.id, a.admissionClassId));
      const attempt = await this.attemptFor(tx, a);
      let exam = null;
      if (attempt) {
        const qs = await tx.select().from(questions).where(inArray(questions.id, attempt.questionIds));
        const subj = await tx.select({ id: subjects.id, name: subjects.name }).from(subjects);
        const bySubject = new Map<string, { name: string; questions: number; correct: number }>();
        for (const q of qs) {
          const s = bySubject.get(q.subjectId) ?? { name: subj.find((x) => x.id === q.subjectId)?.name ?? 'Other', questions: 0, correct: 0 };
          s.questions++;
          if ((attempt.answers[q.id] ?? '').toUpperCase() === q.answer.toUpperCase()) s.correct++;
          bySubject.set(q.subjectId, s);
        }
        exam = {
          startedAt: attempt.startedAt,
          submittedAt: attempt.submittedAt,
          score: attempt.score,
          maxScore: attempt.maxScore,
          percentage: attempt.percentage,
          answered: Object.keys(attempt.answers).length,
          questions: attempt.questionIds.length,
          subjects: [...bySubject.values()].map((s) => ({ ...s, percentage: s.questions ? Math.round((s.correct / s.questions) * 100) : 0 })),
        };
      }
      const [student] = a.studentId ? await tx.select({ id: students.id, admissionNumber: students.admissionNumber }).from(students).where(eq(students.id, a.studentId)) : [];
      return {
        ...a,
        childName: fullName(a),
        className: await this.classLabel(tx, a.classId),
        statusLabel: STATUS_LABEL[a.status],
        passMark: ac?.passMark ?? null,
        entranceTestId: ac?.entranceTestId ?? null,
        statusLink: this.statusLink(school, a),
        exam,
        student: student ?? null,
        events,
        emails,
      };
    });
  }

  private async mine(tx: Tx, id: string) {
    const [a] = await tx.select().from(applications).where(eq(applications.id, id)).for('update');
    return found(a, 'Application');
  }

  markPaid(user: Principal, id: string, method: string) {
    return this.dbs.withSchool(user.schoolId, async (tx) => {
      const school = await this.schoolById(user.schoolId);
      const a = await this.mine(tx, id);
      if (a.feePaidAt) throw new BadRequestException('The form fee is already recorded as paid');
      const updated = await this.setStatus(tx, a, a.status === 'pending_payment' ? 'applied' : a.status, { feePaidAt: new Date(), feeMethod: method });
      await this.event(tx, a, 'fee_paid', `${formatNaira(a.feeKobo)} recorded as paid (${method.replace('_', ' ')})`, user.staffId);
      await this.email.cancel(tx, a.id, ['admission_fee_reminder']);
      if (a.status === 'pending_payment') await this.onSubmitted(tx, school, await this.siteOf(tx, school.id), updated);
      return updated;
    });
  }

  /** Invites applicants to the entrance exam for a time window, with a reminder the day before. */
  scheduleExam(user: Principal, input: { applicationIds: string[]; opensAt: string; closesAt: string }) {
    const opensAt = new Date(input.opensAt);
    const closesAt = new Date(input.closesAt);
    if (opensAt >= closesAt) throw new BadRequestException('The exam must open before it closes');
    return this.dbs.withSchool(user.schoolId, async (tx) => {
      const school = await this.schoolById(user.schoolId);
      const site = await this.siteOf(tx, school.id);
      let scheduled = 0;
      const skipped: { reference: string; reason: string }[] = [];
      for (const id of [...new Set(input.applicationIds)]) {
        const a = await this.mine(tx, id);
        const [ac] = await tx.select().from(admissionClasses).where(eq(admissionClasses.id, a.admissionClassId));
        if (!ac?.entranceTestId) {
          skipped.push({ reference: a.reference, reason: 'This class has no entrance exam' });
          continue;
        }
        if (a.status !== 'applied' && a.status !== 'exam') {
          skipped.push({ reference: a.reference, reason: `Application is ${STATUS_LABEL[a.status].toLowerCase()}` });
          continue;
        }
        const attempt = await this.attemptFor(tx, a);
        if (attempt?.submittedAt) {
          skipped.push({ reference: a.reference, reason: 'Already sat the exam' });
          continue;
        }
        const [test] = await tx.select().from(cbtTests).where(eq(cbtTests.id, ac.entranceTestId));
        const updated = await this.setStatus(tx, a, 'exam', { examTestId: ac.entranceTestId, examOpensAt: opensAt, examClosesAt: closesAt });
        const rescheduled = a.status === 'exam';
        if (rescheduled) await this.email.cancel(tx, a.id, ['admission_exam_reminder', 'admission_exam_missed']);
        await this.event(tx, a, 'exam_scheduled', `${rescheduled ? 'Rescheduled' : 'Scheduled'} for ${lagosTime(opensAt)}`, user.staffId);
        const link = this.statusLink(school, a);
        const body = [
          `Dear ${a.parentName},`,
          `${fullName(a)} is invited to sit the ${test?.title ?? 'entrance exam'} online. It takes ${test?.durationMinutes ?? 'about 30'} minutes on a phone or computer.`,
          `The exam opens on ${lagosTime(opensAt)} and closes on ${lagosTime(closesAt)}. Once started, the timer cannot be paused, so please make sure ${a.firstName} has a quiet place and a charged device.`,
          `Open the exam page: ${link}`,
        ];
        await this.mail(tx, school, site, updated, { subject: `${rescheduled ? 'New date for' : 'Invitation to'} the entrance exam: ${a.firstName}`, kind: 'admission_exam_invite', body });
        await this.sms(tx, a, 'admission', `${school.name}: ${a.firstName}'s entrance exam opens ${lagosTime(opensAt)}. Check ${a.parentEmail} for the link.`);
        const remindAt = new Date(opensAt.getTime() - DAY);
        if (remindAt.getTime() > Date.now() + HOUR) {
          await this.mail(tx, school, site, updated, {
            subject: `Tomorrow: ${a.firstName}'s entrance exam`,
            kind: 'admission_exam_reminder',
            onlyIfStatus: 'exam',
            sendAfter: remindAt,
            body: [`Dear ${a.parentName},`, `A reminder that ${fullName(a)}'s entrance exam opens on ${lagosTime(opensAt)}.`, `Open the exam page: ${link}`],
          });
        }
        // If the window is about to close and the exam has not been sat, nudge once more.
        const lastCall = new Date(closesAt.getTime() - 3 * HOUR);
        if (lastCall > opensAt) {
          await this.mail(tx, school, site, updated, {
            subject: `Last chance: ${a.firstName}'s entrance exam closes soon`,
            kind: 'admission_exam_missed',
            onlyIfStatus: 'exam',
            sendAfter: lastCall,
            body: [`Dear ${a.parentName},`, `${fullName(a)} has not sat the entrance exam yet. It closes on ${lagosTime(closesAt)}.`, `Open the exam page: ${link}`],
          });
        }
        scheduled++;
      }
      return { scheduled, skipped };
    });
  }

  offer(user: Principal, id: string, note?: string) {
    return this.dbs.withSchool(user.schoolId, async (tx) => {
      const school = await this.schoolById(user.schoolId);
      const a = await this.mine(tx, id);
      if (!['applied', 'exam'].includes(a.status)) throw new BadRequestException(`An application that is ${STATUS_LABEL[a.status].toLowerCase()} cannot be offered a place`);
      const [ac] = await tx.select().from(admissionClasses).where(eq(admissionClasses.id, a.admissionClassId));
      if (ac?.seats != null) {
        const [{ n }] = await tx
          .select({ n: sql<number>`count(*)::int` })
          .from(applications)
          .where(and(eq(applications.admissionClassId, ac.id), inArray(applications.status, ['offered', 'accepted', 'enrolled'])));
        if (n >= ac.seats) throw new BadRequestException(`All ${ac.seats} places for this class are taken. Add seats in admissions settings first.`);
      }
      const updated = await this.setStatus(tx, a, 'offered', { offeredAt: new Date(), offerNote: note ?? null, decidedBy: user.staffId });
      await this.email.cancel(tx, a.id, ['admission_exam_reminder', 'admission_exam_missed']);
      await this.event(tx, a, 'offered', note, user.staffId);
      const site = await this.siteOf(tx, school.id);
      const link = this.statusLink(school, a);
      const cls = await this.classLabel(tx, a.classId);
      await this.mail(tx, school, site, updated, {
        subject: `Offer of admission: ${fullName(a)}`,
        kind: 'admission_offer',
        body: [
          `Dear ${a.parentName},`,
          `We are delighted to offer ${fullName(a)} a place in ${cls}${site?.admissionSession ? ` for the ${site.admissionSession} session` : ''}.`,
          ...(note ? [note] : []),
          `Please accept the offer online so we can reserve the place and complete enrolment.`,
          `Accept the offer: ${link}`,
        ],
      });
      await this.sms(tx, a, 'admission', `${school.name}: congratulations! ${a.firstName} has been offered admission into ${cls}. Accept via the link sent to ${a.parentEmail}.`);
      for (const after of [3 * DAY, 7 * DAY]) {
        await this.mail(tx, school, site, updated, {
          subject: `Reminder: please accept ${a.firstName}'s offer`,
          kind: 'admission_offer_reminder',
          onlyIfStatus: 'offered',
          sendAfter: new Date(Date.now() + after),
          body: [`Dear ${a.parentName},`, `${fullName(a)}'s offer of a place in ${cls} is waiting for your reply. Places are limited, so please accept it soon.`, `Accept the offer: ${link}`],
        });
      }
      return updated;
    });
  }

  reject(user: Principal, id: string, note?: string) {
    return this.dbs.withSchool(user.schoolId, async (tx) => {
      const school = await this.schoolById(user.schoolId);
      const a = await this.mine(tx, id);
      if (['enrolled', 'rejected', 'withdrawn'].includes(a.status)) throw new BadRequestException(`This application is already ${STATUS_LABEL[a.status].toLowerCase()}`);
      const updated = await this.setStatus(tx, a, 'rejected', { decisionNote: note ?? null, decidedBy: user.staffId });
      await this.event(tx, a, 'rejected', note, user.staffId);
      await this.email.cancel(tx, a.id, FOLLOW_UPS);
      await this.mail(tx, school, await this.siteOf(tx, school.id), updated, {
        subject: `Update on ${a.firstName}'s application (${a.reference})`,
        kind: 'admission_rejected',
        body: [
          `Dear ${a.parentName},`,
          `Thank you for your interest in ${school.name}. After careful review, we are unable to offer ${fullName(a)} a place at this time.`,
          ...(note ? [note] : []),
          `We wish ${a.firstName} every success.`,
        ],
      });
      return updated;
    });
  }

  /**
   * Turns an accepted (or offered) applicant into a student: the class register, the parent
   * account (matched by phone), a portal PIN, and a welcome email with the admission number.
   */
  enrol(user: Principal, id: string, input: { admissionNumber?: string }) {
    return this.dbs.withSchool(user.schoolId, async (tx) => {
      const school = await this.schoolById(user.schoolId);
      const a = await this.mine(tx, id);
      if (a.status === 'enrolled') throw new BadRequestException('Already enrolled');
      if (!['offered', 'accepted'].includes(a.status)) throw new BadRequestException('Offer a place before enrolling');

      let admissionNumber = input.admissionNumber?.trim();
      if (!admissionNumber) {
        const year = new Date().getFullYear();
        const prefix = `${school.slug.split('-')[0].toUpperCase()}/${year}/`;
        const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(students).where(sql`${students.admissionNumber} like ${`${prefix}%`}`);
        admissionNumber = `${prefix}${String(n + 1).padStart(3, '0')}`;
      }
      const [clash] = await tx.select({ id: students.id }).from(students).where(eq(students.admissionNumber, admissionNumber));
      if (clash) throw new BadRequestException(`Admission number ${admissionNumber} is already in use`);

      const pin = newPin();
      const [student] = await tx
        .insert(students)
        .values({
          schoolId: school.id,
          admissionNumber,
          firstName: a.firstName,
          lastName: a.lastName,
          otherNames: a.otherNames,
          gender: a.gender,
          dateOfBirth: a.dateOfBirth,
          classId: a.classId,
          pinHash: await bcrypt.hash(pin, 10),
        })
        .returning();
      let [guardian] = await tx.select().from(guardians).where(eq(guardians.phone, a.parentPhone));
      if (!guardian) {
        [guardian] = await tx.insert(guardians).values({ schoolId: school.id, fullName: a.parentName, phone: a.parentPhone, email: a.parentEmail }).returning();
      } else if (!guardian.email) {
        await tx.update(guardians).set({ email: a.parentEmail }).where(eq(guardians.id, guardian.id));
      }
      await tx.insert(studentGuardians).values({ schoolId: school.id, studentId: student.id, guardianId: guardian.id, relationship: a.relationship }).onConflictDoNothing();

      const updated = await this.setStatus(tx, a, 'enrolled', { studentId: student.id, enrolledAt: new Date(), acceptedAt: a.acceptedAt ?? new Date() });
      await this.event(tx, a, 'enrolled', `Admission number ${admissionNumber}`, user.staffId);
      await this.email.cancel(tx, a.id, FOLLOW_UPS);
      const portal = config.portalUrl();
      await this.mail(tx, school, await this.siteOf(tx, school.id), updated, {
        subject: `Welcome to ${school.name}, ${a.firstName}!`,
        kind: 'admission_enrolled',
        body: [
          `Dear ${a.parentName},`,
          `${fullName(a)} is now enrolled at ${school.name} in ${await this.classLabel(tx, a.classId)}. Welcome to the family!`,
          `Admission number: ${admissionNumber}\nStudent portal PIN: ${pin}\nSchool code: ${school.slug}`,
          `${a.firstName} uses the admission number and PIN for CBT tests, exam prep and the AI tutor. You can follow results, attendance and fees in the parent portal by signing in with ${a.parentPhone.replace(/^234/, '0')}.`,
          `Open the portal: ${portal}`,
        ],
      });
      await this.sms(tx, a, 'admission', `${school.name}: ${a.firstName} is enrolled. Admission no. ${admissionNumber}. Details sent to ${a.parentEmail}.`);
      return { application: updated, student: { id: student.id, admissionNumber }, pin };
    });
  }

  /** A one-off email from the admissions office to a family. */
  message(user: Principal, id: string, input: { subject: string; message: string }) {
    return this.dbs.withSchool(user.schoolId, async (tx) => {
      const school = await this.schoolById(user.schoolId);
      const a = await this.mine(tx, id);
      await this.mail(tx, school, await this.siteOf(tx, school.id), a, {
        subject: input.subject,
        kind: 'admission_message',
        body: [`Dear ${a.parentName},`, ...input.message.split(/\n{2,}/), `Track the application: ${this.statusLink(school, a)}`],
      });
      await this.event(tx, a, 'email_sent', input.subject, user.staffId);
      return { queued: 1 };
    });
  }

  note(user: Principal, id: string, text: string) {
    return this.dbs.withSchool(user.schoolId, async (tx) => {
      const a = await this.mine(tx, id);
      await this.event(tx, a, 'note', text, user.staffId);
      return { ok: true };
    });
  }

  async dispatchEmails(user: Principal) {
    if (user.role === 'teacher') throw new ForbiddenException();
    return this.email.dispatchForSchool(user.schoolId);
  }
}

function publicSchool(s: School) {
  return { id: s.id, name: s.name, slug: s.slug, motto: s.motto, address: s.address, phone: s.phone, email: s.email };
}

/** The family's progress tracker: each step done, current or still to come. */
function progressSteps(a: Application, hasExam: boolean) {
  const order: ApplicationStatus[] = ['pending_payment', 'applied', 'exam', 'offered', 'accepted', 'enrolled'];
  const at = order.indexOf(a.status);
  const steps = [
    { key: 'applied', label: 'Form submitted', done: at >= 1 || a.feeKobo === 0 },
    ...(a.feeKobo > 0 ? [{ key: 'fee', label: 'Form fee paid', done: Boolean(a.feePaidAt) }] : []),
    ...(hasExam ? [{ key: 'exam', label: 'Entrance exam', done: a.examPercentage != null || at >= 3 }] : []),
    { key: 'offered', label: 'Offer of admission', done: at >= 3 },
    { key: 'accepted', label: 'Offer accepted', done: at >= 4 },
    { key: 'enrolled', label: 'Enrolled', done: at >= 5 },
  ];
  return steps;
}
