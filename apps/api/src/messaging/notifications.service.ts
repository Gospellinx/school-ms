import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { config } from '../common/config';
import { Tx } from '../db/client';
import { DbService } from '../db/db.service';
import { guardians, notifications, schools, studentGuardians, students } from '../db/schema';
import { MessagingProvider } from './messaging.provider';

type StudentRow = typeof students.$inferSelect;
const MAX_ATTEMPTS = 3;

/**
 * Parent alerts go through an outbox table: features queue messages inside their own
 * transaction (so an alert is never sent for a change that rolled back), and a worker sends them.
 */
@Injectable()
export class NotificationsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NotificationsService.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly dbs: DbService,
    private readonly provider: MessagingProvider,
  ) {}

  onModuleInit() {
    const every = config.notificationsPollMs();
    if (every > 0) {
      this.timer = setInterval(() => {
        this.dispatchPending().catch((err) => this.logger.error(err));
      }, every);
      this.timer.unref();
    }
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  /**
   * Queues one message per guardian of each student. `body` builds the text for a student,
   * so each parent hears about their own child. Returns how many messages were queued.
   */
  async queueForGuardians(
    tx: Tx,
    schoolId: string,
    studentIds: string[],
    kind: string,
    body: (student: StudentRow) => string,
    opts: { oncePerGuardian?: boolean } = {},
  ): Promise<number> {
    if (studentIds.length === 0) return 0;
    const rows = await tx
      .select({ student: students, guardian: guardians })
      .from(studentGuardians)
      .innerJoin(students, eq(students.id, studentGuardians.studentId))
      .innerJoin(guardians, eq(guardians.id, studentGuardians.guardianId))
      .where(inArray(studentGuardians.studentId, studentIds));
    let targets = rows;
    if (opts.oncePerGuardian) {
      const seen = new Set<string>();
      targets = rows.filter((r) => !seen.has(r.guardian.id) && seen.add(r.guardian.id));
    }
    if (targets.length === 0) return 0;
    await tx.insert(notifications).values(
      targets.map((r) => ({
        schoolId,
        channel: r.guardian.preferredChannel,
        to: r.guardian.phone,
        body: body(r.student),
        kind,
        guardianId: r.guardian.id,
        studentId: r.student.id,
      })),
    );
    return targets.length;
  }

  /** Sends queued messages for every school. Safe to run from several processes at once. */
  async dispatchPending(limitPerSchool = 100): Promise<{ sent: number; failed: number }> {
    if (this.running) return { sent: 0, failed: 0 };
    this.running = true;
    let sent = 0;
    let failed = 0;
    try {
      const all = await this.dbs.db.select({ id: schools.id }).from(schools);
      for (const school of all) {
        const r = await this.dispatchForSchool(school.id, limitPerSchool);
        sent += r.sent;
        failed += r.failed;
      }
    } finally {
      this.running = false;
    }
    return { sent, failed };
  }

  async dispatchForSchool(schoolId: string, limit = 100): Promise<{ sent: number; failed: number }> {
    // Claim rows in a short transaction so slow gateway calls do not hold row locks.
    const claimed = await this.dbs.withSchool(schoolId, async (tx) => {
      const ids = await tx
        .select({ id: notifications.id })
        .from(notifications)
        .where(eq(notifications.status, 'queued'))
        .orderBy(asc(notifications.createdAt))
        .limit(limit)
        .for('update', { skipLocked: true });
      if (ids.length === 0) return [];
      return tx
        .update(notifications)
        .set({ status: 'sending', attempts: sql`${notifications.attempts} + 1` })
        .where(inArray(notifications.id, ids.map((i) => i.id)))
        .returning();
    });

    let sent = 0;
    let failed = 0;
    for (const n of claimed) {
      try {
        const { providerRef } = await this.provider.send({ channel: n.channel, to: n.to, body: n.body });
        await this.dbs.withSchool(schoolId, (tx) =>
          tx.update(notifications).set({ status: 'sent', providerRef, sentAt: new Date(), error: null }).where(eq(notifications.id, n.id)),
        );
        sent++;
      } catch (err) {
        const giveUp = n.attempts >= MAX_ATTEMPTS;
        await this.dbs.withSchool(schoolId, (tx) =>
          tx
            .update(notifications)
            .set({ status: giveUp ? 'failed' : 'queued', error: (err as Error).message.slice(0, 500) })
            .where(eq(notifications.id, n.id)),
        );
        if (giveUp) failed++;
      }
    }
    return { sent, failed };
  }
}
