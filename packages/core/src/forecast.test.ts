import { describe, expect, it } from 'vitest';
import {
  absenceStreak,
  describeForecastForParent,
  estimateReadiness,
  meetsBenchmark,
  riskReasons,
  summariseCohort,
  topicsToReteach,
  type ReadinessInput,
} from './index';

const SUBJECTS = [
  { id: 'eng', name: 'English Language', code: 'ENG' },
  { id: 'mth', name: 'Mathematics', code: 'MTH' },
  { id: 'phy', name: 'Physics', code: 'PHY' },
  { id: 'che', name: 'Chemistry', code: 'CHE' },
  { id: 'bio', name: 'Biology', code: 'BIO' },
  { id: 'eco', name: 'Economics', code: 'ECO' },
];

function student(scores: (number | null)[]) {
  const inputs: ReadinessInput[] = SUBJECTS.map((s, i) => ({
    subjectId: s.id,
    subjectName: s.name,
    schoolScore: scores[i] ?? null,
    mockScores: [],
    practiceAccuracy: null,
    practiceAnswered: 0,
  }));
  return estimateReadiness('waec', inputs);
}

describe('exam benchmark', () => {
  it('needs English and Maths at credit plus five credits for WAEC', () => {
    expect(meetsBenchmark('waec', student([60, 55, 70, 52, 65, 40]), SUBJECTS)).toBe(true);
    expect(meetsBenchmark('waec', student([45, 80, 80, 80, 80, 80]), SUBJECTS)).toBe(false);
    expect(meetsBenchmark('waec', student([60, 60, 40, 40, 40, 40]), SUBJECTS)).toBe(false);
  });

  it('stays undecided while a core subject or enough others are unknown', () => {
    expect(meetsBenchmark('waec', student([null, 60, 60, 60, 60, 60]), SUBJECTS)).toBeNull();
    expect(meetsBenchmark('waec', student([60, 60, 60, null, null, null]), SUBJECTS)).toBeNull();
  });

  it('uses the UTME aggregate for JAMB', () => {
    const r = estimateReadiness(
      'jamb',
      SUBJECTS.slice(0, 4).map((s, i) => ({ subjectId: s.id, subjectName: s.name, schoolScore: [70, 60, 55, 50][i], mockScores: [], practiceAccuracy: null, practiceAnswered: 0 })),
    );
    expect(r.jambAggregate).toBe(235);
    expect(meetsBenchmark('jamb', r, SUBJECTS)).toBe(true);
  });
});

describe('cohort forecast', () => {
  it('counts bands, subject credit rates and a projected range', () => {
    const members = [student([70, 70, 70, 70, 70, 70]), student([55, 52, 48, 60, 50, 51]), student([40, 35, 30, 45, 42, 38]), student([null, null, null, null, null, null])].map((r) => ({
      readiness: r,
      meetsBenchmark: meetsBenchmark('waec', r, SUBJECTS),
    }));
    const f = summariseCohort('waec', members);
    expect(f.students).toBe(4);
    expect(f.withEvidence).toBe(3);
    expect(f.bands).toEqual({ on_track: 1, borderline: 1, at_risk: 1, unknown: 1 });
    expect(f.benchmark).toMatchObject({ likely: 2, undecided: 1, unlikely: 1 });
    expect(f.projectedRate).toEqual({ low: 50, high: 75 });
    // Weakest subject first.
    expect(f.subjects[0]).toMatchObject({ subjectId: 'phy', students: 3, credits: 1, atRisk: 2 });
    expect(f.subjects.find((s) => s.subjectId === 'eng')).toMatchObject({ average: 55, creditRate: 67 });
  });
});

describe('topics to reteach', () => {
  it('needs several students and enough answers, weakest first', () => {
    const out = topicsToReteach([
      { subjectId: 'p', subjectName: 'Physics', topic: "Ohm's law", attempted: 20, correct: 6, students: 5 },
      { subjectId: 'p', subjectName: 'Physics', topic: 'Waves', attempted: 20, correct: 10, students: 5 },
      { subjectId: 'p', subjectName: 'Physics', topic: 'Motion', attempted: 20, correct: 18, students: 5 },
      { subjectId: 'p', subjectName: 'Physics', topic: 'Lenses', attempted: 20, correct: 0, students: 1 },
    ]);
    expect(out.map((t) => [t.topic, t.accuracy])).toEqual([
      ["Ohm's law", 30],
      ['Waves', 50],
    ]);
  });
});

describe('at-risk signals', () => {
  it('flags absence streaks, readiness and falling scores, most serious first', () => {
    expect(absenceStreak(['absent', 'excused', 'absent', 'absent', 'present', 'absent'])).toBe(3);
    const r = riskReasons({ attendanceRate: 70, consecutiveAbsences: 3, readinessBand: 'borderline', scoreDrop: 12, subjectsAtRisk: 2 });
    expect(r.map((x) => x.code)).toEqual(['absent_streak', 'score_drop', 'weak_subjects']);
    expect(riskReasons({ attendanceRate: 95, consecutiveAbsences: 0, readinessBand: 'on_track', scoreDrop: -3, subjectsAtRisk: 0 })).toEqual([]);
    expect(riskReasons({ attendanceRate: 60, consecutiveAbsences: 1, readinessBand: 'at_risk', scoreDrop: null, subjectsAtRisk: 4 }).map((x) => x.code)).toEqual(['low_attendance', 'readiness']);
  });
});

describe('parent wording', () => {
  it('says how the child is doing and what to do at home', () => {
    const t = describeForecastForParent('Ada', 'waec', student([60, 45, 70, 52, 65, 40]), [{ subjectName: 'Mathematics', topic: 'Quadratic equations' }]);
    expect(t.headline).toBe('Ada is close, but not yet safe, for WAEC (WASSCE).');
    expect(t.lines[0]).toContain('4 of 6 subjects');
    expect(t.lines.join(' ')).toContain('Needs work in Economics and Mathematics.');
    expect(t.atHome[0]).toContain('Quadratic equations (Mathematics)');
  });

  it('explains when there is nothing to forecast yet', () => {
    const t = describeForecastForParent('Ada', 'bece', student([null, null, null, null, null, null]), []);
    expect(t.headline).toContain('not have enough results');
  });
});
