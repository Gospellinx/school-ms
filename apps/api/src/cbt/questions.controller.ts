import { BadRequestException, Body, Controller, Delete, Get, Param, Post, Query } from '@nestjs/common';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { Principal } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators';
import { csvToObjects } from '../common/csv';
import { assertOwned } from '../common/owned';
import { found, parse, uuidParam } from '../common/validation';
import { DbService } from '../db/db.service';
import { cbtTestQuestions, questions, subjects } from '../db/schema';
import { PrepService } from '../prep/prep.service';

const EXAMS = ['school', 'bece', 'waec', 'neco', 'jamb'] as const;
const SECTION_KINDS = ['nursery', 'primary', 'junior_secondary', 'senior_secondary'] as const;

export const questionSchema = z
  .object({
    subjectId: z.string().uuid(),
    topic: z.string().min(1).max(120),
    body: z.string().min(3).max(4000),
    options: z
      .array(z.object({ key: z.string().regex(/^[A-Ea-e]$/).transform((k) => k.toUpperCase()), text: z.string().min(1).max(1000) }))
      .min(2)
      .max(5),
    answer: z.string().regex(/^[A-Ea-e]$/).transform((k) => k.toUpperCase()),
    explanation: z.string().max(4000).optional(),
    exam: z.enum(EXAMS).default('school'),
    year: z.number().int().min(1980).max(2100).optional(),
    sectionKind: z.enum(SECTION_KINDS).optional(),
    source: z.enum(['teacher', 'ai', 'import']).default('teacher'),
  })
  .refine((q) => new Set(q.options.map((o) => o.key)).size === q.options.length, 'Option letters must be different')
  .refine((q) => q.options.some((o) => o.key === q.answer), 'The answer must be one of the options');

const bulkSchema = z.object({ questions: z.array(questionSchema).min(1).max(200) });

const importSchema = z.object({
  /**
   * Header row: subject_code, topic, question, option_a, option_b, option_c, option_d, option_e,
   * answer, explanation, exam, year
   */
  csv: z.string().min(1),
  sectionKind: z.enum(SECTION_KINDS).optional(),
});

const listSchema = z.object({
  subjectId: z.string().uuid().optional(),
  topic: z.string().optional(),
  exam: z.enum(EXAMS).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(200),
});

const generateSchema = z.object({
  subjectId: z.string().uuid(),
  topic: z.string().min(2).max(120),
  count: z.number().int().min(1).max(20).default(5),
  exam: z.enum(EXAMS).default('waec'),
  classLevel: z.string().max(40).default('SS 2'),
});

/** The school's question bank for CBT tests and exam-prep practice. Any teacher can add questions. */
@Controller('questions')
export class QuestionsController {
  constructor(
    private readonly dbs: DbService,
    private readonly prep: PrepService,
  ) {}

  @Get()
  list(@CurrentUser() u: Principal, @Query() q: unknown) {
    const f = parse(listSchema, q);
    return this.dbs.withSchool(u.schoolId, (tx) =>
      tx
        .select()
        .from(questions)
        .where(
          and(
            f.subjectId ? eq(questions.subjectId, f.subjectId) : undefined,
            f.topic ? eq(questions.topic, f.topic) : undefined,
            f.exam ? eq(questions.exam, f.exam) : undefined,
          ),
        )
        .orderBy(asc(questions.topic), asc(questions.createdAt))
        .limit(f.limit),
    );
  }

  @Get('topics')
  topics(@CurrentUser() u: Principal, @Query('subjectId') subjectId: string) {
    const sid = parse(uuidParam, subjectId);
    return this.dbs.withSchool(u.schoolId, async (tx) => {
      const rows = await tx.selectDistinct({ topic: questions.topic }).from(questions).where(eq(questions.subjectId, sid));
      return rows.map((r) => r.topic).sort();
    });
  }

  @Post()
  create(@CurrentUser() u: Principal, @Body() body: unknown) {
    return this.saveMany(u, [parse(questionSchema, body)]).then((rows) => rows[0]);
  }

  /** Saves many questions at once, e.g. AI drafts a teacher has reviewed. */
  @Post('bulk')
  bulk(@CurrentUser() u: Principal, @Body() body: unknown) {
    return this.saveMany(u, parse(bulkSchema, body).questions);
  }

  @Post('import')
  async import(@CurrentUser() u: Principal, @Body() body: unknown) {
    const input = parse(importSchema, body);
    const rows = csvToObjects(input.csv);
    const codes = await this.dbs.withSchool(u.schoolId, (tx) => tx.select().from(subjects));
    const byCode = new Map(codes.map((s) => [s.code.toUpperCase(), s.id]));
    const errors: { row: number; message: string }[] = [];
    const valid: z.infer<typeof questionSchema>[] = [];
    rows.forEach((r, i) => {
      const options = ['a', 'b', 'c', 'd', 'e']
        .filter((k) => r[`option_${k}`])
        .map((k) => ({ key: k.toUpperCase(), text: r[`option_${k}`] }));
      const result = questionSchema.safeParse({
        subjectId: byCode.get((r.subject_code ?? '').toUpperCase()),
        topic: r.topic,
        body: r.question,
        options,
        answer: r.answer,
        explanation: r.explanation || undefined,
        exam: (r.exam || 'school').toLowerCase(),
        year: r.year ? Number(r.year) : undefined,
        sectionKind: input.sectionKind,
        source: 'import',
      });
      if (result.success) valid.push(result.data);
      else
        errors.push({
          row: i + 2,
          message: result.error.issues.map((x) => (x.path[0] === 'subjectId' ? `Unknown subject code "${r.subject_code}"` : `${x.path.join('.') || 'row'}: ${x.message}`)).join('; '),
        });
    });
    if (errors.length) return { imported: 0, errors };
    const saved = valid.length ? await this.saveMany(u, valid) : [];
    return { imported: saved.length, errors };
  }

  /**
   * AI drafts exam-style questions on a topic for a teacher to review. Nothing is saved:
   * the teacher edits the drafts and saves them through POST /questions/bulk.
   */
  @Post('generate')
  generate(@CurrentUser() u: Principal, @Body() body: unknown) {
    return this.prep.draftQuestions(u, parse(generateSchema, body));
  }

  @Delete(':id')
  remove(@CurrentUser() u: Principal, @Param('id') id: string) {
    const qid = parse(uuidParam, id);
    return this.dbs.withSchool(u.schoolId, async (tx) => {
      const [used] = await tx.select().from(cbtTestQuestions).where(eq(cbtTestQuestions.questionId, qid)).limit(1);
      if (used) throw new BadRequestException('This question is in a CBT test and cannot be deleted');
      const [row] = await tx.delete(questions).where(eq(questions.id, qid)).returning();
      found(row, 'Question');
      return { deleted: true };
    });
  }

  private saveMany(u: Principal, items: z.infer<typeof questionSchema>[]) {
    return this.dbs.withSchool(u.schoolId, async (tx) => {
      const subjectIds = [...new Set(items.map((q) => q.subjectId))];
      const owned = await tx.select({ id: subjects.id }).from(subjects).where(inArray(subjects.id, subjectIds));
      if (owned.length !== subjectIds.length) await assertOwned(tx, subjects, subjectIds.find((id) => !owned.some((o) => o.id === id))!, 'Subject');
      return tx
        .insert(questions)
        .values(items.map((q) => ({ ...q, schoolId: u.schoolId, createdBy: u.staffId })))
        .returning();
    });
  }
}
