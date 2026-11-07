/** Formatting for Nigerian schools: naira from kobo, dates in West Africa Time. */

export function naira(kobo: number, opts: { compact?: boolean } = {}) {
  const n = kobo / 100;
  if (opts.compact) {
    if (Math.abs(n) >= 1_000_000) return `₦${(n / 1_000_000).toFixed(n >= 10_000_000 ? 1 : 2).replace(/\.0+$/, '')}m`;
    if (Math.abs(n) >= 1_000) return `₦${Math.round(n / 1_000)}k`;
  }
  return '₦' + n.toLocaleString('en-NG', { maximumFractionDigits: 2 });
}

/** Postgres timestamps can come back as "2026-11-06 08:18:21+00"; make them parseable everywhere. */
function toDate(v: string | Date): Date {
  if (v instanceof Date) return v;
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return new Date(`${v}T12:00:00Z`);
  return new Date(v.replace(' ', 'T').replace(/([+-]\d\d)$/, '$1:00'));
}

export function shortDate(v: string | Date | null | undefined) {
  if (!v) return '';
  return toDate(v).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Africa/Lagos' });
}

export function longDate(v: string | Date | null | undefined) {
  if (!v) return '';
  return toDate(v).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Africa/Lagos' });
}

export function dateTime(v: string | Date | null | undefined) {
  if (!v) return '';
  return toDate(v).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Africa/Lagos' });
}

/** "Mon 26": short enough for chart labels and unique within a few weeks. */
export function dayLabel(v: string) {
  const d = toDate(v);
  return `${d.toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'Africa/Lagos' })} ${d.toLocaleDateString('en-GB', { day: 'numeric', timeZone: 'Africa/Lagos' })}`;
}

export function weekday(v: string) {
  return toDate(v).toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'Africa/Lagos' });
}

/** Today in Nigeria as YYYY-MM-DD. */
export function todayLagos() {
  return new Date(Date.now() + 60 * 60 * 1000).toISOString().slice(0, 10);
}

export function pct(part: number, whole: number) {
  return whole > 0 ? Math.round((part / whole) * 100) : 0;
}

export function plural(n: number, one: string, many = `${one}s`) {
  return `${n.toLocaleString('en-NG')} ${n === 1 ? one : many}`;
}

/** Nigerian numbers are stored as 2348031234567; show them as 0803 123 4567. */
export function phone(p: string) {
  const local = p.startsWith('234') ? `0${p.slice(3)}` : p;
  return local.replace(/^(\d{4})(\d{3})(\d{4})$/, '$1 $2 $3');
}

export const MESSAGE_KINDS: Record<string, string> = {
  attendance_absent: 'Absence alert',
  results_published: 'Results released',
  payment_received: 'Payment receipt',
  fee_reminder: 'Fee reminder',
  broadcast: 'School notice',
  login_code: 'Login code',
  payment_plan: 'Payment plan',
  weekly_report: 'Weekly report',
  daily_summary: 'Daily summary',
  follow_up: 'Follow-up',
};

export const INVOICE_STATUS: Record<string, string> = { paid: 'Paid', part_paid: 'Part paid', unpaid: 'Owing' };
