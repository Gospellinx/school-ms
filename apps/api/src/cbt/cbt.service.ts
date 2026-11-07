import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { EXAM_FORMATS, gradeAttempt, jambAggregate, scaleToComponent, seededShuffle, waecGrade } from '@school-ms/core';
import { and, asc, desc, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm';
import { Principal, StudentPrincipal } from '../auth/auth.types';
import { assertOwned } from '../common/owned';
import { found } from '../common/validation';
import { Tx } from '../db/client';
import { DbService } from '../db/db.service';
import {
  cbtAttempts,
  cbtTestClasses,
  cbtTestQuestions,
  cbtTests,
  classes,
  classSubjects,
  questions,
  scores,
  sections,
  students,
  subjects,
  terms,
} from '../db/schema';

type Attempt = typeof cbtAttempts.$inferSelect;
type Question = typeof questions.$inferSelect;

/** Answers saved this long after the deadline still count, to allow for slow networks. */
const GRACE_MS = 30_000;

export interface TestInput {
  title: string;
  subjectId: string;
  termId?: string;
  durationMinutes: number;
  opensAt?: string;
  closesAt?: string;
  classIds: string[];
  questionIds: string[];
  marks?: Record<string, number>;
  shuffleQuestions: boolean;
  showResults: boolean;
  scoreComponent?: string;
  /** 'entrance' tests are admissions exams: no classes, questions may span subjects, sat by applicants. */
  purpose?: 'class' | 'entrance';
}

@Injectable()
export class CbtService {
  constructor(private readonly dbs: DbService) {}

  // ------------------------------------------------------------ Staff: tests

  private async assertTeaches(tx: Tx, user: Principal, subjectId: string, classIds: string[]) {
    if (user.role !== 'teacher') return;
    // Entrance exams have no classes, so only leadership manages them.
    if (classIds.length === 0) throw new ForbiddenException('Only school leadership can manage entrance exams');
    const links = await tx
      .select({ classId: classSubjects.classId })
      .from(classSubjects)
      .where(and(eq(classSubjects.subjectId, subjectId), eq(classSubjects.teacherId, user.staffId), inArray(classSubjects.classId, classIds)));
    if (links.length !== new Set(classIds).size) throw new ForbiddenException('You can only set tests for subjects you teach in those classes');
  }

  createTest(user: Principal, input: TestInput) {
    if (input.opensAt && input.closesAt && input.opensAt >= input.closesAt) throw new BadRequestException('The test must open before it closes');
    const entrance = input.purpose === 'entrance';
    if (entrance && user.role === 'teacher') throw new ForbiddenException('Only school leadership can set entrance exams');
    if (entrance && (input.classIds.length || input.scoreComponent)) throw new BadRequestException('Entrance exams are not set for classes or score sheets');
    if (!entrance && input.classIds.length === 0) throw new BadRequestException('Choose at least one class');
    return this.dbs.withSchool(user.schoolId, async (tx) => {
      await assertOwned(tx, subjects, input.subjectId, 'Subject');
      if (input.termId) await assertOwned(tx, terms, input.termId, 'Term');
      const classIds = [...new Set(input.classIds)];
      const owned = await tx.select({ id: classes.id, sectionId: classes.sectionId }).from(classes).where(inArray(classes.id, classIds));
      if (owned.length !== classIds.length) throw new NotFoundException('Class not found');
      await this.assertTeaches(tx, user, input.subjectId, classIds);

      if (input.scoreComponent) {
        if (!input.termId) throw new BadRequestException('Choose the term the CBT score counts towards');
        const secs = await tx.select().from(sections).where(inArray(sections.id, owned.map((c) => c.sectionId)));
        for (const s of secs) {
          if (!s.components.some((c) => c.key === input.scoreComponent)) {
            throw new BadRequestException(`${s.name} has no score component "${input.scoreComponent}"`);
          }
        }
      }

      const qIds = [...new Set(input.questionIds)];
      const qs = qIds.length ? await tx.select().from(questions).where(inArray(questions.id, qIds)) : [];
      if (qs.length !== qIds.length) throw new NotFoundException('Question not found');
      // An entrance exam usually mixes subjects (e.g. English and Mathematics); a class test has one.
      if (!entrance && qs.some((q) => q.subjectId !== input.subjectId)) throw new BadRequestException('Every question must be for the test subject');

      const [test] = await tx
        .insert(cbtTests)
        .values({
          schoolId: user.schoolId,
          title: input.title,
          subjectId: input.subjectId,
          termId: input.termId,
          durationMinutes: input.durationMinutes,
          opensAt: input.opensAt ? new Date(input.opensAt) : null,
          closesAt: input.closesAt ? new Date(input.closesAt) : null,
          shuffleQuestions: input.shuffleQuestions,
          showResults: input.showResults,
          scoreComponent: input.scoreComponent,
          purpose: input.purpose ?? 'class',
          createdBy: user.staffId,
        })
        .returning();
      if (classIds.length) await tx.insert(cbtTestClasses).values(classIds.map((classId) => ({ schoolId: user.schoolId, testId: test.id, classId })));
      if (qIds.length) {
        await tx.insert(cbtTestQuestions).values(
          qIds.map((questionId, position) => ({
            schoolId: user.schoolId,
            testId: test.id,
            questionId,
            position,
            marks: input.marks?.[questionId] ?? 1,
          })),
        );
      }
      return this.testDetail(tx, test.id);
    });
  }

  private async testDetail(tx: Tx, testId: string) {
    const [test] = await tx.select().from(cbtTests).where(eq(cbtTests.id, testId));
    found(test, 'Test');
    const classRows = await tx
      .select({ id: classes.id, name: classes.name, arm: classes.arm })
      .from(cbtTestClasses)
      .innerJoin(classes, eq(classes.id, cbtTestClasses.classId))
      .where(eq(cbtTestClasses.testId, testId));
    const qRows = await tx
      .select({ question: questions, marks: cbtTestQuestions.marks, position: cbtTestQuestions.position })
      .from(cbtTestQuestions)
      .innerJoin(questions, eq(questions.id, cbtTestQuestions.questionId))
      .where(eq(cbtTestQuestions.testId, testId))
      .orderBy(asc(cbtTestQuestions.position));
    return {
      ...test,
      classes: classRows,
      totalMarks: qRows.reduce((s, q) => s + q.marks, 0),
      questions: qRows.map((q) => ({ ...q.question, marks: q.marks })),
    };
  }

  listTests(user: Principal) {
    return this.dbs.withSchool(user.schoolId, (tx) =>
      tx
        .select()
        .from(cbtTests)
        .where(user.role === 'teacher' ? eq(cbtTests.purpose, 'class') : undefined)
        .orderBy(desc(cbtTests.createdAt)),
    );
  }

  getTest(user: Principal, testId: string) {
    return this.dbs.withSchool(user.schoolId, (tx) => this.testDetail(tx, testId));
  }

  setStatus(user: Principal, testId: string, status: 'published' | 'closed') {
    return this.dbs.withSchool(user.schoolId, async (tx) => {
      const detail = await this.testDetail(tx, testId);
      await this.assertTeaches(tx, user, detail.subjectId, detail.classes.map((c) => c.id));
      if (status === 'published' && detail.questions.length === 0) throw new BadRequestException('Add questions before publishing');
      const [row] = await tx.update(cbtTests).set({ status }).where(eq(cbtTests.id, testId)).returning();
      return row;
    });
  }

  /** Scores per student, plus how many got each question right (item analysis). */
  results(user: Principal, testId: string) {
    return this.dbs.withSchool(user.schoolId, async (tx) => {
      const detail = await this.testDetail(tx, testId);
      await this.assertTeaches(tx, user, detail.subjectId, detail.classes.map((c) => c.id));
      await this.finaliseExpired(tx, { testId });
      const roster = await tx
        .select()
        .from(students)
        .where(inArray(students.classId, detail.classes.map((c) => c.id)))
        .orderBy(asc(students.lastName), asc(students.firstName));
      const attempts = await tx.select().from(cbtAttempts).where(eq(cbtAttempts.testId, testId));
      const byStudent = new Map(attempts.map((a) => [a.studentId, a]));
      const submitted = attempts.filter((a) => a.submittedAt);
      const items = detail.questions.map((q) => {
        const answered = submitted.filter((a) => a.answers[q.id] !== undefined);
        const correct = answered.filter((a) => a.answers[q.id].toUpperCase() === q.answer).length;
        return {
          questionId: q.id,
          topic: q.topic,
          answered: answered.length,
          correct,
          percentCorrect: submitted.length ? Math.round((correct / submitted.length) * 1000) / 10 : null,
        };
      });
      return {
        test: { id: detail.id, title: detail.title, totalMarks: detail.totalMarks, status: detail.status },
        submittedCount: submitted.length,
        averagePercentage: submitted.length
          ? Math.round((submitted.reduce((s, a) => s + (a.percentage ?? 0), 0) / submitted.length) * 10) / 10
          : null,
        students: roster.map((s) => {
          const a = byStudent.get(s.id);
          return {
            studentId: s.id,
            admissionNumber: s.admissionNumber,
            name: `${s.lastName} ${s.firstName}`,
            classId: s.classId,
            status: !a ? 'not_started' : a.submittedAt ? 'submitted' : 'in_progress',
            score: a?.score ?? null,
            maxScore: a?.maxScore ?? null,
            percentage: a?.percentage ?? null,
          };
        }),
        items,
      };
    });
  }

  /**
   * Writes CBT results into the term's score sheet (e.g. as 1st CA), scaled to that
   * component's maximum. Other components already entered are kept.
   */
  pushScores(user: Principal, testId: string) {
    return this.dbs.withSchool(user.schoolId, async (tx) => {
      const detail = await this.testDetail(tx, testId);
      if (!detail.termId || !detail.scoreComponent) throw new BadRequestException('This test is not set to count towards a score component');
      await this.assertTeaches(tx, user, detail.subjectId, detail.classes.map((c) => c.id));
      await this.finaliseExpired(tx, { testId });
      const component = detail.scoreComponent;
      const done = await tx
        .select({ attempt: cbtAttempts, student: students })
        .from(cbtAttempts)
        .innerJoin(students, eq(students.id, cbtAttempts.studentId))
        .where(and(eq(cbtAttempts.testId, testId), isNotNull(cbtAttempts.submittedAt)));
      const classInfo = await tx
        .select({ classId: classes.id, components: sections.components })
        .from(classes)
        .innerJoin(sections, eq(sections.id, classes.sectionId))
        .where(inArray(classes.id, detail.classes.map((c) => c.id)));
      const maxFor = new Map(classInfo.map((c) => [c.classId, c.components.find((x) => x.key === component)?.maxScore]));
      const takes = await tx
        .select({ classId: classSubjects.classId })
        .from(classSubjects)
        .where(and(eq(classSubjects.subjectId, detail.subjectId), inArray(classSubjects.classId, detail.classes.map((c) => c.id))));
      const takesSet = new Set(takes.map((t) => t.classId));

      const skipped: { studentId: string; reason: string }[] = [];
      let written = 0;
      for (const { attempt, student } of done) {
        const max = student.classId ? maxFor.get(student.classId) : undefined;
        if (!student.classId || max === undefined) {
          skipped.push({ studentId: student.id, reason: 'Student is no longer in one of the test classes' });
          continue;
        }
        if (!takesSet.has(student.classId)) {
          skipped.push({ studentId: student.id, reason: 'The class does not take this subject' });
          continue;
        }
        const value = scaleToComponent(attempt.percentage ?? 0, max);
        const [existing] = await tx
          .select()
          .from(scores)
          .where(and(eq(scores.termId, detail.termId), eq(scores.subjectId, detail.subjectId), eq(scores.studentId, student.id)));
        const merged = { ...(existing?.scores ?? {}), [component]: value };
        await tx
          .insert(scores)
          .values({
            schoolId: user.schoolId,
            termId: detail.termId,
            classId: student.classId,
            subjectId: detail.subjectId,
            studentId: student.id,
            scores: merged,
            enteredBy: user.staffId,
          })
          .onConflictDoUpdate({
            target: [scores.termId, scores.subjectId, scores.studentId],
            set: { scores: merged, classId: student.classId, enteredBy: user.staffId, updatedAt: new Date() },
          });
        written++;
      }
      return { written, component, skipped };
    });
  }

  // ------------------------------------------------------------ Students: tests and attempts

  /** Published tests for the student's class, with whether they have sat them. */
  availableTests(student: StudentPrincipal) {
    return this.dbs.withSchool(student.schoolId, async (tx) => {
      const [me] = await tx.select().from(students).where(eq(students.id, student.studentId));
      if (!me?.classId) return [];
      const rows = await tx
        .select({ test: cbtTests, subject: subjects.name })
        .from(cbtTestClasses)
        .innerJoin(cbtTests, eq(cbtTests.id, cbtTestClasses.testId))
        .innerJoin(subjects, eq(subjects.id, cbtTests.subjectId))
        .where(and(eq(cbtTestClasses.classId, me.classId), eq(cbtTests.status, 'published')))
        .orderBy(asc(cbtTests.opensAt));
      const mine = await tx.select().from(cbtAttempts).where(and(eq(cbtAttempts.studentId, student.studentId), eq(cbtAttempts.kind, 'test')));
      const byTest = new Map(mine.map((a) => [a.testId, a]));
      const now = new Date();
      return rows.map(({ test, subject }) => {
        const a = byTest.get(test.id);
        return {
          id: test.id,
          title: test.title,
          subject,
          durationMinutes: test.durationMinutes,
          opensAt: test.opensAt,
          closesAt: test.closesAt,
          isOpen: (!test.opensAt || test.opensAt <= now) && (!test.closesAt || test.closesAt > now),
          attempt: a ? { id: a.id, submitted: Boolean(a.submittedAt), percentage: test.showResults ? a.percentage : null } : null,
        };
      });
    });
  }

  /** Starts (or resumes) a test. The clock starts on first open and does not stop. */
  startTest(student: StudentPrincipal, testId: string) {
    return this.dbs.withSchool(student.schoolId, async (tx) => {
      const [test] = await tx.select().from(cbtTests).where(eq(cbtTests.id, testId));
      if (!test || test.status !== 'published') throw new NotFoundException('Test not found');
      const [me] = await tx.select().from(students).where(eq(students.id, student.studentId));
      const [assigned] = me?.classId
        ? await tx.select().from(cbtTestClasses).where(and(eq(cbtTestClasses.testId, testId), eq(cbtTestClasses.classId, me.classId)))
        : [];
      if (!assigned) throw new NotFoundException('Test not found');

      const [existing] = await tx
        .select()
        .from(cbtAttempts)
        .where(and(eq(cbtAttempts.testId, testId), eq(cbtAttempts.studentId, student.studentId)));
      if (existing) return this.attemptView(tx, await this.finaliseIfExpired(tx, existing));

      const now = new Date();
      if (test.opensAt && test.opensAt > now) throw new BadRequestException('This test has not opened yet');
      if (test.closesAt && test.closesAt <= now) throw new BadRequestException('This test has closed');

      const qRows = await tx
        .select({ id: cbtTestQuestions.questionId })
        .from(cbtTestQuestions)
        .where(eq(cbtTestQuestions.testId, testId))
        .orderBy(asc(cbtTestQuestions.position));
      let order = qRows.map((q) => q.id);
      if (test.shuffleQuestions) order = seededShuffle(order, `${testId}:${student.studentId}`);
      let deadline = new Date(now.getTime() + test.durationMinutes * 60_000);
      if (test.closesAt && test.closesAt < deadline) deadline = test.closesAt;

      const [attempt] = await tx
        .insert(cbtAttempts)
        .values({
          schoolId: student.schoolId,
          kind: 'test',
          testId,
          studentId: student.studentId,
          subjectId: test.subjectId,
          questionIds: order,
          deadline,
        })
        .onConflictDoNothing()
        .returning();
      if (!attempt) {
        // Two devices opened the test at the same moment: use the attempt the other one created.
        const [other] = await tx
          .select()
          .from(cbtAttempts)
          .where(and(eq(cbtAttempts.testId, testId), eq(cbtAttempts.studentId, student.studentId)));
        return this.attemptView(tx, other);
      }
      return this.attemptView(tx, attempt);
    });
  }

  async createPractice(tx: Tx, student: StudentPrincipal, subjectId: string, questionIds: string[], exam: Attempt['exam'] = null) {
    const [attempt] = await tx
      .insert(cbtAttempts)
      .values({ schoolId: student.schoolId, kind: 'practice', studentId: student.studentId, subjectId, questionIds, exam })
      .returning();
    return this.attemptView(tx, attempt);
  }

  private async mine(tx: Tx, student: StudentPrincipal, attemptId: string) {
    const [a] = await tx
      .select()
      .from(cbtAttempts)
      .where(and(eq(cbtAttempts.id, attemptId), eq(cbtAttempts.studentId, student.studentId)));
    if (!a) throw new NotFoundException('Attempt not found');
    return a;
  }

  getAttempt(student: StudentPrincipal, attemptId: string) {
    return this.dbs.withSchool(student.schoolId, async (tx) =>
      this.attemptView(tx, await this.finaliseIfExpired(tx, await this.mine(tx, student, attemptId))),
    );
  }

  /** Autosave: merges the answers sent with those already saved. */
  saveAnswers(student: StudentPrincipal, attemptId: string, answers: Record<string, string | null>) {
    return this.dbs.withSchool(student.schoolId, async (tx) => {
      const a = await this.mine(tx, student, attemptId);
      if (a.submittedAt) throw new BadRequestException('This attempt has already been submitted');
      if (a.deadline && Date.now() > a.deadline.getTime() + GRACE_MS) {
        return this.attemptView(tx, await this.finaliseIfExpired(tx, a));
      }
      const allowed = new Set(a.questionIds);
      const merged = { ...a.answers };
      for (const [qid, key] of Object.entries(answers)) {
        if (!allowed.has(qid)) throw new BadRequestException('That question is not in this test');
        if (key === null) delete merged[qid];
        else merged[qid] = key.toUpperCase();
      }
      const [updated] = await tx.update(cbtAttempts).set({ answers: merged }).where(eq(cbtAttempts.id, a.id)).returning();
      return { saved: Object.keys(merged).length, deadline: updated.deadline };
    });
  }

  submit(student: StudentPrincipal, attemptId: string) {
    return this.dbs.withSchool(student.schoolId, async (tx) => {
      const a = await this.mine(tx, student, attemptId);
      return this.attemptView(tx, a.submittedAt ? a : await this.grade(tx, a));
    });
  }

  private async questionMarks(tx: Tx, a: Attempt): Promise<Map<string, number>> {
    if (!a.testId) return new Map();
    const rows = await tx.select().from(cbtTestQuestions).where(eq(cbtTestQuestions.testId, a.testId));
    return new Map(rows.map((r) => [r.questionId, r.marks]));
  }

  private async grade(tx: Tx, a: Attempt): Promise<Attempt> {
    const qs = await tx.select().from(questions).where(inArray(questions.id, a.questionIds));
    const marks = await this.questionMarks(tx, a);
    const graded = gradeAttempt(
      qs.map((q) => ({ id: q.id, answer: q.answer, marks: marks.get(q.id) ?? 1 })),
      a.answers,
    );
    const [updated] = await tx
      .update(cbtAttempts)
      .set({ submittedAt: new Date(), score: graded.score, maxScore: graded.maxScore, percentage: graded.percentage })
      .where(and(eq(cbtAttempts.id, a.id), isNull(cbtAttempts.submittedAt)))
      .returning();
    return updated ?? (await tx.select().from(cbtAttempts).where(eq(cbtAttempts.id, a.id)))[0];
  }

  private async finaliseIfExpired(tx: Tx, a: Attempt): Promise<Attempt> {
    if (!a.submittedAt && a.deadline && Date.now() > a.deadline.getTime() + GRACE_MS) return this.grade(tx, a);
    return a;
  }

  /** Submits every attempt whose time ran out (students who closed the browser mid-test). */
  async finaliseExpired(tx: Tx, where: { testId: string }) {
    const open = await tx
      .select()
      .from(cbtAttempts)
      .where(
        and(
          eq(cbtAttempts.testId, where.testId),
          isNull(cbtAttempts.submittedAt),
          sql`${cbtAttempts.deadline} < now() - interval '30 seconds'`,
        ),
      );
    for (const a of open) await this.grade(tx, a);
  }

  /**
   * What the student sees. Answers and explanations appear only after submitting,
   * and for tests only if the teacher chose to show results.
   */
  async attemptView(tx: Tx, a: Attempt) {
    const qs = await tx.select().from(questions).where(inArray(questions.id, a.questionIds));
    const byId = new Map<string, Question>(qs.map((q) => [q.id, q]));
    // Practice sets and mocks always show the review; tests only if the teacher allows it.
    let showReview = a.kind !== 'test';
    let title = a.mock ? `${EXAM_FORMATS[a.mock.exam].name} mock` : 'Practice';
    if (a.testId) {
      const [test] = await tx.select().from(cbtTests).where(eq(cbtTests.id, a.testId));
      showReview = test.showResults;
      title = test.title;
    }
    const submitted = Boolean(a.submittedAt);
    const reveal = submitted && showReview;
    const marks = await this.questionMarks(tx, a);
    return {
      id: a.id,
      kind: a.kind,
      title,
      subjectId: a.subjectId,
      startedAt: a.startedAt,
      deadline: a.deadline,
      secondsLeft: a.deadline && !submitted ? Math.max(0, Math.round((a.deadline.getTime() - Date.now()) / 1000)) : null,
      submitted,
      result: submitted && showReview ? { score: a.score, maxScore: a.maxScore, percentage: a.percentage } : null,
      exam: a.exam,
      mock: a.mock ? { ...a.mock, breakdown: reveal ? mockBreakdown(a, byId) : null } : null,
      questions: a.questionIds.map((qid, i) => {
        const q = byId.get(qid)!;
        const chosen = a.answers[qid] ?? null;
        return {
          number: i + 1,
          id: q.id,
          subjectId: q.subjectId,
          topic: q.topic,
          body: q.body,
          options: q.options,
          marks: marks.get(q.id) ?? 1,
          chosen,
          ...(reveal ? { answer: q.answer, correct: chosen === q.answer, explanation: q.explanation } : {}),
        };
      }),
    };
  }
}

/** Score per subject for a mock (JAMB is marked out of 100 per subject and 400 in all). */
export function mockBreakdown(a: Attempt, byId: Map<string, Question>) {
  if (!a.mock) return null;
  const subjects = a.mock.subjects.map((s) => {
    const qs = a.questionIds.map((id) => byId.get(id)).filter((q): q is Question => Boolean(q) && q!.subjectId === s.subjectId);
    const correct = qs.filter((q) => a.answers[q.id] === q.answer).length;
    const percentage = qs.length ? Math.round((correct / qs.length) * 100) : 0;
    return { subjectId: s.subjectId, name: s.name, questions: qs.length, correct, percentage, grade: waecGrade(percentage) };
  });
  return { subjects, jambScore: a.mock.exam === 'jamb' ? jambAggregate(subjects.map((s) => s.percentage)) : null };
}
