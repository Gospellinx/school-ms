import { GradingScale, gradeFor } from './grading';
import { rank } from './ranking';

/** A scored part of a subject's result, e.g. first CA (20), second CA (20), exam (60). */
export interface AssessmentComponent {
  key: string;
  label: string;
  maxScore: number;
}

/** Common Nigerian split: two continuous assessments and an exam, out of 100. */
export const DEFAULT_COMPONENTS: AssessmentComponent[] = [
  { key: 'ca1', label: '1st CA', maxScore: 20 },
  { key: 'ca2', label: '2nd CA', maxScore: 20 },
  { key: 'exam', label: 'Exam', maxScore: 60 },
];

export interface ScoreEntry {
  studentId: string;
  subjectId: string;
  /** Component key -> score. A missing key counts as 0. */
  scores: Record<string, number>;
}

export interface SubjectResult {
  subjectId: string;
  scores: Record<string, number>;
  total: number;
  grade: string;
  remark: string;
  position: number;
  classAverage: number;
  classHighest: number;
  classLowest: number;
}

export interface StudentResult {
  studentId: string;
  subjects: SubjectResult[];
  grandTotal: number;
  average: number;
  position: number;
  subjectCount: number;
}

export interface ClassResult {
  students: StudentResult[];
  classAverage: number;
  studentCount: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function validateComponents(components: AssessmentComponent[]): void {
  const total = components.reduce((sum, c) => sum + c.maxScore, 0);
  if (total !== 100) throw new Error(`Assessment components must add up to 100, got ${total}`);
  const keys = new Set(components.map((c) => c.key));
  if (keys.size !== components.length) throw new Error('Assessment component keys must be unique');
}

export function subjectTotal(scores: Record<string, number>, components: AssessmentComponent[]): number {
  let total = 0;
  for (const key of Object.keys(scores)) {
    if (!components.some((c) => c.key === key)) throw new Error(`Unknown assessment component "${key}"`);
  }
  for (const c of components) {
    const score = scores[c.key] ?? 0;
    if (!Number.isFinite(score) || score < 0 || score > c.maxScore) {
      throw new Error(`${c.label} score ${score} is outside 0-${c.maxScore}`);
    }
    total += score;
  }
  return round2(total);
}

/**
 * Computes a class's term results: per-subject totals, grades and positions,
 * class statistics per subject, and each student's grand total, average and overall position.
 * Students are ranked by average so that students taking different numbers of subjects compare fairly.
 */
export function computeClassResults(
  entries: ScoreEntry[],
  components: AssessmentComponent[],
  scale: GradingScale,
): ClassResult {
  validateComponents(components);

  const seen = new Set<string>();
  for (const e of entries) {
    const key = `${e.studentId}::${e.subjectId}`;
    if (seen.has(key)) throw new Error(`Duplicate score entry for student ${e.studentId}, subject ${e.subjectId}`);
    seen.add(key);
  }

  const totals = entries.map((e) => ({ entry: e, total: subjectTotal(e.scores, components) }));

  const bySubject = new Map<string, typeof totals>();
  for (const t of totals) {
    const list = bySubject.get(t.entry.subjectId) ?? [];
    list.push(t);
    bySubject.set(t.entry.subjectId, list);
  }

  const subjectResults = new Map<string, SubjectResult[]>();
  for (const [subjectId, list] of bySubject) {
    const positions = rank(list, (t) => t.total);
    const values = list.map((t) => t.total);
    const classAverage = round2(values.reduce((a, b) => a + b, 0) / values.length);
    const classHighest = Math.max(...values);
    const classLowest = Math.min(...values);
    for (const t of list) {
      const band = gradeFor(t.total, scale);
      const result: SubjectResult = {
        subjectId,
        scores: t.entry.scores,
        total: t.total,
        grade: band.grade,
        remark: band.remark,
        position: positions.get(t)!,
        classAverage,
        classHighest,
        classLowest,
      };
      const forStudent = subjectResults.get(t.entry.studentId) ?? [];
      forStudent.push(result);
      subjectResults.set(t.entry.studentId, forStudent);
    }
  }

  const students: StudentResult[] = [...subjectResults.entries()].map(([studentId, subjects]) => {
    const grandTotal = round2(subjects.reduce((sum, s) => sum + s.total, 0));
    return {
      studentId,
      subjects: subjects.sort((a, b) => a.subjectId.localeCompare(b.subjectId)),
      grandTotal,
      average: round2(grandTotal / subjects.length),
      position: 0,
      subjectCount: subjects.length,
    };
  });

  const overall = rank(students, (s) => s.average);
  for (const s of students) s.position = overall.get(s)!;
  students.sort((a, b) => a.position - b.position || a.studentId.localeCompare(b.studentId));

  const classAverage = students.length
    ? round2(students.reduce((sum, s) => sum + s.average, 0) / students.length)
    : 0;

  return { students, classAverage, studentCount: students.length };
}

/** Cumulative (annual) average across the terms a student has results for. */
export function cumulativeAverage(termAverages: number[]): number {
  if (termAverages.length === 0) throw new Error('No term averages given');
  return round2(termAverages.reduce((a, b) => a + b, 0) / termAverages.length);
}
