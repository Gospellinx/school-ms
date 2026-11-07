import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common';
import { normalizeNigerianPhone } from '@school-ms/core';
import { z } from 'zod';
import { Principal } from '../auth/auth.types';
import { CurrentUser, LEADERSHIP, Public, Roles } from '../auth/decorators';
import { parse, uuidParam } from '../common/validation';
import { AdmissionsService } from './admissions.service';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');
const httpsUrl = z.string().url().max(500).refine((u) => u.startsWith('https://') || u.startsWith('http://localhost'), 'Use an https:// link');
const nullableText = (max: number) => z.string().trim().max(max).nullable().optional().transform((v) => (v === '' ? null : v));
const phone = z.string().transform((v, ctx) => {
  const n = normalizeNigerianPhone(v);
  if (!n) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Enter a Nigerian mobile number, e.g. 0803 123 4567' });
  return n ?? '';
});

const siteSchema = z.object({
  published: z.boolean().optional(),
  tagline: nullableText(160),
  about: nullableText(4000),
  heroImageUrl: httpsUrl.nullable().optional(),
  logoUrl: httpsUrl.nullable().optional(),
  accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Use a colour like #1d4ed8').nullable().optional(),
  highlights: z.array(z.object({ title: z.string().trim().min(1).max(60), text: z.string().trim().max(300) })).max(8).optional(),
  gallery: z.array(httpsUrl).max(12).optional(),
  whatsapp: phone.nullable().optional(),
  mapUrl: httpsUrl.nullable().optional(),
  admissionsOpen: z.boolean().optional(),
  admissionSession: nullableText(20),
  /** Kobo. */
  applicationFeeKobo: z.number().int().min(0).max(100_000_000).optional(),
  admissionInstructions: nullableText(2000),
  admissionsEmail: z.string().email().nullable().optional(),
});

const admissionClassSchema = z.object({
  classId: z.string().uuid(),
  entranceTestId: z.string().uuid().nullable().optional(),
  passMark: z.number().int().min(0).max(100).nullable().optional(),
  seats: z.number().int().min(1).max(5000).nullable().optional(),
  open: z.boolean().optional(),
});

const entranceExamSchema = z.object({
  title: z.string().trim().min(2).max(120),
  durationMinutes: z.number().int().min(5).max(180),
  parts: z.array(z.object({ subjectId: z.string().uuid(), count: z.number().int().min(1).max(100) })).min(1).max(6),
});

const applySchema = z.object({
  admissionClassId: z.string().uuid(),
  firstName: z.string().trim().min(1).max(60),
  lastName: z.string().trim().min(1).max(60),
  otherNames: z.string().trim().max(80).optional(),
  gender: z.enum(['male', 'female']).optional(),
  dateOfBirth: isoDate.optional(),
  previousSchool: z.string().trim().max(120).optional(),
  parentName: z.string().trim().min(2).max(120),
  parentEmail: z.string().trim().email(),
  parentPhone: phone,
  relationship: z.string().trim().max(40).optional(),
  address: z.string().trim().max(300).optional(),
  notes: z.string().trim().max(1000).optional(),
  /** Honeypot: hidden on the form, so only bots fill it in. */
  website: z.string().max(0, 'Leave this empty').optional(),
});

const listSchema = z.object({
  status: z.enum(['pending_payment', 'applied', 'exam', 'offered', 'accepted', 'enrolled', 'rejected', 'withdrawn']).optional(),
  admissionClassId: z.string().uuid().optional(),
  q: z.string().max(80).optional(),
});

const scheduleSchema = z.object({
  applicationIds: z.array(z.string().uuid()).min(1).max(500),
  opensAt: z.string().datetime({ offset: true }),
  closesAt: z.string().datetime({ offset: true }),
});

const decisionSchema = z.object({ note: z.string().trim().max(1000).optional() });
const enrolSchema = z.object({ admissionNumber: z.string().trim().min(1).max(40).optional() });
const paidSchema = z.object({ method: z.enum(['cash', 'bank_transfer', 'pos']) });
const messageSchema = z.object({ subject: z.string().trim().min(2).max(150), message: z.string().trim().min(2).max(4000) });
const noteSchema = z.object({ text: z.string().trim().min(1).max(1000) });
const answersSchema = z.object({ answers: z.record(z.string().uuid(), z.string().max(2).nullable()) });
const slugParam = z.string().regex(/^[a-z0-9-]{2,40}$/);
const refParam = z.string().regex(/^ADM-\d{4}-\d{4,}$/);

/** School leadership: website content, admission classes, entrance exams and the applications pipeline. */
@Roles(...LEADERSHIP)
@Controller('admissions')
export class AdmissionsController {
  constructor(private readonly admissions: AdmissionsService) {}

  @Get('site')
  site(@CurrentUser() u: Principal) {
    return this.admissions.getSite(u);
  }

  @Put('site')
  saveSite(@CurrentUser() u: Principal, @Body() body: unknown) {
    return this.admissions.saveSite(u, parse(siteSchema, body));
  }

  @Get('classes')
  classes(@CurrentUser() u: Principal) {
    return this.admissions.listAdmissionClasses(u);
  }

  @Post('classes')
  saveClass(@CurrentUser() u: Principal, @Body() body: unknown) {
    return this.admissions.saveAdmissionClass(u, parse(admissionClassSchema, body));
  }

  @Delete('classes/:id')
  removeClass(@CurrentUser() u: Principal, @Param('id') id: string) {
    return this.admissions.removeAdmissionClass(u, parse(uuidParam, id));
  }

  @Get('entrance-exams')
  exams(@CurrentUser() u: Principal) {
    return this.admissions.listEntranceExams(u);
  }

  @Post('entrance-exams')
  createExam(@CurrentUser() u: Principal, @Body() body: unknown) {
    return this.admissions.createEntranceExam(u, parse(entranceExamSchema, body));
  }

  @Get('overview')
  overview(@CurrentUser() u: Principal) {
    return this.admissions.overview(u);
  }

  @Get('applications')
  list(@CurrentUser() u: Principal, @Query() q: unknown) {
    return this.admissions.list(u, parse(listSchema, q));
  }

  @Get('applications/:id')
  detail(@CurrentUser() u: Principal, @Param('id') id: string) {
    return this.admissions.detail(u, parse(uuidParam, id));
  }

  @Post('schedule-exam')
  schedule(@CurrentUser() u: Principal, @Body() body: unknown) {
    return this.admissions.scheduleExam(u, parse(scheduleSchema, body));
  }

  @Post('applications/:id/mark-paid')
  markPaid(@CurrentUser() u: Principal, @Param('id') id: string, @Body() body: unknown) {
    return this.admissions.markPaid(u, parse(uuidParam, id), parse(paidSchema, body).method);
  }

  @Post('applications/:id/offer')
  offer(@CurrentUser() u: Principal, @Param('id') id: string, @Body() body: unknown) {
    return this.admissions.offer(u, parse(uuidParam, id), parse(decisionSchema, body ?? {}).note);
  }

  @Post('applications/:id/reject')
  reject(@CurrentUser() u: Principal, @Param('id') id: string, @Body() body: unknown) {
    return this.admissions.reject(u, parse(uuidParam, id), parse(decisionSchema, body ?? {}).note);
  }

  @Post('applications/:id/enrol')
  enrol(@CurrentUser() u: Principal, @Param('id') id: string, @Body() body: unknown) {
    return this.admissions.enrol(u, parse(uuidParam, id), parse(enrolSchema, body ?? {}));
  }

  @Post('applications/:id/message')
  message(@CurrentUser() u: Principal, @Param('id') id: string, @Body() body: unknown) {
    return this.admissions.message(u, parse(uuidParam, id), parse(messageSchema, body));
  }

  @Post('applications/:id/notes')
  note(@CurrentUser() u: Principal, @Param('id') id: string, @Body() body: unknown) {
    return this.admissions.note(u, parse(uuidParam, id), parse(noteSchema, body).text);
  }

  /** Sends due admissions emails now instead of waiting for the background worker. */
  @Post('emails/dispatch')
  dispatch(@CurrentUser() u: Principal) {
    return this.admissions.dispatchEmails(u);
  }
}

/**
 * Public pages: the school website, the admission form and the family's status page.
 * No login: families prove who they are with the private key in their status link.
 */
@Public()
@Controller('public/schools/:slug')
export class PublicSchoolController {
  constructor(private readonly admissions: AdmissionsService) {}

  @Get()
  site(@Param('slug') slug: string) {
    return this.admissions.publicSite(parse(slugParam, slug));
  }

  @Post('applications')
  apply(@Param('slug') slug: string, @Body() body: unknown) {
    const { website: _honeypot, ...input } = parse(applySchema, body);
    return this.admissions.apply(parse(slugParam, slug), input);
  }

  @Get('applications/:ref')
  status(@Param('slug') slug: string, @Param('ref') ref: string, @Query('key') key?: string) {
    return this.admissions.publicStatus(parse(slugParam, slug), parse(refParam, ref), key);
  }

  @Post('applications/:ref/pay')
  pay(@Param('slug') slug: string, @Param('ref') ref: string, @Query('key') key?: string) {
    return this.admissions.startPayment(parse(slugParam, slug), parse(refParam, ref), key);
  }

  @Get('payments/:reference/verify')
  verify(@Param('slug') slug: string, @Param('reference') reference: string) {
    return this.admissions.confirmPaymentBySlug(parse(slugParam, slug), parse(z.string().regex(/^ADM-[A-Z0-9-]+$/), reference));
  }

  @Post('applications/:ref/exam/start')
  startExam(@Param('slug') slug: string, @Param('ref') ref: string, @Query('key') key?: string) {
    return this.admissions.startExam(parse(slugParam, slug), parse(refParam, ref), key);
  }

  @Get('applications/:ref/exam')
  exam(@Param('slug') slug: string, @Param('ref') ref: string, @Query('key') key?: string) {
    return this.admissions.getExam(parse(slugParam, slug), parse(refParam, ref), key);
  }

  @Put('applications/:ref/exam/answers')
  answers(@Param('slug') slug: string, @Param('ref') ref: string, @Query('key') key: string | undefined, @Body() body: unknown) {
    return this.admissions.saveExamAnswers(parse(slugParam, slug), parse(refParam, ref), key, parse(answersSchema, body).answers);
  }

  @Post('applications/:ref/exam/submit')
  submit(@Param('slug') slug: string, @Param('ref') ref: string, @Query('key') key?: string) {
    return this.admissions.submitExam(parse(slugParam, slug), parse(refParam, ref), key);
  }

  @Post('applications/:ref/accept')
  accept(@Param('slug') slug: string, @Param('ref') ref: string, @Query('key') key?: string) {
    return this.admissions.acceptOffer(parse(slugParam, slug), parse(refParam, ref), key);
  }
}
