import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import bcrypt from 'bcryptjs';
import { asc, eq } from 'drizzle-orm';
import { validateComponents, validateScale } from '@school-ms/core';
import { z } from 'zod';
import { Principal } from '../auth/auth.types';
import { CurrentUser, LEADERSHIP, Roles } from '../auth/decorators';
import { assertOwned } from '../common/owned';
import { found, parse, rethrowUnique, uuidParam } from '../common/validation';
import { DbService } from '../db/db.service';
import { academicSessions, classes, classSubjects, schools, sections, staff, subjects, terms } from '../db/schema';
import { BadRequestException } from '@nestjs/common';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');

const sessionSchema = z.object({
  name: z.string().regex(/^\d{4}\/\d{4}$/, 'Use the form 2025/2026'),
  startsOn: isoDate.optional(),
  endsOn: isoDate.optional(),
  /** Creates First, Second and Third term automatically unless false. */
  createTerms: z.boolean().default(true),
});

const termPatch = z
  .object({ startsOn: isoDate.nullable().optional(), endsOn: isoDate.nullable().optional() })
  .refine((t) => !t.startsOn || !t.endsOn || t.startsOn <= t.endsOn, 'The term must start before it ends');

const sectionPatch = z.object({
  name: z.string().min(1).optional(),
  gradingScale: z
    .array(z.object({ min: z.number(), max: z.number(), grade: z.string().min(1), remark: z.string() }))
    .optional(),
  components: z
    .array(z.object({ key: z.string().regex(/^[a-z0-9_]+$/), label: z.string().min(1), maxScore: z.number().positive() }))
    .optional(),
});

const classSchema = z.object({
  sectionId: z.string().uuid(),
  name: z.string().min(1),
  arm: z.string().default(''),
  sortOrder: z.number().int().default(0),
});

const classPatch = z.object({
  name: z.string().min(1).optional(),
  arm: z.string().optional(),
  sortOrder: z.number().int().optional(),
  formTeacherId: z.string().uuid().nullable().optional(),
});

const schoolPatch = z.object({
  name: z.string().min(2).optional(),
  motto: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  email: z.string().email().nullable().optional(),
  withholdResultsForDebt: z.boolean().optional(),
});

const subjectSchema = z.object({ name: z.string().min(1), code: z.string().min(1).max(12) });

const classSubjectSchema = z.object({ subjectId: z.string().uuid(), teacherId: z.string().uuid().nullable().default(null) });

const staffSchema = z.object({
  fullName: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(['admin', 'teacher']),
});

const TERM_NAMES = ['First Term', 'Second Term', 'Third Term'];

/** School setup: sessions and terms, sections, classes, subjects and staff. */
@Controller()
export class SetupController {
  constructor(private readonly dbs: DbService) {}

  @Get('sessions')
  listSessions(@CurrentUser() u: Principal) {
    return this.dbs.withSchool(u.schoolId, async (tx) => {
      const all = await tx.select().from(academicSessions).orderBy(asc(academicSessions.name));
      const allTerms = await tx.select().from(terms).orderBy(asc(terms.number));
      return all.map((s) => ({ ...s, terms: allTerms.filter((t) => t.sessionId === s.id) }));
    });
  }

  @Roles(...LEADERSHIP)
  @Post('sessions')
  async createSession(@CurrentUser() u: Principal, @Body() body: unknown) {
    const input = parse(sessionSchema, body);
    try {
      return await this.dbs.withSchool(u.schoolId, async (tx) => {
        const [session] = await tx
          .insert(academicSessions)
          .values({ schoolId: u.schoolId, name: input.name, startsOn: input.startsOn, endsOn: input.endsOn })
          .returning();
        const created = input.createTerms
          ? await tx
              .insert(terms)
              .values(TERM_NAMES.map((name, i) => ({ schoolId: u.schoolId, sessionId: session.id, number: i + 1, name })))
              .returning()
          : [];
        return { ...session, terms: created };
      });
    } catch (err) {
      rethrowUnique(err, 'That session already exists');
    }
  }

  /** Marks one term as the current term for the whole school. */
  @Roles(...LEADERSHIP)
  @Post('terms/:id/make-current')
  makeCurrent(@CurrentUser() u: Principal, @Param('id') id: string) {
    const termId = parse(uuidParam, id);
    return this.dbs.withSchool(u.schoolId, async (tx) => {
      await assertOwned(tx, terms, termId, 'Term');
      await tx.update(terms).set({ isCurrent: false }).where(eq(terms.isCurrent, true));
      const [term] = await tx.update(terms).set({ isCurrent: true }).where(eq(terms.id, termId)).returning();
      return term;
    });
  }

  /** Term dates. Attendance totals on report cards count school days between them. */
  @Roles(...LEADERSHIP)
  @Patch('terms/:id')
  updateTerm(@CurrentUser() u: Principal, @Param('id') id: string, @Body() body: unknown) {
    const termId = parse(uuidParam, id);
    const input = parse(termPatch, body);
    return this.dbs.withSchool(u.schoolId, async (tx) => {
      const [row] = await tx.update(terms).set(input).where(eq(terms.id, termId)).returning();
      return found(row, 'Term');
    });
  }

  @Get('sections')
  listSections(@CurrentUser() u: Principal) {
    return this.dbs.withSchool(u.schoolId, (tx) => tx.select().from(sections).orderBy(asc(sections.sortOrder)));
  }

  @Roles(...LEADERSHIP)
  @Patch('sections/:id')
  updateSection(@CurrentUser() u: Principal, @Param('id') id: string, @Body() body: unknown) {
    const sectionId = parse(uuidParam, id);
    const input = parse(sectionPatch, body);
    try {
      if (input.gradingScale) validateScale(input.gradingScale);
      if (input.components) validateComponents(input.components);
    } catch (err) {
      throw new BadRequestException((err as Error).message);
    }
    return this.dbs.withSchool(u.schoolId, async (tx) => {
      const [row] = await tx.update(sections).set(input).where(eq(sections.id, sectionId)).returning();
      return found(row, 'Section');
    });
  }

  @Get('classes')
  listClasses(@CurrentUser() u: Principal) {
    return this.dbs.withSchool(u.schoolId, (tx) =>
      tx.select().from(classes).orderBy(asc(classes.sortOrder), asc(classes.name), asc(classes.arm)),
    );
  }

  @Roles(...LEADERSHIP)
  @Post('classes')
  async createClass(@CurrentUser() u: Principal, @Body() body: unknown) {
    const input = parse(classSchema, body);
    try {
      return await this.dbs.withSchool(u.schoolId, async (tx) => {
        await assertOwned(tx, sections, input.sectionId, 'Section');
        const [row] = await tx.insert(classes).values({ ...input, schoolId: u.schoolId }).returning();
        return row;
      });
    } catch (err) {
      rethrowUnique(err, 'That class already exists');
    }
  }

  /** Renames a class or sets its form teacher, who takes the daily register. */
  @Roles(...LEADERSHIP)
  @Patch('classes/:id')
  updateClass(@CurrentUser() u: Principal, @Param('id') id: string, @Body() body: unknown) {
    const classId = parse(uuidParam, id);
    const input = parse(classPatch, body);
    return this.dbs.withSchool(u.schoolId, async (tx) => {
      if (input.formTeacherId) await assertOwned(tx, staff, input.formTeacherId, 'Teacher');
      const [row] = await tx.update(classes).set(input).where(eq(classes.id, classId)).returning();
      return found(row, 'Class');
    });
  }

  /** School profile and settings, such as withholding report cards while fees are owed. */
  @Roles(...LEADERSHIP)
  @Patch('school')
  async updateSchool(@CurrentUser() u: Principal, @Body() body: unknown) {
    const input = parse(schoolPatch, body);
    const [row] = await this.dbs.db.update(schools).set(input).where(eq(schools.id, u.schoolId)).returning();
    return row;
  }

  @Get('subjects')
  listSubjects(@CurrentUser() u: Principal) {
    return this.dbs.withSchool(u.schoolId, (tx) => tx.select().from(subjects).orderBy(asc(subjects.name)));
  }

  @Roles(...LEADERSHIP)
  @Post('subjects')
  async createSubject(@CurrentUser() u: Principal, @Body() body: unknown) {
    const input = parse(subjectSchema, body);
    try {
      return await this.dbs.withSchool(u.schoolId, async (tx) => {
        const [row] = await tx
          .insert(subjects)
          .values({ ...input, code: input.code.toUpperCase(), schoolId: u.schoolId })
          .returning();
        return row;
      });
    } catch (err) {
      rethrowUnique(err, 'A subject with that code already exists');
    }
  }

  @Get('classes/:id/subjects')
  listClassSubjects(@CurrentUser() u: Principal, @Param('id') id: string) {
    const classId = parse(uuidParam, id);
    return this.dbs.withSchool(u.schoolId, (tx) =>
      tx
        .select({ id: classSubjects.id, subjectId: subjects.id, name: subjects.name, code: subjects.code, teacherId: classSubjects.teacherId })
        .from(classSubjects)
        .innerJoin(subjects, eq(subjects.id, classSubjects.subjectId))
        .where(eq(classSubjects.classId, classId))
        .orderBy(asc(subjects.name)),
    );
  }

  /** Adds a subject to a class, or changes its teacher if it is already there. */
  @Roles(...LEADERSHIP)
  @Post('classes/:id/subjects')
  assignSubject(@CurrentUser() u: Principal, @Param('id') id: string, @Body() body: unknown) {
    const classId = parse(uuidParam, id);
    const input = parse(classSubjectSchema, body);
    return this.dbs.withSchool(u.schoolId, async (tx) => {
      await assertOwned(tx, classes, classId, 'Class');
      await assertOwned(tx, subjects, input.subjectId, 'Subject');
      if (input.teacherId) await assertOwned(tx, staff, input.teacherId, 'Teacher');
      const [row] = await tx
        .insert(classSubjects)
        .values({ schoolId: u.schoolId, classId, subjectId: input.subjectId, teacherId: input.teacherId })
        .onConflictDoUpdate({ target: [classSubjects.classId, classSubjects.subjectId], set: { teacherId: input.teacherId } })
        .returning();
      return row;
    });
  }

  /** Class and subject pairs this person can enter scores for: their own as a teacher, all of them for leadership. */
  @Get('my-assignments')
  myAssignments(@CurrentUser() u: Principal) {
    return this.dbs.withSchool(u.schoolId, (tx) =>
      tx
        .select({
          classId: classes.id,
          className: classes.name,
          arm: classes.arm,
          subjectId: subjects.id,
          subjectName: subjects.name,
          teacherId: classSubjects.teacherId,
        })
        .from(classSubjects)
        .innerJoin(classes, eq(classes.id, classSubjects.classId))
        .innerJoin(subjects, eq(subjects.id, classSubjects.subjectId))
        .where(u.role === 'teacher' ? eq(classSubjects.teacherId, u.staffId) : undefined)
        .orderBy(asc(classes.sortOrder), asc(classes.name), asc(classes.arm), asc(subjects.name)),
    );
  }

  @Roles(...LEADERSHIP)
  @Get('staff')
  listStaff(@CurrentUser() u: Principal) {
    return this.dbs.withSchool(u.schoolId, (tx) =>
      tx
        .select({ id: staff.id, fullName: staff.fullName, email: staff.email, role: staff.role })
        .from(staff)
        .orderBy(asc(staff.fullName)),
    );
  }

  @Roles(...LEADERSHIP)
  @Post('staff')
  async createStaff(@CurrentUser() u: Principal, @Body() body: unknown) {
    const input = parse(staffSchema, body);
    const passwordHash = await bcrypt.hash(input.password, 10);
    try {
      return await this.dbs.withSchool(u.schoolId, async (tx) => {
        const [row] = await tx
          .insert(staff)
          .values({ schoolId: u.schoolId, fullName: input.fullName, email: input.email.toLowerCase(), passwordHash, role: input.role })
          .returning({ id: staff.id, fullName: staff.fullName, email: staff.email, role: staff.role });
        return row;
      });
    } catch (err) {
      rethrowUnique(err, 'A staff member with that email already exists');
    }
  }
}
