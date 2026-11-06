import { Controller, Get, Param } from '@nestjs/common';
import { and, asc, desc, eq, gte, isNotNull, sql } from 'drizzle-orm';
import { Principal } from '../auth/auth.types';
import { CurrentUser, LEADERSHIP, Roles } from '../auth/decorators';
import { config } from '../common/config';
import { found, parse, uuidParam } from '../common/validation';
import { DbService } from '../db/db.service';
import { aiUsage, classes, students, subjects, tutorConversations, tutorMessages } from '../db/schema';
import { AiService } from '../prep/ai.service';
import { TutorService } from '../tutor/tutor.service';

/** AI spending and child-safety flags, for the proprietor and admins. */
@Roles(...LEADERSHIP)
@Controller('ai')
export class AiAdminController {
  constructor(
    private readonly dbs: DbService,
    private readonly ai: AiService,
  ) {}

  @Get('overview')
  async overview(@CurrentUser() u: Principal) {
    const budget = await this.ai.budget(u.schoolId);
    const dailyLimit = await this.ai.studentDailyLimit(u.schoolId);
    const rate = config.usdToNgn();
    return this.dbs.withSchool(u.schoolId, async (tx) => {
      const since = sql`date_trunc('month', now() at time zone 'Africa/Lagos') at time zone 'Africa/Lagos'`;
      const byFeature = await tx
        .select({
          feature: aiUsage.feature,
          calls: sql<number>`count(*)::int`,
          costMicroUsd: sql<number>`coalesce(sum(${aiUsage.costMicroUsd}), 0)::bigint`,
        })
        .from(aiUsage)
        .where(gte(aiUsage.createdAt, since))
        .groupBy(aiUsage.feature)
        .orderBy(desc(sql`sum(${aiUsage.costMicroUsd})`));
      const [activity] = await tx
        .select({
          conversations: sql<number>`count(distinct ${tutorConversations.id})::int`,
          students: sql<number>`count(distinct ${tutorConversations.studentId})::int`,
          messages: sql<number>`count(${tutorMessages.id})::int`,
        })
        .from(tutorConversations)
        .leftJoin(tutorMessages, and(eq(tutorMessages.conversationId, tutorConversations.id), eq(tutorMessages.role, 'student')))
        .where(gte(tutorConversations.updatedAt, since));
      const flags = await tx
        .select({
          conversationId: tutorConversations.id,
          studentId: students.id,
          student: sql<string>`${students.firstName} || ' ' || ${students.lastName}`,
          admissionNumber: students.admissionNumber,
          className: sql<string>`trim(${classes.name} || ' ' || ${classes.arm})`,
          subject: subjects.name,
          category: tutorMessages.safety,
          message: tutorMessages.content,
          at: tutorMessages.createdAt,
        })
        .from(tutorMessages)
        .innerJoin(tutorConversations, eq(tutorConversations.id, tutorMessages.conversationId))
        .innerJoin(students, eq(students.id, tutorConversations.studentId))
        .leftJoin(classes, eq(classes.id, students.classId))
        .innerJoin(subjects, eq(subjects.id, tutorConversations.subjectId))
        .where(and(isNotNull(tutorMessages.safety), sql`${tutorMessages.safety} <> 'personal_info'`))
        .orderBy(desc(tutorMessages.createdAt))
        .limit(20);
      return {
        enabled: this.ai.enabled,
        model: config.ai().model,
        tutorModel: config.ai().tutorModel,
        budget: { ...budget, spentNaira: Math.round((budget.spentCents / 100) * rate), capNaira: Math.round((budget.capCents / 100) * rate), usdToNgn: rate },
        studentDailyLimit: dailyLimit,
        byFeature: byFeature.map((f) => ({ feature: f.feature, calls: f.calls, costCents: Math.round(Number(f.costMicroUsd) / 10_000) })),
        tutorActivity: activity,
        flags,
      };
    });
  }

  /** The whole conversation behind a safety flag, for the school's safeguarding lead. */
  @Get('flags/:conversationId')
  flag(@CurrentUser() u: Principal, @Param('conversationId') id: string) {
    const conversationId = parse(uuidParam, id);
    return this.dbs.withSchool(u.schoolId, async (tx) => {
      const [c] = await tx.select().from(tutorConversations).where(eq(tutorConversations.id, conversationId));
      found(c, 'Conversation');
      const msgs = await tx.select().from(tutorMessages).where(eq(tutorMessages.conversationId, conversationId)).orderBy(asc(tutorMessages.createdAt));
      return { ...c, messages: msgs.map((m) => ({ ...TutorService.view(m), safety: m.safety })) };
    });
  }
}
