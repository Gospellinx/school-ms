/**
 * Exam forecasts for whole classes and schools, at-risk signals for one student, and the plain
 * words parents see. Builds on `estimateReadiness` (one student, one exam). Pure and deterministic.
 */

import { EXAM_FORMATS, ExamCode, Readiness, SubjectReadiness } from './exams';

// ---------------------------------------------------------------- Benchmarks

export interface ExamBenchmark {
  /** Subjects needed at credit (50) or better, including English and Mathematics. */
  credits: number | null;
  /** JAMB UTME aggregate out of 400 most universities ask for. */
  aggregate: number | null;
  label: string;
}

/** What "ready" means for each exam: the usual admission bar, not the bare pass mark. */
export const EXAM_BENCHMARKS: Record<ExamCode, ExamBenchmark> = {
  waec: { credits: 5, aggregate: null, label: '5 credits including English and Mathematics' },
  neco: { credits: 5, aggregate: null, label: '5 credits including English and Mathematics' },
  bece: { credits: 6, aggregate: null, label: '6 credits including English and Mathematics' },
  jamb: { credits: null, aggregate: 200, label: '200 or more out of 400' },
};

export interface SubjectRef {
  id: string;
  name: string;
  code?: string | null;
}

export const isEnglish = (s: Pick<SubjectRef, 'name' | 'code'>) =>
  (s.code ?? '').toUpperCase() === 'ENG' || /^english/i.test(s.name.trim());
export const isMaths = (s: Pick<SubjectRef, 'name' | 'code'>) =>
  ['MTH', 'MAT', 'MATHS', 'GMT'].includes((s.code ?? '').toUpperCase()) || /^(general )?math/i.test(s.name.trim());

/**
 * Whether the student is on course for the exam's benchmark. `null` means there is not yet
 * enough evidence to say either way (a core subject or enough other subjects are unknown).
 */
export function meetsBenchmark(exam: ExamCode, readiness: Readiness, subjects: SubjectRef[]): boolean | null {
  const bench = EXAM_BENCHMARKS[exam];
  if (bench.aggregate !== null) {
    const known = readiness.subjects.filter((s) => s.predicted !== null).length;
    if (readiness.jambAggregate === null || known < Math.min(4, readiness.subjects.length)) return null;
    return readiness.jambAggregate >= bench.aggregate;
  }
  const byId = new Map(subjects.map((s) => [s.id, s]));
  const core = (test: (s: SubjectRef) => boolean) => readiness.subjects.find((r) => byId.has(r.subjectId) && test(byId.get(r.subjectId)!));
  for (const c of [core(isEnglish), core(isMaths)]) {
    if (!c) continue; // The class does not take it; judge on the rest.
    if (c.predicted === null) return null;
    if (c.predicted < 50) return false;
  }
  const credits = readiness.subjects.filter((s) => (s.predicted ?? 0) >= 50).length;
  const unknown = readiness.subjects.filter((s) => s.predicted === null).length;
  const needed = Math.min(bench.credits!, readiness.subjects.length);
  if (credits >= needed) return true;
  if (credits + unknown >= needed) return null;
  return false;
}

// ---------------------------------------------------------------- Cohorts

export interface CohortMember {
  readiness: Readiness;
  meetsBenchmark: boolean | null;
}

export interface SubjectForecast {
  subjectId: string;
  subjectName: string;
  /** Students with a prediction in this subject. */
  students: number;
  average: number | null;
  /** Predicted at credit (50) or better. */
  credits: number;
  creditRate: number | null;
  atRisk: number;
}

export interface CohortForecast {
  students: number;
  /** Students with at least one predicted subject. */
  withEvidence: number;
  bands: Record<SubjectReadiness['band'], number>;
  average: number | null;
  /** Students on course for the benchmark, not yet decided, and off course. */
  benchmark: { likely: number; undecided: number; unlikely: number; label: string };
  /**
   * Projected share of the cohort reaching the benchmark, as a range: `low` counts only students
   * already on course, `high` also counts every undecided student. Percentages of `students`.
   */
  projectedRate: { low: number; high: number } | null;
  subjects: SubjectForecast[];
}

const pct = (n: number, d: number) => (d ? Math.round((n / d) * 100) : 0);

/** Class, subject or school forecast for one exam from each student's readiness. */
export function summariseCohort(exam: ExamCode, members: CohortMember[]): CohortForecast {
  const bands = { on_track: 0, borderline: 0, at_risk: 0, unknown: 0 };
  let withEvidence = 0;
  const overall: number[] = [];
  const subjects = new Map<string, { name: string; values: number[] }>();
  let likely = 0;
  let undecided = 0;
  for (const m of members) {
    bands[m.readiness.band]++;
    if (m.readiness.overall !== null) {
      withEvidence++;
      overall.push(m.readiness.overall);
    }
    if (m.meetsBenchmark === true) likely++;
    else if (m.meetsBenchmark === null) undecided++;
    for (const s of m.readiness.subjects) {
      const entry = subjects.get(s.subjectId) ?? { name: s.subjectName, values: [] };
      if (s.predicted !== null) entry.values.push(s.predicted);
      subjects.set(s.subjectId, entry);
    }
  }
  const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);
  return {
    students: members.length,
    withEvidence,
    bands,
    average: avg(overall),
    benchmark: { likely, undecided, unlikely: members.length - likely - undecided, label: EXAM_BENCHMARKS[exam].label },
    projectedRate: members.length && withEvidence ? { low: pct(likely, members.length), high: pct(likely + undecided, members.length) } : null,
    subjects: [...subjects.entries()]
      .map(([subjectId, { name, values }]) => {
        const credits = values.filter((v) => v >= 50).length;
        return {
          subjectId,
          subjectName: name,
          students: values.length,
          average: avg(values),
          credits,
          creditRate: values.length ? pct(credits, values.length) : null,
          atRisk: values.filter((v) => v < 50).length,
        };
      })
      .sort((a, b) => (a.average ?? 101) - (b.average ?? 101) || a.subjectName.localeCompare(b.subjectName)),
  };
}

// ---------------------------------------------------------------- Topics to reteach

export interface ClassTopicStat {
  subjectId: string;
  subjectName: string;
  topic: string;
  attempted: number;
  correct: number;
  /** Distinct students who answered questions on the topic. */
  students: number;
}

/**
 * Topics most of the class keeps getting wrong in CBT, practice and tutor quizzes. Needs answers
 * from at least `minStudents` students so one weak student does not decide what the class reteaches.
 */
export function topicsToReteach(stats: ClassTopicStat[], opts: { minStudents?: number; minAttempts?: number; below?: number; limit?: number } = {}) {
  const { minStudents = 2, minAttempts = 6, below = 55, limit = 8 } = opts;
  return stats
    .filter((s) => s.students >= minStudents && s.attempted >= minAttempts)
    .map((s) => ({ ...s, accuracy: pct(s.correct, s.attempted) }))
    .filter((s) => s.accuracy < below)
    .sort((a, b) => a.accuracy - b.accuracy || b.students - a.students)
    .slice(0, limit);
}

// ---------------------------------------------------------------- At-risk signals

export interface RiskInput {
  /** Present or late, as a share of marked days in the last two weeks, 0-100. */
  attendanceRate: number | null;
  /** School days absent in a row, ending with the latest register. */
  consecutiveAbsences: number;
  readinessBand: SubjectReadiness['band'] | null;
  /** Fall in the average between the last two released terms, in marks (positive = worse). */
  scoreDrop: number | null;
  /** Subjects predicted below 50. */
  subjectsAtRisk: number;
}

export type RiskCode = 'absent_streak' | 'low_attendance' | 'readiness' | 'score_drop' | 'weak_subjects';

export interface Risk {
  code: RiskCode;
  severity: 'high' | 'medium';
  label: string;
}

/** Why a student needs attention, most serious first. An empty list means nothing to flag. */
export function riskReasons(i: RiskInput): Risk[] {
  const out: Risk[] = [];
  if (i.consecutiveAbsences >= 3) out.push({ code: 'absent_streak', severity: 'high', label: `Absent ${i.consecutiveAbsences} school days in a row` });
  else if (i.attendanceRate !== null && i.attendanceRate < 80)
    out.push({ code: 'low_attendance', severity: i.attendanceRate < 65 ? 'high' : 'medium', label: `Attendance ${i.attendanceRate}% in the last two weeks` });
  if (i.readinessBand === 'at_risk') out.push({ code: 'readiness', severity: 'high', label: 'Predicted below credit overall' });
  if (i.scoreDrop !== null && i.scoreDrop >= 10)
    out.push({ code: 'score_drop', severity: i.scoreDrop >= 15 ? 'high' : 'medium', label: `Average fell ${Math.round(i.scoreDrop)} marks since last term` });
  if (i.subjectsAtRisk >= 2 && i.readinessBand !== 'at_risk')
    out.push({ code: 'weak_subjects', severity: 'medium', label: `${i.subjectsAtRisk} subjects predicted below credit` });
  return out.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'high' ? -1 : 1));
}

/** The latest run of absences, given registers newest first. */
export function absenceStreak(statusesNewestFirst: string[]): number {
  let n = 0;
  for (const s of statusesNewestFirst) {
    if (s === 'excused') continue;
    if (s !== 'absent') break;
    n++;
  }
  return n;
}

// ---------------------------------------------------------------- Plain words for parents

export interface ParentForecastText {
  headline: string;
  lines: string[];
  atHome: string[];
}

/**
 * What a parent reads about their child's forecast: no jargon, what is going well, what needs
 * work, and a few things to do at home. Weak topics come from the child's own practice.
 */
export function describeForecastForParent(
  firstName: string,
  exam: ExamCode,
  readiness: Readiness,
  weakTopics: { subjectName: string; topic: string }[],
): ParentForecastText {
  const name = EXAM_FORMATS[exam].name;
  const bench = EXAM_BENCHMARKS[exam].label;
  const known = readiness.subjects.filter((s) => s.predicted !== null);
  if (!known.length) {
    return {
      headline: `We do not have enough results yet to forecast ${firstName}'s ${name}.`,
      lines: ['The forecast appears once the school releases a term result or ' + firstName + ' sits a practice mock.'],
      atHome: [`Encourage ${firstName} to try a practice mock in the student app's Exam Prep page.`],
    };
  }
  const strong = known.filter((s) => (s.predicted ?? 0) >= 65).map((s) => s.subjectName);
  const weak = known.filter((s) => (s.predicted ?? 0) < 50).sort((a, b) => a.predicted! - b.predicted!).map((s) => s.subjectName);
  const headline =
    readiness.band === 'on_track'
      ? `${firstName} is on track for ${name}.`
      : readiness.band === 'borderline'
        ? `${firstName} is close, but not yet safe, for ${name}.`
        : `${firstName} needs extra support to be ready for ${name}.`;
  const lines: string[] = [];
  if (exam === 'jamb' && readiness.jambAggregate !== null) lines.push(`Predicted UTME score: about ${readiness.jambAggregate} out of 400 (the usual target is ${bench}).`);
  else lines.push(`About ${readiness.creditsLikely} of ${readiness.subjects.length} subjects are heading for a credit or better (the usual target is ${bench}).`);
  if (strong.length) lines.push(`Doing well in ${listWords(strong)}.`);
  if (weak.length) lines.push(`Needs work in ${listWords(weak)}.`);
  const lowConfidence = known.every((s) => s.confidence === 'low');
  if (lowConfidence) lines.push('This is an early forecast from little evidence, so treat it as a rough guide.');

  const atHome: string[] = [];
  const topics = weakTopics.slice(0, 3);
  if (topics.length) atHome.push(`Ask ${firstName} to explain ${listWords(topics.map((t) => `${t.topic} (${t.subjectName})`))} to you in their own words.`);
  if (weak.length) atHome.push(`Set aside 30 minutes a day for ${weak[0]}, with the AI tutor or past questions.`);
  atHome.push(`Check that ${firstName} sits one timed practice mock each week in the student app.`);
  return { headline, lines, atHome };
}

function listWords(xs: string[]): string {
  if (xs.length <= 1) return xs.join('');
  return `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`;
}
