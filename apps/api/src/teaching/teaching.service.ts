import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  draftRemark,
  MarkSuggestion,
  percentSoFar,
  RemarkDraft,
  RubricPoint,
  scaleMark,
  subjectTotal,
  suggestMarks,
  watchStudent,
} from '@school-ms/core';
import { and, asc, desc, eq, gte, inArray, isNotNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import { Principal } from '../auth/auth.types';
import { assertTeachesClass, assertTeachesSubject } from '../common/access';
import { assertOwned } from '../common/owned';
import { found } from '../common/validation';
import { Tx } from '../db/client';
import { DbService } from '../db/db.service';
import {
  academicSessions,
  cbtAttempts,
  cbtTestClasses,
  cbtTests,
  classes,
  essayScripts,
  essayTasks,
  questions,
  reportComments,
  scores,
  sections,
  students,
  subjects,
  terms,
  tutorConversations,
  tutorMessages,
} from '../db/schema';
import { AttendanceService } from '../attendance/attendance.service';
import { citationOf, KnowledgeService, Passage } from '../knowledge/knowledge.service';
import { AiService } from '../prep/ai.service';
import { ResultsService } from '../results/results.service';

type ExamStyle = 'school' | 'waec' | 'neco' | 'bece' | 'jamb';

const ASSISTANT_SYSTEM =
  'You are the Linx School teaching assistant for teachers in Nigerian schools (nursery to SS 3). ' +
  "Follow the NERDC curriculum and the school's own scheme of work. Write clear British English at the level of the class, " +
  'with Nigerian examples, names and naira where they help. Use the school sources when they are relevant and cite them as [1], [2]; ' +
  'do not invent facts the sources contradict. Check every calculation.';

// ---------------------------------------------------------------- AI output schemas

const docZod = z.object({ title: z.string(), body: z.string(), sources: z.array(z.number().int()) });
const docSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'body', 'sources'],
  properties: {
    title: { type: 'string' },
    body: { type: 'string', description: 'The document in Markdown, with ## headings.' },
    sources: { type: 'array', items: { type: 'integer' }, description: 'Numbers of the school sources used.' },
  },
};

const assessmentZod = z.object({
  objective: z.array(
    z.object({
      topic: z.string(),
      body: z.string(),
      options: z.array(z.object({ key: z.string(), text: z.string() })),
      answer: z.string(),
      explanation: z.string(),
    }),
  ),
  theory: z.array(z.object({ topic: z.string(), question: z.string(), points: z.array(z.object({ point: z.string(), marks: z.number() })) })),
});
const assessmentSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['objective', 'theory'],
  properties: {
    objective: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['topic', 'body', 'options', 'answer', 'explanation'],
        properties: {
          topic: { type: 'string' },
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
    theory: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['topic', 'question', 'points'],
        properties: {
          topic: { type: 'string' },
          question: { type: 'string' },
          points: {
            type: 'array',
            description: 'The marking scheme: one point per mark-earning idea.',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['point', 'marks'],
              properties: { point: { type: 'string' }, marks: { type: 'number' } },
            },
          },
        },
      },
    },
  },
};

const markZod = z.object({ criteria: z.array(z.object({ index: z.number().int(), awarded: z.number(), reason: z.string() })), feedback: z.string() });
const markSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['criteria', 'feedback'],
  properties: {
    criteria: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['index', 'awarded', 'reason'],
        properties: {
          index: { type: 'integer', description: 'Number of the marking point, from 1.' },
          awarded: { type: 'number', description: 'Marks for this point, from 0 to its maximum, in steps of 0.5.' },
          reason: { type: 'string', description: 'One short sentence a teacher can check.' },
        },
      },
    },
    feedback: { type: 'string', description: 'Two sentences of feedback to the student: one strength, one thing to add.' },
  },
};

const remarksZod = z.object({ remarks: z.array(z.object({ studentId: z.string(), teacherComment: z.string(), headComment: z.string() })) });
const remarksSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['remarks'],
  properties: {
    remarks: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['studentId', 'teacherComment', 'headComment'],
        properties: {
          studentId: { type: 'string' },
          teacherComment: { type: 'string', description: "Class teacher's remark, at most 30 words." },
          headComment: { type: 'string', description: "Head teacher's remark, at most 15 words." },
        },
      },
    },
  },
};

export interface LessonInput {
  classId: string;
  subjectId: string;
  kind: 'lesson_note' | 'lesson_plan';
  topic: string;
  week?: number;
  durationMinutes: number;
  notes?: string;
}

export interface AssessmentInput {
  classId: string;
  subjectId: string;
  topics: string[];
  objectiveCount: number;
  theoryCount: number;
  style: ExamStyle;
  purpose: 'class_test' | 'exam';
}

export interface EssayTaskInput {
  classId: string;
  subjectId: string;
  title: string;
  question: string;
  rubric: RubricPoint[];
  termId?: string | null;
  scoreComponent?: string | null;
}

const DAY = 24 * 60 * 60 * 1000;

/**
 * The teacher assistant: lesson notes and plans from the scheme of work, class tests and
 * exam questions with marking schemes, marking written answers against a rubric, report
 * card remarks for a whole class, and the list of students falling behind.
 * Everything works without AI, with simpler stand-ins, and gets better once it is on.
 */
@Injectable()
export class TeachingService {
  constructor(
    private readonly dbs: DbService,
    private readonly ai: AiService,
    private readonly kb: KnowledgeService,
    private readonly results: ResultsService,
    private readonly attendance: AttendanceService,
  ) {}

  // ------------------------------------------------------------ Context

  private async classSubject(tx: Tx, user: Principal, classId: string, subjectId: string) {
    const cls = await assertTeachesSubject(tx, user, classId, subjectId);
    const [section] = await tx.select().from(sections).where(eq(sections.id, cls.sectionId));
    const [subject] = await tx.select().from(subjects).where(eq(subjects.id, subjectId));
    const [term] = await tx.select().from(terms).where(eq(terms.isCurrent, true)).limit(1);
    return { cls, section, subject: found(subject, 'Subject'), term: term ?? null, classLevel: cls.name };
  }

  /** What the assistant knows about a class and subject: the scheme of work, the term, and whether AI is on. */
  context(user: Principal, classId: string, subjectId: string) {
    return this.dbs.withSchool(user.schoolId, async (tx) => {
      const c = await this.classSubject(tx, user, classId, subjectId);
      const outline = await this.kb.outline(tx, { subjectId, classLevel: c.classLevel });
      return {
        class: { id: c.cls.id, name: c.cls.name, arm: c.cls.arm },
        subject: { id: c.subject.id, name: c.subject.name },
        section: { kind: c.section.kind, components: c.section.components },
        term: c.term ? { id: c.term.id, name: c.term.name, number: c.term.number } : null,
        outline: outline.sort((a, b) => (a.termNumber ?? 0) - (b.termNumber ?? 0) || a.week - b.week),
        aiEnabled: this.ai.enabled,
      };
    });
  }

  // ------------------------------------------------------------ Lesson notes and plans

  async lesson(user: Principal, input: LessonInput) {
    const ctx = await this.dbs.withSchool(user.schoolId, async (tx) => {
      const c = await this.classSubject(tx, user, input.classId, input.subjectId);
      const passages = await this.kb.search(tx, input.topic, {
        subjectId: input.subjectId,
        classLevel: c.classLevel,
        termNumber: c.term?.number ?? null,
        // Teaching material only: earlier plans, tests and marking schemes would make drafts quote drafts.
        excludeKinds: ['lesson_plan', 'past_questions', 'marking_scheme'],
        limit: 6,
      });
      return { ...c, passages };
    });
    const kindName = input.kind === 'lesson_plan' ? 'Lesson plan' : 'Lesson note';
    const header = { subject: ctx.subject.name, classLevel: ctx.classLevel, term: ctx.term?.name ?? null };
    const { block, used } = KnowledgeService.sourcesBlock(ctx.passages);

    if (!this.ai.enabled) {
      return {
        title: `${input.topic} (${kindName.toLowerCase()})`,
        body: lessonTemplate(input, header, used),
        citations: used.map(citationOf),
        source: 'template' as const,
      };
    }

    const shape =
      input.kind === 'lesson_plan'
        ? `a lesson plan for a ${input.durationMinutes}-minute lesson with these headings: Subject and class; Topic; Duration; ` +
          'Behavioural objectives (by the end of the lesson, students should be able to...); Instructional materials; Previous knowledge; ' +
          'Introduction (with minutes); Presentation, as numbered steps each with Teacher activity and Student activity (with minutes); ' +
          'Evaluation (3-5 questions); Summary (board notes); Assignment.'
        : 'a lesson note students can copy, with: Topic; a short introduction; the content under clear subheadings, with definitions, ' +
          'formulas or rules; at least two worked examples with full working where the subject allows; Evaluation (4-5 questions with answers for the teacher); Assignment.';
    const out = await this.ai.json({
      feature: 'lesson_draft',
      schoolId: user.schoolId,
      staffId: user.staffId,
      system: ASSISTANT_SYSTEM,
      prompt:
        `Write ${shape}\n\nSubject: ${ctx.subject.name}. Class: ${ctx.classLevel}. Term: ${ctx.term?.name ?? 'not set'}. ` +
        `Topic: ${input.topic}${input.week ? ` (week ${input.week} of the scheme of work)` : ''}.\n` +
        (input.notes ? `Teacher's notes: ${input.notes}\n` : '') +
        (block ? `\nThe school's own material on this topic:\n${block}\n` : '\nThe school has no material on this topic yet; use the NERDC curriculum.\n'),
      schema: docSchema,
      validate: docZod,
      effort: 'medium',
      maxTokens: 8000,
    });
    const cited = out.sources.map((n) => used[n - 1]).filter(Boolean);
    return { title: out.title, body: out.body, citations: cited.map(citationOf), source: 'ai' as const };
  }

  // ------------------------------------------------------------ Tests, exam questions and marking schemes

  async assessment(user: Principal, input: AssessmentInput) {
    const ctx = await this.dbs.withSchool(user.schoolId, async (tx) => {
      const c = await this.classSubject(tx, user, input.classId, input.subjectId);
      const wanted = new Set(input.topics.map((t) => t.toLowerCase()));
      const bank = (await tx.select().from(questions).where(eq(questions.subjectId, input.subjectId))).filter(
        (q) => (!q.sectionKind || q.sectionKind === c.section.kind) && (wanted.size === 0 || wanted.has(q.topic.toLowerCase())),
      );
      const passages = await this.kb.search(tx, input.topics.join(' '), { subjectId: input.subjectId, classLevel: c.classLevel, excludeKinds: ['lesson_plan'], limit: 6 });
      return { ...c, bank, passages };
    });
    const label = input.purpose === 'exam' ? 'examination' : 'class test';
    const title = `${ctx.classLevel} ${ctx.subject.name} ${label}${input.topics.length ? `: ${input.topics.slice(0, 3).join(', ')}` : ''}`;

    // From the school's own bank first; AI writes the rest when it is on.
    const fromBank = shuffle(ctx.bank, `${user.staffId}:${Date.now()}`)
      .slice(0, input.objectiveCount)
      .map((q) => ({ questionId: q.id, topic: q.topic, body: q.body, options: q.options, answer: q.answer, explanation: q.explanation ?? '', source: 'bank' as const }));
    const need = input.objectiveCount - fromBank.length;

    if (!this.ai.enabled) {
      return {
        title,
        objective: fromBank,
        theory: [] as { topic: string; question: string; points: RubricPoint[] }[],
        note:
          fromBank.length < input.objectiveCount
            ? `Your question bank has ${fromBank.length} questions on these topics. AI writes the rest, and theory questions with marking schemes, once it is switched on. You can type your own below.`
            : 'Theory questions and marking schemes are written by AI once it is switched on. You can type your own below.',
        source: 'bank' as const,
      };
    }

    const { block } = KnowledgeService.sourcesBlock(ctx.passages);
    const style = input.style === 'school' ? 'school' : input.style.toUpperCase();
    const out = await this.ai.json({
      feature: 'assessment_draft',
      schoolId: user.schoolId,
      staffId: user.staffId,
      system:
        ASSISTANT_SYSTEM +
        ' You write exam questions in the style of WAEC, NECO, BECE and JAMB past papers without copying real questions. ' +
        'Objective questions have exactly four options A-D and one correct answer. Theory questions have a marking scheme that adds up to the marks.',
      prompt:
        `Write a ${style}-style ${label} for ${ctx.classLevel} ${ctx.subject.name} on: ${input.topics.join(', ') || 'the term’s work'}.\n` +
        `Objective questions: ${Math.max(0, need)}. Theory questions: ${input.theoryCount}, each worth 5 to 10 marks.\n` +
        'Vary difficulty from easy to hard and spread the questions across the topics.\n' +
        (block ? `\nThe school's own material:\n${block}\n` : ''),
      schema: assessmentSchema,
      validate: assessmentZod,
      effort: 'medium',
      maxTokens: 16000,
    });
    const objective = [
      ...fromBank,
      ...out.objective
        .filter((q) => q.options.some((o) => o.key === q.answer))
        .slice(0, Math.max(0, need))
        .map((q) => ({ questionId: null, ...q, source: 'ai' as const })),
    ];
    const theory = out.theory.slice(0, input.theoryCount).map((t) => ({ ...t, points: t.points.filter((p) => p.marks > 0) }));
    return { title, objective, theory, note: null, source: 'ai' as const };
  }

  /** Saves a draft (lesson note, plan, marking scheme or test) into the knowledge base as Markdown. */
  save(user: Principal, input: { classId: string; subjectId: string; kind: 'lesson_note' | 'lesson_plan' | 'marking_scheme' | 'past_questions'; title: string; body: string; visibleToStudents?: boolean }) {
    return this.dbs
      .withSchool(user.schoolId, (tx) => this.classSubject(tx, user, input.classId, input.subjectId))
      .then((c) =>
        this.kb.upload(
          user,
          {
            title: input.title,
            kind: input.kind,
            subjectId: input.subjectId,
            classLevel: c.classLevel,
            termNumber: c.term?.number ?? null,
            // Plans, marking schemes and tests stay with staff; lesson notes are for students too.
            visibleToStudents: input.visibleToStudents ?? input.kind === 'lesson_note',
            fileName: `${slug(input.title)}.md`,
            mimeType: 'text/markdown',
          },
          Buffer.from(input.body, 'utf8'),
        ),
      );
  }

  // ------------------------------------------------------------ Essay and theory marking

  createEssay(user: Principal, input: EssayTaskInput) {
    if (!input.rubric.length) throw new BadRequestException('Add at least one marking point');
    return this.dbs.withSchool(user.schoolId, async (tx) => {
      await assertTeachesSubject(tx, user, input.classId, input.subjectId);
      if (input.termId) await assertOwned(tx, terms, input.termId, 'Term');
      if (input.scoreComponent) await this.assertComponent(tx, input.classId, input.scoreComponent);
      const [task] = await tx
        .insert(essayTasks)
        .values({
          schoolId: user.schoolId,
          classId: input.classId,
          subjectId: input.subjectId,
          termId: input.termId ?? null,
          scoreComponent: input.scoreComponent ?? null,
          title: input.title,
          question: input.question,
          rubric: input.rubric,
          maxMarks: input.rubric.reduce((n, r) => n + r.marks, 0),
          createdBy: user.staffId,
        })
        .returning();
      return task;
    });
  }

  private async assertComponent(tx: Tx, classId: string, key: string) {
    const [row] = await tx.select({ components: sections.components }).from(classes).innerJoin(sections, eq(sections.id, classes.sectionId)).where(eq(classes.id, classId));
    const comp = row?.components.find((c) => c.key === key);
    if (!comp) throw new BadRequestException(`This class has no score column "${key}"`);
    return comp;
  }

  listEssays(user: Principal, classId?: string) {
    return this.dbs.withSchool(user.schoolId, async (tx) => {
      const rows = await tx
        .select({
          task: essayTasks,
          className: classes.name,
          arm: classes.arm,
          subject: subjects.name,
          scripts: sql<number>`(select count(*) from essay_scripts s where s.task_id = ${essayTasks.id})::int`,
          confirmed: sql<number>`(select count(*) from essay_scripts s where s.task_id = ${essayTasks.id} and s.status = 'confirmed')::int`,
        })
        .from(essayTasks)
        .innerJoin(classes, eq(classes.id, essayTasks.classId))
        .innerJoin(subjects, eq(subjects.id, essayTasks.subjectId))
        .where(and(classId ? eq(essayTasks.classId, classId) : undefined, user.role === 'teacher' ? eq(essayTasks.createdBy, user.staffId) : undefined))
        .orderBy(desc(essayTasks.createdAt));
      return rows.map((r) => ({ ...r.task, className: `${r.className} ${r.arm}`.trim(), subject: r.subject, scripts: r.scripts, confirmed: r.confirmed }));
    });
  }

  private async task(tx: Tx, user: Principal, taskId: string) {
    const [task] = await tx.select().from(essayTasks).where(eq(essayTasks.id, taskId));
    if (!task) throw new NotFoundException('Marking task not found');
    await assertTeachesSubject(tx, user, task.classId, task.subjectId);
    return task;
  }

  /** The task with every student in the class and their script, if one has been entered. */
  getEssay(user: Principal, taskId: string) {
    return this.dbs.withSchool(user.schoolId, async (tx) => {
      const task = await this.task(tx, user, taskId);
      const roster = await tx.select().from(students).where(eq(students.classId, task.classId)).orderBy(asc(students.lastName), asc(students.firstName));
      const scripts = await tx.select().from(essayScripts).where(eq(essayScripts.taskId, taskId));
      const byStudent = new Map(scripts.map((s) => [s.studentId, s]));
      const [subject] = await tx.select().from(subjects).where(eq(subjects.id, task.subjectId));
      return {
        ...task,
        subject: subject?.name ?? '',
        aiEnabled: this.ai.enabled,
        students: roster.map((s) => ({
          studentId: s.id,
          name: `${s.lastName} ${s.firstName}`,
          admissionNumber: s.admissionNumber,
          script: byStudent.get(s.id) ?? null,
        })),
      };
    });
  }

  /** Saves a student's answer and suggests marks for each point: AI when it is on, key words otherwise. */
  async submitScript(user: Principal, taskId: string, studentId: string, answer: string) {
    const task = await this.dbs.withSchool(user.schoolId, async (tx) => {
      const t = await this.task(tx, user, taskId);
      const [s] = await tx.select().from(students).where(eq(students.id, studentId));
      if (!s || s.classId !== t.classId) throw new BadRequestException('That student is not in this class');
      const [subject] = await tx.select().from(subjects).where(eq(subjects.id, t.subjectId));
      const [cls] = await tx.select().from(classes).where(eq(classes.id, t.classId));
      return { ...t, subjectName: subject.name, classLevel: cls.name };
    });
    const suggestion = await this.mark(user, task, answer);
    return this.dbs.withSchool(user.schoolId, async (tx) => {
      const [row] = await tx
        .insert(essayScripts)
        .values({ schoolId: user.schoolId, taskId, studentId, answer, suggestion, status: 'suggested', markedBy: user.staffId })
        .onConflictDoUpdate({
          target: [essayScripts.taskId, essayScripts.studentId],
          set: { answer, suggestion, status: 'suggested', awarded: null, updatedAt: new Date(), markedBy: user.staffId },
        })
        .returning();
      return row;
    });
  }

  private async mark(
    user: Principal,
    task: typeof essayTasks.$inferSelect & { subjectName: string; classLevel: string },
    answer: string,
  ): Promise<MarkSuggestion & { source: 'ai' | 'keywords' }> {
    if (!this.ai.enabled) return { ...suggestMarks(answer, task.rubric), source: 'keywords' };
    const points = task.rubric.map((r, i) => `${i + 1}. ${r.point} (${r.marks} mark${r.marks === 1 ? '' : 's'})`).join('\n');
    const out = await this.ai.json({
      feature: 'essay_marking',
      schoolId: user.schoolId,
      staffId: user.staffId,
      system:
        'You help Nigerian teachers mark written answers against their marking scheme, as a fair and careful WAEC examiner would. ' +
        'Award marks only for points the answer actually makes, accept correct ideas in the student’s own words, ignore spelling unless the scheme says otherwise, ' +
        'and never award more than a point is worth. The teacher makes the final decision.',
      prompt:
        `${task.classLevel} ${task.subjectName}.\nQuestion: ${task.question}\n\nMarking scheme:\n${points}\n\n` +
        `Student's answer (between the lines):\n-----\n${answer.slice(0, 8000)}\n-----`,
      schema: markSchema,
      validate: markZod,
      maxTokens: 3000,
    });
    const byIndex = new Map(out.criteria.map((c) => [c.index, c]));
    const criteria = task.rubric.map((r, i) => {
      const c = byIndex.get(i + 1);
      const awarded = Math.min(r.marks, Math.max(0, Math.round((c?.awarded ?? 0) * 2) / 2));
      return { point: r.point, marks: r.marks, awarded, reason: c?.reason ?? 'Not assessed.' };
    });
    const total = criteria.reduce((n, c) => n + c.awarded, 0);
    return { criteria, total, max: task.maxMarks, feedback: out.feedback, source: 'ai' };
  }

  /** The teacher's final mark. Suggested marks never reach a score sheet until confirmed. */
  confirmScript(user: Principal, taskId: string, studentId: string, input: { awarded: number; teacherNote?: string | null }) {
    return this.dbs.withSchool(user.schoolId, async (tx) => {
      const task = await this.task(tx, user, taskId);
      if (input.awarded > task.maxMarks) throw new BadRequestException(`The most this question can score is ${task.maxMarks}`);
      const [row] = await tx
        .update(essayScripts)
        .set({ awarded: input.awarded, teacherNote: input.teacherNote ?? null, status: 'confirmed', markedBy: user.staffId, updatedAt: new Date() })
        .where(and(eq(essayScripts.taskId, taskId), eq(essayScripts.studentId, studentId)))
        .returning();
      if (!row) throw new NotFoundException('Enter the answer before confirming a mark');
      return row;
    });
  }

  /** Writes confirmed marks into the term's score column, scaled to that column's maximum. */
  pushEssayScores(user: Principal, taskId: string) {
    return this.dbs.withSchool(user.schoolId, async (tx) => {
      const task = await this.task(tx, user, taskId);
      if (!task.termId || !task.scoreComponent) throw new BadRequestException('Choose the term and score column for this task first');
      const comp = await this.assertComponent(tx, task.classId, task.scoreComponent);
      const done = await tx
        .select({ script: essayScripts, classId: students.classId })
        .from(essayScripts)
        .innerJoin(students, eq(students.id, essayScripts.studentId))
        .where(and(eq(essayScripts.taskId, taskId), eq(essayScripts.status, 'confirmed')));
      let written = 0;
      const skipped: { studentId: string; reason: string }[] = [];
      for (const { script, classId } of done) {
        if (classId !== task.classId) {
          skipped.push({ studentId: script.studentId, reason: 'Student is no longer in this class' });
          continue;
        }
        const value = scaleMark(script.awarded ?? 0, task.maxMarks, comp.maxScore);
        const [existing] = await tx
          .select()
          .from(scores)
          .where(and(eq(scores.termId, task.termId), eq(scores.subjectId, task.subjectId), eq(scores.studentId, script.studentId)));
        const merged = { ...(existing?.scores ?? {}), [comp.key]: value };
        await tx
          .insert(scores)
          .values({ schoolId: user.schoolId, termId: task.termId, classId: task.classId, subjectId: task.subjectId, studentId: script.studentId, scores: merged, enteredBy: user.staffId })
          .onConflictDoUpdate({
            target: [scores.termId, scores.subjectId, scores.studentId],
            set: { scores: merged, classId: task.classId, enteredBy: user.staffId, updatedAt: new Date() },
          });
        written++;
      }
      return { written, component: comp.key, outOf: comp.maxScore, skipped };
    });
  }

  removeEssay(user: Principal, taskId: string) {
    return this.dbs.withSchool(user.schoolId, async (tx) => {
      await this.task(tx, user, taskId);
      await tx.delete(essayTasks).where(eq(essayTasks.id, taskId));
      return { deleted: true };
    });
  }

  // ------------------------------------------------------------ Report card remarks for a class

  /**
   * Drafts remarks for every student in a class for a term, for the form teacher to edit and
   * save. Students who already have a teacher's remark keep it unless `overwrite` is set.
   */
  async classRemarks(user: Principal, termId: string, classId: string) {
    const ctx = await this.dbs.withSchool(user.schoolId, async (tx) => {
      const cls = await assertTeachesClass(tx, user, classId);
      await assertOwned(tx, terms, termId, 'Term');
      // Remarks are written on full results: a term with only the CAs in would read as a collapse.
      const [section] = await tx.select().from(sections).where(eq(sections.id, cls.sectionId));
      const entered = await tx.select({ scores: scores.scores }).from(scores).where(and(eq(scores.termId, termId), eq(scores.classId, classId)));
      const complete = entered.filter((r) => section.components.every((c) => typeof r.scores[c.key] === 'number')).length;
      if (entered.length && complete / entered.length < 0.8) {
        throw new BadRequestException(
          `Scores for this term are not complete yet: ${Math.round((complete / entered.length) * 100)}% of subjects have every column. Draft remarks once the exam scores are in.`,
        );
      }
      const sheet = await this.results.broadsheet(user, termId, classId);
      const ids = sheet.students.map((s) => s.studentId);
      if (!ids.length) throw new BadRequestException('No scores have been entered for this class this term');
      const studentRows = await tx.select().from(students).where(inArray(students.id, ids));
      const firstNames = new Map(studentRows.map((s) => [s.id, s.firstName]));
      const existing = await tx.select().from(reportComments).where(and(eq(reportComments.termId, termId), inArray(reportComments.studentId, ids)));
      const comments = new Map(existing.map((c) => [c.studentId, c]));
      const previous = await this.previousAverages(tx, termId, ids);
      const range = await this.attendance.termRange(tx, termId);
      const att = range ? await this.attendance.summarise(tx, ids, range.from, range.to, classId) : null;
      const subjectNames = new Map(sheet.subjects.map((s) => [s.id, s.name]));
      const inputs = sheet.students.map((s) => ({
        studentId: s.studentId,
        name: s.name ?? '',
        average: s.average,
        positionText: s.positionText,
        current: comments.get(s.studentId)?.teacherComment ?? null,
        currentHead: comments.get(s.studentId)?.headComment ?? null,
        remark: {
          key: s.studentId,
          firstName: firstNames.get(s.studentId) ?? '',
          average: s.average,
          position: s.position,
          outOf: sheet.studentCount,
          subjects: s.subjects.map((x) => ({ name: subjectNames.get(x.subjectId) ?? '', total: x.total })),
          previousAverage: previous.get(s.studentId) ?? null,
          attendance: att?.get(s.studentId) ? { present: att.get(s.studentId)!.present + att.get(s.studentId)!.late, opened: att.get(s.studentId)!.opened } : null,
        },
      }));
      return { sheet, inputs };
    });

    let drafts = new Map<string, RemarkDraft>(ctx.inputs.map((i) => [i.studentId, draftRemark(i.remark)]));
    let source: 'ai' | 'template' = 'template';
    if (this.ai.enabled) {
      drafts = new Map();
      for (let i = 0; i < ctx.inputs.length; i += 15) {
        const batch = ctx.inputs.slice(i, i + 15);
        const out = await this.ai.json({
          feature: 'report_comment',
          schoolId: user.schoolId,
          staffId: user.staffId,
          system:
            'You draft report card remarks for a Nigerian school. Be specific to each student’s results, warm and honest, name one strength and one area ' +
            'to improve, and avoid clichés and repeating the same sentence for different students. Never mention a position in the bottom third of the class.',
          prompt: `${ctx.sheet.class.name} ${ctx.sheet.class.arm}, ${ctx.sheet.studentCount} students. Draft remarks for each:\n${JSON.stringify(
            batch.map((b) => ({ studentId: b.studentId, ...b.remark, key: undefined, position: b.positionText })),
            null,
            1,
          )}`,
          schema: remarksSchema,
          validate: remarksZod,
          maxTokens: 6000,
        });
        for (const r of out.remarks) drafts.set(r.studentId, { teacherComment: r.teacherComment, headComment: r.headComment });
      }
      source = 'ai';
    }
    return {
      class: ctx.sheet.class,
      source,
      students: ctx.inputs.map((i) => ({
        studentId: i.studentId,
        name: i.name,
        average: i.average,
        position: i.positionText,
        current: { teacherComment: i.current, headComment: i.currentHead },
        draft: drafts.get(i.studentId) ?? draftRemark(i.remark),
      })),
    };
  }

  /** Each student's average in the term before this one, for the trend in remarks. */
  private async previousAverages(tx: Tx, termId: string, ids: string[]) {
    const prev = await this.termBefore(tx, termId);
    const out = new Map<string, number>();
    if (!prev) return out;
    const rows = await tx
      .select({ studentId: scores.studentId, scores: scores.scores, components: sections.components })
      .from(scores)
      .innerJoin(classes, eq(classes.id, scores.classId))
      .innerJoin(sections, eq(sections.id, classes.sectionId))
      .where(and(eq(scores.termId, prev.id), inArray(scores.studentId, ids)));
    const sums = new Map<string, number[]>();
    for (const r of rows) {
      try {
        sums.set(r.studentId, [...(sums.get(r.studentId) ?? []), subjectTotal(r.scores, r.components)]);
      } catch {
        // Older grading split; skip.
      }
    }
    for (const [id, xs] of sums) out.set(id, Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10);
    return out;
  }

  private async termBefore(tx: Tx, termId: string) {
    const all = await tx
      .select({ id: terms.id, number: terms.number, session: academicSessions.name })
      .from(terms)
      .innerJoin(academicSessions, eq(academicSessions.id, terms.sessionId));
    const order = (t: { number: number; session: string }) => Number(t.session.slice(0, 4)) * 10 + t.number;
    const sorted = all.sort((a, b) => order(a) - order(b));
    const i = sorted.findIndex((t) => t.id === termId);
    return i > 0 ? sorted[i - 1] : null;
  }

  // ------------------------------------------------------------ Students falling behind

  /** Students in a class who are falling behind this term, most urgent first, with the reasons. */
  watchlist(user: Principal, classId: string) {
    return this.dbs.withSchool(user.schoolId, async (tx) => {
      const cls = await assertTeachesClass(tx, user, classId);
      const [section] = await tx.select().from(sections).where(eq(sections.id, cls.sectionId));
      const [term] = await tx.select().from(terms).where(eq(terms.isCurrent, true)).limit(1);
      if (!term) throw new BadRequestException('Set the current term first');
      const prev = await this.termBefore(tx, term.id);
      const roster = await tx.select().from(students).where(eq(students.classId, classId)).orderBy(asc(students.lastName));
      const ids = roster.map((s) => s.id);
      if (!ids.length) return { class: { id: cls.id, name: cls.name, arm: cls.arm }, term: { id: term.id, name: term.name }, students: [] };

      const subjectRows = await tx.select().from(subjects);
      const subjectName = new Map(subjectRows.map((s) => [s.id, s.name]));
      const scoreRows = await tx
        .select({ termId: scores.termId, studentId: scores.studentId, subjectId: scores.subjectId, scores: scores.scores, components: sections.components })
        .from(scores)
        .innerJoin(classes, eq(classes.id, scores.classId))
        .innerJoin(sections, eq(sections.id, classes.sectionId))
        .where(and(inArray(scores.studentId, ids), inArray(scores.termId, prev ? [term.id, prev.id] : [term.id])));

      const range = await this.attendance.termRange(tx, term.id);
      const att = range ? await this.attendance.summarise(tx, ids, range.from, range.to, classId) : null;

      // Closed CBT tests set for this class this term that the student never sat.
      const closed = await tx
        .select({ id: cbtTests.id })
        .from(cbtTests)
        .innerJoin(cbtTestClasses, eq(cbtTestClasses.testId, cbtTests.id))
        .where(and(eq(cbtTestClasses.classId, classId), eq(cbtTests.status, 'closed'), eq(cbtTests.termId, term.id)));
      const closedIds = closed.map((t) => t.id);
      const sat = closedIds.length
        ? await tx
            .select({ studentId: cbtAttempts.studentId, testId: cbtAttempts.testId })
            .from(cbtAttempts)
            .where(and(inArray(cbtAttempts.testId, closedIds), inArray(cbtAttempts.studentId, ids)))
        : [];
      const satBy = new Map<string, Set<string>>();
      for (const s of sat) satBy.set(s.studentId, (satBy.get(s.studentId) ?? new Set()).add(s.testId!));

      const since = new Date(Date.now() - 14 * DAY);
      const practice = await tx
        .select({ studentId: cbtAttempts.studentId, n: sql<number>`count(*)::int` })
        .from(cbtAttempts)
        .where(and(inArray(cbtAttempts.studentId, ids), isNotNull(cbtAttempts.submittedAt), gte(cbtAttempts.submittedAt, since), inArray(cbtAttempts.kind, ['practice', 'mock'])))
        .groupBy(cbtAttempts.studentId);
      const quizzes = await tx
        .select({ studentId: tutorConversations.studentId, n: sql<number>`count(*)::int` })
        .from(tutorMessages)
        .innerJoin(tutorConversations, eq(tutorConversations.id, tutorMessages.conversationId))
        .where(and(inArray(tutorConversations.studentId, ids), isNotNull(tutorMessages.quizAnswer), gte(tutorMessages.createdAt, since)))
        .groupBy(tutorConversations.studentId);
      const active = new Map<string, number>();
      for (const r of [...practice, ...quizzes]) active.set(r.studentId, (active.get(r.studentId) ?? 0) + r.n);

      const passMark = section.kind === 'senior_secondary' ? 50 : 40;
      const out = roster.map((s) => {
        const mine = scoreRows.filter((r) => r.studentId === s.id);
        const subjectIds = [...new Set(mine.map((r) => r.subjectId))];
        const subjectsIn = subjectIds.map((sid) => {
          const cur = mine.find((r) => r.subjectId === sid && r.termId === term.id);
          const old = prev ? mine.find((r) => r.subjectId === sid && r.termId === prev.id) : undefined;
          let previous: number | null = null;
          if (old) {
            try {
              previous = subjectTotal(old.scores, old.components);
            } catch {
              previous = null;
            }
          }
          return { name: subjectName.get(sid) ?? '', current: cur ? percentSoFar(cur.scores, cur.components) : null, previous };
        });
        const a = att?.get(s.id);
        const result = watchStudent({
          subjects: subjectsIn,
          passMark,
          attendanceRate: a && a.opened > 0 ? (a.present + a.late) / a.opened : null,
          missedTests: closedIds.filter((t) => !satBy.get(s.id)?.has(t)).length,
          recentPractice: active.get(s.id) ?? 0,
        });
        return { studentId: s.id, name: `${s.lastName} ${s.firstName}`, admissionNumber: s.admissionNumber, ...result };
      });
      const rank = { high: 0, medium: 1 } as Record<string, number>;
      out.sort((a, b) => (rank[a.level ?? ''] ?? 2) - (rank[b.level ?? ''] ?? 2) || (a.average ?? 101) - (b.average ?? 101));
      return {
        class: { id: cls.id, name: cls.name, arm: cls.arm },
        term: { id: term.id, name: term.name },
        passMark,
        counts: { high: out.filter((o) => o.level === 'high').length, medium: out.filter((o) => o.level === 'medium').length, total: out.length },
        students: out,
      };
    });
  }
}

// ---------------------------------------------------------------- Stand-ins and helpers

function lessonTemplate(input: LessonInput, h: { subject: string; classLevel: string; term: string | null }, used: Passage[]): string {
  const notes = used.length
    ? used.map((p, i) => `[${i + 1}] ${p.title}${p.locator ? ` · ${p.locator}` : ''}\n\n${p.text.trim()}`).join('\n\n')
    : '_Your knowledge base has nothing on this topic yet. Upload your notes so the assistant can use them._';
  const meta = `**Subject:** ${h.subject}  \n**Class:** ${h.classLevel}  \n**Term:** ${h.term ?? '-'}${input.week ? `, week ${input.week}` : ''}  \n**Topic:** ${input.topic}`;
  if (input.kind === 'lesson_plan') {
    const d = input.durationMinutes;
    const intro = Math.max(5, Math.round(d * 0.15));
    const evalMin = Math.max(5, Math.round(d * 0.15));
    const pres = d - intro - evalMin - 5;
    return [
      `# Lesson plan: ${input.topic}`,
      meta + `  \n**Duration:** ${d} minutes`,
      '## Behavioural objectives',
      `By the end of the lesson, students should be able to:\n1. Explain what ${input.topic} means.\n2. [Add an objective]\n3. [Add an objective]`,
      '## Instructional materials',
      '- [Charts, real objects, textbook pages]',
      '## Previous knowledge',
      '- [What students learnt before that this lesson builds on]',
      `## Introduction (${intro} minutes)`,
      `- Teacher asks questions on the previous lesson and links it to ${input.topic}.`,
      `## Presentation (${pres} minutes)`,
      `1. **Step 1.** Teacher activity: [explain the first idea]. Student activity: [listen, ask questions, copy notes].\n2. **Step 2.** Teacher activity: [worked example on the board]. Student activity: [try a similar example].\n3. **Step 3.** Teacher activity: [class exercise]. Student activity: [solve in pairs].`,
      `## Evaluation (${evalMin} minutes)`,
      '1. [Question]\n2. [Question]\n3. [Question]',
      '## Summary (board notes)',
      '- [Key points to copy]',
      '## Assignment',
      '- [Homework]',
      "## From your school's notes",
      notes,
      ...(input.notes ? ['## Your notes', input.notes] : []),
    ].join('\n\n');
  }
  return [
    `# Lesson note: ${input.topic}`,
    meta,
    '## Introduction',
    `[Introduce ${input.topic} with an everyday example students know.]`,
    "## Content from your school's notes",
    notes,
    '## Worked examples',
    '1. [Example with full working]\n2. [Example with full working]',
    '## Evaluation',
    '1. [Question]\n2. [Question]\n3. [Question]\n4. [Question]',
    '## Assignment',
    '- [Homework]',
    ...(input.notes ? ['## Your notes', input.notes] : []),
  ].join('\n\n');
}

function slug(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'document';
}

/** Deterministic shuffle, so two clicks a moment apart give different but repeatable picks. */
function shuffle<T>(xs: T[], seed: string): T[] {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  const out = [...xs];
  for (let i = out.length - 1; i > 0; i--) {
    h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0;
    const j = h % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

