import { describe, expect, it } from 'vitest';
import { lessonCoverage, matchReadRows, nameSimilarity, titleMatchesTopic, weekOfTerm } from './index';

const components = [
  { key: 'ca1', label: '1st CA', maxScore: 20 },
  { key: 'ca2', label: '2nd CA', maxScore: 20 },
  { key: 'exam', label: 'Exam', maxScore: 60 },
];

const roster = [
  { studentId: 's1', name: 'Adebayo Toluwani', admissionNumber: 'GCIS/S/001' },
  { studentId: 's2', name: 'Okafor Chukwuemeka', admissionNumber: 'GCIS/S/002' },
  { studentId: 's3', name: 'Bello Aisha', admissionNumber: 'GCIS/S/003' },
  { studentId: 's4', name: 'Bello Amina', admissionNumber: 'GCIS/S/004' },
];

describe('snap-to-score name matching', () => {
  it('matches names in any order, with initials and small spelling slips', () => {
    expect(nameSimilarity('Toluwani Adebayo', 'Adebayo Toluwani')).toBe(1);
    expect(nameSimilarity('ADEBAYO T.', 'Adebayo Toluwani')).toBeGreaterThan(0.85);
    expect(nameSimilarity('Okafor Chukwuemka', 'Okafor Chukwuemeka')).toBeGreaterThan(0.9);
    expect(nameSimilarity('Okafor Chukwu', 'Okafor Chukwuemeka')).toBeGreaterThan(0.85);
    expect(nameSimilarity('Bello Aisha', 'Bello Amina')).toBeLessThan(0.75);
  });

  it('matches rows to students, checks maximums and lists what is left over', () => {
    const r = matchReadRows(
      roster,
      [
        { line: 1, name: 'Adebayo T.', scores: { ca1: 15, ca2: 18, exam: 52 } },
        { line: 2, name: 'Okafor Chukwuemka', scores: { ca1: 12, ca2: null, exam: 75 } },
        { line: 3, name: 'Bello Aisha', scores: { ca1: 19.5, ca2: 17, exam: 48 }, unclear: ['exam'] },
        { line: 4, name: 'Musa Ibrahim', scores: { ca1: 10, ca2: 10, exam: 30 } },
      ],
      components,
    );
    expect(r.matches.map((m) => [m.line, m.studentId, m.confidence])).toEqual([
      [1, 's1', 'medium'],
      [2, 's2', 'medium'],
      [3, 's3', 'medium'],
    ]);
    // 75 is above the exam maximum of 60, so it is left for the teacher to fix.
    expect(r.matches[1]!.scores).toEqual({ ca1: 12 });
    expect(r.matches[1]!.check).toEqual(['exam']);
    expect(r.matches[1]!.issues[0]).toBe('Exam reads as 75, but the most is 60');
    expect(r.matches[2]!.scores).toEqual({ ca1: 19.5, ca2: 17, exam: 48 });
    expect(r.matches[2]!.check).toEqual(['exam']);
    expect(r.unmatched.map((u) => u.name)).toEqual(['Musa Ibrahim']);
    expect(r.missing).toEqual(['s4']);
  });

  it('trusts an admission number over the name', () => {
    const r = matchReadRows(roster, [{ line: 1, name: 'Amina B', admissionNumber: 'gcis s 004', scores: { exam: 40 } }], components);
    expect(r.matches).toEqual([{ studentId: 's4', line: 1, nameAsWritten: 'Amina B', confidence: 'high', scores: { exam: 40 }, check: [], issues: [] }]);
  });

  it('never gives two rows to the same student', () => {
    const r = matchReadRows(
      roster,
      [
        { line: 1, name: 'Bello Aisha', scores: { exam: 40 } },
        { line: 2, name: 'Bello Aisha', scores: { exam: 41 } },
      ],
      components,
    );
    expect(r.matches.map((m) => m.studentId)).toEqual(['s3']);
    expect(r.unmatched.map((u) => u.line)).toEqual([2]);
  });
});

describe('lesson notes book', () => {
  const outline = [
    { week: 1, topic: 'Electric charges' },
    { week: 2, topic: "Ohm's law" },
    { week: 3, topic: 'Resistors in series and parallel' },
    { week: 4, topic: 'Electrical energy and power' },
  ];

  it('places notes by week, then by title, and counts the weeks so far', () => {
    const c = lessonCoverage(
      outline,
      [
        { id: 'n1', kind: 'lesson_note', title: 'Lesson note: Electric charges', week: 1, vetted: true },
        { id: 'p1', kind: 'lesson_plan', title: 'Lesson plan: Electric charges', week: 1, vetted: false },
        { id: 'n3', kind: 'lesson_note', title: 'Resistors in series and in parallel', week: null, vetted: false },
        { id: 'n9', kind: 'lesson_note', title: 'Magnetism', week: null, vetted: false },
      ],
      3,
    );
    expect(c.rows.map((r) => [r.week, r.noteId, r.planId, r.vetted])).toEqual([
      [1, 'n1', 'p1', true],
      [2, null, null, false],
      [3, 'n3', null, false],
      [4, null, null, false],
    ]);
    expect(c.extra).toEqual(['n9']);
    expect(c.missingWeeks).toEqual([2]);
    expect(c.percent).toBe(67);
  });

  it('matches titles to topics by most of their words', () => {
    expect(titleMatchesTopic("Lesson plan: Ohm's Law", "Ohm's law")).toBe(true);
    expect(titleMatchesTopic('Electrical energy', 'Electrical energy and power')).toBe(false);
  });

  it('works out the week of term, Monday to Sunday', () => {
    expect(weekOfTerm('2026-09-14', '2026-09-14')).toBe(1);
    expect(weekOfTerm('2026-09-16', '2026-09-20')).toBe(1);
    expect(weekOfTerm('2026-09-16', '2026-09-21')).toBe(2);
    expect(weekOfTerm('2026-09-14', '2026-11-06')).toBe(8);
    expect(weekOfTerm('2026-09-14', '2026-09-01')).toBeNull();
  });
});
