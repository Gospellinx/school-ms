import { describe, expect, it } from 'vitest';
import {
  BASIC_SCALE,
  DEFAULT_COMPONENTS,
  WAEC_SCALE,
  computeClassResults,
  cumulativeAverage,
  gradeFor,
  ordinal,
  rank,
  subjectTotal,
  validateComponents,
  validateScale,
} from './index';

describe('grading', () => {
  it('ships valid default scales', () => {
    expect(() => validateScale(WAEC_SCALE)).not.toThrow();
    expect(() => validateScale(BASIC_SCALE)).not.toThrow();
  });

  it('grades band edges correctly', () => {
    expect(gradeFor(75, WAEC_SCALE).grade).toBe('A1');
    expect(gradeFor(74.99, WAEC_SCALE).grade).toBe('B2');
    expect(gradeFor(74.5, WAEC_SCALE).grade).toBe('B2');
    expect(gradeFor(39.99, WAEC_SCALE).grade).toBe('F9');
    expect(gradeFor(0, BASIC_SCALE).grade).toBe('F');
    expect(gradeFor(100, BASIC_SCALE).grade).toBe('A');
  });

  it('rejects overlapping or incomplete scales', () => {
    expect(() =>
      validateScale([
        { min: 0, max: 50, grade: 'F', remark: '' },
        { min: 50, max: 100, grade: 'A', remark: '' },
      ]),
    ).toThrow(/overlap/);
    expect(() => validateScale([{ min: 0, max: 90, grade: 'A', remark: '' }])).toThrow(/end at 100/);
  });
});

describe('ranking', () => {
  it('shares positions on ties and skips the next', () => {
    const items = [{ v: 90 }, { v: 80 }, { v: 90 }, { v: 70 }];
    const r = rank(items, (i) => i.v);
    expect(items.map((i) => r.get(i))).toEqual([1, 3, 1, 4]);
  });

  it('formats ordinals', () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 101, 111].map(ordinal)).toEqual([
      '1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '23rd', '101st', '111th',
    ]);
  });
});

describe('subject totals', () => {
  it('adds components and treats missing as zero', () => {
    expect(subjectTotal({ ca1: 15, ca2: 18, exam: 52 }, DEFAULT_COMPONENTS)).toBe(85);
    expect(subjectTotal({ exam: 40 }, DEFAULT_COMPONENTS)).toBe(40);
  });

  it('rejects scores above the maximum, negatives and unknown components', () => {
    expect(() => subjectTotal({ ca1: 21 }, DEFAULT_COMPONENTS)).toThrow(/outside 0-20/);
    expect(() => subjectTotal({ exam: -1 }, DEFAULT_COMPONENTS)).toThrow();
    expect(() => subjectTotal({ ca3: 5 }, DEFAULT_COMPONENTS)).toThrow(/Unknown/);
  });

  it('requires components to add up to 100', () => {
    expect(() => validateComponents([{ key: 'exam', label: 'Exam', maxScore: 70 }])).toThrow(/100/);
  });
});

describe('class results', () => {
  const entries = [
    { studentId: 'ada', subjectId: 'eng', scores: { ca1: 18, ca2: 17, exam: 50 } }, // 85
    { studentId: 'ada', subjectId: 'mth', scores: { ca1: 15, ca2: 15, exam: 40 } }, // 70
    { studentId: 'bayo', subjectId: 'eng', scores: { ca1: 10, ca2: 10, exam: 30 } }, // 50
    { studentId: 'bayo', subjectId: 'mth', scores: { ca1: 20, ca2: 20, exam: 60 } }, // 100
    { studentId: 'chi', subjectId: 'eng', scores: { ca1: 18, ca2: 17, exam: 50 } }, // 85
  ];

  const result = computeClassResults(entries, DEFAULT_COMPONENTS, WAEC_SCALE);
  const byId = Object.fromEntries(result.students.map((s) => [s.studentId, s]));

  it('computes subject positions with ties and class statistics', () => {
    const adaEng = byId.ada.subjects.find((s) => s.subjectId === 'eng')!;
    const chiEng = byId.chi.subjects.find((s) => s.subjectId === 'eng')!;
    const bayoEng = byId.bayo.subjects.find((s) => s.subjectId === 'eng')!;
    expect([adaEng.position, chiEng.position, bayoEng.position]).toEqual([1, 1, 3]);
    expect(adaEng.classHighest).toBe(85);
    expect(adaEng.classLowest).toBe(50);
    expect(adaEng.classAverage).toBe(73.33);
    expect(adaEng.grade).toBe('A1');
    expect(bayoEng.grade).toBe('C6');
  });

  it('ranks students by average across the subjects they took', () => {
    expect(byId.chi.average).toBe(85);
    expect(byId.ada.average).toBe(77.5);
    expect(byId.bayo.average).toBe(75);
    expect([byId.chi.position, byId.ada.position, byId.bayo.position]).toEqual([1, 2, 3]);
    expect(result.students.map((s) => s.studentId)).toEqual(['chi', 'ada', 'bayo']);
    expect(byId.ada.grandTotal).toBe(155);
    expect(byId.chi.subjectCount).toBe(1);
    expect(result.classAverage).toBe(79.17);
  });

  it('rejects duplicate entries for the same student and subject', () => {
    expect(() =>
      computeClassResults([entries[0], entries[0]], DEFAULT_COMPONENTS, WAEC_SCALE),
    ).toThrow(/Duplicate/);
  });

  it('handles an empty class', () => {
    expect(computeClassResults([], DEFAULT_COMPONENTS, BASIC_SCALE)).toEqual({
      students: [],
      classAverage: 0,
      studentCount: 0,
    });
  });
});

describe('cumulative average', () => {
  it('averages term averages', () => {
    expect(cumulativeAverage([70, 75.5, 80])).toBe(75.17);
  });
});
