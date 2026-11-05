import { Body, Controller, Get, Param, Put, Query } from '@nestjs/common';
import { z } from 'zod';
import { Principal } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators';
import { todayInLagos } from '../common/access';
import { parse, uuidParam } from '../common/validation';
import { AttendanceService } from './attendance.service';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');

const registerSchema = z.object({
  entries: z
    .array(
      z.object({
        studentId: z.string().uuid(),
        status: z.enum(['present', 'absent', 'late', 'excused']),
        note: z.string().max(200).optional(),
      }),
    )
    .max(500),
  /** Text parents of students newly marked absent today. On by default. */
  notifyGuardians: z.boolean().default(true),
});

const rangeSchema = z.object({ from: isoDate, to: isoDate });

@Controller()
export class AttendanceController {
  constructor(private readonly attendance: AttendanceService) {}

  @Get('classes/:classId/attendance/:date')
  register(@CurrentUser() u: Principal, @Param('classId') c: string, @Param('date') d: string) {
    return this.attendance.register(u, parse(uuidParam, c), parse(isoDate, d));
  }

  @Put('classes/:classId/attendance/:date')
  save(@CurrentUser() u: Principal, @Param('classId') c: string, @Param('date') d: string, @Body() body: unknown) {
    const input = parse(registerSchema, body);
    return this.attendance.saveRegister(u, parse(uuidParam, c), parse(isoDate, d), input.entries, input.notifyGuardians);
  }

  @Get('terms/:termId/classes/:classId/attendance')
  termSummary(@CurrentUser() u: Principal, @Param('termId') t: string, @Param('classId') c: string) {
    return this.attendance.classTermSummary(u, parse(uuidParam, t), parse(uuidParam, c));
  }

  @Get('students/:studentId/attendance')
  history(@CurrentUser() u: Principal, @Param('studentId') s: string, @Query() q: unknown) {
    const today = todayInLagos();
    const range = parse(rangeSchema, { from: `${today.slice(0, 4)}-01-01`, to: today, ...(q as object) });
    return this.attendance.studentHistory(u.schoolId, parse(uuidParam, s), range.from, range.to);
  }
}
