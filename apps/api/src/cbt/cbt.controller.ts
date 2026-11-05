import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { z } from 'zod';
import { Principal } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators';
import { parse, uuidParam } from '../common/validation';
import { CbtService } from './cbt.service';

const testSchema = z.object({
  title: z.string().min(2).max(120),
  subjectId: z.string().uuid(),
  termId: z.string().uuid().optional(),
  durationMinutes: z.number().int().min(1).max(300),
  opensAt: z.string().datetime({ offset: true }).optional(),
  closesAt: z.string().datetime({ offset: true }).optional(),
  classIds: z.array(z.string().uuid()).min(1),
  questionIds: z.array(z.string().uuid()).max(200).default([]),
  /** Optional marks per question id; 1 by default. */
  marks: z.record(z.string().uuid(), z.number().int().min(1).max(20)).optional(),
  shuffleQuestions: z.boolean().default(true),
  showResults: z.boolean().default(true),
  /** e.g. "ca1": lets the teacher push CBT scores into that column of the term's score sheet. */
  scoreComponent: z.string().regex(/^[a-z0-9_]+$/).optional(),
});

/** Teachers set computer-based tests from the question bank and see results. */
@Controller('cbt/tests')
export class CbtController {
  constructor(private readonly cbt: CbtService) {}

  @Post()
  create(@CurrentUser() u: Principal, @Body() body: unknown) {
    return this.cbt.createTest(u, parse(testSchema, body));
  }

  @Get()
  list(@CurrentUser() u: Principal) {
    return this.cbt.listTests(u);
  }

  @Get(':id')
  get(@CurrentUser() u: Principal, @Param('id') id: string) {
    return this.cbt.getTest(u, parse(uuidParam, id));
  }

  @Post(':id/publish')
  publish(@CurrentUser() u: Principal, @Param('id') id: string) {
    return this.cbt.setStatus(u, parse(uuidParam, id), 'published');
  }

  @Post(':id/close')
  close(@CurrentUser() u: Principal, @Param('id') id: string) {
    return this.cbt.setStatus(u, parse(uuidParam, id), 'closed');
  }

  @Get(':id/results')
  results(@CurrentUser() u: Principal, @Param('id') id: string) {
    return this.cbt.results(u, parse(uuidParam, id));
  }

  @Post(':id/push-scores')
  pushScores(@CurrentUser() u: Principal, @Param('id') id: string) {
    return this.cbt.pushScores(u, parse(uuidParam, id));
  }
}
