import type { OutlineEntry } from './knowledge';
import { nameTokens } from './snap';

/**
 * The lesson notes book an inspector asks to see: one row per week of the scheme of work,
 * showing whether a lesson note and a lesson plan are ready, and whether they were vetted.
 */

export interface LessonBookEntry {
  id: string;
  kind: 'lesson_note' | 'lesson_plan';
  title: string;
  week: number | null;
  vetted: boolean;
}

export interface CoverageRow {
  week: number;
  topic: string;
  noteId: string | null;
  planId: string | null;
  vetted: boolean;
}

export interface Coverage {
  rows: CoverageRow[];
  /** Notes and plans that fit no week of the scheme. */
  extra: string[];
  /** Weeks so far (up to `currentWeek`) with no lesson note. */
  missingWeeks: number[];
  /** Share of weeks so far with a lesson note, 0 to 100. */
  percent: number;
}

/** True when most words of the topic appear in the title, e.g. "Lesson note: Ohm's law" for "Ohm's Law". */
export function titleMatchesTopic(title: string, topic: string): boolean {
  const want = nameTokens(topic).filter((t) => t.length > 2);
  if (!want.length) return false;
  const have = new Set(nameTokens(title));
  const hits = want.filter((t) => have.has(t)).length;
  return hits / want.length >= 0.6;
}

/**
 * Lines up saved notes and plans with the scheme of work. A note with a week goes to that week;
 * one without goes to the first week whose topic its title matches.
 */
export function lessonCoverage(outline: OutlineEntry[], entries: LessonBookEntry[], currentWeek?: number | null): Coverage {
  const weeks = [...new Map(outline.map((o) => [o.week, o])).values()].sort((a, b) => a.week - b.week);
  const rows: CoverageRow[] = weeks.map((o) => ({ week: o.week, topic: o.topic, noteId: null, planId: null, vetted: false }));
  const byWeek = new Map(rows.map((r) => [r.week, r]));
  const extra: string[] = [];
  const slot = (e: LessonBookEntry) => (e.kind === 'lesson_note' ? 'noteId' : 'planId');

  const place = (row: CoverageRow | undefined, e: LessonBookEntry) => {
    if (!row || row[slot(e)]) return false;
    row[slot(e)] = e.id;
    if (e.kind === 'lesson_note') row.vetted = e.vetted;
    return true;
  };

  // Week numbers first, so a titled match never takes a week someone set by hand.
  const later: LessonBookEntry[] = [];
  for (const e of entries) {
    if (e.week !== null && place(byWeek.get(e.week), e)) continue;
    later.push(e);
  }
  for (const e of later) {
    const row = rows.find((r) => !r[slot(e)] && titleMatchesTopic(e.title, r.topic));
    if (!place(row, e)) extra.push(e.id);
  }

  const upTo = rows.filter((r) => currentWeek === undefined || currentWeek === null || r.week <= currentWeek);
  const missingWeeks = upTo.filter((r) => !r.noteId).map((r) => r.week);
  const percent = upTo.length ? Math.round(((upTo.length - missingWeeks.length) / upTo.length) * 100) : 0;
  return { rows, extra, missingWeeks, percent };
}

/**
 * Week of term for a date, counting the week the term began as week 1 (weeks start on Monday).
 * Null before the term starts.
 */
export function weekOfTerm(termStart: string, today: string): number | null {
  const start = new Date(`${termStart}T00:00:00Z`);
  const now = new Date(`${today}T00:00:00Z`);
  const monday = (d: Date) => new Date(d.getTime() - ((d.getUTCDay() + 6) % 7) * 86_400_000);
  const diff = monday(now).getTime() - monday(start).getTime();
  if (diff < 0) return null;
  return Math.floor(diff / (7 * 86_400_000)) + 1;
}
