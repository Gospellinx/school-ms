import { Body, Controller, Get, Param, Post, Put, Query } from '@nestjs/common';
import { asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { StudentPrincipal } from '../auth/auth.types';
import { CurrentUser, ForAudience } from '../auth/decorators';
import { CbtService } from '../cbt/cbt.service';
import { found, parse, uuidParam } from '../common/validation';
import { DbService } from '../db/db.service';
import { classes, classSubjects, students, subjects } from '../db/schema';
import { PrepService } from '../prep/prep.service';
import { PortalResultsService } from './portal-results.service';

const answersSchema = z.object({
  answers: z.record(z.string().uuid(), z.string().regex(/^[A-Ea-e]$/).nullable()),
});
const practiceSchema = z.object({
  subjectId: z.string().uuid().optional(),
  count: z.number().int().min(5).max(40).default(10),
});
const planQuery = z.object({ ai: z.enum(['true', 'false']).default('true') });

/** The student portal: CBT tests, AI exam prep and released results. */
@ForAudience('student')
@Controller('student')
export class StudentController {
  constructor(
    private readonly dbs: DbService,
    private readonly cbt: CbtService,
    private readonly prep: PrepService,
    private readonly portal: PortalResultsService,
  ) {}

  @Get('me')
  me(@CurrentUser() s: StudentPrincipal) {
    return this.dbs.withSchool(s.schoolId, async (tx) => {
      const [row] = await tx
        .select({ student: students, className: classes.name, arm: classes.arm })
        .from(students)
        .leftJoin(classes, eq(classes.id, students.classId))
        .where(eq(students.id, s.studentId));
      found(row, 'Student');
      const mySubjects = row.student.classId
        ? await tx
            .select({ id: subjects.id, name: subjects.name, code: subjects.code })
            .from(classSubjects)
            .innerJoin(subjects, eq(subjects.id, classSubjects.subjectId))
            .where(eq(classSubjects.classId, row.student.classId))
            .orderBy(asc(subjects.name))
        : [];
      const { pinHash, ...student } = row.student;
      return { student, className: row.className, arm: row.arm, subjects: mySubjects };
    });
  }

  @Get('tests')
  tests(@CurrentUser() s: StudentPrincipal) {
    return this.cbt.availableTests(s);
  }

  @Post('tests/:id/start')
  start(@CurrentUser() s: StudentPrincipal, @Param('id') id: string) {
    return this.cbt.startTest(s, parse(uuidParam, id));
  }

  @Get('attempts/:id')
  attempt(@CurrentUser() s: StudentPrincipal, @Param('id') id: string) {
    return this.cbt.getAttempt(s, parse(uuidParam, id));
  }

  @Put('attempts/:id/answers')
  save(@CurrentUser() s: StudentPrincipal, @Param('id') id: string, @Body() body: unknown) {
    return this.cbt.saveAnswers(s, parse(uuidParam, id), parse(answersSchema, body).answers);
  }

  @Post('attempts/:id/submit')
  submit(@CurrentUser() s: StudentPrincipal, @Param('id') id: string) {
    return this.cbt.submit(s, parse(uuidParam, id));
  }

  /** Where the student stands, from their own results, and an AI study plan. */
  @Get('prep/plan')
  plan(@CurrentUser() s: StudentPrincipal, @Query() q: unknown) {
    const { ai } = parse(planQuery, q);
    return this.prep.plan(s.schoolId, s.studentId, { withAi: ai === 'true' });
  }

  /** A practice set aimed at the student's weakest topics. Answer and submit it like a test. */
  @Post('prep/practice')
  practice(@CurrentUser() s: StudentPrincipal, @Body() body: unknown) {
    return this.prep.practice(s, parse(practiceSchema, body ?? {}));
  }

  @Post('prep/explain/:questionId')
  explain(@CurrentUser() s: StudentPrincipal, @Param('questionId') q: string) {
    return this.prep.explain(s, parse(uuidParam, q));
  }

  @Get('results')
  results(@CurrentUser() s: StudentPrincipal) {
    return this.dbs.withSchool(s.schoolId, (tx) => this.portal.publishedTerms(tx, s.studentId));
  }

  @Get('results/:termId')
  reportCard(@CurrentUser() s: StudentPrincipal, @Param('termId') t: string) {
    return this.portal.reportCard(s.schoolId, s.studentId, parse(uuidParam, t));
  }
}
