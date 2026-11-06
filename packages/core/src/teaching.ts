/**
 * Teacher assistant logic that does not need AI: reading a marking scheme into points,
 * a rough first marking of a written answer against those points, report card remarks
 * drafted from results, and the rules for flagging students who are falling behind.
 * The API uses Claude for the first three when it is switched on, and these as stand-ins.
 */
import type { AssessmentComponent } from './results';

// ---------------------------------------------------------------- Rubrics and marking

export interface RubricPoint {
  point: string;
  marks: number;
}

/**
 * Reads a marking scheme typed or pasted one point per line, with the marks at the start or
 * the end: "State Ohm's law (2)", "2 marks: states Ohm's law", "Correct unit - 1", "[1] unit".
 * Lines without marks count 1 mark each.
 */
export function parseRubric(text: string): RubricPoint[] {
  const out: RubricPoint[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/^\s*(?:[-*•]|\d+[.)]|[a-z][.)])\s+/i, '').trim();
    if (line.length < 2) continue;
    let m = line.match(/^(?:\[|\()?\s*(\d+(?:\.5)?)\s*(?:marks?|mks?|m)?\s*(?:\]|\))?\s*[:\-–]?\s*(.+)$/i);
    if (m && /[a-z]/i.test(m[2])) {
      out.push({ point: m[2].trim(), marks: Number(m[1]) });
      continue;
    }
    m = line.match(/^(.+?)\s*[\-–:]?\s*[([]?\s*(\d+(?:\.5)?)\s*(?:marks?|mks?|m)?\s*[)\]]?\s*$/i);
    if (m && /[a-z]/i.test(m[1])) {
      out.push({ point: m[1].trim(), marks: Number(m[2]) });
      continue;
    }
    out.push({ point: line, marks: 1 });
  }
  return out.filter((p) => p.marks > 0 && p.marks <= 100);
}

const MARKING_STOP = new Set(
  (
    'a an and are as at be but by can do does for from how i in is it its me my of on or so that the this to was we what when where which who why will with you your ' +
    'state states stated mention mentions give gives correct correctly any two three one explain explains describe describes define defines show shows write ' +
    'mark marks student answer answers point points award should must use uses using also each e g eg ie'
  ).split(' '),
);

/** The words in a rubric point that a good answer would be expected to contain. */
export function keyTerms(text: string): string[] {
  const words = text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => (w.length > 2 || /\d/.test(w)) && !MARKING_STOP.has(w));
  return [...new Set(words.map(stem))];
}

/** A crude stem, so "proportional" matches "proportion" and "resistors" matches "resistor". */
function stem(w: string): string {
  if (/\d/.test(w)) return w;
  return w.length > 6 ? w.slice(0, 6) : w.replace(/(es|s)$/, '');
}

export interface PointMark {
  point: string;
  marks: number;
  awarded: number;
  reason: string;
}

export interface MarkSuggestion {
  criteria: PointMark[];
  total: number;
  max: number;
  feedback: string;
}

/**
 * A first marking by matching each rubric point's key words in the answer. It is a rough
 * guide for the teacher, never a final mark: it cannot tell a right idea from a wrong one
 * that uses the same words.
 */
export function suggestMarks(answer: string, rubric: RubricPoint[]): MarkSuggestion {
  const have = new Set(keyTerms(answer));
  const criteria = rubric.map((r) => {
    const terms = keyTerms(r.point);
    const hit = terms.filter((t) => have.has(t));
    // Numbers and values must match exactly: "answer 6" earns nothing on "final answer 4".
    const numbersMissing = terms.some((t) => /\d/.test(t) && !have.has(t));
    const cover = terms.length ? hit.length / terms.length : 0;
    const awarded = numbersMissing ? 0 : cover >= 0.6 ? r.marks : cover >= 0.3 ? Math.floor(r.marks) / 2 : 0;
    const reason = numbersMissing
      ? 'A value in this point is missing or different in the answer.'
      : awarded === r.marks
        ? 'The answer covers this point.'
        : awarded > 0
          ? 'Partly covered: check the answer for this point.'
          : terms.length
            ? 'Not found in the answer.'
            : 'Check this point yourself.';
    return { point: r.point, marks: r.marks, awarded, reason };
  });
  const total = round1(criteria.reduce((n, c) => n + c.awarded, 0));
  const max = round1(rubric.reduce((n, r) => n + r.marks, 0));
  const missing = criteria.filter((c) => c.awarded < c.marks).map((c) => c.point);
  const feedback = missing.length
    ? `Good effort. To score higher, also cover: ${missing.slice(0, 3).join('; ')}.`
    : 'Well done: the answer covers every point in the marking scheme.';
  return { criteria, total, max, feedback };
}

/** Scales a mark out of `max` to a score component out of `componentMax`, to one decimal place. */
export function scaleMark(mark: number, max: number, componentMax: number): number {
  if (max <= 0) return 0;
  return round1(Math.min(componentMax, Math.max(0, (mark / max) * componentMax)));
}

// ---------------------------------------------------------------- Report card remarks

export interface RemarkInput {
  /** Used to vary the wording between students, never printed. */
  key: string;
  firstName: string;
  average: number;
  position?: number | null;
  outOf?: number | null;
  subjects: { name: string; total: number }[];
  previousAverage?: number | null;
  attendance?: { present: number; opened: number } | null;
}

export interface RemarkDraft {
  teacherComment: string;
  headComment: string;
}

const pickBy = <T>(key: string, xs: T[]): T => {
  let h = 0;
  for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return xs[h % xs.length];
};

/**
 * Report card remarks from the student's results: one strength, one area to work on, and the
 * trend since last term. Never mentions a position in the bottom third of the class.
 */
export function draftRemark(r: RemarkInput): RemarkDraft {
  const sorted = [...r.subjects].sort((a, b) => b.total - a.total);
  const best = sorted[0];
  const weakest = sorted.length > 1 ? sorted[sorted.length - 1] : undefined;
  const name = r.firstName;
  const avg = r.average;

  const opening =
    avg >= 70
      ? pickBy(r.key, [`${name} has worked excellently this term.`, `An outstanding term for ${name}.`, `${name} has shown excellent commitment this term.`])
      : avg >= 55
        ? pickBy(r.key, [`${name} has worked well this term.`, `A good term for ${name}.`, `${name} has made good progress this term.`])
        : avg >= 45
          ? pickBy(r.key, [`${name} has made a fair effort this term.`, `A fair term for ${name}, with room to grow.`, `${name} is capable of more than this term shows.`])
          : pickBy(r.key, [`${name} needs to work much harder.`, `${name} needs more support and steady effort.`, `This term was difficult for ${name}.`]);

  const parts = [opening];
  if (best && best.total >= 50) parts.push(`Strong in ${best.name}.`);
  if (weakest && weakest.total < 60 && weakest.name !== best?.name) parts.push(`Should give more time to ${weakest.name}.`);
  if (r.previousAverage != null) {
    const d = avg - r.previousAverage;
    if (d >= 5) parts.push('A clear improvement on last term.');
    else if (d <= -5) parts.push('Results dropped since last term.');
  }
  if (r.attendance && r.attendance.opened > 0 && r.attendance.present / r.attendance.opened < 0.85) parts.push('Better attendance will help.');
  const topThird = r.position != null && r.outOf ? r.position <= Math.ceil(r.outOf / 3) : false;
  if (topThird && avg >= 55 && r.position != null) parts.push(`Keep it up.`);

  const head =
    avg >= 70
      ? pickBy(r.key, ['Excellent result. Keep it up.', 'A brilliant performance. Well done.'])
      : avg >= 55
        ? pickBy(r.key, ['Good result. Aim higher next term.', 'A good performance. Keep working.'])
        : avg >= 45
          ? pickBy(r.key, ['Fair result. You can do better.', 'More effort is needed next term.'])
          : pickBy(r.key, ['Sit up and work harder next term.', 'See your class teacher for a study plan.']);
  return { teacherComment: limitWords(parts.join(' '), 30), headComment: head };
}

function limitWords(text: string, n: number): string {
  const words = text.split(/\s+/);
  if (words.length <= n) return text;
  const cut = words.slice(0, n).join(' ');
  const lastStop = cut.lastIndexOf('.');
  return lastStop > 0 ? cut.slice(0, lastStop + 1) : `${cut}.`;
}

// ---------------------------------------------------------------- Students falling behind

/**
 * A subject's percentage from the components entered so far, so a term with only the CAs in
 * does not read as a collapse. Null when nothing has been entered.
 */
export function percentSoFar(scores: Record<string, number>, components: AssessmentComponent[]): number | null {
  let got = 0;
  let max = 0;
  for (const c of components) {
    const v = scores[c.key];
    if (v === undefined || v === null || !Number.isFinite(v)) continue;
    got += v;
    max += c.maxScore;
  }
  return max > 0 ? round1((got / max) * 100) : null;
}

export interface WatchInput {
  subjects: { name: string; current: number | null; previous: number | null }[];
  /** The pass mark that matters: 50 for a WAEC credit in SS, 40 elsewhere. */
  passMark: number;
  /** Present days over school days this term, 0 to 1. */
  attendanceRate?: number | null;
  /** Closed CBT tests for the class the student never sat. */
  missedTests: number;
  /** Practice sets, mocks and tutor quiz answers in the last 14 days. */
  recentPractice: number;
  readiness?: 'on_track' | 'borderline' | 'at_risk' | null;
}

export interface WatchReason {
  code: 'drop' | 'below_pass' | 'attendance' | 'missed_tests' | 'readiness' | 'inactive';
  serious: boolean;
  text: string;
}

export interface WatchResult {
  level: 'high' | 'medium' | null;
  reasons: WatchReason[];
  average: number | null;
}

const avgOf = (xs: number[]) => (xs.length ? round1(xs.reduce((a, b) => a + b, 0) / xs.length) : null);

/**
 * Whether a student is falling behind, and why, in words a form teacher can act on.
 * Two serious reasons, or three or more subjects below the pass mark, make it high; one serious
 * reason, or two minor ones, make it medium.
 */
export function watchStudent(w: WatchInput): WatchResult {
  const reasons: WatchReason[] = [];
  const now = w.subjects.filter((s) => s.current !== null);
  const average = avgOf(now.map((s) => s.current!));

  const paired = now.filter((s) => s.previous !== null);
  const avgNow = avgOf(paired.map((s) => s.current!));
  const avgBefore = avgOf(paired.map((s) => s.previous!));
  const drops = paired.filter((s) => s.previous! - s.current! >= 15).sort((a, b) => b.previous! - b.current! - (a.previous! - a.current!));
  if (avgNow !== null && avgBefore !== null && avgBefore - avgNow >= 10) {
    reasons.push({ code: 'drop', serious: true, text: `Average down ${Math.round(avgBefore - avgNow)} points since last term` });
  } else if (drops.length) {
    reasons.push({
      code: 'drop',
      serious: drops.length >= 2,
      text: `Dropped in ${drops.slice(0, 3).map((s) => `${s.name} (${Math.round(s.previous!)} to ${Math.round(s.current!)})`).join(', ')}`,
    });
  }

  const below = now.filter((s) => s.current! < w.passMark);
  if (below.length) {
    reasons.push({
      code: 'below_pass',
      serious: below.length >= 2,
      text: `Below ${w.passMark}% in ${below.slice(0, 4).map((s) => s.name).join(', ')}${below.length > 4 ? ` and ${below.length - 4} more` : ''}`,
    });
  }

  if (w.attendanceRate != null && w.attendanceRate < 0.85) {
    reasons.push({ code: 'attendance', serious: w.attendanceRate < 0.75, text: `Attendance ${Math.round(w.attendanceRate * 100)}% this term` });
  }
  if (w.missedTests > 0) {
    reasons.push({ code: 'missed_tests', serious: w.missedTests >= 2, text: `Missed ${w.missedTests} CBT test${w.missedTests === 1 ? '' : 's'}` });
  }
  if (w.readiness === 'at_risk') reasons.push({ code: 'readiness', serious: true, text: 'Predicted exam readiness: at risk' });
  if (w.recentPractice === 0 && reasons.length) reasons.push({ code: 'inactive', serious: false, text: 'No practice in the last two weeks' });

  const serious = reasons.filter((r) => r.serious).length;
  const minor = reasons.length - serious;
  // Failing three or more subjects is urgent on its own.
  const level = serious >= 2 || below.length >= 3 ? 'high' : serious === 1 || minor >= 2 ? 'medium' : null;
  return { level, reasons, average };
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
