import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { asc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { Principal } from '../auth/auth.types';
import { CurrentUser, LEADERSHIP, Roles } from '../auth/decorators';
import { csvToObjects } from '../common/csv';
import { assertOwned } from '../common/owned';
import { found, parse, rethrowUnique, uuidParam } from '../common/validation';
import { DbService } from '../db/db.service';
import { classes, students } from '../db/schema';

const studentSchema = z.object({
  admissionNumber: z.string().min(1),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  otherNames: z.string().optional(),
  gender: z.enum(['male', 'female']).optional(),
  dateOfBirth: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')
    .optional(),
  classId: z.string().uuid().optional(),
});

const importSchema = z.object({
  classId: z.string().uuid(),
  /** Header row: admission_number, first_name, last_name, other_names, gender, date_of_birth */
  csv: z.string().min(1),
});

function normaliseGender(value: string | undefined): 'male' | 'female' | undefined {
  const v = value?.trim().toLowerCase();
  if (v === 'm' || v === 'male') return 'male';
  if (v === 'f' || v === 'female') return 'female';
  return undefined;
}

@Controller('students')
export class StudentsController {
  constructor(private readonly dbs: DbService) {}

  @Get()
  list(@CurrentUser() u: Principal, @Query('classId') classId?: string) {
    const filter = classId ? eq(students.classId, parse(uuidParam, classId)) : undefined;
    return this.dbs.withSchool(u.schoolId, (tx) =>
      tx.select().from(students).where(filter).orderBy(asc(students.lastName), asc(students.firstName)),
    );
  }

  @Get(':id')
  get(@CurrentUser() u: Principal, @Param('id') id: string) {
    const studentId = parse(uuidParam, id);
    return this.dbs.withSchool(u.schoolId, async (tx) => {
      const [row] = await tx.select().from(students).where(eq(students.id, studentId));
      return found(row, 'Student');
    });
  }

  @Roles(...LEADERSHIP)
  @Post()
  async create(@CurrentUser() u: Principal, @Body() body: unknown) {
    const input = parse(studentSchema, body);
    try {
      return await this.dbs.withSchool(u.schoolId, async (tx) => {
        if (input.classId) await assertOwned(tx, classes, input.classId, 'Class');
        const [row] = await tx.insert(students).values({ ...input, schoolId: u.schoolId }).returning();
        return row;
      });
    } catch (err) {
      rethrowUnique(err, 'A student with that admission number already exists');
    }
  }

  /**
   * Bulk import from a spreadsheet exported as CSV. Existing admission numbers are updated
   * and moved into the class, so the same file can be re-uploaded safely.
   */
  @Roles(...LEADERSHIP)
  @Post('import')
  import(@CurrentUser() u: Principal, @Body() body: unknown) {
    const input = parse(importSchema, body);
    const rows = csvToObjects(input.csv);
    const errors: { row: number; message: string }[] = [];
    const valid: z.infer<typeof studentSchema>[] = [];
    rows.forEach((r, i) => {
      const result = studentSchema.safeParse({
        admissionNumber: r.admission_number,
        firstName: r.first_name,
        lastName: r.last_name,
        otherNames: r.other_names || undefined,
        gender: normaliseGender(r.gender),
        dateOfBirth: r.date_of_birth || undefined,
        classId: input.classId,
      });
      if (result.success) valid.push(result.data);
      else errors.push({ row: i + 2, message: result.error.issues.map((x) => `${x.path.join('.')}: ${x.message}`).join('; ') });
    });

    const seen = new Set<string>();
    for (const v of valid) {
      if (seen.has(v.admissionNumber)) errors.push({ row: 0, message: `Admission number ${v.admissionNumber} appears twice in the file` });
      seen.add(v.admissionNumber);
    }
    if (errors.length) return { imported: 0, errors };

    return this.dbs.withSchool(u.schoolId, async (tx) => {
      await assertOwned(tx, classes, input.classId, 'Class');
      if (valid.length === 0) return { imported: 0, errors };
      await tx
        .insert(students)
        .values(valid.map((v) => ({ ...v, schoolId: u.schoolId })))
        .onConflictDoUpdate({
          target: [students.schoolId, students.admissionNumber],
          set: {
            firstName: sql`excluded.first_name`,
            lastName: sql`excluded.last_name`,
            otherNames: sql`excluded.other_names`,
            gender: sql`excluded.gender`,
            dateOfBirth: sql`excluded.date_of_birth`,
            classId: sql`excluded.class_id`,
          },
        });
      return { imported: valid.length, errors };
    });
  }
}
