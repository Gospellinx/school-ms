import { describe, expect, it } from 'vitest';
import {
  buildCountdownPlan,
  chunkSections,
  compatibleTags,
  defaultExamDate,
  estimateReadiness,
  examsForSection,
  jambAggregate,
  parseSchemeOfWork,
  planMock,
  screenStudentMessage,
  toSearchQuery,
  waecGrade,
} from './index';

describe('knowledge base chunks', () => {
  it('splits by week headings and keeps the week as the citation', () => {
    const text = 'SS 2 Physics, First Term\n\nWeek 1: Motion\nSpeed is distance over time.\n\nWeek 2: Electricity\nOhm\'s law says V = IR.';
    const chunks = chunkSections([{ locator: null, text }]);
    expect(chunks.map((c) => c.locator)).toEqual([null, 'Week 1', 'Week 2']);
    expect(chunks[2].text).toContain('V = IR');
    expect(chunks.map((c) => c.ordinal)).toEqual([0, 1, 2]);
  });

  it('keeps page locators and breaks long pages into pieces under the limit', () => {
    const long = Array.from({ length: 60 }, (_, i) => `Sentence number ${i} explains a key idea about osmosis in plant cells.`).join(' ');
    const chunks = chunkSections([{ locator: 'Page 4', text: long }]);
    expect(chunks.length).toBeGreaterThan(2);
    expect(chunks.every((c) => c.locator === 'Page 4' && c.text.length <= 1600)).toBe(true);
  });

  it('reads weekly topics from a scheme of work', () => {
    const outline = parseSchemeOfWork('WEEK 1 - Revision\nWeek 2: Topic: Electric circuits\nwk 3. Ohm’s law\nWeek 3: duplicate\nNotes');
    expect(outline).toEqual([
      { week: 1, topic: 'Revision' },
      { week: 2, topic: 'Electric circuits' },
      { week: 3, topic: 'Ohm’s law' },
    ]);
  });

  it('turns a question into an OR prefix query without filler words', () => {
    expect(toSearchQuery('Please explain what Ohm’s law is?')).toBe('ohm:* | law:*');
    expect(toSearchQuery('what is it?')).toBeNull();
  });
});

describe('exam formats and mocks', () => {
  it('offers the right exams for each section', () => {
    expect(examsForSection('senior_secondary').sort()).toEqual(['jamb', 'neco', 'waec']);
    expect(examsForSection('junior_secondary')).toEqual(['bece']);
    expect(examsForSection('nursery')).toEqual([]);
    expect(compatibleTags('jamb')[0]).toBe('jamb');
  });

  it('shapes a JAMB mock with English first and keeps the pace on a short mock', () => {
    const subjects = [
      { subjectId: 'eng', available: 100 },
      { subjectId: 'mth', available: 100 },
      { subjectId: 'phy', available: 6 },
      { subjectId: 'che', available: 100 },
    ];
    const full = planMock('jamb', subjects, 'full');
    expect(full.subjects.map((s) => s.count)).toEqual([60, 40, 6, 40]);
    expect(full.minutes).toBe(Math.round((120 * 146) / 180));
    const short = planMock('jamb', subjects, 'short');
    expect(short.subjects.map((s) => s.count)).toEqual([15, 10, 6, 10]);
    expect(jambAggregate([60, 55, 70, 45])).toBe(230);
    expect(waecGrade(72)).toBe('B2');
    expect(waecGrade(49)).toBe('D7');
  });

  it('picks the next usual exam date', () => {
    expect(defaultExamDate('jamb', '2026-11-06')).toBe('2027-04-20');
    expect(defaultExamDate('waec', '2027-03-01')).toBe('2027-05-05');
  });
});

describe('countdown study plan', () => {
  it('starts with weak topics, schedules mocks and ends with revision', () => {
    const plan = buildCountdownPlan('2026-11-06', '2026-12-18', [
      { subjectId: 'phy', subjectName: 'Physics', priority: 40, weakTopics: ['Electricity'], topics: ['Motion', 'Electricity', 'Waves'] },
      { subjectId: 'mth', subjectName: 'Mathematics', priority: 10, weakTopics: [], topics: ['Indices', 'Logarithms'] },
    ], { slotsPerWeek: 2 });
    expect(plan.daysLeft).toBe(42);
    expect(plan.weeks).toHaveLength(6);
    expect(plan.weeks[0].focus[0]).toMatchObject({ subject: 'Physics', topic: 'Electricity', kind: 'fix' });
    expect(plan.weeks[2].mock).toBe(true);
    expect(plan.weeks.at(-1)).toMatchObject({ mock: true, focus: [{ topic: 'Electricity', kind: 'revise' }] });
    expect(plan.weeks[1].startsOn).toBe('2026-11-13');
  });
});

describe('readiness', () => {
  it('blends mocks, school results and practice, and counts likely credits', () => {
    const r = estimateReadiness('waec', [
      { subjectId: 'a', subjectName: 'Maths', schoolScore: 70, mockScores: [40, 60, 70], practiceAccuracy: 80, practiceAnswered: 20 },
      { subjectId: 'b', subjectName: 'Physics', schoolScore: 42, mockScores: [], practiceAccuracy: null, practiceAnswered: 0 },
      { subjectId: 'c', subjectName: 'Biology', schoolScore: null, mockScores: [], practiceAccuracy: null, practiceAnswered: 0 },
    ]);
    expect(r.subjects[0]).toMatchObject({ predicted: 70, band: 'on_track', confidence: 'high' });
    expect(r.subjects[1]).toMatchObject({ predicted: 42, band: 'at_risk', confidence: 'low' });
    expect(r.subjects[2].band).toBe('unknown');
    expect(r.creditsLikely).toBe(1);
    expect(r.jambAggregate).toBeNull();
  });
});

describe('tutor safety screen', () => {
  it('flags safeguarding concerns and inappropriate requests', () => {
    expect(screenStudentMessage('I want to die, nobody cares').category).toBe('safeguarding');
    expect(screenStudentMessage('My uncle touched me').category).toBe('safeguarding');
    expect(screenStudentMessage('how do I make a bomb').category).toBe('inappropriate');
    expect(screenStudentMessage('Explain how a bomb calorimeter works').category).toBeNull();
    expect(screenStudentMessage('What is cell division?').category).toBeNull();
  });

  it('masks phone numbers and emails', () => {
    const r = screenStudentMessage('call me on 0803 123 4567 or ada@mail.com');
    expect(r.category).toBe('personal_info');
    expect(r.cleaned).toBe('call me on [number removed] or [email removed]');
  });
});
