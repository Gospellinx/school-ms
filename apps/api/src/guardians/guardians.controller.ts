import { Body, Controller, Delete, Get, NotFoundException, Param, Patch, Post, Query } from '@nestjs/common';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { Principal } from '../auth/auth.types';
import { CurrentUser, LEADERSHIP, Roles } from '../auth/decorators';
import { assertOwned } from '../common/owned';
import { found, parse, uuidParam } from '../common/validation';
import { DbService } from '../db/db.service';
import { guardians, studentGuardians, students } from '../db/schema';
import { GuardiansService, phoneOrThrow } from './guardians.service';

const guardianSchema = z.object({
  fullName: z.string().min(2),
  phone: z.string().min(7),
  email: z.string().email().optional(),
  preferredChannel: z.enum(['sms', 'whatsapp']).optional(),
  students: z.array(z.object({ studentId: z.string().uuid(), relationship: z.string().max(40).optional() })).default([]),
});

const patchSchema = z.object({
  fullName: z.string().min(2).optional(),
  phone: z.string().min(7).optional(),
  email: z.string().email().nullable().optional(),
  preferredChannel: z.enum(['sms', 'whatsapp']).optional(),
});

const linkSchema = z.object({ studentId: z.string().uuid(), relationship: z.string().max(40).optional() });

/** Parents and guardians, and which students they are linked to. */
@Controller('guardians')
export class GuardiansController {
  constructor(
    private readonly dbs: DbService,
    private readonly service: GuardiansService,
  ) {}

  @Get()
  list(@CurrentUser() u: Principal, @Query('studentId') studentId?: string) {
    return this.dbs.withSchool(u.schoolId, async (tx) => {
      const links = await tx.select().from(studentGuardians);
      let rows = await tx.select().from(guardians).orderBy(asc(guardians.fullName));
      if (studentId) {
        const sid = parse(uuidParam, studentId);
        const ids = new Set(links.filter((l) => l.studentId === sid).map((l) => l.guardianId));
        rows = rows.filter((g) => ids.has(g.id));
      }
      return rows.map((g) => ({
        ...g,
        students: links.filter((l) => l.guardianId === g.id).map((l) => ({ studentId: l.studentId, relationship: l.relationship })),
      }));
    });
  }

  /** Adds a parent (or updates the one with that phone number) and links them to their children. */
  @Roles(...LEADERSHIP)
  @Post()
  create(@CurrentUser() u: Principal, @Body() body: unknown) {
    const input = parse(guardianSchema, body);
    return this.dbs.withSchool(u.schoolId, async (tx) => {
      const ids = input.students.map((s) => s.studentId);
      if (ids.length) {
        const owned = await tx.select({ id: students.id }).from(students).where(inArray(students.id, ids));
        if (owned.length !== new Set(ids).size) throw new NotFoundException('Student not found');
      }
      const guardian = await this.service.upsert(tx, u.schoolId, input);
      for (const s of input.students) await this.service.link(tx, u.schoolId, guardian.id, s.studentId, s.relationship);
      return { ...guardian, students: input.students };
    });
  }

  @Roles(...LEADERSHIP)
  @Patch(':id')
  update(@CurrentUser() u: Principal, @Param('id') id: string, @Body() body: unknown) {
    const guardianId = parse(uuidParam, id);
    const input = parse(patchSchema, body);
    const set = {
      ...input,
      phone: input.phone ? phoneOrThrow(input.phone) : undefined,
      email: input.email === undefined ? undefined : input.email?.toLowerCase() ?? null,
    };
    return this.dbs.withSchool(u.schoolId, async (tx) => {
      const [row] = await tx.update(guardians).set(set).where(eq(guardians.id, guardianId)).returning();
      return found(row, 'Guardian');
    });
  }

  @Roles(...LEADERSHIP)
  @Post(':id/students')
  link(@CurrentUser() u: Principal, @Param('id') id: string, @Body() body: unknown) {
    const guardianId = parse(uuidParam, id);
    const input = parse(linkSchema, body);
    return this.dbs.withSchool(u.schoolId, async (tx) => {
      await assertOwned(tx, guardians, guardianId, 'Guardian');
      await assertOwned(tx, students, input.studentId, 'Student');
      await this.service.link(tx, u.schoolId, guardianId, input.studentId, input.relationship);
      return { linked: true };
    });
  }

  @Roles(...LEADERSHIP)
  @Delete(':id/students/:studentId')
  unlink(@CurrentUser() u: Principal, @Param('id') id: string, @Param('studentId') studentId: string) {
    const guardianId = parse(uuidParam, id);
    const sid = parse(uuidParam, studentId);
    return this.dbs.withSchool(u.schoolId, async (tx) => {
      await tx.delete(studentGuardians).where(and(eq(studentGuardians.guardianId, guardianId), eq(studentGuardians.studentId, sid)));
      return { unlinked: true };
    });
  }
}
