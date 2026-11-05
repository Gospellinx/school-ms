import { Body, Controller, Delete, Get, Param, Post, Put } from '@nestjs/common';
import { z } from 'zod';
import { Principal } from '../auth/auth.types';
import { CurrentUser, LEADERSHIP, Roles } from '../auth/decorators';
import { parse, uuidParam } from '../common/validation';
import { ResultsService } from './results.service';

const scoresSchema = z.object({
  entries: z.array(z.object({ studentId: z.string().uuid(), scores: z.record(z.string(), z.number()) })).max(500),
});

const commentsSchema = z
  .object({ teacherComment: z.string().max(1000).optional(), headComment: z.string().max(1000).optional() })
  .refine((v) => v.teacherComment !== undefined || v.headComment !== undefined, 'Give at least one comment');

const publishSchema = z.object({ notifyGuardians: z.boolean().default(true) });

@Controller('terms/:termId')
export class ResultsController {
  constructor(private readonly results: ResultsService) {}

  @Get('classes/:classId/subjects/:subjectId/scores')
  sheet(@CurrentUser() u: Principal, @Param('termId') t: string, @Param('classId') c: string, @Param('subjectId') s: string) {
    return this.results.scoreSheet(u, parse(uuidParam, t), parse(uuidParam, c), parse(uuidParam, s));
  }

  @Put('classes/:classId/subjects/:subjectId/scores')
  save(
    @CurrentUser() u: Principal,
    @Param('termId') t: string,
    @Param('classId') c: string,
    @Param('subjectId') s: string,
    @Body() body: unknown,
  ) {
    const { entries } = parse(scoresSchema, body);
    return this.results.saveScores(u, parse(uuidParam, t), parse(uuidParam, c), parse(uuidParam, s), entries);
  }

  @Get('classes/:classId/results')
  broadsheet(@CurrentUser() u: Principal, @Param('termId') t: string, @Param('classId') c: string) {
    return this.results.broadsheet(u, parse(uuidParam, t), parse(uuidParam, c));
  }

  @Get('students/:studentId/report-card')
  reportCard(@CurrentUser() u: Principal, @Param('termId') t: string, @Param('studentId') s: string) {
    return this.results.reportCard(u, parse(uuidParam, t), parse(uuidParam, s));
  }

  @Put('students/:studentId/comments')
  comments(@CurrentUser() u: Principal, @Param('termId') t: string, @Param('studentId') s: string, @Body() body: unknown) {
    return this.results.saveComments(u, parse(uuidParam, t), parse(uuidParam, s), parse(commentsSchema, body));
  }

  /** Releases a class's results to parents and students. */
  @Roles(...LEADERSHIP)
  @Post('classes/:classId/publish')
  publish(@CurrentUser() u: Principal, @Param('termId') t: string, @Param('classId') c: string, @Body() body: unknown) {
    const { notifyGuardians } = parse(publishSchema, body ?? {});
    return this.results.publish(u, parse(uuidParam, t), parse(uuidParam, c), notifyGuardians);
  }

  @Roles(...LEADERSHIP)
  @Delete('classes/:classId/publish')
  unpublish(@CurrentUser() u: Principal, @Param('termId') t: string, @Param('classId') c: string) {
    return this.results.unpublish(u, parse(uuidParam, t), parse(uuidParam, c));
  }

  @Get('publications')
  publications(@CurrentUser() u: Principal, @Param('termId') t: string) {
    return this.results.listPublications(u, parse(uuidParam, t));
  }
}
