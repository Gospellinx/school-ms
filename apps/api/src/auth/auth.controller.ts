import { BadRequestException, Body, Controller, Get, Patch, Post } from '@nestjs/common';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { parse } from '../common/validation';
import { DbService } from '../db/db.service';
import { schools, staff } from '../db/schema';
import { AuthService, loginSchema, registerSchema } from './auth.service';
import { Principal } from './auth.types';
import { CurrentUser, Public } from './decorators';

const profileSchema = z.object({ fullName: z.string().min(2).max(120) });
const passwordSchema = z.object({ currentPassword: z.string(), newPassword: z.string().min(8) });

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly dbs: DbService,
  ) {}

  @Public()
  @Post('register-school')
  register(@Body() body: unknown) {
    return this.auth.registerSchool(parse(registerSchema, body));
  }

  @Public()
  @Post('login')
  login(@Body() body: unknown) {
    return this.auth.login(parse(loginSchema, body));
  }

  @Get('me')
  async me(@CurrentUser() user: Principal) {
    const [school] = await this.dbs.db.select().from(schools).where(eq(schools.id, user.schoolId));
    const [me] = await this.dbs.withSchool(user.schoolId, (tx) =>
      tx
        .select({ id: staff.id, fullName: staff.fullName, email: staff.email, role: staff.role })
        .from(staff)
        .where(eq(staff.id, user.staffId)),
    );
    return { school, staff: me };
  }

  @Patch('me')
  async updateMe(@CurrentUser() user: Principal, @Body() body: unknown) {
    const input = parse(profileSchema, body);
    const [row] = await this.dbs.withSchool(user.schoolId, (tx) =>
      tx
        .update(staff)
        .set(input)
        .where(eq(staff.id, user.staffId))
        .returning({ id: staff.id, fullName: staff.fullName, email: staff.email, role: staff.role }),
    );
    return row;
  }

  @Post('password')
  async changePassword(@CurrentUser() user: Principal, @Body() body: unknown) {
    const input = parse(passwordSchema, body);
    await this.dbs.withSchool(user.schoolId, async (tx) => {
      const [me] = await tx.select().from(staff).where(eq(staff.id, user.staffId));
      if (!me || !(await bcrypt.compare(input.currentPassword, me.passwordHash))) {
        throw new BadRequestException('Your current password is wrong');
      }
      await tx.update(staff).set({ passwordHash: await bcrypt.hash(input.newPassword, 10) }).where(eq(staff.id, user.staffId));
    });
    return { changed: true };
  }
}
