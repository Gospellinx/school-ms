import { BadRequestException, Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import {
  absentStreak,
  addDays,
  DEFAULT_SEQUENCES,
  dueStep,
  FollowUpChannel,
  formatNaira,
  inSendingWindow,
  Instalment,
  lagosClock,
  renderTemplate,
  SequenceStep,
  SequenceTrigger,
  splitInstalments,
  validateInstalments,
  weekStart,
} from '@school-ms/core';
import { and, asc, desc, eq, gte, inArray, isNotNull, lt, ne, or, sql } from 'drizzle-orm';
import { randomBytes } from 'node:crypto';
import { Principal } from '../auth/auth.types';
import { todayInLagos } from '../common/access';
import { config } from '../common/config';
import { found } from '../common/validation';
import { Tx } from '../db/client';
import { DbService } from '../db/db.service';
import {
  attendanceRecords,
  automationRuns,
  automationSettings,
  cbtAttempts,
  classes,
  DigestRecipient,
  followUpSequences,
  guardians,
  instalmentPlans,
  invoices,
  notifications,
  payLinks,
  payments,
  schools,
  scores,
  staff,
  studentGuardians,
  students,
  subjects,
  terms,
} from '../db/schema';
import { EmailProvider } from '../messaging/email.provider';
import { LiveService } from '../live/live.service';
import { LogProvider, MessagingProvider } from '../messaging/messaging.provider';
import { NotificationsService } from '../messaging/notifications.service';
import { viewPlan } from './plans';

type School = typeof schools.$inferSelect;
type Settings = typeof automationSettings.$inferSelect;
type Sequence = typeof followUpSequences.$inferSelect;
type Guardian = typeof guardians.$inferSelect;
type Term = typeof terms.$inferSelect;

interface Ctx {
  school: School;
  settings: Settings;
  sequences: Record<SequenceTrigger, Sequence>;
  term: Term | null;
}

/** One fee reminder that is due now. */
interface FeeDue {
  key: string;
  invoiceId: string;
  studentId: string;
  studentFirstName: string;
  studentName: string;
  termName: string;
  anchor: string;
  step: number;
  balanceKobo: number;
  amountDueKobo: number;
  plan: { index: number; count: number } | null;
}

export interface RunResult {
  feeReminders: number;
  newParents: number;
  absences: number;
  weeklyReports: number;
  dailySummaries: number;
  messages: number;
}

const TRIGGERS: SequenceTrigger[] = ['fee_overdue', 'new_parent', 'absent_streak'];
const DEFAULT_ABSENCE_THRESHOLD = 3;
const dayStart = (date: string) => new Date(`${date}T00:00:00+01:00`);
const shortDate = (date: string) =>
  new Date(`${date}T12:00:00Z`).toLocaleDateString('en-NG', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
const longDate = (date: string) => new Date(`${date}T12:00:00Z`).toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const compactNaira = (kobo: number) => {
  const n = kobo / 100;
  if (n >= 1_000_000) return `₦${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}m`;
  if (n >= 100_000) return `₦${Math.round(n / 1000)}k`;
  return formatNaira(kobo);
};

/**
 * The parent follow-up autopilot. Every few minutes it checks each school for fee reminders due,
 * new parents to welcome, children missing school, the weekly parent report and the proprietor's
 * daily summary, and queues the messages in the outbox. Each send is recorded in automation_runs
 * under a unique key first, so nothing goes out twice even with several API servers running.
 */
@Injectable()
export class AutomationsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AutomationsService.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly dbs: DbService,
    private readonly notifications: NotificationsService,
    private readonly email: EmailProvider,
    private readonly sms: MessagingProvider,
    private readonly live: LiveService,
  ) {}

  onModuleInit() {
    const every = config.automationsPollMs();
    if (every > 0) {
      this.timer = setInterval(() => void this.tick().catch((err) => this.logger.error(err)), every);
      this.timer.unref();
    }
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async tick(now = new Date()) {
    if (this.running) return;
    this.running = true;
    try {
      const all = await this.dbs.db.select({ id: schools.id }).from(schools);
      for (const s of all) {
        try {
          await this.runForSchool(s.id, now);
        } catch (err) {
          this.logger.error(`Autopilot failed for school ${s.id}: ${(err as Error).message}`);
        }
      }
    } finally {
      this.running = false;
    }
  }

  /** Runs every automation for one school as of `now`. Each part has its own transaction, so one failure does not block the rest. */
  async runForSchool(schoolId: string, now = new Date()): Promise<RunResult> {
    const clock = lagosClock(now);
    const r: RunResult = { feeReminders: 0, newParents: 0, absences: 0, weeklyReports: 0, dailySummaries: 0, messages: 0 };
    const part = async (fn: (tx: Tx, ctx: Ctx) => Promise<{ runs: number; messages: number }>, key: keyof RunResult) => {
      const out = await this.dbs.withSchool(schoolId, async (tx) => fn(tx, await this.context(tx, schoolId)));
      r[key] += out.runs;
      r.messages += out.messages;
    };
    const ctx = await this.dbs.withSchool(schoolId, (tx) => this.context(tx, schoolId));
    if (inSendingWindow(clock.hour, ctx.settings.sendFrom, ctx.settings.sendUntil)) {
      await part((tx, c) => this.sendFeeReminders(tx, c, clock.date), 'feeReminders');
      await part((tx, c) => this.sendNewParentSteps(tx, c, now), 'newParents');
      await part((tx, c) => this.sendAbsenceFollowUps(tx, c, clock.date), 'absences');
      if (ctx.settings.weeklyReport && clock.weekday === ctx.settings.weeklyDay && clock.hour >= ctx.settings.weeklyHour) {
        await part((tx, c) => this.sendWeeklyReports(tx, c, clock.date, clock.isoWeek), 'weeklyReports');
      }
    }
    if (ctx.settings.dailySummary && clock.hour >= ctx.settings.dailyHour) {
      await part((tx, c) => this.sendDailySummary(tx, c, clock.date, `daily:${clock.date}`), 'dailySummaries');
    }
    return r;
  }

  // ------------------------------------------------------------ Shared helpers

  private async context(tx: Tx, schoolId: string): Promise<Ctx> {
    const [school] = await this.dbs.db.select().from(schools).where(eq(schools.id, schoolId));
    found(school, 'School');
    const settings = await this.ensureSettings(tx, schoolId);
    const sequences = await this.ensureSequences(tx, schoolId);
    const [term] = await tx.select().from(terms).where(eq(terms.isCurrent, true)).limit(1);
    return { school, settings, sequences, term: term ?? null };
  }

  async ensureSettings(tx: Tx, schoolId: string): Promise<Settings> {
    await tx.insert(automationSettings).values({ schoolId }).onConflictDoNothing();
    const [row] = await tx.select().from(automationSettings);
    return row;
  }

  async ensureSequences(tx: Tx, schoolId: string): Promise<Record<SequenceTrigger, Sequence>> {
    let rows = await tx.select().from(followUpSequences);
    if (rows.length < TRIGGERS.length) {
      await tx
        .insert(followUpSequences)
        .values(
          TRIGGERS.map((t) => ({
            schoolId,
            trigger: t,
            name: DEFAULT_SEQUENCES[t].name,
            steps: DEFAULT_SEQUENCES[t].steps,
            threshold: t === 'absent_streak' ? DEFAULT_ABSENCE_THRESHOLD : null,
          })),
        )
        .onConflictDoNothing();
      rows = await tx.select().from(followUpSequences);
    }
    return Object.fromEntries(rows.map((r) => [r.trigger, r])) as Record<SequenceTrigger, Sequence>;
  }

  /** Records a send under a unique key. Returns the run id, or null when it already happened. */
  private async claim(tx: Tx, schoolId: string, values: Omit<typeof automationRuns.$inferInsert, 'schoolId'>): Promise<string | null> {
    const [row] = await tx
      .insert(automationRuns)
      .values({ ...values, schoolId })
      .onConflictDoNothing()
      .returning({ id: automationRuns.id });
    return row?.id ?? null;
  }

  private async finishRun(tx: Tx, runId: string, messages: number, summary: string) {
    await tx.update(automationRuns).set({ messages, summary: summary.slice(0, 300) }).where(eq(automationRuns.id, runId));
  }

  /** The short link in reminders that lets a parent pay a bill without signing in. One per bill. */
  async payLink(tx: Tx, schoolId: string, invoiceId: string): Promise<string> {
    const [existing] = await tx.select().from(payLinks).where(eq(payLinks.invoiceId, invoiceId));
    let token = existing?.token;
    if (!token) {
      token = randomBytes(9).toString('base64url');
      await tx.insert(payLinks).values({ token, schoolId, invoiceId });
    }
    return `${config.portalUrl()}/pay/${token}`;
  }

  private async guardiansOf(tx: Tx, studentIds: string[]): Promise<Map<string, Guardian[]>> {
    const out = new Map<string, Guardian[]>();
    if (studentIds.length === 0) return out;
    const rows = await tx
      .select({ studentId: studentGuardians.studentId, guardian: guardians })
      .from(studentGuardians)
      .innerJoin(guardians, eq(guardians.id, studentGuardians.guardianId))
      .where(inArray(studentGuardians.studentId, studentIds));
    for (const r of rows) out.set(r.studentId, [...(out.get(r.studentId) ?? []), r.guardian]);
    return out;
  }

  /**
   * Queues a message to each guardian on each channel. `preferred` is the parent's SMS or WhatsApp
   * choice; email is skipped for parents without an address. The same address never gets a copy twice.
   */
  private async queueToGuardians(
    tx: Tx,
    schoolId: string,
    recipients: { guardian: Guardian; studentId: string | null }[],
    channels: FollowUpChannel[],
    kind: string,
    subject: string,
    body: (channel: 'sms' | 'whatsapp' | 'email', guardian: Guardian) => string,
  ): Promise<number> {
    const rows: (typeof notifications.$inferInsert)[] = [];
    const seen = new Set<string>();
    for (const { guardian, studentId } of recipients) {
      for (const c of channels) {
        const channel = c === 'preferred' ? guardian.preferredChannel : c;
        const to = channel === 'email' ? guardian.email : guardian.phone;
        if (!to || seen.has(`${channel}:${to}`)) continue;
        seen.add(`${channel}:${to}`);
        rows.push({ schoolId, channel, to, subject: channel === 'email' ? subject : null, body: body(channel, guardian), kind, guardianId: guardian.id, studentId });
      }
    }
    if (rows.length) await tx.insert(notifications).values(rows);
    return rows.length;
  }

  private baseVars(ctx: Ctx) {
    return { school_name: ctx.school.name, school_phone: ctx.school.phone ?? 'the school office', portal_link: config.portalUrl() };
  }

  // ------------------------------------------------------------ Fee recovery

  /** The date this term's fees fall due: the term's start plus the school's grace days. */
  feeDueDate(ctx: Ctx): string | null {
    return ctx.term?.startsOn ? addDays(ctx.term.startsOn, ctx.settings.feeDueDays) : null;
  }

  /** Bills with a reminder due today that has not gone out yet. */
  private async feeRemindersDue(tx: Tx, ctx: Ctx, today: string): Promise<FeeDue[]> {
    const seq = ctx.sequences.fee_overdue;
    const termDue = this.feeDueDate(ctx);
    const rows = await tx
      .select({ invoice: invoices, student: students, term: terms, plan: instalmentPlans })
      .from(invoices)
      .innerJoin(students, eq(students.id, invoices.studentId))
      .innerJoin(terms, eq(terms.id, invoices.termId))
      .leftJoin(instalmentPlans, eq(instalmentPlans.invoiceId, invoices.id))
      .where(and(ne(invoices.status, 'paid'), or(ctx.term ? eq(invoices.termId, ctx.term.id) : sql`false`, isNotNull(instalmentPlans.id))))
      .orderBy(asc(students.lastName), asc(students.firstName));

    const due: FeeDue[] = [];
    for (const { invoice, student, term, plan } of rows) {
      const balanceKobo = invoice.totalKobo - invoice.paidKobo;
      let anchor: string | null = termDue;
      let amountDueKobo = balanceKobo;
      let planInfo: FeeDue['plan'] = null;
      if (plan) {
        const { progress } = viewPlan(plan, invoice.paidKobo, today);
        if (!progress.next) continue;
        anchor = progress.next.dueOn;
        amountDueKobo = progress.behindKobo > 0 ? progress.behindKobo : progress.next.outstandingKobo;
        const sorted = [...plan.schedule].sort((a, b) => a.dueOn.localeCompare(b.dueOn));
        planInfo = { index: sorted.findIndex((i) => i.dueOn === anchor) + 1, count: sorted.length };
      }
      if (!anchor || amountDueKobo <= 0) continue;
      const step = dueStep(seq.steps, anchor, today);
      if (step === null) continue;
      due.push({
        key: `fee:${invoice.id}:${anchor}:${step}`,
        invoiceId: invoice.id,
        studentId: student.id,
        studentFirstName: student.firstName,
        studentName: `${student.firstName} ${student.lastName}`,
        termName: term.name,
        anchor,
        step,
        balanceKobo,
        amountDueKobo,
        plan: planInfo,
      });
    }
    if (due.length === 0) return due;
    const sent = await tx
      .select({ key: automationRuns.key })
      .from(automationRuns)
      .where(inArray(automationRuns.key, due.map((d) => d.key)));
    const done = new Set(sent.map((s) => s.key));
    return due.filter((d) => !done.has(d.key));
  }

  private async sendFeeReminders(tx: Tx, ctx: Ctx, today: string) {
    const seq = ctx.sequences.fee_overdue;
    if (!seq.enabled) return { runs: 0, messages: 0 };
    const due = await this.feeRemindersDue(tx, ctx, today);
    const parents = await this.guardiansOf(tx, due.map((d) => d.studentId));
    let runs = 0;
    let messages = 0;
    for (const d of due) {
      const kin = parents.get(d.studentId) ?? [];
      if (kin.length === 0) continue;
      const runId = await this.claim(tx, ctx.school.id, { key: d.key, kind: 'fee_reminder', step: d.step, invoiceId: d.invoiceId, studentId: d.studentId });
      if (!runId) continue;
      const step = seq.steps[d.step];
      const vars = {
        ...this.baseVars(ctx),
        student_first_name: d.studentFirstName,
        student_name: d.studentName,
        term: d.termName,
        balance: formatNaira(d.balanceKobo),
        amount_due: formatNaira(d.amountDueKobo),
        due_date: longDate(d.anchor),
        pay_link: await this.payLink(tx, ctx.school.id, d.invoiceId),
        hold_note: ctx.school.withholdResultsForDebt ? 'Report cards are released once fees are cleared.' : '',
        plan_note: d.plan ? `This is instalment ${d.plan.index} of ${d.plan.count} on your payment plan.` : '',
      };
      const count = await this.queueToGuardians(
        tx,
        ctx.school.id,
        kin.map((g) => ({ guardian: g, studentId: d.studentId })),
        step.channels,
        'fee_reminder',
        renderTemplate(step.subject, vars),
        (_c, g) => renderTemplate(step.body, { ...vars, parent_name: g.fullName }),
      );
      await this.finishRun(tx, runId, count, `Step ${d.step + 1} to ${d.studentName}'s parents: ${formatNaira(d.amountDueKobo)} due`);
      runs++;
      messages += count;
    }
    return { runs, messages };
  }

  /** The fee recovery dashboard: what is owed, what the reminders brought in, and who is due a reminder today. */
  feeRecovery(schoolId: string) {
    return this.dbs.withSchool(schoolId, async (tx) => {
      const ctx = await this.context(tx, schoolId);
      const today = todayInLagos();
      const termId = ctx.term?.id;
      const [owing] = termId
        ? await tx
            .select({
              bills: sql<number>`count(*)::int`,
              kobo: sql<number>`coalesce(sum(${invoices.totalKobo} - ${invoices.paidKobo}), 0)::bigint`,
              expected: sql<number>`coalesce(sum(${invoices.totalKobo}), 0)::bigint`,
            })
            .from(invoices)
            .where(and(eq(invoices.termId, termId), ne(invoices.status, 'paid')))
        : [{ bills: 0, kobo: 0, expected: 0 }];
      const bySteps = termId
        ? await tx
            .select({ step: automationRuns.step, runs: sql<number>`count(*)::int`, messages: sql<number>`coalesce(sum(${automationRuns.messages}), 0)::int` })
            .from(automationRuns)
            .innerJoin(invoices, eq(invoices.id, automationRuns.invoiceId))
            .where(and(eq(automationRuns.kind, 'fee_reminder'), eq(invoices.termId, termId)))
            .groupBy(automationRuns.step)
        : [];
      const recovered = termId
        ? (
            await tx.execute<{ kobo: string; bills: number }>(sql`
              select coalesce(sum(p.amount_kobo), 0)::bigint as kobo, count(distinct p.invoice_id)::int as bills
              from ${payments} p
              join (
                select invoice_id, min(created_at) as first_at from ${automationRuns}
                where kind = 'fee_reminder' and invoice_id is not null group by invoice_id
              ) r on r.invoice_id = p.invoice_id
              join ${invoices} i on i.id = p.invoice_id
              where p.status = 'success' and p.paid_at > r.first_at and i.term_id = ${termId}`)
          ).rows[0]
        : { kobo: '0', bills: 0 };
      const plans = await tx
        .select({ plan: instalmentPlans, invoice: invoices })
        .from(instalmentPlans)
        .innerJoin(invoices, eq(invoices.id, instalmentPlans.invoiceId))
        .where(ne(invoices.status, 'paid'));
      const views = plans.map((p) => viewPlan(p.plan, p.invoice.paidKobo, today));
      const dueToday = await this.feeRemindersDue(tx, ctx, today);
      const seq = ctx.sequences.fee_overdue;
      return {
        enabled: seq.enabled,
        term: ctx.term ? { id: ctx.term.id, name: ctx.term.name, startsOn: ctx.term.startsOn } : null,
        dueDate: this.feeDueDate(ctx),
        feeDueDays: ctx.settings.feeDueDays,
        withholdResultsForDebt: ctx.school.withholdResultsForDebt,
        holdAllowsPlans: ctx.settings.holdAllowsPlans,
        owingBills: owing.bills,
        owingKobo: Number(owing.kobo),
        reminders: seq.steps.map((s, i) => {
          const hit = bySteps.find((b) => b.step === i);
          return { step: i, offsetDays: s.offsetDays, subject: s.subject, sent: hit?.runs ?? 0, messages: hit?.messages ?? 0 };
        }),
        recoveredKobo: Number(recovered.kobo),
        recoveredBills: Number(recovered.bills),
        plans: { total: views.length, onTrack: views.filter((v) => v.progress.onTrack).length, behindKobo: views.reduce((s, v) => s + v.progress.behindKobo, 0) },
        dueToday: dueToday.map((d) => ({
          invoiceId: d.invoiceId,
          student: d.studentName,
          step: d.step,
          amountDueKobo: d.amountDueKobo,
          dueDate: d.anchor,
          plan: d.plan,
        })),
      };
    });
  }

  // ------------------------------------------------------------ Instalment plans

  listPlans(schoolId: string) {
    return this.dbs.withSchool(schoolId, async (tx) => {
      const rows = await tx
        .select({ plan: instalmentPlans, invoice: invoices, student: students, term: terms })
        .from(instalmentPlans)
        .innerJoin(invoices, eq(invoices.id, instalmentPlans.invoiceId))
        .innerJoin(students, eq(students.id, invoices.studentId))
        .innerJoin(terms, eq(terms.id, invoices.termId))
        .orderBy(asc(students.lastName));
      return rows.map((r) => ({
        invoiceId: r.invoice.id,
        number: r.invoice.number,
        term: r.term.name,
        student: { id: r.student.id, name: `${r.student.lastName} ${r.student.firstName}` },
        totalKobo: r.invoice.totalKobo,
        paidKobo: r.invoice.paidKobo,
        balanceKobo: r.invoice.totalKobo - r.invoice.paidKobo,
        plan: viewPlan(r.plan, r.invoice.paidKobo),
      }));
    });
  }

  /**
   * Agrees an instalment plan for what is still owed on a bill: either `count` equal parts
   * starting `firstDueOn`, or a custom schedule. Replaces any earlier plan and tells the parents.
   */
  setPlan(
    user: Principal,
    invoiceId: string,
    input: { count?: number; firstDueOn?: string; everyDays?: number; schedule?: Instalment[]; note?: string },
  ) {
    return this.dbs.withSchool(user.schoolId, async (tx) => {
      const ctx = await this.context(tx, user.schoolId);
      const [row] = await tx
        .select({ invoice: invoices, student: students })
        .from(invoices)
        .innerJoin(students, eq(students.id, invoices.studentId))
        .where(eq(invoices.id, invoiceId))
        .for('update', { of: invoices });
      found(row, 'Invoice');
      const balance = row.invoice.totalKobo - row.invoice.paidKobo;
      if (balance <= 0) throw new BadRequestException('This bill is already fully paid');
      const schedule = input.schedule ?? splitInstalments(balance, input.count ?? 3, input.firstDueOn ?? todayInLagos(), input.everyDays ?? 30);
      const problem = validateInstalments(schedule, balance);
      if (problem) throw new BadRequestException(problem);
      schedule.sort((a, b) => a.dueOn.localeCompare(b.dueOn));

      await tx.delete(instalmentPlans).where(eq(instalmentPlans.invoiceId, invoiceId));
      const [plan] = await tx
        .insert(instalmentPlans)
        .values({ schoolId: user.schoolId, invoiceId, schedule, paidBeforeKobo: row.invoice.paidKobo, note: input.note, createdBy: user.staffId })
        .returning();

      const link = await this.payLink(tx, user.schoolId, invoiceId);
      const lines = schedule.map((i, n) => `${n + 1}. ${formatNaira(i.amountKobo)} by ${longDate(i.dueOn)}`);
      const kin = (await this.guardiansOf(tx, [row.student.id])).get(row.student.id) ?? [];
      const subject = `Payment plan for ${row.student.firstName}'s fees`;
      await this.queueToGuardians(
        tx,
        user.schoolId,
        kin.map((g) => ({ guardian: g, studentId: row.student.id })),
        ['preferred', 'email'],
        'payment_plan',
        subject,
        (channel, g) =>
          channel === 'email'
            ? `Dear ${g.fullName},\n\n${ctx.school.name} has agreed a payment plan for ${row.student.firstName} ${row.student.lastName}'s outstanding fees of ${formatNaira(balance)}:\n\n${lines.join('\n')}\n\nPay each instalment here: ${link}\n\nWe will remind you a few days before each date. As long as the plan is kept, report cards stay available.`
            : `Dear ${g.fullName}, ${ctx.school.name} agreed a payment plan for ${row.student.firstName}'s fees: ${lines.join('; ')}. Pay here: ${link}`,
      );
      return { ...viewPlan(plan, row.invoice.paidKobo), payLink: link };
    });
  }

  cancelPlan(schoolId: string, invoiceId: string) {
    return this.dbs.withSchool(schoolId, async (tx) => {
      const [row] = await tx.delete(instalmentPlans).where(eq(instalmentPlans.invoiceId, invoiceId)).returning();
      found(row, 'Payment plan');
      return { cancelled: true };
    });
  }

  invoicePayLink(schoolId: string, invoiceId: string) {
    return this.dbs.withSchool(schoolId, async (tx) => {
      const [inv] = await tx.select({ id: invoices.id }).from(invoices).where(eq(invoices.id, invoiceId));
      found(inv, 'Invoice');
      return { url: await this.payLink(tx, schoolId, invoiceId) };
    });
  }

  // ------------------------------------------------------------ New parents and missed days

  private async sendNewParentSteps(tx: Tx, ctx: Ctx, now: Date) {
    const seq = ctx.sequences.new_parent;
    if (!seq.enabled || !seq.enabledAt || seq.steps.length === 0) return { runs: 0, messages: 0 };
    const today = lagosClock(now).date;
    const longest = Math.max(...seq.steps.map((s) => s.offsetDays));
    const window = new Date(now.getTime() - (longest + 3) * 86400000);
    const since = seq.enabledAt > window ? seq.enabledAt : window;
    const fresh = await tx.select().from(guardians).where(gte(guardians.createdAt, since));
    if (fresh.length === 0) return { runs: 0, messages: 0 };
    const kids = await tx
      .select({ guardianId: studentGuardians.guardianId, student: students })
      .from(studentGuardians)
      .innerJoin(students, eq(students.id, studentGuardians.studentId))
      .where(inArray(studentGuardians.guardianId, fresh.map((g) => g.id)));
    let runs = 0;
    let messages = 0;
    for (const g of fresh) {
      const children = kids.filter((k) => k.guardianId === g.id).map((k) => k.student);
      if (children.length === 0) continue;
      const step = dueStep(seq.steps, lagosClock(g.createdAt).date, today);
      if (step === null) continue;
      const runId = await this.claim(tx, ctx.school.id, { key: `new_parent:${g.id}:${step}`, kind: 'new_parent', step, guardianId: g.id, studentId: children[0].id });
      if (!runId) continue;
      const s = seq.steps[step];
      const names = children.map((c) => c.firstName);
      const vars = {
        ...this.baseVars(ctx),
        parent_name: g.fullName,
        parent_phone: `0${g.phone.slice(3)}`,
        children: names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : names[0],
        student_first_name: names[0],
      };
      const count = await this.queueToGuardians(tx, ctx.school.id, [{ guardian: g, studentId: children[0].id }], s.channels, 'follow_up', renderTemplate(s.subject, vars), () =>
        renderTemplate(s.body, vars),
      );
      await this.finishRun(tx, runId, count, `Welcome step ${step + 1} to ${g.fullName}`);
      runs++;
      messages += count;
    }
    return { runs, messages };
  }

  private async sendAbsenceFollowUps(tx: Tx, ctx: Ctx, today: string) {
    const seq = ctx.sequences.absent_streak;
    if (!seq.enabled || !seq.enabledAt || seq.steps.length === 0) return { runs: 0, messages: 0 };
    const threshold = seq.threshold ?? DEFAULT_ABSENCE_THRESHOLD;
    const startedOn = lagosClock(seq.enabledAt).date;
    const rows = await tx
      .select({ studentId: attendanceRecords.studentId, date: attendanceRecords.date, status: attendanceRecords.status, student: students })
      .from(attendanceRecords)
      .innerJoin(students, eq(students.id, attendanceRecords.studentId))
      .where(gte(attendanceRecords.date, addDays(today, -28)))
      .orderBy(asc(attendanceRecords.studentId), desc(attendanceRecords.date));
    const byStudent = new Map<string, typeof rows>();
    for (const r of rows) byStudent.set(r.studentId, [...(byStudent.get(r.studentId) ?? []), r]);

    const streaks: { student: (typeof rows)[number]['student']; days: number; since: string }[] = [];
    for (const [, register] of byStudent) {
      // Only streaks still running, and still running after the sequence was switched on.
      const latest = register[0].date;
      if (latest < addDays(today, -3) || latest < startedOn) continue;
      const streak = absentStreak(register);
      if (streak.days < threshold || !streak.since) continue;
      streaks.push({ student: register[0].student, days: streak.days, since: streak.since });
    }
    const parents = await this.guardiansOf(tx, streaks.map((s) => s.student.id));
    let runs = 0;
    let messages = 0;
    for (const s of streaks) {
      const kin = parents.get(s.student.id) ?? [];
      if (kin.length === 0) continue;
      const step = dueStep(seq.steps, s.since, today);
      if (step === null) continue;
      const runId = await this.claim(tx, ctx.school.id, { key: `absent:${s.student.id}:${s.since}:${step}`, kind: 'absent_streak', step, studentId: s.student.id });
      if (!runId) continue;
      const st = seq.steps[step];
      const vars = { ...this.baseVars(ctx), student_first_name: s.student.firstName, student_name: `${s.student.firstName} ${s.student.lastName}`, absent_days: s.days };
      const count = await this.queueToGuardians(
        tx,
        ctx.school.id,
        kin.map((g) => ({ guardian: g, studentId: s.student.id })),
        st.channels,
        'follow_up',
        renderTemplate(st.subject, vars),
        (_c, g) => renderTemplate(st.body, { ...vars, parent_name: g.fullName }),
      );
      await this.finishRun(tx, runId, count, `${s.student.firstName} ${s.student.lastName} absent ${s.days} days in a row`);
      runs++;
      messages += count;
    }
    return { runs, messages };
  }

  // ------------------------------------------------------------ Weekly parent report

  /** Builds this week's report for every parent (or one parent), one message covering all their children. */
  private async weeklyReports(tx: Tx, ctx: Ctx, today: string, guardianId?: string) {
    const from = weekStart(today);
    const links = await tx
      .select({ guardian: guardians, student: students })
      .from(studentGuardians)
      .innerJoin(guardians, eq(guardians.id, studentGuardians.guardianId))
      .innerJoin(students, eq(students.id, studentGuardians.studentId))
      .where(and(isNotNull(students.classId), guardianId ? eq(guardians.id, guardianId) : undefined))
      .orderBy(asc(guardians.id), asc(students.firstName));
    const ids = [...new Set(links.map((l) => l.student.id))];
    if (ids.length === 0) return [];

    const att = await tx
      .select({ studentId: attendanceRecords.studentId, date: attendanceRecords.date, status: attendanceRecords.status })
      .from(attendanceRecords)
      .where(and(inArray(attendanceRecords.studentId, ids), gte(attendanceRecords.date, from), sql`${attendanceRecords.date} <= ${today}`));
    const marks = await tx
      .select({ studentId: scores.studentId, subject: subjects.name, scores: scores.scores })
      .from(scores)
      .innerJoin(subjects, eq(subjects.id, scores.subjectId))
      .where(and(inArray(scores.studentId, ids), gte(scores.updatedAt, dayStart(from))));
    const tests = await tx
      .select({ studentId: cbtAttempts.studentId, percentage: cbtAttempts.percentage })
      .from(cbtAttempts)
      .where(and(inArray(cbtAttempts.studentId, ids), gte(cbtAttempts.submittedAt, dayStart(from))));
    const bills = ctx.term
      ? await tx.select().from(invoices).where(and(eq(invoices.termId, ctx.term.id), inArray(invoices.studentId, ids), ne(invoices.status, 'paid')))
      : [];

    const childReport = async (s: typeof students.$inferSelect) => {
      const days = att.filter((a) => a.studentId === s.id);
      const absent = days.filter((d) => d.status === 'absent').length;
      const late = days.filter((d) => d.status === 'late').length;
      const subjectsMarked = marks.filter((m) => m.studentId === s.id).map((m) => `${m.subject} ${Math.round(Object.values(m.scores).reduce((a, b) => a + b, 0))}`);
      const done = tests.filter((t) => t.studentId === s.id && t.percentage !== null);
      const avg = done.length ? Math.round(done.reduce((a, t) => a + (t.percentage ?? 0), 0) / done.length) : null;
      const bill = bills.find((b) => b.studentId === s.id);
      const owed = bill ? bill.totalKobo - bill.paidKobo : 0;
      const parts: string[] = [];
      const lines: string[] = [];
      if (days.length) {
        const present = days.length - absent;
        parts.push(`at school ${present} of ${days.length} days${absent ? ` (${absent} absent)` : ''}${late ? `, late ${late}` : ''}`);
        lines.push(`Attendance: present ${present} of ${days.length} school days${absent ? `, absent ${absent}` : ''}${late ? `, late ${late} time${late > 1 ? 's' : ''}` : ''}.`);
      } else {
        lines.push('Attendance: no register was taken this week.');
      }
      if (subjectsMarked.length) {
        parts.push(`new scores: ${subjectsMarked.join(', ')}`);
        lines.push(`New scores: ${subjectsMarked.join(', ')}.`);
      }
      if (done.length) {
        parts.push(`${done.length} practice test${done.length > 1 ? 's' : ''}, average ${avg}%`);
        lines.push(`Practice: ${done.length} CBT or practice test${done.length > 1 ? 's' : ''}, average ${avg}%.`);
      } else {
        lines.push('Practice: no practice tests this week. A few questions a day on the exam prep page helps.');
      }
      let payLink: string | null = null;
      if (owed > 0 && bill) {
        payLink = await this.payLink(tx, ctx.school.id, bill.id);
        parts.push(`fees owed ${formatNaira(owed)}`);
        lines.push(`Fees: ${formatNaira(owed)} still owed for ${ctx.term!.name}. Pay here: ${payLink}`);
      }
      return { name: s.firstName, short: `${s.firstName}: ${parts.length ? parts.join('; ') : 'no school activity recorded this week'}.`, lines };
    };

    const byGuardian = new Map<string, { guardian: Guardian; children: (typeof students.$inferSelect)[] }>();
    for (const l of links) {
      const g = byGuardian.get(l.guardian.id) ?? { guardian: l.guardian, children: [] };
      g.children.push(l.student);
      byGuardian.set(l.guardian.id, g);
    }
    const out = [];
    const weekLabel = `${shortDate(from)} to ${shortDate(today)}`;
    for (const { guardian, children } of byGuardian.values()) {
      const reports = await Promise.all(children.map(childReport));
      const names = reports.map((r) => r.name).join(' and ');
      out.push({
        guardian,
        studentIds: children.map((c) => c.id),
        subject: `Weekly update for ${names} (${weekLabel})`,
        sms: `${ctx.school.name} weekly update. ${reports.map((r) => r.short).join(' ')} More: ${config.portalUrl()}`,
        email:
          `Dear ${guardian.fullName},\n\nHere is this week's update from ${ctx.school.name} (${weekLabel}).\n\n` +
          reports.map((r) => `${r.name}\n${r.lines.join('\n')}`).join('\n\n') +
          `\n\nResults, attendance and fees are always on the parent portal: ${config.portalUrl()}\n\nThank you for your support.`,
      });
    }
    return out;
  }

  private async sendWeeklyReports(tx: Tx, ctx: Ctx, today: string, week: string) {
    const reports = await this.weeklyReports(tx, ctx, today);
    let runs = 0;
    let messages = 0;
    for (const r of reports) {
      const runId = await this.claim(tx, ctx.school.id, { key: `weekly:${week}:${r.guardian.id}`, kind: 'weekly_report', guardianId: r.guardian.id, studentId: r.studentIds[0] });
      if (!runId) continue;
      const count = await this.queueToGuardians(tx, ctx.school.id, [{ guardian: r.guardian, studentId: r.studentIds[0] }], ctx.settings.weeklyChannels, 'weekly_report', r.subject, (c) =>
        c === 'email' ? r.email : r.sms,
      );
      await this.finishRun(tx, runId, count, `Weekly report to ${r.guardian.fullName}`);
      runs++;
      messages += count;
    }
    return { runs, messages };
  }

  weeklyPreview(schoolId: string, guardianId?: string) {
    return this.dbs.withSchool(schoolId, async (tx) => {
      const ctx = await this.context(tx, schoolId);
      const [first] = await this.weeklyReports(tx, ctx, todayInLagos(), guardianId);
      if (!first) throw new NotFoundException('No parents with children in a class yet');
      return { guardian: { id: first.guardian.id, name: first.guardian.fullName }, subject: first.subject, sms: first.sms, email: first.email };
    });
  }

  // ------------------------------------------------------------ Proprietor's daily summary

  private async dailyFigures(tx: Tx, ctx: Ctx, today: string) {
    const start = dayStart(today);
    const end = dayStart(addDays(today, 1));
    const [paid] = await tx
      .select({ count: sql<number>`count(*)::int`, kobo: sql<number>`coalesce(sum(${payments.amountKobo}), 0)::bigint` })
      .from(payments)
      .where(and(eq(payments.status, 'success'), gte(payments.paidAt, start), lt(payments.paidAt, end)));
    const [term] = ctx.term
      ? await tx
          .select({ expected: sql<number>`coalesce(sum(${invoices.totalKobo}), 0)::bigint`, collected: sql<number>`coalesce(sum(${invoices.paidKobo}), 0)::bigint` })
          .from(invoices)
          .where(eq(invoices.termId, ctx.term.id))
      : [{ expected: 0, collected: 0 }];
    const [classCount] = await tx
      .select({ n: sql<number>`count(distinct ${students.classId})::int` })
      .from(students)
      .where(isNotNull(students.classId));
    const [register] = await tx
      .select({
        classes: sql<number>`count(distinct ${attendanceRecords.classId})::int`,
        present: sql<number>`count(*) filter (where ${attendanceRecords.status} in ('present', 'late'))::int`,
        absent: sql<number>`count(*) filter (where ${attendanceRecords.status} = 'absent')::int`,
      })
      .from(attendanceRecords)
      .where(eq(attendanceRecords.date, today));
    const runs = await tx
      .select({ kind: automationRuns.kind, runs: sql<number>`count(*)::int` })
      .from(automationRuns)
      .where(gte(automationRuns.createdAt, start))
      .groupBy(automationRuns.kind);
    const msgs = await tx
      .select({ status: notifications.status, n: sql<number>`count(*)::int` })
      .from(notifications)
      .where(gte(notifications.createdAt, start))
      .groupBy(notifications.status);
    const plans = await tx
      .select({ plan: instalmentPlans, invoice: invoices })
      .from(instalmentPlans)
      .innerJoin(invoices, eq(invoices.id, instalmentPlans.invoiceId))
      .where(ne(invoices.status, 'paid'));
    const behind = plans.map((p) => viewPlan(p.plan, p.invoice.paidKobo, today).progress).filter((p) => !p.onTrack);
    const topOwing = ctx.term
      ? await tx
          .select({ name: classes.name, arm: classes.arm, owed: sql<number>`coalesce(sum(${invoices.totalKobo} - ${invoices.paidKobo}), 0)::bigint` })
          .from(invoices)
          .innerJoin(students, eq(students.id, invoices.studentId))
          .innerJoin(classes, eq(classes.id, students.classId))
          .where(and(eq(invoices.termId, ctx.term.id), ne(invoices.status, 'paid')))
          .groupBy(classes.id, classes.name, classes.arm)
          .orderBy(desc(sql`3`))
          .limit(3)
      : [];
    const run = (k: string) => runs.find((r) => r.kind === k)?.runs ?? 0;
    const msg = (s: string) => msgs.find((m) => m.status === s)?.n ?? 0;
    const live = await this.liveDigest(tx, ctx);
    return {
      alerts: live.alerts,
      forecasts: live.forecasts,
      date: today,
      paymentsToday: { count: paid.count, kobo: Number(paid.kobo) },
      term: ctx.term ? { name: ctx.term.name, expectedKobo: Number(term.expected), collectedKobo: Number(term.collected) } : null,
      attendance: { classes: classCount.n, marked: register.classes, present: register.present, absent: register.absent },
      autopilot: { feeReminders: run('fee_reminder'), followUps: run('new_parent') + run('absent_streak'), weeklyReports: run('weekly_report') },
      messages: { sent: msg('sent'), failed: msg('failed'), queued: msg('queued') + msg('sending') },
      plansBehind: { count: behind.length, kobo: behind.reduce((s, p) => s + p.behindKobo, 0) },
      topOwing: topOwing.map((c) => ({ class: `${c.name}${c.arm ? ` ${c.arm}` : ''}`, kobo: Number(c.owed) })),
    };
  }

  /** The live monitor's open alerts and exam forecasts, seen as the proprietor would see them. */
  private async liveDigest(tx: Tx, ctx: Ctx) {
    const [owner] = await tx.select({ id: staff.id }).from(staff).where(eq(staff.role, 'proprietor')).limit(1);
    if (!owner) return { alerts: [], forecasts: [] };
    try {
      const snap = await this.live.snapshot({ staffId: owner.id, schoolId: ctx.school.id, role: 'proprietor' });
      return {
        alerts: snap.alerts.filter((a) => a.severity !== 'info').slice(0, 5).map((a) => ({ severity: a.severity, title: a.title, detail: a.detail })),
        forecasts: snap.forecasts.map((f) => ({ exam: f.examName, students: f.students, onTrack: f.onTrack, atRisk: f.atRisk })),
      };
    } catch (err) {
      this.logger.warn(`Live alerts left out of the daily summary: ${(err as Error).message}`);
      return { alerts: [], forecasts: [] };
    }
  }

  private summaryText(ctx: Ctx, f: Awaited<ReturnType<AutomationsService['dailyFigures']>>) {
    const pctOf = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0);
    const lines = [
      `Fees today: ${f.paymentsToday.count ? `${formatNaira(f.paymentsToday.kobo)} from ${f.paymentsToday.count} payment${f.paymentsToday.count > 1 ? 's' : ''}` : 'no payments yet'}`,
      f.term
        ? `${f.term.name}: ${compactNaira(f.term.collectedKobo)} of ${compactNaira(f.term.expectedKobo)} collected (${pctOf(f.term.collectedKobo, f.term.expectedKobo)}%), ${compactNaira(f.term.expectedKobo - f.term.collectedKobo)} outstanding`
        : 'No current term set',
      `Attendance: ${f.attendance.marked} of ${f.attendance.classes} classes marked, ${f.attendance.present} present, ${f.attendance.absent} absent`,
      `Autopilot: ${f.autopilot.feeReminders} fee reminders, ${f.autopilot.followUps} follow-ups; ${f.messages.sent} messages sent${f.messages.failed ? `, ${f.messages.failed} failed` : ''}`,
    ];
    if (f.plansBehind.count) lines.push(`Payment plans behind: ${f.plansBehind.count} (${formatNaira(f.plansBehind.kobo)})`);
    if (f.topOwing.length) lines.push(`Most owed: ${f.topOwing.map((c) => `${c.class} ${compactNaira(c.kobo)}`).join(', ')}`);
    for (const fc of f.forecasts) lines.push(`${fc.exam} forecast: ${fc.onTrack} of ${fc.students} on track, ${fc.atRisk} at risk`);
    if (f.alerts.length) lines.push(`Needs attention: ${f.alerts.map((a) => a.title).join('; ')}`);
    const subject = `${ctx.school.name} daily summary, ${shortDate(f.date)}`;
    return {
      subject,
      text: `${subject}\n${lines.join('\n')}`,
      email: `Good evening,\n\nHere is today's summary for ${ctx.school.name} (${longDate(f.date)}).\n\n${lines.join('\n')}\n\nOpen the dashboard for details: ${config.portalUrl()}/admin`,
    };
  }

  private async digestRecipients(tx: Tx, ctx: Ctx): Promise<DigestRecipient[]> {
    if (ctx.settings.digestRecipients.length) return ctx.settings.digestRecipients;
    const owners = await tx.select({ name: staff.fullName, email: staff.email }).from(staff).where(eq(staff.role, 'proprietor'));
    return owners.map((o) => ({ name: o.name, email: o.email, channel: 'email' as const }));
  }

  private async sendDailySummary(tx: Tx, ctx: Ctx, today: string, key: string) {
    const recipients = await this.digestRecipients(tx, ctx);
    if (recipients.length === 0) return { runs: 0, messages: 0 };
    const runId = await this.claim(tx, ctx.school.id, { key, kind: 'daily_summary' });
    if (!runId) return { runs: 0, messages: 0 };
    const text = this.summaryText(ctx, await this.dailyFigures(tx, ctx, today));
    const rows: (typeof notifications.$inferInsert)[] = [];
    for (const r of recipients) {
      const to = r.channel === 'email' ? r.email : r.phone;
      if (!to) continue;
      rows.push({ schoolId: ctx.school.id, channel: r.channel, to, subject: r.channel === 'email' ? text.subject : null, body: r.channel === 'email' ? text.email : text.text, kind: 'daily_summary' });
    }
    if (rows.length) await tx.insert(notifications).values(rows);
    await this.finishRun(tx, runId, rows.length, `Daily summary to ${recipients.map((r) => r.name).join(', ')}`);
    return { runs: 1, messages: rows.length };
  }

  dailyPreview(schoolId: string) {
    return this.dbs.withSchool(schoolId, async (tx) => {
      const ctx = await this.context(tx, schoolId);
      const figures = await this.dailyFigures(tx, ctx, todayInLagos());
      return { figures, ...this.summaryText(ctx, figures), recipients: await this.digestRecipients(tx, ctx) };
    });
  }

  /** Sends the daily summary now (on top of the scheduled one), e.g. to try it out. */
  async sendDailyNow(schoolId: string) {
    const out = await this.dbs.withSchool(schoolId, async (tx) => {
      const ctx = await this.context(tx, schoolId);
      return this.sendDailySummary(tx, ctx, todayInLagos(), `daily-now:${Date.now()}`);
    });
    if (out.messages === 0) throw new BadRequestException('Add someone to receive the summary first');
    await this.notifications.dispatchForSchool(schoolId, 50);
    return { queued: out.messages };
  }

  // ------------------------------------------------------------ Settings and monitoring

  overview(schoolId: string) {
    return this.dbs.withSchool(schoolId, async (tx) => {
      const ctx = await this.context(tx, schoolId);
      return { settings: ctx.settings, sequences: TRIGGERS.map((t) => ctx.sequences[t]), feeDueDate: this.feeDueDate(ctx), providers: this.providers() };
    });
  }

  updateSettings(schoolId: string, input: Partial<Omit<Settings, 'schoolId' | 'updatedAt'>>) {
    return this.dbs.withSchool(schoolId, async (tx) => {
      await this.ensureSettings(tx, schoolId);
      const [row] = await tx.update(automationSettings).set({ ...input, updatedAt: new Date() }).returning();
      return row;
    });
  }

  updateSequence(schoolId: string, trigger: SequenceTrigger, input: { enabled?: boolean; name?: string; steps?: SequenceStep[]; threshold?: number }) {
    return this.dbs.withSchool(schoolId, async (tx) => {
      const current = (await this.ensureSequences(tx, schoolId))[trigger];
      const steps = input.steps ? [...input.steps].sort((a, b) => a.offsetDays - b.offsetDays) : undefined;
      const switchingOn = input.enabled === true && !current.enabled;
      const [row] = await tx
        .update(followUpSequences)
        .set({ ...input, steps, enabledAt: switchingOn ? new Date() : current.enabledAt, updatedAt: new Date() })
        .where(eq(followUpSequences.id, current.id))
        .returning();
      return row;
    });
  }

  resetSequence(schoolId: string, trigger: SequenceTrigger) {
    return this.updateSequence(schoolId, trigger, { name: DEFAULT_SEQUENCES[trigger].name, steps: DEFAULT_SEQUENCES[trigger].steps });
  }

  /** Which gateways are live and which are in sandbox (logging only), so the school knows what parents actually receive. */
  providers() {
    const key = config.paystack().secretKey;
    return {
      sms: this.sms instanceof LogProvider ? 'sandbox' : 'termii',
      email: this.email.sandbox ? 'sandbox' : this.email.name,
      paystack: !key ? 'missing' : key.startsWith('sk_live') ? 'live' : 'test',
    };
  }

  /** The live activity feed: what the autopilot did recently and how today's messages are doing. */
  activity(schoolId: string, limit = 40) {
    return this.dbs.withSchool(schoolId, async (tx) => {
      const ctx = await this.context(tx, schoolId);
      const clock = lagosClock();
      const start = dayStart(clock.date);
      const runs = await tx
        .select({ run: automationRuns, firstName: students.firstName, lastName: students.lastName })
        .from(automationRuns)
        .leftJoin(students, eq(students.id, automationRuns.studentId))
        .orderBy(desc(automationRuns.createdAt))
        .limit(limit);
      const byChannel = await tx
        .select({ channel: notifications.channel, status: notifications.status, n: sql<number>`count(*)::int` })
        .from(notifications)
        .where(gte(notifications.createdAt, start))
        .groupBy(notifications.channel, notifications.status);
      const failures = await tx
        .select({ id: notifications.id, channel: notifications.channel, to: notifications.to, kind: notifications.kind, error: notifications.error, createdAt: notifications.createdAt })
        .from(notifications)
        .where(and(eq(notifications.status, 'failed'), gte(notifications.createdAt, new Date(Date.now() - 7 * 86400000))))
        .orderBy(desc(notifications.createdAt))
        .limit(10);
      const s = ctx.settings;
      const daysToWeekly = (s.weeklyDay - clock.weekday + 7) % 7;
      const weeklyDate = daysToWeekly === 0 && clock.hour >= s.weeklyHour ? addDays(clock.date, 7) : addDays(clock.date, daysToWeekly);
      return {
        now: new Date().toISOString(),
        sendingNow: inSendingWindow(clock.hour, s.sendFrom, s.sendUntil),
        providers: this.providers(),
        schedule: {
          window: { from: s.sendFrom, until: s.sendUntil },
          weeklyReport: s.weeklyReport ? { date: weeklyDate, hour: s.weeklyHour } : null,
          dailySummary: s.dailySummary ? { date: clock.hour >= s.dailyHour ? addDays(clock.date, 1) : clock.date, hour: s.dailyHour } : null,
          sequences: TRIGGERS.map((t) => ({ trigger: t, name: ctx.sequences[t].name, enabled: ctx.sequences[t].enabled })),
        },
        today: byChannel,
        failures,
        runs: runs.map((r) => ({ ...r.run, student: r.firstName ? `${r.firstName} ${r.lastName}` : null })),
      };
    });
  }

  /** Runs the autopilot for this school right now and sends what it queued. */
  async runNow(schoolId: string) {
    const result = await this.runForSchool(schoolId);
    const sent = await this.notifications.dispatchForSchool(schoolId, 500);
    return { ...result, ...sent };
  }
}
