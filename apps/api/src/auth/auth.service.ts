import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcryptjs';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { DbService, scopeToSchool } from '../db/db.service';
import { schools, sections, staff } from '../db/schema';
import { rethrowUnique } from '../common/validation';
import { DEFAULT_SECTIONS } from '../setup/defaults';
import { Role } from './auth.types';

export const registerSchema = z.object({
  school: z.object({
    name: z.string().min(2),
    slug: z
      .string()
      .min(2)
      .max(40)
      .regex(/^[a-z0-9-]+$/, 'Use lowercase letters, numbers and dashes'),
    motto: z.string().optional(),
    address: z.string().optional(),
    phone: z.string().optional(),
    email: z.string().email().optional(),
  }),
  owner: z.object({
    fullName: z.string().min(2),
    email: z.string().email(),
    password: z.string().min(8),
  }),
});

export const loginSchema = z.object({
  schoolSlug: z.string(),
  email: z.string().email(),
  password: z.string(),
});

@Injectable()
export class AuthService {
  constructor(
    private readonly dbs: DbService,
    private readonly jwt: JwtService,
  ) {}

  /** Creates a school, its default sections and its proprietor account. */
  async registerSchool(input: z.infer<typeof registerSchema>) {
    const passwordHash = await bcrypt.hash(input.owner.password, 10);
    try {
      return await this.dbs.db.transaction(async (tx) => {
        const [school] = await tx.insert(schools).values(input.school).returning();
        await scopeToSchool(tx, school.id);
        await tx.insert(sections).values(DEFAULT_SECTIONS.map((s) => ({ ...s, schoolId: school.id })));
        const [owner] = await tx
          .insert(staff)
          .values({
            schoolId: school.id,
            fullName: input.owner.fullName,
            email: input.owner.email.toLowerCase(),
            passwordHash,
            role: 'proprietor',
          })
          .returning();
        return { school, token: await this.sign(owner.id, school.id, owner.role) };
      });
    } catch (err) {
      rethrowUnique(err, 'That school address is already taken');
    }
  }

  /** Staff log in through their school's address (slug), so the same email can exist in two schools. */
  async login(input: z.infer<typeof loginSchema>) {
    const [school] = await this.dbs.db.select().from(schools).where(eq(schools.slug, input.schoolSlug));
    if (!school) throw new UnauthorizedException('Wrong school, email or password');
    const [member] = await this.dbs.withSchool(school.id, (tx) =>
      tx
        .select()
        .from(staff)
        .where(and(eq(staff.schoolId, school.id), eq(staff.email, input.email.toLowerCase()))),
    );
    if (!member || !(await bcrypt.compare(input.password, member.passwordHash))) {
      throw new UnauthorizedException('Wrong school, email or password');
    }
    return {
      token: await this.sign(member.id, school.id, member.role),
      staff: { id: member.id, fullName: member.fullName, role: member.role },
    };
  }

  sign(staffId: string, schoolId: string, role: Role): Promise<string> {
    return this.jwt.signAsync({ sub: staffId, school: schoolId, role });
  }
}
