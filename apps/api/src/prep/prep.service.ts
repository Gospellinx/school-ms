import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { buildStudyProfile, compatibleTags, draftRemark, ExamCode, pickPracticeQuestions, subjectTotal, SubjectTermResult, TopicStat } from '@school-ms/core';
import { and, desc, eq, inArray, isNotNull, ne, sql } from 'drizzle-orm';
import { z } from 'zod';
import { Principal, StudentPrincipal } from '../auth/auth.types';
import { assertOwned } from '../common/owned';
import { found } from '../common/validation';
import { Tx } from '../db/client';
import { DbService } from '../db/db.service';
import {
  academicSessions,
  cbtAttempts,
  cbtTestQuestions,
  cbtTests,
  classes,
  questionExplanations,
  questions,
  scores,
  sections,
  students,
  subjects,
  terms,
  resultPublications,
  tutorConversations,
  tutorMessages,
} from '../db/schema';
import { CbtService } from '../cbt/cbt.service';
import { ResultsService } from '../results/results.service';
import { AiService } from './ai.service';

type SectionKind = (typeof sections.$inferSelect)['kind'];

const TARGET_EXAM: Record<SectionKind, string> = {
  senior_secondary: 'WAEC and NECO (SSCE)',
  junior_secondary: 'BECE (Junior WAEC)',
  primary: 'Common Entrance and school exams',
  nursery: 'school assessments',
};

// ---------------------------------------------------------------- AI output schemas

const planZod = z.object({
  summary: z.string(),
  weeks: z.array(
    z.object({
      week: z.number(),
      focus: z.array(z.object({ subject: z.string(), topic: z.string(), activities: z.array(z.string()) })),
    }),
  ),
  tips: z.array(z.string()),
});
const planSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['summary', 'weeks', 'tips'],
  properties: {
    summary: { type: 'string', description: 'Two or three encouraging sentences to the student about where they stand.' },
    weeks: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['week', 'focus'],
        properties: {
          week: { type: 'integer' },
          focus: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['subject', 'topic', 'activities'],
              properties: {
                subject: { type: 'string' },
                topic: { type: 'string' },
                activities: { type: 'array', items: { type: 'string' } },
              },
            },
          },
        },
      },
    },
    tips: { type: 'array', items: { type: 'string' } },
  },
};

const explainZod = z.object({ explanation: z.string(), tip: z.string() });
const explainSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['explanation', 'tip'],
  properties: {
    explanation: { type: 'string', description: 'Why the correct option is right and, if the student chose wrongly, why their option is wrong.' },
    tip: { type: 'string', description: 'One short tip for similar exam questions.' },
  },
};

const draftsZod = z.object({
  questions: z.array(
    z.object({
      body: z.string(),
      options: z.array(z.object({ key: z.string(), text: z.string() })),
      answer: z.string(),
      explanation: z.string(),
    }),
  ),
});
const draftsSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['questions'],
  properties: {
    questions: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['body', 'options', 'answer', 'explanation'],
        properties: {
          body: { type: 'string' },
          options: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['key', 'text'],
              properties: { key: { type: 'string', enum: ['A', 'B', 'C', 'D'] }, text: { type: 'string' } },
            },
          },
          answer: { type: 'string', enum: ['A', 'B', 'C', 'D'] },
          explanation: { type: 'string' },
        },
      },
    },
  },
};

const commentZod = z.object({ teacherComment: z.string(), headComment: z.string() });
const commentSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['teacherComment', 'headComment'],
  properties: {
    teacherComment: { type: 'string', description: "Class teacher's remark, at most 30 words." },
    headComment: { type: 'string', description: "Head teacher's remark, at most 15 words." },
  },
};

const TUTOR_SYSTEM =
  'You are a patient, encouraging exam-prep tutor for Nigerian secondary school students. ' +
  'Use clear, simple British English and Nigerian examples where they help. Follow the WAEC, NECO and BECE syllabuses. ' +
  'Base advice only on the data given; do not invent scores or topics.';

@Injectable()
export class PrepService {
  constructor(
    private readonly dbs: DbService,
    private readonly ai: AiService,
    private readonly cbt: CbtService,
    private readonly results: ResultsService,
  ) {}

  // ------------------------------------------------------------ Study profile

  /** The student's results history and CBT topic accuracy, analysed into priorities. */
  async profileFor(tx: Tx, studentId: string) {
    const [me] = await tx
      .select({ student: students, sectionKind: sections.kind, className: classes.name })
      .from(students)
      .leftJoin(classes, eq(classes.id, students.classId))
      .leftJoin(sections, eq(sections.id, classes.sectionId))
      .where(eq(students.id, studentId));
    found(me, 'Student');

    const rows = await tx
      .select({
        scores: scores.scores,
        subjectId: subjects.id,
        subjectName: subjects.name,
        termName: terms.name,
        termNumber: terms.number,
        sessionName: academicSessions.name,
        components: sections.components,
      })
      .from(scores)
      .innerJoin(subjects, eq(subjects.id, scores.subjectId))
      .innerJoin(terms, eq(terms.id, scores.termId))
      .innerJoin(academicSessions, eq(academicSessions.id, terms.sessionId))
      .innerJoin(classes, eq(classes.id, scores.classId))
      .innerJoin(sections, eq(sections.id, classes.sectionId))
      // Released results only: a term still being entered (CAs in, no exam yet) would read as a collapse.
      .innerJoin(resultPublications, and(eq(resultPublications.termId, scores.termId), eq(resultPublications.classId, scores.classId)))
      .where(eq(scores.studentId, studentId));
    const results: SubjectTermResult[] = [];
    for (const r of rows) {
      try {
        results.push({
          subjectId: r.subjectId,
          subjectName: r.subjectName,
          termOrder: Number(r.sessionName.slice(0, 4)) * 10 + r.termNumber,
          termLabel: `${r.termName} ${r.sessionName}`,
          total: subjectTotal(r.scores, r.components),
        });
      } catch {
        // Scores entered under an older grading split; leave them out of the analysis.
      }
    }

    const topics = await this.topicStats(tx, studentId);
    const profile = buildStudyProfile(results, topics);
    const kind = me.sectionKind ?? 'senior_secondary';
    return {
      student: { id: me.student.id, name: `${me.student.firstName} ${me.student.lastName}`, className: me.className },
      sectionKind: kind,
      targetExam: TARGET_EXAM[kind],
      ...profile,
    };
  }

  async topicStats(tx: Tx, studentId: string): Promise<TopicStat[]> {
    const attempts = await tx
      .select()
      .from(cbtAttempts)
      .where(and(eq(cbtAttempts.studentId, studentId), isNotNull(cbtAttempts.submittedAt)));
    const ids = [...new Set(attempts.flatMap((a) => a.questionIds))];
    if (ids.length === 0) return [];
    const qs = await tx.select().from(questions).where(inArray(questions.id, ids));
    const byId = new Map(qs.map((q) => [q.id, q]));
    const stats = new Map<string, TopicStat>();
    for (const a of attempts) {
      for (const qid of a.questionIds) {
        const q = byId.get(qid);
        if (!q) continue;
        const key = `${q.subjectId}::${q.topic}`;
        const s = stats.get(key) ?? { subjectId: q.subjectId, topic: q.topic, attempted: 0, correct: 0 };
        s.attempted++;
        if (a.answers[qid] === q.answer) s.correct++;
        stats.set(key, s);
      }
    }
    // Quiz questions answered in the tutor count too, under the conversation's topic.
    const quizzes = await tx
      .select({ subjectId: tutorConversations.subjectId, topic: tutorConversations.topic, correct: tutorMessages.quizCorrect })
      .from(tutorMessages)
      .innerJoin(tutorConversations, eq(tutorConversations.id, tutorMessages.conversationId))
      .where(and(eq(tutorConversations.studentId, studentId), isNotNull(tutorMessages.quizAnswer), isNotNull(tutorConversations.topic)));
    for (const qz of quizzes) {
      const key = `${qz.subjectId}::${qz.topic}`;
      const s = stats.get(key) ?? { subjectId: qz.subjectId, topic: qz.topic!, attempted: 0, correct: 0 };
      s.attempted++;
      if (qz.correct) s.correct++;
      stats.set(key, s);
    }
    return [...stats.values()];
  }

  /**
   * A study plan built on the student's own school results: the deterministic profile
   * always, plus an AI-written two-week plan when AI is set up.
   */
  async plan(schoolId: string, studentId: string, opts: { withAi: boolean }) {
    const profile = await this.dbs.withSchool(schoolId, async (tx) => {
      const p = await this.profileFor(tx, studentId);
      if (opts.withAi && this.ai.enabled) await this.ai.assertStudentAllowance(tx, schoolId, studentId);
      return p;
    });
    if (!opts.withAi || !this.ai.enabled || profile.subjects.length === 0) return { profile, plan: null };

    const top = profile.subjects.slice(0, 5).map((s) => ({
      subject: s.subjectName,
      latestScore: s.latestScore,
      latestTerm: s.latestTerm,
      trend: s.trend,
      belowCredit: s.belowCredit,
      weakTopics: s.weakTopics.map((t) => `${t.topic} (${t.accuracy}% correct)`),
    }));
    const plan = await this.ai.json({
      feature: 'prep_plan',
      schoolId,
      studentId,
      system: TUTOR_SYSTEM,
      prompt:
        `Write a two-week study plan for ${profile.student.name}, ${profile.student.className ?? 'a student'}, preparing for ${profile.targetExam}.\n` +
        `Their priority subjects, most urgent first, from their school results and CBT practice:\n${JSON.stringify(top, null, 2)}\n` +
        'Put the weakest areas first. Give 2-3 concrete activities per focus (e.g. past questions, a worked example to redo). ' +
        'Keep each activity under 20 words. Give at most 4 tips.',
      schema: planSchema,
      validate: planZod,
      effort: 'medium',
    });
    return { profile, plan };
  }

  // ------------------------------------------------------------ Practice

  /** Questions in tests that are not closed yet are kept out of practice, so tests are not leaked. */
  async reservedQuestionIds(tx: Tx): Promise<Set<string>> {
    const rows = await tx
      .select({ id: cbtTestQuestions.questionId })
      .from(cbtTestQuestions)
      .innerJoin(cbtTests, eq(cbtTests.id, cbtTestQuestions.testId))
      .where(ne(cbtTests.status, 'closed'));
    return new Set(rows.map((r) => r.id));
  }

  /** Builds a practice set aimed at the student's weakest topics, from the school's question bank. */
  practice(student: StudentPrincipal, opts: { subjectId?: string; topic?: string; exam?: ExamCode; count: number }) {
    return this.dbs.withSchool(student.schoolId, async (tx) => {
      const profile = await this.profileFor(tx, student.studentId);
      const reserved = await this.reservedQuestionIds(tx);
      const tags = opts.exam ? new Set(compatibleTags(opts.exam)) : null;
      const topic = opts.topic?.trim().toLowerCase();
      const suits = (q: typeof questions.$inferSelect) =>
        !reserved.has(q.id) &&
        (!q.sectionKind || q.sectionKind === profile.sectionKind) &&
        (!tags || tags.has(q.exam)) &&
        (!topic || q.topic.toLowerCase() === topic);

      let subjectId = opts.subjectId;
      let pool: (typeof questions.$inferSelect)[] = [];
      if (subjectId) {
        await assertOwned(tx, subjects, subjectId, 'Subject');
        pool = (await tx.select().from(questions).where(eq(questions.subjectId, subjectId))).filter(suits);
      } else {
        for (const s of profile.subjects) {
          pool = (await tx.select().from(questions).where(eq(questions.subjectId, s.subjectId))).filter(suits);
          if (pool.length) {
            subjectId = s.subjectId;
            break;
          }
        }
      }
      if (!subjectId || pool.length === 0) throw new BadRequestException(topic ? 'There are no practice questions on this topic yet' : 'There are no practice questions for this subject yet');

      const focus = profile.subjects.find((s) => s.subjectId === subjectId);
      const past = await tx
        .select()
        .from(cbtAttempts)
        .where(and(eq(cbtAttempts.studentId, student.studentId), isNotNull(cbtAttempts.submittedAt), eq(cbtAttempts.subjectId, subjectId)));
      const answerKey = new Map(pool.map((q) => [q.id, q.answer]));
      const mastered = new Set(past.flatMap((a) => Object.entries(a.answers).filter(([qid, k]) => answerKey.get(qid) === k).map(([qid]) => qid)));
      const picked = pickPracticeQuestions(pool, {
        weakTopics: topic ? [] : (focus?.weakTopics.map((t) => t.topic) ?? []),
        mastered,
        count: opts.count,
        seed: `${student.studentId}:${Date.now()}`,
      });
      const attempt = await this.cbt.createPractice(tx, student, subjectId, picked, opts.exam ?? null);
      return { ...attempt, focus: focus ? { subject: focus.subjectName, weakTopics: focus.weakTopics, reasons: focus.reasons } : null };
    });
  }

  // ------------------------------------------------------------ Explanations

  /**
   * Explains a question the student has already answered and submitted (never during a
   * live test). Explanations are cached per question and chosen option.
   */
  async explain(student: StudentPrincipal, questionId: string) {
    const ctx = await this.dbs.withSchool(student.schoolId, async (tx) => {
      const [q] = await tx.select().from(questions).where(eq(questions.id, questionId));
      if (!q) throw new NotFoundException('Question not found');
      const attempts = await tx
        .select({ attempt: cbtAttempts, showResults: cbtTests.showResults, testStatus: cbtTests.status })
        .from(cbtAttempts)
        .leftJoin(cbtTests, eq(cbtTests.id, cbtAttempts.testId))
        .where(
          and(
            eq(cbtAttempts.studentId, student.studentId),
            isNotNull(cbtAttempts.submittedAt),
            sql`${cbtAttempts.questionIds} @> ${JSON.stringify([questionId])}::jsonb`,
          ),
        )
        .orderBy(desc(cbtAttempts.submittedAt));
      const usable = attempts.find((a) => a.attempt.kind === 'practice' || a.showResults || a.testStatus === 'closed');
      if (!usable) throw new NotFoundException('You can ask for an explanation after you submit this question');
      const chosen = usable.attempt.answers[questionId] ?? '-';
      const [cached] = await tx
        .select()
        .from(questionExplanations)
        .where(and(eq(questionExplanations.questionId, questionId), eq(questionExplanations.chosenKey, chosen)));
      if (!cached && this.ai.enabled) await this.ai.assertStudentAllowance(tx, student.schoolId, student.studentId);
      const [subject] = await tx.select().from(subjects).where(eq(subjects.id, q.subjectId));
      return { q, chosen, cached, subject: subject.name };
    });

    const base = { questionId, chosen: ctx.chosen === '-' ? null : ctx.chosen, answer: ctx.q.answer, correct: ctx.chosen === ctx.q.answer };
    if (ctx.cached) return { ...base, explanation: ctx.cached.text, source: 'cache' as const };
    if (!this.ai.enabled) {
      return {
        ...base,
        explanation: ctx.q.explanation ?? `The correct answer is ${ctx.q.answer}.`,
        source: 'question_bank' as const,
      };
    }

    const options = ctx.q.options.map((o) => `${o.key}. ${o.text}`).join('\n');
    const out = await this.ai.json({
      feature: 'explain',
      schoolId: student.schoolId,
      studentId: student.studentId,
      system: TUTOR_SYSTEM,
      prompt:
        `Subject: ${ctx.subject}. Topic: ${ctx.q.topic}.\nQuestion: ${ctx.q.body}\n${options}\n` +
        `Correct answer: ${ctx.q.answer}. The student chose: ${ctx.chosen === '-' ? 'nothing' : ctx.chosen}.\n` +
        (ctx.q.explanation ? `Teacher's note: ${ctx.q.explanation}\n` : '') +
        'Explain step by step in under 150 words.',
      schema: explainSchema,
      validate: explainZod,
      maxTokens: 2000,
    });
    const text = `${out.explanation}\n\nTip: ${out.tip}`;
    await this.dbs.withSchool(student.schoolId, (tx) =>
      tx
        .insert(questionExplanations)
        .values({ schoolId: student.schoolId, questionId, chosenKey: ctx.chosen, text })
        .onConflictDoNothing(),
    );
    return { ...base, explanation: text, source: 'ai' as const };
  }

  // ------------------------------------------------------------ Teacher tools

  /** AI drafts of exam-style questions for a teacher to check before saving. */
  async draftQuestions(user: Principal, input: { subjectId: string; topic: string; count: number; exam: string; classLevel: string }) {
    const subject = await this.dbs.withSchool(user.schoolId, async (tx) => {
      const [s] = await tx.select().from(subjects).where(eq(subjects.id, input.subjectId));
      return found(s, 'Subject');
    });
    const out = await this.ai.json({
      feature: 'question_drafts',
      schoolId: user.schoolId,
      staffId: user.staffId,
      system:
        'You write objective (multiple-choice) exam questions for Nigerian schools, matching the style and difficulty of ' +
        'WAEC, NECO, BECE and JAMB past questions. Every question has exactly four options A-D and exactly one correct answer. ' +
        'Check your arithmetic. Never copy real past questions word for word.',
      prompt:
        `Write ${input.count} ${input.exam.toUpperCase()}-style questions for ${input.classLevel} ${subject.name} on "${input.topic}". ` +
        'Vary difficulty from easy to hard. Give a short worked explanation for each.',
      schema: draftsSchema,
      validate: draftsZod,
      effort: 'medium',
      maxTokens: 12000,
    });
    const drafts = out.questions.filter((q) => q.options.some((o) => o.key === q.answer));
    return {
      note: 'Drafts only: check each question, then save the ones you want with POST /questions/bulk.',
      questions: drafts.map((q) => ({
        ...q,
        subjectId: input.subjectId,
        topic: input.topic,
        exam: input.exam,
        source: 'ai' as const,
      })),
    };
  }

  /** AI-drafted report card remarks from the student's results, for the teacher to edit. */
  async draftComments(user: Principal, termId: string, studentId: string) {
    const card = await this.dbs.withSchool(user.schoolId, (tx) => this.results.buildReportCard(tx, user.schoolId, termId, studentId));
    const summary = {
      name: card.student.name,
      class: `${card.class.name} ${card.class.arm}`.trim(),
      term: `${card.term} ${card.session}`,
      average: card.summary.average,
      position: `${card.summary.positionText} of ${card.summary.outOf}`,
      subjects: card.subjects.map((s) => ({ subject: s.name, total: s.total, grade: s.grade })),
      attendance: card.attendance,
    };
    // Without AI, a remark built from the results, so the button still helps.
    if (!this.ai.enabled) {
      return draftRemark({
        key: studentId,
        firstName: card.student.name.split(' ')[1] ?? card.student.name,
        average: card.summary.average,
        position: card.summary.position,
        outOf: card.summary.outOf,
        subjects: card.subjects.map((s) => ({ name: s.name, total: s.total })),
        attendance: card.attendance ? { present: card.attendance.present + card.attendance.late, opened: card.attendance.opened } : null,
      });
    }
    return this.ai.json({
      feature: 'report_comment',
      schoolId: user.schoolId,
      staffId: user.staffId,
      system:
        'You draft report card remarks for a Nigerian school. Be specific to the results, warm and honest, ' +
        'name one strength and one area to improve, and avoid clichés. Do not mention the student’s position if it is in the bottom third.',
      prompt: `Draft remarks for this report card:\n${JSON.stringify(summary, null, 2)}`,
      schema: commentSchema,
      validate: commentZod,
      maxTokens: 2000,
    });
  }
}

