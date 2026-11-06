import { Controller, Get, Param, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { Principal } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators';
import { parse, uuidParam } from '../common/validation';
import { PrepService } from './prep.service';

const planQuery = z.object({ ai: z.enum(['true', 'false']).default('false') });

/** Staff views of exam prep, and AI help for teachers. */
@Controller()
export class PrepController {
  constructor(private readonly prep: PrepService) {}

  /** A student's study profile (what to work on first). Add ?ai=true for an AI-written plan. */
  @Get('students/:studentId/prep-plan')
  plan(@CurrentUser() u: Principal, @Param('studentId') s: string, @Query() q: unknown) {
    const { ai } = parse(planQuery, q);
    return this.prep.plan(u.schoolId, parse(uuidParam, s), { withAi: ai === 'true' });
  }

  /** AI-drafted teacher and head remarks for a report card. Review, then save with PUT .../comments. */
  @Post('terms/:termId/students/:studentId/comments/draft')
  draftComments(@CurrentUser() u: Principal, @Param('termId') t: string, @Param('studentId') s: string) {
    return this.prep.draftComments(u, parse(uuidParam, t), parse(uuidParam, s));
  }
}
