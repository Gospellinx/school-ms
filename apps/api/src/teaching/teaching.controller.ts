import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { parseRubric } from '@school-ms/core';
import { z } from 'zod';
import { Principal } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators';
import { parse, uuidParam } from '../common/validation';
import { TeachingService } from './teaching.service';

const contextQuery = z.object({ classId: z.string().uuid(), subjectId: z.string().uuid() });

const lessonSchema = contextQuery.extend({
  kind: z.enum(['lesson_note', 'lesson_plan']),
  topic: z.string().trim().min(2).max(200),
  week: z.coerce.number().int().min(1).max(16).optional(),
  durationMinutes: z.coerce.number().int().min(20).max(120).default(40),
  notes: z.string().max(2000).optional(),
});

const assessmentSchema = contextQuery.extend({
  topics: z.array(z.string().trim().min(1).max(200)).max(12).default([]),
  objectiveCount: z.coerce.number().int().min(0).max(60).default(10),
  theoryCount: z.coerce.number().int().min(0).max(10).default(2),
  style: z.enum(['school', 'waec', 'neco', 'bece', 'jamb']).default('school'),
  purpose: z.enum(['class_test', 'exam']).default('class_test'),
});

const saveSchema = contextQuery.extend({
  kind: z.enum(['lesson_note', 'lesson_plan', 'marking_scheme', 'past_questions']),
  title: z.string().trim().min(2).max(200),
  body: z.string().min(10).max(200_000),
  visibleToStudents: z.boolean().optional(),
});

const rubricPoint = z.object({ point: z.string().trim().min(1).max(500), marks: z.number().positive().max(100) });
const essaySchema = contextQuery
  .extend({
    title: z.string().trim().min(2).max(200),
    question: z.string().trim().min(5).max(5000),
    /** Either points, or the marking scheme as text (one point per line, marks in brackets). */
    rubric: z.array(rubricPoint).max(40).optional(),
    rubricText: z.string().max(10_000).optional(),
    termId: z.string().uuid().nullish(),
    scoreComponent: z.string().min(1).max(40).nullish(),
  })
  .transform(({ rubricText, ...v }) => ({ ...v, rubric: v.rubric?.length ? v.rubric : parseRubric(rubricText ?? '') }));

const scriptSchema = z.object({ answer: z.string().trim().min(1).max(20_000) });
const confirmSchema = z.object({ awarded: z.number().min(0).max(1000), teacherNote: z.string().max(1000).nullish() });
const remarksSchema = z.object({ termId: z.string().uuid(), classId: z.string().uuid() });

/** The teacher assistant. Teachers only reach classes and subjects they teach; leadership reaches all. */
@Controller('assistant')
export class TeachingController {
  constructor(private readonly teaching: TeachingService) {}

  @Get('context')
  context(@CurrentUser() u: Principal, @Query() q: unknown) {
    const { classId, subjectId } = parse(contextQuery, q);
    return this.teaching.context(u, classId, subjectId);
  }

  /** A draft lesson note or lesson plan from the scheme of work and the school's notes. Nothing is saved. */
  @Post('lesson')
  lesson(@CurrentUser() u: Principal, @Body() body: unknown) {
    return this.teaching.lesson(u, parse(lessonSchema, body));
  }

  /** A draft class test or exam: objective questions (bank first) and theory questions with marking schemes. */
  @Post('assessment')
  assessment(@CurrentUser() u: Principal, @Body() body: unknown) {
    return this.teaching.assessment(u, parse(assessmentSchema, body));
  }

  /** Saves an edited draft into the knowledge base. */
  @Post('save')
  save(@CurrentUser() u: Principal, @Body() body: unknown) {
    return this.teaching.save(u, parse(saveSchema, body));
  }

  @Get('essays')
  essays(@CurrentUser() u: Principal, @Query('classId') classId?: string) {
    return this.teaching.listEssays(u, classId ? parse(uuidParam, classId) : undefined);
  }

  @Post('essays')
  createEssay(@CurrentUser() u: Principal, @Body() body: unknown) {
    return this.teaching.createEssay(u, parse(essaySchema, body));
  }

  @Get('essays/:id')
  essay(@CurrentUser() u: Principal, @Param('id') id: string) {
    return this.teaching.getEssay(u, parse(uuidParam, id));
  }

  @Delete('essays/:id')
  removeEssay(@CurrentUser() u: Principal, @Param('id') id: string) {
    return this.teaching.removeEssay(u, parse(uuidParam, id));
  }

  /** Saves a student's answer and returns suggested marks per point. */
  @Put('essays/:id/scripts/:studentId')
  script(@CurrentUser() u: Principal, @Param('id') id: string, @Param('studentId') s: string, @Body() body: unknown) {
    return this.teaching.submitScript(u, parse(uuidParam, id), parse(uuidParam, s), parse(scriptSchema, body).answer);
  }

  /** The teacher's final mark for a script. */
  @Patch('essays/:id/scripts/:studentId')
  confirm(@CurrentUser() u: Principal, @Param('id') id: string, @Param('studentId') s: string, @Body() body: unknown) {
    return this.teaching.confirmScript(u, parse(uuidParam, id), parse(uuidParam, s), parse(confirmSchema, body));
  }

  /** Sends confirmed marks to the score sheet column chosen for the task. */
  @Post('essays/:id/push-scores')
  push(@CurrentUser() u: Principal, @Param('id') id: string) {
    return this.teaching.pushEssayScores(u, parse(uuidParam, id));
  }

  /** Draft report card remarks for a whole class. Save each with PUT /terms/:termId/students/:id/comments. */
  @Post('remarks')
  remarks(@CurrentUser() u: Principal, @Body() body: unknown) {
    const { termId, classId } = parse(remarksSchema, body);
    return this.teaching.classRemarks(u, termId, classId);
  }

  /** Students in a class who are falling behind this term, with the reasons. */
  @Get('watchlist')
  watchlist(@CurrentUser() u: Principal, @Query('classId') classId: string) {
    return this.teaching.watchlist(u, parse(uuidParam, classId));
  }
}
