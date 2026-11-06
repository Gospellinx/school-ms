import { describe, expect, it } from 'vitest';
import {
  absentStreak,
  DEFAULT_SEQUENCES,
  dueStep,
  inSendingWindow,
  instalmentProgress,
  isoWeek,
  lagosClock,
  renderTemplate,
  splitInstalments,
  validateInstalments,
  weekStart,
} from './autopilot';

describe('autopilot rules', () => {
  it('reads the clock in Lagos time', () => {
    const c = lagosClock(new Date('2026-11-06T23:30:00Z'));
    expect(c).toMatchObject({ date: '2026-11-07', hour: 0, weekday: 6 });
    expect(isoWeek('2026-11-06')).toBe('2026-W45');
    expect(isoWeek('2027-01-01')).toBe('2026-W53');
    expect(weekStart('2026-11-06')).toBe('2026-11-02');
  });

  it('respects quiet hours, including windows that cross midnight', () => {
    expect(inSendingWindow(7, 7, 20)).toBe(true);
    expect(inSendingWindow(20, 7, 20)).toBe(false);
    expect(inSendingWindow(23, 22, 6)).toBe(true);
    expect(inSendingWindow(12, 22, 6)).toBe(false);
  });

  it('fills templates and tidies blanks', () => {
    expect(renderTemplate('Dear {{parent_name}}, pay {{ amount_due }} now. {{hold_note}}', { parent_name: 'Mrs Okafor', amount_due: '₦5,000', hold_note: '' })).toBe(
      'Dear Mrs Okafor, pay ₦5,000 now.',
    );
  });

  it('picks only the latest fee step that is due', () => {
    const steps = DEFAULT_SEQUENCES.fee_overdue.steps;
    expect(dueStep(steps, '2026-11-10', '2026-11-06')).toBe(null);
    expect(dueStep(steps, '2026-11-10', '2026-11-07')).toBe(0);
    expect(dueStep(steps, '2026-11-10', '2026-11-10')).toBe(1);
    expect(dueStep(steps, '2026-11-10', '2026-11-30')).toBe(3);
    expect(dueStep(steps, '2026-11-10', '2027-03-01')).toBe(4);
  });

  it('splits a balance into instalments and tracks progress', () => {
    const plan = splitInstalments(100_000_00 + 50, 3, '2026-11-01', 30);
    expect(plan.map((p) => p.amountKobo)).toEqual([33_334_50, 33_333_00, 33_333_00]);
    expect(plan.map((p) => p.dueOn)).toEqual(['2026-11-01', '2026-12-01', '2026-12-31']);
    expect(validateInstalments(plan, 100_000_50)).toBeNull();
    expect(validateInstalments(plan, 90_000_00)).toMatch(/add up/);

    const onTime = instalmentProgress(plan, 33_334_50, '2026-11-20');
    expect(onTime).toMatchObject({ onTrack: true, behindKobo: 0, next: { dueOn: '2026-12-01', outstandingKobo: 33_333_00 } });
    const late = instalmentProgress(plan, 10_000_00, '2026-12-02');
    expect(late.onTrack).toBe(false);
    expect(late.behindKobo).toBe(66_667_50 - 10_000_00);
    expect(late.next).toMatchObject({ dueOn: '2026-11-01', outstandingKobo: 23_334_50 });
  });

  it('counts consecutive absences from the latest register', () => {
    expect(absentStreak([{ date: '2026-11-06', status: 'absent' }, { date: '2026-11-05', status: 'absent' }, { date: '2026-11-04', status: 'present' }])).toEqual({
      days: 2,
      since: '2026-11-05',
    });
    expect(absentStreak([{ date: '2026-11-06', status: 'present' }])).toEqual({ days: 0, since: null });
  });
});
