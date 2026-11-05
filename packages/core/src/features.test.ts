import { describe, expect, it } from 'vitest';
import {
  buildStudyProfile,
  formatNaira,
  gradeAttempt,
  invoiceStatus,
  normalizeNigerianPhone,
  pickPracticeQuestions,
  scaleToComponent,
  seededShuffle,
} from './index';

describe('normalizeNigerianPhone', () => {
  it('accepts the usual ways parents write numbers', () => {
    for (const n of ['08031234567', '+2348031234567', '234 803 123 4567', '8031234567', '0803-123-4567']) {
      expect(normalizeNigerianPhone(n)).toBe('2348031234567');
    }
    expect(normalizeNigerianPhone('09121234567')).toBe('2349121234567');
  });

  it('rejects numbers that are not Nigerian mobiles', () => {
    for (const n of ['0803123456', '12345', '0603123456 7', 'abc', '+447700900123']) {
      expect(normalizeNigerianPhone(n)).toBeNull();
    }
  });
});

describe('money', () => {
  it('formats kobo as naira', () => {
    expect(formatNaira(15_000_00)).toBe('₦15,000');
    expect(formatNaira(15_000_50)).toBe('₦15,000.50');
  });

  it('works out invoice status', () => {
    expect(invoiceStatus(1000, 0)).toBe('unpaid');
    expect(invoiceStatus(1000, 400)).toBe('part_paid');
    expect(invoiceStatus(1000, 1000)).toBe('paid');
  });
});

describe('CBT grading', () => {
  it('marks answers case-insensitively and counts blanks as zero', () => {
    const result = gradeAttempt(
      [
        { id: 'q1', answer: 'A' },
        { id: 'q2', answer: 'c', marks: 2 },
        { id: 'q3', answer: 'B' },
      ],
      { q1: 'a', q2: 'B' },
    );
    expect(result).toMatchObject({ score: 1, maxScore: 4, percentage: 25, answered: 2, correctCount: 1 });
    expect(result.answers[2]).toMatchObject({ chosen: null, correct: false });
  });

  it('scales a percentage into a score component', () => {
    expect(scaleToComponent(75, 20)).toBe(15);
    expect(scaleToComponent(33.33, 60)).toBe(20);
  });

  it('shuffles the same way for the same seed', () => {
    const items = Array.from({ length: 20 }, (_, i) => i);
    expect(seededShuffle(items, 'abc')).toEqual(seededShuffle(items, 'abc'));
    expect(seededShuffle(items, 'abc')).not.toEqual(items);
    expect([...seededShuffle(items, 'abc')].sort((a, b) => a - b)).toEqual(items);
  });
});

describe('study profile', () => {
  const results = [
    { subjectId: 'mth', subjectName: 'Mathematics', termOrder: 1, termLabel: 'First Term', total: 62 },
    { subjectId: 'mth', subjectName: 'Mathematics', termOrder: 2, termLabel: 'Second Term', total: 45 },
    { subjectId: 'eng', subjectName: 'English Language', termOrder: 2, termLabel: 'Second Term', total: 80 },
    { subjectId: 'phy', subjectName: 'Physics', termOrder: 2, termLabel: 'Second Term', total: 58 },
  ];
  const topics = [
    { subjectId: 'mth', topic: 'Quadratic equations', attempted: 10, correct: 3 },
    { subjectId: 'mth', topic: 'Indices', attempted: 5, correct: 5 },
    { subjectId: 'mth', topic: 'Logarithms', attempted: 2, correct: 0 }, // too few attempts to judge
    { subjectId: 'phy', topic: 'Motion', attempted: 4, correct: 2 },
  ];

  it('puts a falling, below-credit subject first with its weak topics', () => {
    const profile = buildStudyProfile(results, topics);
    expect(profile.subjects.map((s) => s.subjectId)).toEqual(['mth', 'phy', 'eng']);
    const maths = profile.subjects[0];
    expect(maths).toMatchObject({ latestScore: 45, trend: -17, belowCredit: true });
    expect(maths.weakTopics.map((t) => t.topic)).toEqual(['Quadratic equations']);
    expect(maths.reasons.join(' ')).toMatch(/below the credit line/);
    expect(profile.overallAverage).toBe(61);
  });

  it('picks mostly weak-topic questions the student has not mastered', () => {
    const pool = [
      ...Array.from({ length: 6 }, (_, i) => ({ id: `w${i}`, topic: 'Quadratic equations' })),
      ...Array.from({ length: 6 }, (_, i) => ({ id: `o${i}`, topic: 'Indices' })),
    ];
    const picked = pickPracticeQuestions(pool, {
      weakTopics: ['quadratic equations'],
      mastered: new Set(['w0', 'w1']),
      count: 6,
      seed: 's1',
    });
    expect(picked).toHaveLength(6);
    expect(picked.filter((id) => id.startsWith('w'))).toHaveLength(4);
    expect(picked).not.toContain('w0');
    expect(picked).not.toContain('w1');
  });
});
