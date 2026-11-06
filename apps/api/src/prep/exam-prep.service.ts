import { BadRequestException, Injectable } from '@nestjs/common';
import {
  buildCountdownPlan,
  compatibleTags,
  defaultExamDate,
  estimateReadiness,
  EXAM_FORMATS,
  ExamCode,
  examsForSection,
  planMock,
  ReadinessInput,
  seededShuffle,
} from '@school-ms/core';
import { and, asc, desc, eq, inArray, isNotNull, sql } from 'drizzle-orm';
import { StudentPrincipal } from '../auth/auth.types';
import { todayInLagos } from '../common/access';
import { Tx } from '../db/client';
import { DbService } from '../db/db.service';
import { cbtAttempts, classes, classSubjects, examGoals, questions, students, subjects } from '../db/schema';
import { KnowledgeService } from '../knowledge/knowledge.service';
import { CbtService } from '../cbt/cbt.service';
import { PrepService } from './prep.service';

type Question = typeof questions.$inferSelect;

/**
 * External exam preparation: WAEC, NECO, JAMB UTME and BECE goals with exam dates, practice by
 * subject and topic, timed JAMB-style mocks, predicted readiness and a study plan to exam day.
 * Builds on PrepService (study profile, practice sets) and CbtService (attempts and marking).
 */
@Injectable()
export class ExamPrepService {
  constructor(
    private readonly dbs: DbService,
    private readonly prep: PrepService,
    private readonly cbt: CbtService,
    private readonly kb: KnowledgeService,
  ) {}

  private async classSubjectsFor(tx: Tx, studentId: string) {
    const [me] = await tx
      .select({ classId: students.classId, classLevel: classes.name })
      .from(students)
      .leftJoin(classes, eq(classes.id, students.classId))
      .where(eq(students.id, studentId));
    if (!me?.classId) return { classLevel: null, subjects: [] as { id: string; name: string; code: string }[] };
    const rows = await tx
      .select({ id: subjects.id, name: subjects.name, code: subjects.code })
      .from(classSubjects)
      .innerJoin(subjects, eq(subjects.id, classSubjects.subjectId))
      .where(eq(classSubjects.classId, me.classId))
      .orderBy(asc(subjects.name));
    return { classLevel: me.classLevel, subjects: rows };
  }

  /** Questions that suit this exam and the student's section, not in a live test. */
  private async pool(tx: Tx, exam: ExamCode, subjectIds: string[], sectionKind: string) {
    if (!subjectIds.length) return [];
    const reserved = await this.prep.reservedQuestionIds(tx);
    const tags = compatibleTags(exam);
    const rows = await tx
      .select()
      .from(questions)
      .where(and(inArray(questions.subjectId, subjectIds), inArray(questions.exam, tags as Question['exam'][])));
    return rows.filter((q) => !reserved.has(q.id) && (!q.sectionKind || q.sectionKind === sectionKind));
  }

  // ------------------------------------------------------------ Overview and goals

  /** Everything the exam prep page needs in one request (kept small for slow connections). */
  overview(student: StudentPrincipal) {
    return this.dbs.withSchool(student.schoolId, async (tx) => {
      const profile = await this.prep.profileFor(tx, student.studentId);
      const { subjects: mine } = await this.classSubjectsFor(tx, student.studentId);
      const exams = examsForSection(profile.sectionKind);
      const goals = await tx.select().from(examGoals).where(eq(examGoals.studentId, student.studentId));
      const today = todayInLagos();
      const counts =
        exams.length && mine.length
          ? await tx
              .select({ subjectId: questions.subjectId, exam: questions.exam, n: sql<number>`count(*)::int` })
              .from(questions)
              .where(inArray(questions.subjectId, mine.map((s) => s.id)))
              .groupBy(questions.subjectId, questions.exam)
          : [];
      const recentMocks = await tx
        .select()
        .from(cbtAttempts)
        .where(and(eq(cbtAttempts.studentId, student.studentId), eq(cbtAttempts.kind, 'mock'), isNotNull(cbtAttempts.submittedAt)))
        .orderBy(desc(cbtAttempts.submittedAt))
        .limit(5);
      return {
        student: profile.student,
        sectionKind: profile.sectionKind,
        today,
        exams: exams.map((code) => {
          const f = EXAM_FORMATS[code];
          const goal = goals.find((g) => g.exam === code);
          const tags = new Set(compatibleTags(code));
          return {
            code,
            name: f.name,
            subjectsPerSitting: f.subjects,
            fullMock: { questions: f.questionsPerSubject.slice(0, f.subjects).reduce((a, b) => a + b, 0), minutes: f.minutes },
            compulsorySubjectCodes: f.compulsory,
            goal: goal ? { examDate: goal.examDate, subjectIds: goal.subjectIds } : null,
            suggestedDate: defaultExamDate(code, today),
            questionsBySubject: Object.fromEntries(
              mine.map((s) => [s.id, counts.filter((c) => c.subjectId === s.id && tags.has(c.exam)).reduce((a, c) => a + c.n, 0)]),
            ),
          };
        }),
        subjects: mine,
        recentMocks: recentMocks.map((a) => ({
          id: a.id,
          exam: a.exam,
          submittedAt: a.submittedAt,
          percentage: a.percentage,
          subjects: a.mock?.subjects.map((s) => s.name) ?? [],
        })),
      };
    });
  }

  setGoal(student: StudentPrincipal, input: { exam: ExamCode; examDate?: string; subjectIds: string[] }) {
    return this.dbs.withSchool(student.schoolId, async (tx) => {
      const profile = await this.prep.profileFor(tx, student.studentId);
      if (!examsForSection(profile.sectionKind).includes(input.exam)) throw new BadRequestException(`${EXAM_FORMATS[input.exam].name} is not for your class`);
      const { subjects: mine } = await this.classSubjectsFor(tx, student.studentId);
      const ids = [...new Set(input.subjectIds)];
      if (ids.some((id) => !mine.some((s) => s.id === id))) throw new BadRequestException('Choose subjects your class takes');
      const f = EXAM_FORMATS[input.exam];
      if (input.exam === 'jamb') {
        if (ids.length !== 4) throw new BadRequestException('JAMB UTME is four subjects: Use of English and three others');
        const english = mine.find((s) => f.compulsory.includes(s.code));
        if (english && !ids.includes(english.id)) throw new BadRequestException('Use of English is compulsory for JAMB UTME');
      } else if (!ids.length) {
        throw new BadRequestException('Choose at least one subject');
      }
      const today = todayInLagos();
      const examDate = input.examDate ?? defaultExamDate(input.exam, today);
      if (examDate < today) throw new BadRequestException('The exam date has passed');
      // English first, so JAMB mocks follow the real paper order.
      const ordered = [...ids].sort((a, b) => Number(f.compulsory.includes(mine.find((s) => s.id === b)!.code)) - Number(f.compulsory.includes(mine.find((s) => s.id === a)!.code)));
      const [goal] = await tx
        .insert(examGoals)
        .values({ schoolId: student.schoolId, studentId: student.studentId, exam: input.exam, examDate, subjectIds: ordered })
        .onConflictDoUpdate({ target: [examGoals.studentId, examGoals.exam], set: { examDate, subjectIds: ordered, updatedAt: new Date() } })
        .returning();
      return goal;
    });
  }

  // ------------------------------------------------------------ Topics

  /** Topics for a subject (scheme of work and question bank), with how the student is doing on each. */
  topics(student: StudentPrincipal, subjectId: string, exam: ExamCode) {
    return this.dbs.withSchool(student.schoolId, async (tx) => {
      const profile = await this.prep.profileFor(tx, student.studentId);
      const { classLevel, subjects: mine } = await this.classSubjectsFor(tx, student.studentId);
      if (!mine.some((s) => s.id === subjectId)) throw new BadRequestException('Your class does not take this subject');
      const pool = await this.pool(tx, exam, [subjectId], profile.sectionKind);
      const stats = (await this.prep.topicStats(tx, student.studentId)).filter((t) => t.subjectId === subjectId);
      const scheme = await this.kb.outline(tx, { subjectId, classLevel, studentsOnly: true });
      const names = new Map<string, string>();
      for (const q of pool) names.set(q.topic.toLowerCase(), q.topic);
      for (const s of scheme) if (!names.has(s.topic.toLowerCase())) names.set(s.topic.toLowerCase(), s.topic);
      return [...names.entries()]
        .map(([key, topic]) => {
          const st = stats.find((t) => t.topic.toLowerCase() === key);
          return {
            topic,
            questions: pool.filter((q) => q.topic.toLowerCase() === key).length,
            inSchemeOfWork: scheme.some((s) => s.topic.toLowerCase() === key),
            attempted: st?.attempted ?? 0,
            accuracy: st && st.attempted ? Math.round((st.correct / st.attempted) * 100) : null,
          };
        })
        .sort((a, b) => (a.accuracy ?? 101) - (b.accuracy ?? 101) || b.questions - a.questions || a.topic.localeCompare(b.topic));
    });
  }

  // ------------------------------------------------------------ Mocks

  /** A timed mock in the exam's format: one subject for WAEC/NECO/BECE, four for JAMB. */
  startMock(student: StudentPrincipal, input: { exam: ExamCode; subjectIds?: string[]; size: 'full' | 'short' }) {
    return this.dbs.withSchool(student.schoolId, async (tx) => {
      const profile = await this.prep.profileFor(tx, student.studentId);
      if (!examsForSection(profile.sectionKind).includes(input.exam)) throw new BadRequestException(`${EXAM_FORMATS[input.exam].name} is not for your class`);
      const f = EXAM_FORMATS[input.exam];
      const { subjects: mine } = await this.classSubjectsFor(tx, student.studentId);
      const [goal] = await tx.select().from(examGoals).where(and(eq(examGoals.studentId, student.studentId), eq(examGoals.exam, input.exam)));
      let ids = input.subjectIds?.length ? input.subjectIds : (goal?.subjectIds ?? []);
      if (input.exam === 'jamb' && ids.length !== 4) throw new BadRequestException('Choose your four JAMB subjects first');
      if (input.exam !== 'jamb') ids = ids.slice(0, 1);
      if (!ids.length) throw new BadRequestException('Choose a subject');
      if (ids.some((id) => !mine.some((s) => s.id === id))) throw new BadRequestException('Choose subjects your class takes');
      const english = mine.find((s) => f.compulsory.includes(s.code));
      if (english && ids.includes(english.id)) ids = [english.id, ...ids.filter((id) => id !== english.id)];

      const pool = await this.pool(tx, input.exam, ids, profile.sectionKind);
      const plan = planMock(input.exam, ids.map((id) => ({ subjectId: id, available: pool.filter((q) => q.subjectId === id).length })), input.size);
      if (plan.totalQuestions < 5) throw new BadRequestException('There are not enough questions for a mock in these subjects yet');

      const tags = compatibleTags(input.exam);
      const seed = `${student.studentId}:${Date.now()}`;
      const questionIds: string[] = [];
      for (const s of plan.subjects) {
        // Exact exam tag first (real JAMB-style questions for JAMB), then related exams; shuffled within each.
        const qs = pool.filter((q) => q.subjectId === s.subjectId);
        const ranked = tags.flatMap((t) => seededShuffle(qs.filter((q) => q.exam === t), `${seed}:${t}`));
        questionIds.push(...seededShuffle(ranked.slice(0, s.count), seed).map((q) => q.id));
      }
      const deadline = new Date(Date.now() + plan.minutes * 60_000);
      const [attempt] = await tx
        .insert(cbtAttempts)
        .values({
          schoolId: student.schoolId,
          kind: 'mock',
          studentId: student.studentId,
          subjectId: plan.subjects[0].subjectId,
          questionIds,
          deadline,
          exam: input.exam,
          mock: {
            exam: input.exam,
            size: input.size,
            subjects: plan.subjects.map((s) => ({ subjectId: s.subjectId, name: mine.find((m) => m.id === s.subjectId)!.name, count: s.count })),
          },
        })
        .returning();
      return this.cbt.attemptView(tx, attempt);
    });
  }

  // ------------------------------------------------------------ Readiness and plan

  /** Predicted readiness per subject and a week-by-week plan to exam day, for one exam goal. */
  plan(student: StudentPrincipal, exam: ExamCode) {
    return this.dbs.withSchool(student.schoolId, async (tx) => {
      const profile = await this.prep.profileFor(tx, student.studentId);
      const { classLevel, subjects: mine } = await this.classSubjectsFor(tx, student.studentId);
      const [goal] = await tx.select().from(examGoals).where(and(eq(examGoals.studentId, student.studentId), eq(examGoals.exam, exam)));
      const today = todayInLagos();
      const subjectIds = goal?.subjectIds.length ? goal.subjectIds : mine.map((s) => s.id);
      const examDate = goal?.examDate ?? defaultExamDate(exam, today);

      const mocks = await tx
        .select()
        .from(cbtAttempts)
        .where(and(eq(cbtAttempts.studentId, student.studentId), eq(cbtAttempts.kind, 'mock'), isNotNull(cbtAttempts.submittedAt)))
        .orderBy(asc(cbtAttempts.submittedAt));
      const mockQs = mocks.length ? await tx.select().from(questions).where(inArray(questions.id, [...new Set(mocks.flatMap((m) => m.questionIds))])) : [];
      const byId = new Map(mockQs.map((q) => [q.id, q]));
      const stats = await this.prep.topicStats(tx, student.studentId);
      const pool = await this.pool(tx, exam, subjectIds, profile.sectionKind);

      const inputs: ReadinessInput[] = [];
      const planSubjects = [];
      for (const id of subjectIds) {
        const subject = mine.find((s) => s.id === id);
        if (!subject) continue;
        const focus = profile.subjects.find((s) => s.subjectId === id);
        const mockScores = mocks
          .map((m) => {
            const qs = m.questionIds.map((q) => byId.get(q)).filter((q): q is Question => Boolean(q) && q!.subjectId === id);
            return qs.length ? Math.round((qs.filter((q) => m.answers[q.id] === q.answer).length / qs.length) * 100) : null;
          })
          .filter((x): x is number => x !== null);
        const st = stats.filter((t) => t.subjectId === id);
        const answered = st.reduce((a, t) => a + t.attempted, 0);
        inputs.push({
          subjectId: id,
          subjectName: subject.name,
          schoolScore: focus?.latestScore ?? null,
          mockScores,
          practiceAccuracy: answered ? Math.round((st.reduce((a, t) => a + t.correct, 0) / answered) * 100) : null,
          practiceAnswered: answered,
        });
        const scheme = await this.kb.outline(tx, { subjectId: id, classLevel, studentsOnly: true });
        const topics = [...new Set([...pool.filter((q) => q.subjectId === id).map((q) => q.topic), ...scheme.map((s) => s.topic)])];
        planSubjects.push({
          subjectId: id,
          subjectName: subject.name,
          priority: focus?.priority ?? 10,
          weakTopics: focus?.weakTopics.map((t) => t.topic) ?? [],
          topics,
        });
      }
      return {
        exam,
        examName: EXAM_FORMATS[exam].name,
        hasGoal: Boolean(goal),
        readiness: estimateReadiness(exam, inputs),
        countdown: buildCountdownPlan(today, examDate, planSubjects),
      };
    });
  }
}
