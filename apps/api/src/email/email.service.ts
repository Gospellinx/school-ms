import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { and, asc, eq, inArray, lte, sql } from 'drizzle-orm';
import { config } from '../common/config';
import { Tx } from '../db/client';
import { DbService } from '../db/db.service';
import { applications, emailOutbox, schools } from '../db/schema';
import { EmailProvider } from './email.provider';

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

const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** A plain, mobile-friendly email: the school's name on top, short paragraphs, links as buttons. */
export function renderEmail(schoolName: string, subject: string, body: string[], accent = '#6a3bf0') {
  const text = [...body, '', `${schoolName}`].join('\n\n');
  const blocks = body
    .map((p) => {
      const link = p.match(/^(.*?)(https?:\/\/\S+)$/);
      if (link) {
        const label = link[1].replace(/[:\s]+$/, '') || 'Open';
        return `<p style="margin:24px 0"><a href="${escape(link[2])}" style="background:${accent};color:#fff;text-decoration:none;padding:12px 20px;border-radius:12px;font-weight:600;display:inline-block">${escape(label)}</a></p>`;
      }
      return `<p style="margin:0 0 14px;line-height:1.55">${escape(p).replace(/\n/g, '<br>')}</p>`;
    })
    .join('');
  const html = `<!doctype html><html><body style="margin:0;background:#f4f4f6;font-family:Arial,Helvetica,sans-serif;color:#16151c">
<div style="max-width:560px;margin:0 auto;padding:24px 16px">
<p style="font-weight:700;font-size:18px;margin:0 0 16px;color:${accent}">${escape(schoolName)}</p>
<div style="background:#fff;border-radius:16px;padding:24px">
<h1 style="font-size:20px;margin:0 0 16px">${escape(subject)}</h1>${blocks}
</div>
<p style="font-size:12px;color:#6f6c7a;margin:16px 4px">Sent by ${escape(schoolName)} through Linx School.</p>
</div></body></html>`;
  return { text, html };
}

/**
 * Email outbox. Features queue emails inside their own transaction; a worker sends them
 * when they fall due, so follow-ups (e.g. "your form is not paid yet") can be scheduled days ahead.
 */
@Injectable()
export class EmailService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EmailService.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly dbs: DbService,
    private readonly provider: EmailProvider,
  ) {}

  onModuleInit() {
    const every = config.email().pollMs;
    if (every > 0) {
      this.timer = setInterval(() => this.dispatchDue().catch((err) => this.logger.error(err)), every);
      this.timer.unref();
    }
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async queue(tx: Tx, schoolId: string, schoolName: string, e: QueuedEmail, accent?: string | null) {
    const { text, html } = renderEmail(schoolName, e.subject, e.body, accent ?? undefined);
    const [row] = await tx
      .insert(emailOutbox)
      .values({
        schoolId,
        to: e.to,
        subject: e.subject,
        text,
        html,
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
          html: e.html,
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
