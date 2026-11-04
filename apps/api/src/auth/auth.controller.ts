import { Body, Controller, Get, Post } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { parse } from '../common/validation';
import { DbService } from '../db/db.service';
import { schools, staff } from '../db/schema';
import { AuthService, loginSchema, registerSchema } from './auth.service';
import { Principal } from './auth.types';
import { CurrentUser, Public } from './decorators';

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
}
