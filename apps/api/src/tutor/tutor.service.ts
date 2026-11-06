import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { SAFETY_REPLIES, screenStudentMessage, seededShuffle } from '@school-ms/core';
import { and, asc, desc, eq, ilike, isNotNull, ne } from 'drizzle-orm';
import { z } from 'zod';
import { StudentPrincipal } from '../auth/auth.types';
import { config } from '../common/config';
import { assertOwned } from '../common/owned';
import { found } from '../common/validation';
import { Tx } from '../db/client';
import { DbService } from '../db/db.service';
import {
  cbtTestQuestions,
  cbtTests,
  Citation,
  classes,
  classSubjects,
  questions,
  sections,
  students,
  subjects,
  terms,
  tutorConversations,
  tutorMessages,
  TutorQuiz,
} from '../db/schema';
import { citationOf, KnowledgeService, Passage } from '../knowledge/knowledge.service';
import { AiService } from '../prep/ai.service';

export const TUTOR_INTENTS = ['ask', 'explain', 'example', 'quiz', 'hint'] as const;
export type TutorIntent = (typeof TUTOR_INTENTS)[number];

type SectionKind = (typeof sections.$inferSelect)['kind'];
type Message = typeof tutorMessages.$inferSelect;

const LEVEL_NOTE: Record<SectionKind, string> = {
  nursery: 'a nursery pupil aged about 3 to 5. Use very short sentences, simple words and counting objects children know.',
  primary: 'a primary school pupil aged about 6 to 11. Use short sentences, simple words and everyday Nigerian examples.',
  junior_secondary: 'a junior secondary (JSS) student aged about 11 to 14, working towards the BECE.',
  senior_secondary: 'a senior secondary (SS) student aged about 14 to 18, working towards WAEC, NECO and JAMB UTME.',
};

const INTENT_NOTE: Record<TutorIntent, string> = {
  ask: 'Answer the student’s message.',
  explain: 'Explain the topic step by step at the student’s level, with one everyday Nigerian example. End with one short question that checks understanding.',
  example:
    'Give one fully worked exam-style example, one step per line, explaining why each step is taken. Then give a similar question for the student to try, without its answer.',
  quiz: 'Set one exam-standard multiple-choice question (options A to D, exactly one correct) on the topic in the quiz field. Keep the reply to one encouraging line introducing it. Do not reveal the answer in the reply.',
  hint: 'Give only the next small hint towards the answer of the problem being worked on. Do not give the final answer.',
};

const replyZod = z.object({
  reply: z.string(),
  sources: z.array(z.number().int()),
  quiz: z.array(
    z.object({
      question: z.string(),
      options: z.array(z.object({ key: z.string(), text: z.string() })),
      answer: z.string(),
      explanation: z.string(),
    }),
  ),
  followUps: z.array(z.string()),
});
const replySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['reply', 'sources', 'quiz', 'followUps'],
  properties: {
    reply: { type: 'string', description: 'What the tutor says. Under 180 words. Plain text; **bold** and simple lists allowed.' },
    sources: { type: 'array', items: { type: 'integer' }, description: 'Numbers of the school sources used in the reply.' },
    quiz: {
      type: 'array',
      description: 'Empty, or exactly one multiple-choice question when asked to quiz the student.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['question', 'options', 'answer', 'explanation'],
        properties: {
          question: { type: 'string' },
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
          explanation: { type: 'string', description: 'Worked explanation shown after the student answers.' },
        },
      },
    },
    followUps: { type: 'array', items: { type: 'string' }, description: 'Up to three short things the student could ask next.' },
  },
};

/** Messages of history sent with each request: enough for context, small enough to stay cheap. */
const HISTORY = 10;

/**
 * The student's subject tutor. Explains at the student's class level, follows the Nigerian
 * curriculum and the school's scheme of work, answers from the school's own material first
 * (with citations), quizzes the student, and guides them to answers instead of doing homework.
 * Without an AI key it falls back to the school's notes and question bank.
 */
@Injectable()
export class TutorService {
  constructor(
    private readonly dbs: DbService,
    private readonly ai: AiService,
    private readonly kb: KnowledgeService,
  ) {}

  // ------------------------------------------------------------ Context

  private async studentContext(tx: Tx, studentId: string) {
    const [row] = await tx
      .select({ student: students, className: classes.name, arm: classes.arm, sectionKind: sections.kind })
      .from(students)
      .leftJoin(classes, eq(classes.id, students.classId))
      .leftJoin(sections, eq(sections.id, classes.sectionId))
      .where(eq(students.id, studentId));
    found(row, 'Student');
    const [term] = await tx.select({ number: terms.number, name: terms.name }).from(terms).where(eq(terms.isCurrent, true)).limit(1);
    return {
      firstName: row.student.firstName,
      classId: row.student.classId,
      classLevel: row.className,
      sectionKind: (row.sectionKind ?? 'senior_secondary') as SectionKind,
      termNumber: term?.number ?? null,
      termName: term?.name ?? null,
    };
  }

  private async assertTakesSubject(tx: Tx, classId: string | null, subjectId: string) {
    await assertOwned(tx, subjects, subjectId, 'Subject');
    if (!classId) throw new BadRequestException('You are not in a class yet');
    const [link] = await tx
      .select({ id: classSubjects.id })
      .from(classSubjects)
      .where(and(eq(classSubjects.classId, classId), eq(classSubjects.subjectId, subjectId)));
    if (!link) throw new BadRequestException('Your class does not take this subject');
  }

  // ------------------------------------------------------------ Topics

  /** Topics to pick from: the scheme of work for the student's class, and question-bank topics. */
  topics(student: StudentPrincipal, subjectId: string) {
    return this.dbs.withSchool(student.schoolId, async (tx) => {
      const ctx = await this.studentContext(tx, student.studentId);
      await this.assertTakesSubject(tx, ctx.classId, subjectId);
      const scheme = await this.kb.outline(tx, { subjectId, classLevel: ctx.classLevel, studentsOnly: true });
      const bank = await tx
        .selectDistinct({ topic: questions.topic })
        .from(questions)
        .where(and(eq(questions.subjectId, subjectId)))
        .orderBy(asc(questions.topic));
      return {
        currentTerm: ctx.termNumber,
        schemeOfWork: scheme.sort((a, b) => (a.termNumber ?? 0) - (b.termNumber ?? 0) || a.week - b.week),
        bankTopics: bank.map((b) => b.topic),
      };
    });
  }

  // ------------------------------------------------------------ Conversations

  startConversation(student: StudentPrincipal, input: { subjectId: string; topic?: string }) {
    return this.dbs.withSchool(student.schoolId, async (tx) => {
      const ctx = await this.studentContext(tx, student.studentId);
      await this.assertTakesSubject(tx, ctx.classId, input.subjectId);
      const [subject] = await tx.select().from(subjects).where(eq(subjects.id, input.subjectId));
      const [c] = await tx
        .insert(tutorConversations)
        .values({
          schoolId: student.schoolId,
          studentId: student.studentId,
          subjectId: input.subjectId,
          topic: input.topic?.trim() || null,
          title: input.topic?.trim() ? `${subject.name}: ${input.topic.trim()}` : subject.name,
        })
        .returning();
      return { ...c, subject: subject.name, messages: [] };
    });
  }

  listConversations(student: StudentPrincipal) {
    return this.dbs.withSchool(student.schoolId, (tx) =>
      tx
        .select({
          id: tutorConversations.id,
          title: tutorConversations.title,
          topic: tutorConversations.topic,
          subjectId: tutorConversations.subjectId,
          subject: subjects.name,
          updatedAt: tutorConversations.updatedAt,
        })
        .from(tutorConversations)
        .innerJoin(subjects, eq(subjects.id, tutorConversations.subjectId))
        .where(eq(tutorConversations.studentId, student.studentId))
        .orderBy(desc(tutorConversations.updatedAt))
        .limit(30),
    );
  }

  private async mine(tx: Tx, student: StudentPrincipal, conversationId: string) {
    const [c] = await tx
      .select({ conversation: tutorConversations, subject: subjects.name })
      .from(tutorConversations)
      .innerJoin(subjects, eq(subjects.id, tutorConversations.subjectId))
      .where(and(eq(tutorConversations.id, conversationId), eq(tutorConversations.studentId, student.studentId)));
    if (!c) throw new NotFoundException('Conversation not found');
    return c;
  }

  /** What the student sees: quiz answers stay hidden until they answer. */
  static view(m: Message) {
    const answered = m.quizAnswer !== null;
    return {
      id: m.id,
      role: m.role,
      intent: m.intent,
      content: m.content,
      citations: m.citations,
      source: m.source,
      createdAt: m.createdAt,
      quiz: m.quiz
        ? {
            question: m.quiz.question,
            options: m.quiz.options,
            chosen: m.quizAnswer,
            ...(answered ? { answer: m.quiz.answer, correct: m.quizCorrect, explanation: m.quiz.explanation } : {}),
          }
        : null,
    };
  }

  getConversation(student: StudentPrincipal, conversationId: string) {
    return this.dbs.withSchool(student.schoolId, async (tx) => {
      const c = await this.mine(tx, student, conversationId);
      const msgs = await tx.select().from(tutorMessages).where(eq(tutorMessages.conversationId, conversationId)).orderBy(asc(tutorMessages.createdAt));
      return { ...c.conversation, subject: c.subject, aiEnabled: this.ai.enabled, messages: msgs.map(TutorService.view) };
    });
  }

  // ------------------------------------------------------------ Messages

  async send(student: StudentPrincipal, conversationId: string, input: { text?: string; intent: TutorIntent }) {
    const raw = input.text?.trim() ?? '';
    if (!raw && input.intent === 'ask') throw new BadRequestException('Type a question first');
    const screen = screenStudentMessage(raw);

    const prep = await this.dbs.withSchool(student.schoolId, async (tx) => {
      const c = await this.mine(tx, student, conversationId);
      const ctx = await this.studentContext(tx, student.studentId);
      const [mine] = await tx
        .insert(tutorMessages)
        .values({
          schoolId: student.schoolId,
          conversationId,
          role: 'student',
          intent: input.intent,
          content: screen.cleaned || defaultPrompt(input.intent, c.conversation.topic),
          safety: screen.category,
        })
        .returning();
      if (screen.category) {
        const [reply] = await tx
          .insert(tutorMessages)
          .values({ schoolId: student.schoolId, conversationId, role: 'tutor', content: SAFETY_REPLIES[screen.category], source: 'safety' })
          .returning();
        await tx
          .update(tutorConversations)
          .set({ updatedAt: new Date(), flagged: screen.category === 'personal_info' ? undefined : true })
          .where(eq(tutorConversations.id, conversationId));
        return { done: true as const, mine, reply };
      }
      if (this.ai.enabled) await this.ai.assertStudentAllowance(tx, student.schoolId, student.studentId);
      const history = await tx
        .select()
        .from(tutorMessages)
        .where(and(eq(tutorMessages.conversationId, conversationId), ne(tutorMessages.id, mine.id)))
        .orderBy(desc(tutorMessages.createdAt))
        .limit(HISTORY);
      const query = [raw, c.conversation.topic, c.subject].filter(Boolean).join(' ');
      const passages = await this.kb.search(tx, query, {
        subjectId: c.conversation.subjectId,
        classLevel: ctx.classLevel,
        termNumber: ctx.termNumber,
        studentsOnly: true,
        limit: 5,
      });
      const scheme = await this.kb.outline(tx, { subjectId: c.conversation.subjectId, classLevel: ctx.classLevel, termNumber: ctx.termNumber, studentsOnly: true });
      return { done: false as const, c, ctx, mine, history: history.reverse(), passages, scheme };
    });

    if (prep.done) return { message: TutorService.view(prep.mine), reply: TutorService.view(prep.reply), followUps: [] };

    const out = this.ai.enabled
      ? await this.aiReply(student, prep, raw, input.intent)
      : await this.offlineReply(student, prep.c.conversation, prep.passages, input.intent);

    const reply = await this.dbs.withSchool(student.schoolId, async (tx) => {
      const [r] = await tx
        .insert(tutorMessages)
        .values({
          schoolId: student.schoolId,
          conversationId,
          role: 'tutor',
          intent: input.intent,
          content: out.reply,
          citations: out.citations,
          quiz: out.quiz,
          source: out.source,
        })
        .returning();
      await tx.update(tutorConversations).set({ updatedAt: new Date() }).where(eq(tutorConversations.id, conversationId));
      return r;
    });
    return { message: TutorService.view(prep.mine), reply: TutorService.view(reply), followUps: out.followUps };
  }

  private async aiReply(
    student: StudentPrincipal,
    p: {
      c: { conversation: typeof tutorConversations.$inferSelect; subject: string };
      ctx: Awaited<ReturnType<TutorService['studentContext']>>;
      history: Message[];
      passages: Passage[];
      scheme: { week: number; topic: string; termNumber: number | null }[];
    },
    text: string,
    intent: TutorIntent,
  ) {
    const { block, used } = KnowledgeService.sourcesBlock(p.passages);
    const schemeLine = p.scheme.length
      ? `This term's scheme of work for ${p.c.subject}: ${p.scheme.filter((s) => !p.ctx.termNumber || !s.termNumber || s.termNumber === p.ctx.termNumber).map((s) => `Week ${s.week} ${s.topic}`).join('; ')}.`
      : '';
    const system = [
      `You are the Linx School tutor for ${p.c.subject}. You are talking to ${p.ctx.firstName}, ${LEVEL_NOTE[p.ctx.sectionKind]} Class: ${p.ctx.classLevel ?? 'not set'}.`,
      'Teach the Nigerian curriculum (NERDC), and the WAEC, NECO, JAMB and BECE syllabuses where they apply. Use British English, naira and Nigerian names and places in examples.',
      'Rules:',
      '- Use the school’s sources first when they cover the question, and cite them inline as [n]. Never invent a source.',
      '- Guide, do not do the work. If the student pastes homework, an assignment or test question, or asks for just the answer, do not give the final answer. Break it into steps, ask them to try the first step, and check their attempt. After a real attempt you may confirm or correct it.',
      '- Keep replies short for a phone screen: under 180 words, short paragraphs.',
      '- Write maths in plain text (x^2, 3/4, sqrt(2)).',
      '- Stay on school work. Politely decline anything unsafe, adult, violent, hateful or unrelated to learning, and steer back to the subject.',
      '- If the student seems upset, unsafe or mentions harm, respond kindly, tell them to speak to a trusted adult or teacher, and do not continue the lesson.',
      '- Never ask for or repeat personal details (phone, address, passwords).',
      schemeLine,
    ]
      .filter(Boolean)
      .join('\n');

    const history = p.history.map((m) => ({
      role: m.role === 'student' ? ('user' as const) : ('assistant' as const),
      content: m.quiz ? `${m.content}\n[Quiz: ${m.quiz.question}${m.quizAnswer ? ` Student answered ${m.quizAnswer}, ${m.quizCorrect ? 'correct' : `correct answer ${m.quiz.answer}`}` : ''}]` : m.content,
    }));
    const turn = [
      p.c.conversation.topic ? `Topic: ${p.c.conversation.topic}` : null,
      used.length ? `School sources:\n${block}` : 'No school sources matched; use the Nigerian curriculum.',
      `Task: ${INTENT_NOTE[intent]}`,
      `Student: ${text || defaultPrompt(intent, p.c.conversation.topic)}`,
    ]
      .filter(Boolean)
      .join('\n\n');
    // The API needs alternating turns starting with the student.
    const messages = mergeTurns([...history, { role: 'user' as const, content: turn }]);

    const out = await this.ai.json({
      feature: 'tutor',
      schoolId: student.schoolId,
      studentId: student.studentId,
      model: config.ai().tutorModel,
      system,
      messages,
      schema: replySchema,
      validate: replyZod,
      maxTokens: 4000,
    });
    const quiz = out.quiz.find((q) => q.options.length >= 2 && q.options.some((o) => o.key === q.answer));
    return {
      reply: out.reply,
      citations: out.sources.filter((n) => n >= 1 && n <= used.length).map((n) => citationOf(used[n - 1])),
      quiz: quiz ?? null,
      followUps: out.followUps.slice(0, 3),
      source: 'ai' as const,
    };
  }

  /**
   * Stand-in used until the AI key is added: quotes the school's notes on the topic and
   * draws quiz questions and worked examples from the school's question bank.
   */
  private async offlineReply(
    student: StudentPrincipal,
    conversation: typeof tutorConversations.$inferSelect,
    passages: Passage[],
    intent: TutorIntent,
  ): Promise<{ reply: string; citations: Citation[]; quiz: TutorQuiz | null; followUps: string[]; source: 'offline' }> {
    const followUps = ['Quiz me on this', 'Show me a worked example'];
    if (intent === 'quiz' || intent === 'example') {
      const q = await this.bankQuestion(student, conversation);
      if (q && intent === 'quiz') {
        return {
          reply: `Here is a practice question${conversation.topic ? ` on ${conversation.topic}` : ''} from your school’s question bank.`,
          citations: [],
          quiz: { question: q.body, options: q.options, answer: q.answer, explanation: q.explanation ?? `The correct answer is ${q.answer}.`, questionId: q.id },
          followUps: ['Quiz me again', 'Explain this topic'],
          source: 'offline',
        };
      }
      if (q && intent === 'example') {
        const right = q.options.find((o) => o.key === q.answer);
        return {
          reply: `Worked example (${q.topic}):\n\n${q.body}\n\nAnswer: ${q.answer}. ${right?.text ?? ''}\n\n${q.explanation ?? ''}`.trim(),
          citations: [],
          quiz: null,
          followUps: ['Quiz me on this', 'Explain this topic'],
          source: 'offline',
        };
      }
    }
    if (passages.length) {
      const top = passages.slice(0, 2);
      const quoted = top.map((p, i) => `[${i + 1}] ${trimExcerpt(p.text)}`).join('\n\n');
      return {
        reply: `The AI tutor is not switched on yet, so here is what your school’s notes say:\n\n${quoted}`,
        citations: top.map(citationOf),
        quiz: null,
        followUps,
        source: 'offline',
      };
    }
    return {
      reply:
        'The AI tutor is not switched on yet, and I could not find this in your school’s notes. ' +
        'Try a shorter question with the key words (for example "Ohm’s law"), or ask me to quiz you from the question bank.',
      citations: [],
      quiz: null,
      followUps: ['Quiz me on this'],
      source: 'offline',
    };
  }

  /** A question-bank question for this subject (and topic if possible) that is not in a live test. */
  private bankQuestion(student: StudentPrincipal, conversation: typeof tutorConversations.$inferSelect) {
    return this.dbs.withSchool(student.schoolId, async (tx) => {
      const reserved = new Set(
        (
          await tx
            .select({ id: cbtTestQuestions.questionId })
            .from(cbtTestQuestions)
            .innerJoin(cbtTests, eq(cbtTests.id, cbtTestQuestions.testId))
            .where(ne(cbtTests.status, 'closed'))
        ).map((r) => r.id),
      );
      const byTopic = conversation.topic
        ? await tx.select().from(questions).where(and(eq(questions.subjectId, conversation.subjectId), ilike(questions.topic, `%${conversation.topic}%`)))
        : [];
      const pool = (byTopic.length ? byTopic : await tx.select().from(questions).where(eq(questions.subjectId, conversation.subjectId))).filter((q) => !reserved.has(q.id));
      if (!pool.length) return null;
      return seededShuffle(pool, `${conversation.id}:${Date.now()}`)[0];
    });
  }

  /** The student answers a quiz question; it is marked and counts towards weak-topic tracking. */
  answerQuiz(student: StudentPrincipal, messageId: string, choice: string) {
    return this.dbs.withSchool(student.schoolId, async (tx) => {
      const [row] = await tx
        .select({ m: tutorMessages })
        .from(tutorMessages)
        .innerJoin(tutorConversations, eq(tutorConversations.id, tutorMessages.conversationId))
        .where(and(eq(tutorMessages.id, messageId), eq(tutorConversations.studentId, student.studentId), isNotNull(tutorMessages.quiz)));
      if (!row) throw new NotFoundException('Quiz not found');
      if (row.m.quizAnswer) return TutorService.view(row.m);
      const key = choice.toUpperCase();
      if (!row.m.quiz!.options.some((o) => o.key === key)) throw new BadRequestException('Pick one of the options');
      const [m] = await tx
        .update(tutorMessages)
        .set({ quizAnswer: key, quizCorrect: key === row.m.quiz!.answer })
        .where(eq(tutorMessages.id, messageId))
        .returning();
      return TutorService.view(m);
    });
  }
}

function defaultPrompt(intent: TutorIntent, topic: string | null): string {
  const t = topic ?? 'this topic';
  return { ask: '', explain: `Explain ${t}`, example: `Show me a worked example on ${t}`, quiz: `Quiz me on ${t}`, hint: 'Give me a hint' }[intent];
}

function trimExcerpt(text: string, max = 600): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  return `${cut.slice(0, Math.max(cut.lastIndexOf('. ') + 1, max - 80))} …`;
}

/** Joins consecutive same-role turns so the conversation alternates and starts with the student. */
function mergeTurns(msgs: { role: 'user' | 'assistant'; content: string }[]) {
  const out: { role: 'user' | 'assistant'; content: string }[] = [];
  for (const m of msgs) {
    if (!out.length && m.role === 'assistant') continue;
    const last = out.at(-1);
    if (last && last.role === m.role) last.content += `\n\n${m.content}`;
    else out.push({ ...m });
  }
  return out;
}
