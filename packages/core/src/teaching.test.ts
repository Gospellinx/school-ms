import { describe, expect, it } from 'vitest';
import { draftRemark, keyTerms, parseRubric, percentSoFar, scaleMark, suggestMarks, watchStudent } from './index';

describe('marking schemes', () => {
  it('reads marks at the start or the end of each line', () => {
    expect(
      parseRubric("1. State Ohm's law (2)\n2 marks: correct formula V = IR\n- Correct unit - 1\n[1] Labelled diagram\nNeat work"),
    ).toEqual([
      { point: "State Ohm's law", marks: 2 },
      { point: 'correct formula V = IR', marks: 2 },
      { point: 'Correct unit', marks: 1 },
      { point: 'Labelled diagram', marks: 1 },
      { point: 'Neat work', marks: 1 },
    ]);
  });

  it('gives a first marking by matching the key words of each point', () => {
    expect(keyTerms('State that current is directly proportional to voltage')).toEqual(['curren', 'direct', 'propor', 'voltag']);
    const rubric = [
      { point: 'Current is directly proportional to potential difference', marks: 2 },
      { point: 'Temperature and physical conditions constant', marks: 1 },
      { point: 'Unit of resistance is the ohm', marks: 1 },
    ];
    const s = suggestMarks('Ohms law says the current through a conductor is directly proportional to the potential difference across it.', rubric);
    expect(s.criteria.map((c) => c.awarded)).toEqual([2, 0, 0.5]);
    expect(s).toMatchObject({ total: 2.5, max: 4 });
    expect(s.feedback).toContain('Temperature');
    expect(scaleMark(7, 10, 20)).toBe(14);

    // Numbers must match: a wrong final answer earns nothing for that point.
    const sums = [{ point: 'log2 8 = 3', marks: 1 }, { point: 'log5 25 = 2', marks: 1 }, { point: 'Final answer 3 + 3 - 2 = 4', marks: 2 }];
    expect(suggestMarks('2^3 = 8 so log2 8 = 3. Answer 6', sums).criteria.map((c) => c.awarded)).toEqual([1, 0, 0]);
    expect(suggestMarks('log2 8 = 3, log3 27 = 3, log5 25 = 2, so 3 + 3 - 2 = 4', sums).total).toBe(4);
    expect(scaleMark(12, 10, 20)).toBe(20);
  });
});

describe('report card remarks', () => {
  it('names a strength and a weak subject, and keeps to 30 words', () => {
    const r = draftRemark({
      key: 's1',
      firstName: 'Chiamaka',
      average: 62,
      position: 2,
      outOf: 12,
      previousAverage: 55,
      subjects: [
        { name: 'Physics', total: 48 },
        { name: 'English Language', total: 78 },
        { name: 'Mathematics', total: 60 },
      ],
    });
    expect(r.teacherComment).toContain('Strong in English Language');
    expect(r.teacherComment).toContain('Physics');
    expect(r.teacherComment).toContain('improvement');
    expect(r.teacherComment.split(/\s+/).length).toBeLessThanOrEqual(30);
    expect(r.headComment.length).toBeGreaterThan(5);
  });
});

describe('students falling behind', () => {
  it('scores only the components entered so far', () => {
    const comps = [
      { key: 'ca1', label: '1st CA', maxScore: 20 },
      { key: 'ca2', label: '2nd CA', maxScore: 20 },
      { key: 'exam', label: 'Exam', maxScore: 60 },
    ];
    expect(percentSoFar({ ca1: 15, ca2: 10 }, comps)).toBe(62.5);
    expect(percentSoFar({}, comps)).toBeNull();
  });

  it('flags drops, low scores, attendance and missed tests, with reasons', () => {
    const high = watchStudent({
      subjects: [
        { name: 'Mathematics', current: 35, previous: 62 },
        { name: 'Physics', current: 41, previous: 58 },
        { name: 'English Language', current: 66, previous: 70 },
      ],
      passMark: 50,
      attendanceRate: 0.7,
      missedTests: 1,
      recentPractice: 0,
    });
    expect(high.level).toBe('high');
    expect(high.reasons.map((r) => r.code)).toEqual(['drop', 'below_pass', 'attendance', 'missed_tests', 'inactive']);
    expect(high.reasons[0].text).toBe('Average down 16 points since last term');

    const fine = watchStudent({ subjects: [{ name: 'Mathematics', current: 72, previous: 70 }], passMark: 50, attendanceRate: 0.95, missedTests: 0, recentPractice: 3 });
    expect(fine).toMatchObject({ level: null, reasons: [] });

    const medium = watchStudent({ subjects: [{ name: 'Chemistry', current: 44, previous: null }], passMark: 50, missedTests: 1, recentPractice: 2 });
    expect(medium.level).toBe('medium');

    const failing = watchStudent({
      subjects: ['Mathematics', 'Physics', 'Chemistry'].map((name) => ({ name, current: 40, previous: null })),
      passMark: 50,
      missedTests: 0,
      recentPractice: 4,
    });
    expect(failing.level).toBe('high');
  });
});
