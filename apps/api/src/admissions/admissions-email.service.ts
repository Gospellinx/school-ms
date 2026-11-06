import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { and, asc, eq, inArray, lte, sql } from 'drizzle-orm';
import { config } from '../common/config';
import { Tx } from '../db/client';
import { DbService } from '../db/db.service';
import { applications, emailOutbox, schools } from '../db/schema';
import { EmailProvider } from '../messaging/email.provider';

const MAX_ATTEMPTS = 3;

export interface QueuedEmail {
  to: string;
  subject: string;
  /** Paragraphs of plain text. Lines starting with "http" become buttons in the HTML version. */
  body: string[];
  kind: string;
  applicationId?: string;
  /** Only send if the application is still in this status when the email falls due. */
  onlyIfStatus?: string;
  sendAfter?: Date;
}

/** Plain text paragraphs; the shared email provider turns them into a mobile-friendly HTML email with clickable links. */
export function renderEmail(body: string[]) {
  return body.join('\n\n');
}

/**
 * Admissions email outbox, sent through the shared EmailProvider (Brevo, Resend or log). Features queue emails inside their own transaction; a worker sends them
 * when they fall due, so follow-ups (e.g. "your form is not paid yet") can be scheduled days ahead.
 */
@Injectable()
export class AdmissionsEmailService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AdmissionsEmailService.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly dbs: DbService,
    private readonly provider: EmailProvider,
  ) {}

  onModuleInit() {
    const every = config.admissionsEmailPollMs();
    if (every > 0) {
      this.timer = setInterval(() => this.dispatchDue().catch((err) => this.logger.error(err)), every);
      this.timer.unref();
    }
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async queue(tx: Tx, schoolId: string, e: QueuedEmail) {
    const text = renderEmail(e.body);
    const [row] = await tx
      .insert(emailOutbox)
      .values({
        schoolId,
        to: e.to,
        subject: e.subject,
        text,
        kind: e.kind,
        applicationId: e.applicationId,
        onlyIfStatus: e.onlyIfStatus,
        sendAfter: e.sendAfter ?? new Date(),
      })
      .returning();
    return row;
  }

  /** Cancels follow-ups that no longer apply, e.g. exam reminders once the exam is done. */
  async cancel(tx: Tx, applicationId: string, kinds: string[]) {
    await tx
      .update(emailOutbox)
      .set({ status: 'skipped', error: 'No longer needed' })
      .where(and(eq(emailOutbox.applicationId, applicationId), eq(emailOutbox.status, 'queued'), inArray(emailOutbox.kind, kinds)));
  }

  /** Sends due emails for every school. */
  async dispatchDue(limitPerSchool = 100): Promise<{ sent: number; failed: number; skipped: number }> {
    const total = { sent: 0, failed: 0, skipped: 0 };
    if (this.running) return total;
    this.running = true;
    try {
      const all = await this.dbs.db.select({ id: schools.id, name: schools.name, email: schools.email }).from(schools);
      for (const school of all) {
        const r = await this.dispatchForSchool(school.id, limitPerSchool, school);
        total.sent += r.sent;
        total.failed += r.failed;
        total.skipped += r.skipped;
      }
    } finally {
      this.running = false;
    }
    return total;
  }

  async dispatchForSchool(schoolId: string, limit = 100, school?: { name: string; email: string | null }) {
    if (!school) [school] = await this.dbs.db.select({ name: schools.name, email: schools.email }).from(schools).where(eq(schools.id, schoolId));
    let skipped = 0;
    const claimed = await this.dbs.withSchool(schoolId, async (tx) => {
      const due = await tx
        .select({ row: emailOutbox, appStatus: applications.status })
        .from(emailOutbox)
        .leftJoin(applications, eq(applications.id, emailOutbox.applicationId))
        .where(and(eq(emailOutbox.status, 'queued'), lte(emailOutbox.sendAfter, new Date())))
        .orderBy(asc(emailOutbox.sendAfter))
        .limit(limit)
        .for('update', { of: emailOutbox, skipLocked: true });
      const stale = due.filter((d) => d.row.onlyIfStatus && d.appStatus !== d.row.onlyIfStatus).map((d) => d.row.id);
      if (stale.length) {
        await tx.update(emailOutbox).set({ status: 'skipped', error: 'The application moved on' }).where(inArray(emailOutbox.id, stale));
        skipped = stale.length;
      }
      const ids = due.map((d) => d.row.id).filter((id) => !stale.includes(id));
      if (!ids.length) return [];
      return tx
        .update(emailOutbox)
        .set({ status: 'sending', attempts: sql`${emailOutbox.attempts} + 1` })
        .where(inArray(emailOutbox.id, ids))
        .returning();
    });

    let sent = 0;
    let failed = 0;
    for (const e of claimed) {
      try {
        const { providerRef } = await this.provider.send({
          to: e.to,
          subject: e.subject,
          text: e.text,
          fromName: school?.name,
          replyTo: school?.email ?? undefined,
        });
        await this.dbs.withSchool(schoolId, (tx) =>
          tx.update(emailOutbox).set({ status: 'sent', providerRef, sentAt: new Date(), error: null }).where(eq(emailOutbox.id, e.id)),
        );
        sent++;
      } catch (err) {
        const giveUp = e.attempts >= MAX_ATTEMPTS;
        await this.dbs.withSchool(schoolId, (tx) =>
          tx
            .update(emailOutbox)
            .set({ status: giveUp ? 'failed' : 'queued', error: (err as Error).message.slice(0, 500) })
            .where(eq(emailOutbox.id, e.id)),
        );
        if (giveUp) failed++;
      }
    }
    return { sent, failed, skipped };
  }
}
