import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { normalizeNigerianPhone } from '@school-ms/core';
import { z } from 'zod';
import { Principal } from '../auth/auth.types';
import { CurrentUser, LEADERSHIP, Roles } from '../auth/decorators';
import { parse, uuidParam } from '../common/validation';
import { AutomationsService } from './automations.service';

const hour = z.number().int().min(0).max(23);
const channel = z.enum(['preferred', 'sms', 'whatsapp', 'email']);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-12-01');

const recipientSchema = z
  .object({
    name: z.string().min(1).max(80),
    phone: z.string().nullable().optional(),
    email: z.string().email().nullable().optional(),
    channel: z.enum(['sms', 'whatsapp', 'email']),
  })
  .transform((r, ctx) => {
    if (r.channel === 'email' && !r.email) ctx.addIssue({ code: 'custom', message: `${r.name} needs an email address` });
    let phone = r.phone ?? null;
    if (phone) {
      phone = normalizeNigerianPhone(phone);
      if (!phone) ctx.addIssue({ code: 'custom', message: `${r.name}'s phone is not a valid Nigerian mobile number` });
    }
    if (r.channel !== 'email' && !phone) ctx.addIssue({ code: 'custom', message: `${r.name} needs a phone number for ${r.channel}` });
    return { ...r, phone };
  });

const settingsSchema = z
  .object({
    feeDueDays: z.number().int().min(0).max(120),
    holdAllowsPlans: z.boolean(),
    weeklyReport: z.boolean(),
    weeklyDay: z.number().int().min(0).max(6),
    weeklyHour: hour,
    weeklyChannels: z.array(channel).min(1),
    dailySummary: z.boolean(),
    dailyHour: hour,
    digestRecipients: z.array(recipientSchema).max(10),
    sendFrom: hour,
    sendUntil: hour,
  })
  .partial();

const stepSchema = z.object({
  offsetDays: z.number().int().min(-60).max(180),
  channels: z.array(channel).min(1),
  subject: z.string().min(1).max(160),
  body: z.string().min(5).max(1200),
});

const sequenceSchema = z.object({
  enabled: z.boolean().optional(),
  name: z.string().min(1).max(80).optional(),
  steps: z.array(stepSchema).min(1).max(10).optional(),
  threshold: z.number().int().min(1).max(20).optional(),
});

const triggerParam = z.enum(['fee_overdue', 'new_parent', 'absent_streak']);

const planSchema = z
  .object({
    count: z.number().int().min(1).max(12).optional(),
    firstDueOn: isoDate.optional(),
    everyDays: z.number().int().min(7).max(120).optional(),
    schedule: z.array(z.object({ dueOn: isoDate, amountKobo: z.number().int().positive() })).optional(),
    note: z.string().max(300).optional(),
  })
  .refine((p) => p.schedule || p.count, 'Give a number of instalments or a schedule');

/**
 * The autopilot: fee recovery, instalment plans, the weekly parent report, the proprietor's
 * daily summary and follow-up sequences, plus the live activity feed.
 */
@Roles(...LEADERSHIP)
@Controller()
export class AutopilotController {
  constructor(private readonly autopilot: AutomationsService) {}

  @Get('automations')
  overview(@CurrentUser() u: Principal) {
    return this.autopilot.overview(u.schoolId);
  }

  @Patch('automations/settings')
  settings(@CurrentUser() u: Principal, @Body() body: unknown) {
    return this.autopilot.updateSettings(u.schoolId, parse(settingsSchema, body));
  }

  @Patch('automations/sequences/:trigger')
  sequence(@CurrentUser() u: Principal, @Param('trigger') t: string, @Body() body: unknown) {
    return this.autopilot.updateSequence(u.schoolId, parse(triggerParam, t), parse(sequenceSchema, body));
  }

  @Post('automations/sequences/:trigger/reset')
  reset(@CurrentUser() u: Principal, @Param('trigger') t: string) {
    return this.autopilot.resetSequence(u.schoolId, parse(triggerParam, t));
  }

  @Get('automations/activity')
  activity(@CurrentUser() u: Principal) {
    return this.autopilot.activity(u.schoolId);
  }

  @Post('automations/run')
  run(@CurrentUser() u: Principal) {
    return this.autopilot.runNow(u.schoolId);
  }

  @Get('automations/fee-recovery')
  feeRecovery(@CurrentUser() u: Principal) {
    return this.autopilot.feeRecovery(u.schoolId);
  }

  @Get('automations/weekly-report/preview')
  weekly(@CurrentUser() u: Principal, @Query('guardianId') g?: string) {
    return this.autopilot.weeklyPreview(u.schoolId, g ? parse(uuidParam, g) : undefined);
  }

  @Get('automations/daily-summary/preview')
  daily(@CurrentUser() u: Principal) {
    return this.autopilot.dailyPreview(u.schoolId);
  }

  @Post('automations/daily-summary/send')
  sendDaily(@CurrentUser() u: Principal) {
    return this.autopilot.sendDailyNow(u.schoolId);
  }

  @Get('fees/plans')
  plans(@CurrentUser() u: Principal) {
    return this.autopilot.listPlans(u.schoolId);
  }

  @Put('invoices/:id/plan')
  setPlan(@CurrentUser() u: Principal, @Param('id') id: string, @Body() body: unknown) {
    return this.autopilot.setPlan(u, parse(uuidParam, id), parse(planSchema, body));
  }

  @Delete('invoices/:id/plan')
  cancelPlan(@CurrentUser() u: Principal, @Param('id') id: string) {
    return this.autopilot.cancelPlan(u.schoolId, parse(uuidParam, id));
  }

  @Post('invoices/:id/pay-link')
  payLink(@CurrentUser() u: Principal, @Param('id') id: string) {
    return this.autopilot.invoicePayLink(u.schoolId, parse(uuidParam, id));
  }
}
