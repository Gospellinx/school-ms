/**
 * Pure rules for the parent follow-up autopilot: fee reminder timing, instalment plans,
 * message templates and Nigerian clock helpers. No database or network access here.
 */

/** Where a step's message goes. `preferred` is the parent's chosen SMS or WhatsApp. */
export type FollowUpChannel = 'preferred' | 'sms' | 'whatsapp' | 'email';

export type SequenceTrigger = 'fee_overdue' | 'new_parent' | 'absent_streak';

export interface SequenceStep {
  /**
   * Days after the trigger date when this step goes out. For fees the trigger date is the
   * due date (or the next instalment's date), so -3 means three days before it falls due.
   */
  offsetDays: number;
  channels: FollowUpChannel[];
  /** Email subject line. SMS and WhatsApp ignore it. */
  subject: string;
  body: string;
}

export interface Instalment {
  /** YYYY-MM-DD */
  dueOn: string;
  amountKobo: number;
}

// ---------------------------------------------------------------- Clock

export interface LagosClock {
  /** YYYY-MM-DD in West Africa Time */
  date: string;
  hour: number;
  /** 0 = Sunday ... 6 = Saturday */
  weekday: number;
  /** ISO week, e.g. 2026-W45 */
  isoWeek: string;
}

/** Nigeria is on West Africa Time (UTC+1) all year, with no daylight saving. */
export function lagosClock(now: Date = new Date()): LagosClock {
  const local = new Date(now.getTime() + 60 * 60 * 1000);
  const date = local.toISOString().slice(0, 10);
  return { date, hour: local.getUTCHours(), weekday: local.getUTCDay(), isoWeek: isoWeek(date) };
}

export function isoWeek(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

export function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T12:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
}

/** Whole days from `from` to `to` (both YYYY-MM-DD). */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86400000);
}

/** Monday of the week that contains `date`. */
export function weekStart(date: string): string {
  const day = new Date(`${date}T12:00:00Z`).getUTCDay() || 7;
  return addDays(date, 1 - day);
}

/** True when parents may be messaged at this hour: from `start` up to, not including, `end`. */
export function inSendingWindow(hour: number, start: number, end: number): boolean {
  return start <= end ? hour >= start && hour < end : hour >= start || hour < end;
}

// ---------------------------------------------------------------- Templates

/** Fills {{name}} placeholders. Unknown names become empty, and blank runs of spaces are tidied. */
export function renderTemplate(template: string, vars: Record<string, string | number | null | undefined>): string {
  return template
    .replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (_, key: string) => {
      const v = vars[key.toLowerCase()];
      return v === null || v === undefined ? '' : String(v);
    })
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/ +([.,!?])/g, '$1')
    .trim();
}

/** The placeholders each trigger fills, shown to the school when editing a step. */
export const TEMPLATE_FIELDS: Record<SequenceTrigger, string[]> = {
  fee_overdue: ['parent_name', 'student_first_name', 'student_name', 'school_name', 'school_phone', 'term', 'balance', 'amount_due', 'due_date', 'pay_link', 'hold_note', 'plan_note'],
  new_parent: ['parent_name', 'children', 'student_first_name', 'school_name', 'school_phone', 'portal_link', 'parent_phone'],
  absent_streak: ['parent_name', 'student_first_name', 'student_name', 'school_name', 'school_phone', 'absent_days', 'portal_link'],
};

// ---------------------------------------------------------------- Fee reminders

/**
 * Which step is due now. Only the latest step whose time has come is returned, so a school
 * that switches the autopilot on mid-term sends one up-to-date message, not every missed one.
 */
export function dueStep(steps: SequenceStep[], anchor: string, today: string): number | null {
  const sinceAnchor = daysBetween(anchor, today);
  let pick: number | null = null;
  for (let i = 0; i < steps.length; i++) {
    if (steps[i].offsetDays > sinceAnchor) continue;
    if (pick === null || steps[i].offsetDays >= steps[pick].offsetDays) pick = i;
  }
  return pick;
}

export interface InstalmentProgress {
  /** Total of the instalments whose date has arrived. */
  dueSoFarKobo: number;
  /** How far payments are behind the schedule (0 when on track). */
  behindKobo: number;
  onTrack: boolean;
  /** The first instalment not yet covered by payments, if any. */
  next: (Instalment & { outstandingKobo: number }) | null;
}

/** Compares what has been paid with the plan. Payments fill instalments in date order. */
export function instalmentProgress(schedule: Instalment[], paidKobo: number, today: string): InstalmentProgress {
  const sorted = [...schedule].sort((a, b) => a.dueOn.localeCompare(b.dueOn));
  const dueSoFarKobo = sorted.filter((i) => i.dueOn <= today).reduce((s, i) => s + i.amountKobo, 0);
  const behindKobo = Math.max(0, dueSoFarKobo - paidKobo);
  let covered = paidKobo;
  let next: InstalmentProgress['next'] = null;
  for (const i of sorted) {
    if (covered >= i.amountKobo) {
      covered -= i.amountKobo;
      continue;
    }
    next = { ...i, outstandingKobo: i.amountKobo - covered };
    break;
  }
  return { dueSoFarKobo, behindKobo, onTrack: behindKobo === 0, next };
}

/**
 * Splits a balance into `count` instalments `everyDays` apart, starting on `firstDueOn`.
 * Amounts are whole naira; any remainder goes on the first instalment.
 */
export function splitInstalments(balanceKobo: number, count: number, firstDueOn: string, everyDays = 30): Instalment[] {
  if (count < 1) throw new Error('A plan needs at least one instalment');
  const base = Math.floor(balanceKobo / count / 100) * 100;
  const first = balanceKobo - base * (count - 1);
  return Array.from({ length: count }, (_, i) => ({ dueOn: addDays(firstDueOn, i * everyDays), amountKobo: i === 0 ? first : base }));
}

/** Checks a custom plan: sensible dates, positive amounts, and a total that matches the balance. */
export function validateInstalments(schedule: Instalment[], balanceKobo: number): string | null {
  if (schedule.length === 0) return 'Add at least one instalment';
  if (schedule.length > 12) return 'A plan can have at most 12 instalments';
  const dates = new Set<string>();
  for (const i of schedule) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(i.dueOn)) return `${i.dueOn} is not a date`;
    if (dates.has(i.dueOn)) return 'Two instalments fall on the same day';
    dates.add(i.dueOn);
    if (!Number.isInteger(i.amountKobo) || i.amountKobo <= 0) return 'Each instalment needs an amount';
  }
  const total = schedule.reduce((s, i) => s + i.amountKobo, 0);
  if (total !== balanceKobo) return `The instalments add up to ${total / 100} naira but the balance is ${balanceKobo / 100} naira`;
  return null;
}

// ---------------------------------------------------------------- Default sequences

/** Starting sequences every school gets. Schools can edit the wording, timing and channels. */
export const DEFAULT_SEQUENCES: Record<SequenceTrigger, { name: string; steps: SequenceStep[] }> = {
  fee_overdue: {
    name: 'Fee recovery',
    steps: [
      {
        offsetDays: -3,
        channels: ['preferred', 'email'],
        subject: '{{student_first_name}}’s {{term}} fees are due on {{due_date}}',
        body: 'Dear {{parent_name}}, a friendly reminder that {{student_first_name}}’s {{term}} fees of {{amount_due}} are due on {{due_date}}. Pay securely here: {{pay_link}} {{plan_note}}',
      },
      {
        offsetDays: 0,
        channels: ['preferred', 'email'],
        subject: '{{student_first_name}}’s fees are due today',
        body: 'Dear {{parent_name}}, {{student_first_name}}’s fees of {{amount_due}} are due today. Pay by card, transfer or USSD: {{pay_link}}',
      },
      {
        offsetDays: 7,
        channels: ['preferred', 'email'],
        subject: 'Fees overdue for {{student_first_name}}',
        body: 'Dear {{parent_name}}, {{student_first_name}}’s fees of {{amount_due}} are now a week overdue. Please pay here: {{pay_link}}. If you need to pay in parts, call the school on {{school_phone}}.',
      },
      {
        offsetDays: 14,
        channels: ['whatsapp', 'email'],
        subject: 'Second notice: {{student_first_name}}’s fees',
        body: 'Dear {{parent_name}}, this is a second notice that {{amount_due}} is still owed for {{student_first_name}} ({{term}}). Pay now: {{pay_link}}. The school can agree an instalment plan with you; call {{school_phone}}. {{hold_note}}',
      },
      {
        offsetDays: 28,
        channels: ['preferred', 'email'],
        subject: 'Final notice: {{student_first_name}}’s fees',
        body: 'Dear {{parent_name}}, final notice: {{amount_due}} is owed for {{student_first_name}}. {{hold_note}} Pay here: {{pay_link}} or call the bursar on {{school_phone}}.',
      },
    ],
  },
  new_parent: {
    name: 'Welcome new parents',
    steps: [
      {
        offsetDays: 0,
        channels: ['preferred', 'email'],
        subject: 'Welcome to {{school_name}} on Linx School',
        body: 'Welcome to {{school_name}}, {{parent_name}}! You can now see {{children}}’s results, fees and attendance at {{portal_link}}. Sign in with your phone number {{parent_phone}}.',
      },
      {
        offsetDays: 3,
        channels: ['email'],
        subject: 'Paying fees and tracking {{student_first_name}}’s progress',
        body: 'Dear {{parent_name}}, on the parent portal ({{portal_link}}) you can pay fees online by card, transfer or USSD, check attendance every day, and open report cards as soon as {{school_name}} releases them.',
      },
      {
        offsetDays: 7,
        channels: ['email'],
        subject: 'Your weekly update from {{school_name}}',
        body: 'Dear {{parent_name}}, from this week you will get a short update every Friday with {{student_first_name}}’s attendance, new scores and practice tests. Questions? Call {{school_phone}}.',
      },
    ],
  },
  absent_streak: {
    name: 'Missed school days',
    steps: [
      {
        offsetDays: 0,
        channels: ['preferred', 'email'],
        subject: '{{student_first_name}} has missed {{absent_days}} school days',
        body: 'Dear {{parent_name}}, {{student_first_name}} has been absent for {{absent_days}} school days in a row. Is everything okay? Please call {{school_name}} on {{school_phone}}.',
      },
    ],
  },
};

/** Consecutive absences, counted back from the latest register entry. Dates must be sorted newest first. */
export function absentStreak(register: { date: string; status: string }[]): { days: number; since: string | null } {
  let days = 0;
  let since: string | null = null;
  for (const r of register) {
    if (r.status !== 'absent') break;
    days++;
    since = r.date;
  }
  return { days, since };
}
