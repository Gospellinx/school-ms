import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { desc, eq, isNotNull } from 'drizzle-orm';
import { z } from 'zod';
import { Principal } from '../auth/auth.types';
import { CurrentUser, LEADERSHIP, Roles } from '../auth/decorators';
import { assertOwned } from '../common/owned';
import { parse } from '../common/validation';
import { DbService } from '../db/db.service';
import { classes, notifications, students } from '../db/schema';
import { NotificationsService } from './notifications.service';

const broadcastSchema = z.object({
  /** Leave out to message the parents of every student in the school. */
  classId: z.string().uuid().optional(),
  message: z.string().min(3).max(480),
});

const listSchema = z.object({
  status: z.enum(['queued', 'sending', 'sent', 'failed']).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
});

/** The message log and school-wide announcements to parents by SMS or WhatsApp. */
@Roles(...LEADERSHIP)
@Controller('notifications')
export class NotificationsController {
  constructor(
    private readonly dbs: DbService,
    private readonly notifications: NotificationsService,
  ) {}

  @Get()
  list(@CurrentUser() u: Principal, @Query() query: unknown) {
    const q = parse(listSchema, query);
    return this.dbs.withSchool(u.schoolId, (tx) =>
      tx
        .select()
        .from(notifications)
        .where(q.status ? eq(notifications.status, q.status) : undefined)
        .orderBy(desc(notifications.createdAt))
        .limit(q.limit),
    );
  }

  @Post('broadcast')
  broadcast(@CurrentUser() u: Principal, @Body() body: unknown) {
    const input = parse(broadcastSchema, body);
    return this.dbs.withSchool(u.schoolId, async (tx) => {
      if (input.classId) await assertOwned(tx, classes, input.classId, 'Class');
      const roster = await tx
        .select({ id: students.id })
        .from(students)
        .where(input.classId ? eq(students.classId, input.classId) : isNotNull(students.classId));
      const queued = await this.notifications.queueForGuardians(
        tx,
        u.schoolId,
        roster.map((s) => s.id),
        'broadcast',
        () => input.message,
        { oncePerGuardian: true },
      );
      return { queued };
    });
  }

  /** Sends queued messages now instead of waiting for the background worker. */
  @Post('dispatch')
  dispatch(@CurrentUser() u: Principal) {
    return this.notifications.dispatchForSchool(u.schoolId, 500);
  }
}
