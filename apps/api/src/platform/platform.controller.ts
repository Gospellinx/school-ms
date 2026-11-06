import { Body, Controller, Get, NotFoundException, Param, Patch, Post, UnauthorizedException } from '@nestjs/common';
import bcrypt from 'bcryptjs';
import { asc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { AuthService } from '../auth/auth.service';
import { PlatformPrincipal } from '../auth/auth.types';
import { CurrentUser, ForAudience, Public } from '../auth/decorators';
import { parse, uuidParam } from '../common/validation';
import { DbService } from '../db/db.service';
import { platformAdmins, schools } from '../db/schema';

const loginSchema = z.object({ email: z.string().email(), password: z.string() });
const aiLimitsSchema = z.object({
  monthlyBudgetCents: z.number().int().min(0).max(10_000_000).optional(),
  studentDailyLimit: z.number().int().min(0).max(500).nullable().optional(),
});

/** One row per school for the super admin. Counts only: no student names, scores or contact details. */
export interface SchoolSummary {
  id: string;
  name: string;
  slug: string;
  address: string | null;
  createdAt: Date;
  paystackConnected: boolean;
  students: number;
  staff: number;
  classes: number;
  parents: number;
  questions: number;
  questionsByExam: Record<string, number>;
  currentTerm: string | null;
  feesCollectedKobo: number;
  publishedResults: number;
}

/** The Linx School platform (super admin) view across all schools. */
@ForAudience('platform')
@Controller('platform')
export class PlatformController {
  constructor(
    private readonly dbs: DbService,
    private readonly auth: AuthService,
  ) {}

  @Public()
  @Post('auth/login')
  async login(@Body() body: unknown) {
    const input = parse(loginSchema, body);
    const [admin] = await this.dbs.db.select().from(platformAdmins).where(eq(platformAdmins.email, input.email.toLowerCase()));
    if (!admin || !(await bcrypt.compare(input.password, admin.passwordHash))) {
      throw new UnauthorizedException('Wrong email or password');
    }
    return { token: await this.auth.sign(admin.id, null, 'platform'), admin: { id: admin.id, fullName: admin.fullName } };
  }

  @Get('me')
  async me(@CurrentUser() u: PlatformPrincipal) {
    const [admin] = await this.dbs.db
      .select({ id: platformAdmins.id, fullName: platformAdmins.fullName, email: platformAdmins.email })
      .from(platformAdmins)
      .where(eq(platformAdmins.id, u.adminId));
    if (!admin) throw new UnauthorizedException();
    return { admin };
  }

  @Get('admins')
  admins() {
    return this.dbs.db
      .select({ id: platformAdmins.id, fullName: platformAdmins.fullName, email: platformAdmins.email, createdAt: platformAdmins.createdAt })
      .from(platformAdmins)
      .orderBy(asc(platformAdmins.fullName));
  }

  /** Every school with headline counts. Each school is read inside its own row-level-security scope. */
  @Get('schools')
  async schools(): Promise<SchoolSummary[]> {
    const all = await this.dbs.db.select().from(schools).orderBy(asc(schools.name));
    const out: SchoolSummary[] = [];
    for (const s of all) {
      const counts = await this.dbs.withSchool(s.id, async (tx) => {
        const one = async (q: ReturnType<typeof sql>) => Number((await tx.execute(q)).rows[0]?.n ?? 0);
        const byExam = await tx.execute(sql`select exam::text as exam, count(*)::int as n from questions group by exam`);
        const term = await tx.execute(
          sql`select t.name || ', ' || s.name as label from terms t join academic_sessions s on s.id = t.session_id where t.is_current limit 1`,
        );
        return {
          students: await one(sql`select count(*)::int as n from students where class_id is not null`),
          staff: await one(sql`select count(*)::int as n from staff`),
          classes: await one(sql`select count(*)::int as n from classes`),
          parents: await one(sql`select count(*)::int as n from guardians`),
          questions: await one(sql`select count(*)::int as n from questions`),
          questionsByExam: Object.fromEntries(byExam.rows.map((r) => [String(r.exam), Number(r.n)])),
          currentTerm: (term.rows[0]?.label as string | undefined) ?? null,
          feesCollectedKobo: await one(sql`select coalesce(sum(amount_kobo), 0)::bigint as n from payments where status = 'success'`),
          publishedResults: await one(sql`select count(*)::int as n from result_publications`),
        };
      });
      out.push({
        id: s.id,
        name: s.name,
        slug: s.slug,
        address: s.address,
        createdAt: s.createdAt,
        paystackConnected: Boolean(s.paystackSubaccountCode),
        ...counts,
      });
    }
    return out;
  }

  /** Sets a school's AI limits: the monthly spending cap (US cents) and messages per student per day. */
  @Patch('schools/:id/ai')
  async setAiLimits(@Param('id') id: string, @Body() body: unknown) {
    const input = parse(aiLimitsSchema, body);
    const [school] = await this.dbs.db
      .update(schools)
      .set({ aiMonthlyBudgetCents: input.monthlyBudgetCents, aiStudentDailyLimit: input.studentDailyLimit })
      .where(eq(schools.id, parse(uuidParam, id)))
      .returning({ id: schools.id, aiMonthlyBudgetCents: schools.aiMonthlyBudgetCents, aiStudentDailyLimit: schools.aiStudentDailyLimit });
    if (!school) throw new NotFoundException('School not found');
    return school;
  }
}
