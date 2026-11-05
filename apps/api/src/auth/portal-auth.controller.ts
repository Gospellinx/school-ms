import { Body, Controller, Post } from '@nestjs/common';
import { z } from 'zod';
import { parse } from '../common/validation';
import { Public } from './decorators';
import { PortalAuthService } from './portal-auth.service';

const requestCodeSchema = z.object({ schoolSlug: z.string(), phone: z.string() });
const verifySchema = z.object({ schoolSlug: z.string(), phone: z.string(), code: z.string().regex(/^\s*\d{6}\s*$/) });
const studentLoginSchema = z.object({ schoolSlug: z.string(), admissionNumber: z.string().min(1), pin: z.string().min(4) });

@Public()
@Controller()
export class PortalAuthController {
  constructor(private readonly portal: PortalAuthService) {}

  /** Step 1 of parent login: text a code to the phone number the school has on file. */
  @Post('parent/auth/request-code')
  requestCode(@Body() body: unknown) {
    const input = parse(requestCodeSchema, body);
    return this.portal.requestParentCode(input.schoolSlug, input.phone);
  }

  /** Step 2 of parent login: exchange the code for a token. */
  @Post('parent/auth/verify')
  verify(@Body() body: unknown) {
    const input = parse(verifySchema, body);
    return this.portal.verifyParentCode(input.schoolSlug, input.phone, input.code);
  }

  @Post('student/auth/login')
  studentLogin(@Body() body: unknown) {
    const input = parse(studentLoginSchema, body);
    return this.portal.studentLogin(input.schoolSlug, input.admissionNumber, input.pin);
  }
}
