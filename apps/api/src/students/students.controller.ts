import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { normalizeNigerianPhone } from '@school-ms/core';
import bcrypt from 'bcryptjs';
import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import { Principal } from '../auth/auth.types';
import { CurrentUser, LEADERSHIP, Roles } from '../auth/decorators';
import { csvToObjects } from '../common/csv';
import { assertOwned } from '../common/owned';
import { found, parse, rethrowUnique, uuidParam } from '../common/validation';
import { DbService } from '../db/db.service';
import { classes, students } from '../db/schema';
import { newPin } from '../auth/portal-auth.service';
import { GuardiansService } from '../guardians/guardians.service';

/** Never send PIN hashes to the client. */
function publicStudent<T extends { pinHash?: string | null }>(row: T) {
  const { pinHash, ...rest } = row;
  return { ...rest, hasPin: Boolean(pinHash) };
}

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
  /**
   * Header row: admission_number, first_name, last_name, other_names, gender, date_of_birth,
   * and optionally parent_name, parent_phone, parent_email to link a parent at the same time.
   */
  csv: z.string().min(1),
});

const pinsSchema = z.object({ resetExisting: z.boolean().default(false) });

interface ParentColumns {
  admissionNumber: string;
  name: string;
  phone: string;
  email?: string;
}

function normaliseGender(value: string | undefined): 'male' | 'female' | undefined {
  const v = value?.trim().toLowerCase();
  if (v === 'm' || v === 'male') return 'male';
  if (v === 'f' || v === 'female') return 'female';
  return undefined;
}

@Controller('students')
export class StudentsController {
  constructor(
    private readonly dbs: DbService,
    private readonly guardians: GuardiansService,
  ) {}

  @Get()
  list(@CurrentUser() u: Principal, @Query('classId') classId?: string) {
    const filter = classId ? eq(students.classId, parse(uuidParam, classId)) : undefined;
    return this.dbs.withSchool(u.schoolId, async (tx) =>
      (await tx.select().from(students).where(filter).orderBy(asc(students.lastName), asc(students.firstName))).map(publicStudent),
    );
  }

  @Get(':id')
  get(@CurrentUser() u: Principal, @Param('id') id: string) {
    const studentId = parse(uuidParam, id);
    return this.dbs.withSchool(u.schoolId, async (tx) => {
      const [row] = await tx.select().from(students).where(eq(students.id, studentId));
      return publicStudent(found(row, 'Student'));
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
        return publicStudent(row);
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
    const parents: ParentColumns[] = [];
    rows.forEach((r, i) => {
      if (r.parent_phone) {
        if (!normaliseParent(r)) {
          errors.push({ row: i + 2, message: `parent_phone: "${r.parent_phone}" is not a valid Nigerian mobile number` });
        } else if (!r.parent_name) {
          errors.push({ row: i + 2, message: 'parent_name: needed when parent_phone is given' });
        } else {
          parents.push({ admissionNumber: r.admission_number, name: r.parent_name, phone: r.parent_phone, email: r.parent_email || undefined });
        }
      }
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
    if (errors.length) return { imported: 0, parentsLinked: 0, errors };

    return this.dbs.withSchool(u.schoolId, async (tx) => {
      await assertOwned(tx, classes, input.classId, 'Class');
      if (valid.length === 0) return { imported: 0, parentsLinked: 0, errors };
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
      let parentsLinked = 0;
      if (parents.length) {
        const ids = await tx
          .select({ id: students.id, admissionNumber: students.admissionNumber })
          .from(students)
          .where(inArray(students.admissionNumber, parents.map((p) => p.admissionNumber)));
        const byAdmission = new Map(ids.map((s) => [s.admissionNumber, s.id]));
        for (const p of parents) {
          const guardian = await this.guardians.upsert(tx, u.schoolId, { fullName: p.name, phone: p.phone, email: p.email });
          await this.guardians.link(tx, u.schoolId, guardian.id, byAdmission.get(p.admissionNumber)!);
          parentsLinked++;
        }
      }
      return { imported: valid.length, parentsLinked, errors };
    });
  }

  /**
   * Gives students a 6-digit PIN for CBT and exam prep. Returns the PINs once so the school
   * can print login slips; only hashes are stored. Students who already have a PIN keep it
   * unless resetExisting is true.
   */
  @Roles(...LEADERSHIP)
  @Post('pins/class/:classId')
  classPins(@CurrentUser() u: Principal, @Param('classId') classId: string, @Body() body: unknown) {
    const cid = parse(uuidParam, classId);
    const input = parse(pinsSchema, body ?? {});
    return this.dbs.withSchool(u.schoolId, async (tx) => {
      await assertOwned(tx, classes, cid, 'Class');
      const roster = await tx
        .select()
        .from(students)
        .where(input.resetExisting ? eq(students.classId, cid) : and(eq(students.classId, cid), isNull(students.pinHash)))
        .orderBy(asc(students.lastName), asc(students.firstName));
      const slips = [];
      for (const s of roster) {
        const pin = newPin();
        await tx.update(students).set({ pinHash: await bcrypt.hash(pin, 8) }).where(eq(students.id, s.id));
        slips.push({ studentId: s.id, admissionNumber: s.admissionNumber, name: `${s.lastName} ${s.firstName}`, pin });
      }
      return { issued: slips.length, slips };
    });
  }

  @Roles(...LEADERSHIP)
  @Post(':id/reset-pin')
  resetPin(@CurrentUser() u: Principal, @Param('id') id: string) {
    const studentId = parse(uuidParam, id);
    return this.dbs.withSchool(u.schoolId, async (tx) => {
      await assertOwned(tx, students, studentId, 'Student');
      const pin = newPin();
      await tx.update(students).set({ pinHash: await bcrypt.hash(pin, 8) }).where(eq(students.id, studentId));
      return { studentId, pin };
    });
  }
}

function normaliseParent(r: Record<string, string>): string | null {
  return normalizeNigerianPhone(r.parent_phone);
}
