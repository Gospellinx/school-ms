/**
 * External exams Nigerian students sit (WAEC, NECO, JAMB UTME, BECE): mock exam formats,
 * which question tags suit each exam, a week-by-week study plan up to exam day, and a
 * simple readiness estimate. Pure and deterministic; the AI layer only words things.
 */

export type ExamCode = 'waec' | 'neco' | 'jamb' | 'bece';
export type SectionKindCode = 'nursery' | 'primary' | 'junior_secondary' | 'senior_secondary';

export interface ExamFormat {
  code: ExamCode;
  name: string;
  /** Number of subjects in one sitting of the mock. JAMB is four subjects at once. */
  subjects: number;
  /** Questions per subject in a full mock. For JAMB the first entry is Use of English. */
  questionsPerSubject: number[];
  /** Minutes for a full mock. */
  minutes: number;
  /** Subject codes that must be included, e.g. Use of English for JAMB. */
  compulsory: string[];
  /** Usual month and day of the first paper (approximate, editable by the student). */
  usualDate: { month: number; day: number };
  sections: SectionKindCode[];
}

/** Approximate paper formats. Schools can adjust these later; they only shape the mocks. */
export const EXAM_FORMATS: Record<ExamCode, ExamFormat> = {
  jamb: {
    code: 'jamb',
    name: 'JAMB UTME',
    subjects: 4,
    questionsPerSubject: [60, 40, 40, 40],
    minutes: 120,
    compulsory: ['ENG'],
    usualDate: { month: 4, day: 20 },
    sections: ['senior_secondary'],
  },
  waec: {
    code: 'waec',
    name: 'WAEC (WASSCE)',
    subjects: 1,
    questionsPerSubject: [50],
    minutes: 60,
    compulsory: [],
    usualDate: { month: 5, day: 5 },
    sections: ['senior_secondary'],
  },
  neco: {
    code: 'neco',
    name: 'NECO (SSCE)',
    subjects: 1,
    questionsPerSubject: [60],
    minutes: 60,
    compulsory: [],
    usualDate: { month: 6, day: 15 },
    sections: ['senior_secondary'],
  },
  bece: {
    code: 'bece',
    name: 'BECE (Junior WAEC)',
    subjects: 1,
    questionsPerSubject: [50],
    minutes: 60,
    compulsory: [],
    usualDate: { month: 6, day: 10 },
    sections: ['junior_secondary'],
  },
};

/** Exams a student in this section can prepare for. */
export function examsForSection(kind: SectionKindCode | null | undefined): ExamCode[] {
  if (!kind) return [];
  return (Object.keys(EXAM_FORMATS) as ExamCode[]).filter((c) => EXAM_FORMATS[c].sections.includes(kind));
}

/**
 * Question-bank tags that suit an exam, best match first. Senior exams share a syllabus
 * closely enough to borrow each other's questions; BECE also uses the school's own questions.
 */
export function compatibleTags(exam: ExamCode): string[] {
  switch (exam) {
    case 'jamb':
      return ['jamb', 'waec', 'neco'];
    case 'waec':
      return ['waec', 'neco', 'jamb'];
    case 'neco':
      return ['neco', 'waec', 'jamb'];
    case 'bece':
      return ['bece', 'school'];
  }
}

/** The next usual exam date on or after `today` (YYYY-MM-DD). */
export function defaultExamDate(exam: ExamCode, today: string): string {
  const { month, day } = EXAM_FORMATS[exam].usualDate;
  const y = Number(today.slice(0, 4));
  const candidate = `${y}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  return candidate >= today ? candidate : `${y + 1}${candidate.slice(4)}`;
}

export interface MockSubjectPlan {
  subjectId: string;
  /** Questions wanted for this subject. */
  count: number;
}

export interface MockPlan {
  subjects: MockSubjectPlan[];
  totalQuestions: number;
  minutes: number;
}

/**
 * Shapes a mock: how many questions per subject and how long. A short mock keeps the exam's
 * pace (questions per minute) with a quarter of the questions, for practice on mobile data.
 * Counts are capped by the questions available.
 */
export function planMock(
  exam: ExamCode,
  subjects: { subjectId: string; available: number }[],
  size: 'full' | 'short',
): MockPlan {
  const f = EXAM_FORMATS[exam];
  const total = f.questionsPerSubject.reduce((a, b) => a + b, 0);
  const planned = subjects.slice(0, f.subjects).map((s, i) => {
    const full = f.questionsPerSubject[i] ?? f.questionsPerSubject.at(-1)!;
    const want = size === 'full' ? full : Math.max(5, Math.round(full / 4));
    return { subjectId: s.subjectId, count: Math.min(want, s.available) };
  });
  const totalQuestions = planned.reduce((a, s) => a + s.count, 0);
  const minutes = Math.max(5, Math.round((f.minutes * totalQuestions) / total));
  return { subjects: planned.filter((s) => s.count > 0), totalQuestions, minutes };
}

/** JAMB reports each subject out of 100 and the aggregate out of 400. */
export function jambAggregate(subjectPercentages: number[]): number {
  return Math.round(subjectPercentages.slice(0, 4).reduce((a, p) => a + p, 0));
}

/** WAEC-style grade for a percentage on our mocks (approximate bands). */
export function waecGrade(pct: number): string {
  if (pct >= 75) return 'A1';
  if (pct >= 70) return 'B2';
  if (pct >= 65) return 'B3';
  if (pct >= 60) return 'C4';
  if (pct >= 55) return 'C5';
  if (pct >= 50) return 'C6';
  if (pct >= 45) return 'D7';
  if (pct >= 40) return 'E8';
  return 'F9';
}

// ---------------------------------------------------------------- Study plan to exam day

export interface PlanSubject {
  subjectId: string;
  subjectName: string;
  /** Higher means more urgent (from the study profile). */
  priority: number;
  /** Weakest first. */
  weakTopics: string[];
  /** Every topic known for the subject (scheme of work and question bank). */
  topics: string[];
}

export interface PlanFocus {
  subjectId: string;
  subject: string;
  topic: string;
  kind: 'fix' | 'cover' | 'revise';
}

export interface PlanWeek {
  week: number;
  startsOn: string;
  focus: PlanFocus[];
  /** A timed mock this week. */
  mock: boolean;
}

export interface CountdownPlan {
  examDate: string;
  daysLeft: number;
  weeks: PlanWeek[];
}

const addDays = (date: string, n: number) => new Date(Date.parse(`${date}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000);

/**
 * A week-by-week plan from today to exam day. Weak topics come first (more often for the most
 * urgent subjects), then the rest of each syllabus, a timed mock every third week, and the
 * final week is revision plus a last mock. Long countdowns are capped at 52 weeks.
 */
export function buildCountdownPlan(
  today: string,
  examDate: string,
  subjects: PlanSubject[],
  opts: { slotsPerWeek?: number } = {},
): CountdownPlan {
  const daysLeft = Math.max(0, daysBetween(today, examDate));
  const weekCount = Math.min(52, Math.max(1, Math.ceil(daysLeft / 7)));
  const slots = opts.slotsPerWeek ?? 4;
  const ordered = [...subjects].sort((a, b) => b.priority - a.priority || a.subjectName.localeCompare(b.subjectName));

  // Queue of things to study: each subject's weak topics, interleaved by urgency, then everything else.
  const queue: PlanFocus[] = [];
  const weakLists = ordered.map((s) => s.weakTopics.map((t) => ({ subjectId: s.subjectId, subject: s.subjectName, topic: t, kind: 'fix' as const })));
  for (let i = 0; weakLists.some((l) => l.length > i); i++) for (const l of weakLists) if (l[i]) queue.push(l[i]);
  const rest = ordered.map((s) => {
    const weak = new Set(s.weakTopics.map((t) => t.toLowerCase()));
    return s.topics.filter((t) => !weak.has(t.toLowerCase())).map((t) => ({ subjectId: s.subjectId, subject: s.subjectName, topic: t, kind: 'cover' as const }));
  });
  for (let i = 0; rest.some((l) => l.length > i); i++) for (const l of rest) if (l[i]) queue.push(l[i]);

  const weeks: PlanWeek[] = [];
  let cursor = 0;
  for (let w = 1; w <= weekCount; w++) {
    const last = w === weekCount;
    const focus: PlanFocus[] = [];
    if (last) {
      // Final week: revise the weakest topics again, lightly.
      for (const l of weakLists) if (l[0]) focus.push({ ...l[0], kind: 'revise' });
      if (!focus.length) for (const s of ordered.slice(0, slots)) focus.push({ subjectId: s.subjectId, subject: s.subjectName, topic: 'Past questions', kind: 'revise' });
    } else if (queue.length) {
      for (let k = 0; k < slots; k++) {
        const item = queue[cursor % queue.length];
        // Once the queue has been covered, go round again as revision.
        focus.push(cursor >= queue.length ? { ...item, kind: 'revise' } : item);
        cursor++;
      }
    }
    weeks.push({ week: w, startsOn: addDays(today, (w - 1) * 7), focus: focus.slice(0, slots), mock: last || w % 3 === 0 });
  }
  return { examDate, daysLeft, weeks };
}

// ---------------------------------------------------------------- Readiness

export interface ReadinessInput {
  subjectId: string;
  subjectName: string;
  /** Latest released school result for the subject, 0-100. */
  schoolScore: number | null;
  /** Mock percentages, oldest first. */
  mockScores: number[];
  /** Accuracy on practice and tutor quiz questions, 0-100, with how many were answered. */
  practiceAccuracy: number | null;
  practiceAnswered: number;
}

export interface SubjectReadiness {
  subjectId: string;
  subjectName: string;
  predicted: number | null;
  grade: string | null;
  band: 'on_track' | 'borderline' | 'at_risk' | 'unknown';
  confidence: 'low' | 'medium' | 'high';
}

export interface Readiness {
  subjects: SubjectReadiness[];
  /** Average of predicted subject scores. */
  overall: number | null;
  band: SubjectReadiness['band'];
  /** For JAMB: predicted aggregate out of 400 over the best-known four subjects. */
  jambAggregate: number | null;
  /** For WAEC/NECO/BECE: subjects predicted at credit (50) or better. */
  creditsLikely: number;
}

const bandFor = (p: number | null): SubjectReadiness['band'] => (p === null ? 'unknown' : p >= 65 ? 'on_track' : p >= 50 ? 'borderline' : 'at_risk');

/**
 * Predicted exam score per subject: a weighted mix of recent mocks (most weight, latest two),
 * school results and practice accuracy. Confidence grows with how much evidence there is.
 * This is a rough guide for students and teachers, not a promise.
 */
export function estimateReadiness(exam: ExamCode, inputs: ReadinessInput[]): Readiness {
  const subjects = inputs.map((s) => {
    const parts: [number, number][] = [];
    const recentMocks = s.mockScores.slice(-2);
    if (recentMocks.length) parts.push([recentMocks.reduce((a, b) => a + b, 0) / recentMocks.length, 0.5]);
    if (s.schoolScore !== null) parts.push([s.schoolScore, 0.3]);
    if (s.practiceAccuracy !== null && s.practiceAnswered >= 5) parts.push([s.practiceAccuracy, 0.2]);
    const weight = parts.reduce((a, [, w]) => a + w, 0);
    const predicted = weight ? Math.round(parts.reduce((a, [v, w]) => a + v * w, 0) / weight) : null;
    const evidence = s.mockScores.length + (s.schoolScore !== null ? 1 : 0) + Math.min(2, Math.floor(s.practiceAnswered / 15));
    return {
      subjectId: s.subjectId,
      subjectName: s.subjectName,
      predicted,
      grade: predicted === null ? null : waecGrade(predicted),
      band: bandFor(predicted),
      confidence: (evidence >= 4 ? 'high' : evidence >= 2 ? 'medium' : 'low') as SubjectReadiness['confidence'],
    };
  });
  const known = subjects.filter((s) => s.predicted !== null).map((s) => s.predicted!);
  const overall = known.length ? Math.round(known.reduce((a, b) => a + b, 0) / known.length) : null;
  const top4 = [...known].sort((a, b) => b - a).slice(0, 4);
  return {
    subjects,
    overall,
    band: bandFor(overall),
    jambAggregate: exam === 'jamb' && top4.length ? jambAggregate(top4) : null,
    creditsLikely: subjects.filter((s) => (s.predicted ?? 0) >= 50).length,
  };
}
