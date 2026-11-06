import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { eq } from 'drizzle-orm';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { DbService } from '../src/db/db.service';
import { aiUsage, schools } from '../src/db/schema';
import { AiService } from '../src/prep/ai.service';

let app: INestApplication;
let http: ReturnType<typeof request>;
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
type Json = Record<string, any>;

beforeAll(async () => {
  const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = mod.createNestApplication();
  configureApp(app);
  await app.init();
  http = request(app.getHttpServer());
});

afterAll(async () => {
  await app?.close();
});

afterEach(() => {
  vi.restoreAllMocks();
  process.env.ANTHROPIC_API_KEY = '';
});

function upload(token: string, file: Buffer, q: Record<string, string>) {
  return http
    .post(`/api/kb/documents?${new URLSearchParams(q)}`)
    .set(auth(token))
    .set('content-type', 'application/octet-stream')
    .send(file);
}

async function makePdf(pages: string[]): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (const text of pages) {
    const page = doc.addPage();
    text.split('\n').forEach((line, i) => page.drawText(line, { x: 40, y: 780 - i * 18, size: 12, font }));
  }
  return Buffer.from(await doc.save());
}

const SCHEME = `SS 2 Physics Scheme of Work, First Term
Week 1: Motion
Week 2: Electric current and charge
Week 3: Ohm's law
Week 4: Resistors in series and parallel
Week 5: Waves
Week 6: Mid-term test and break`;

const NOTE = `Lesson note: Ohm's law (SS 2 Physics)

Ohm's law states that the current flowing through a metallic conductor is directly proportional to the potential difference across its ends, provided temperature and other physical conditions remain constant. In symbols, V = IR, where V is the potential difference in volts, I is the current in amperes and R is the resistance in ohms.

Example: a bulb on a 12 V battery draws 3 A. Its resistance is R = V / I = 12 / 3 = 4 ohms.`;

function q(subjectId: string, topic: string, n: number, exam: string, answer = 'A') {
  return {
    subjectId,
    topic,
    body: `${topic} question ${n}: which option is correct?`,
    options: ['A', 'B', 'C', 'D'].map((key) => ({ key, text: `Option ${key} for ${topic} ${n}` })),
    answer,
    explanation: `Option ${answer} is correct for ${topic}.`,
    exam,
    sectionKind: 'senior_secondary',
  };
}

describe('AI learning layer: knowledge base, tutor and exam prep', () => {
  const ctx: Json = {};

  it('sets up a school with an SS 2 class, four subjects, a teacher and a student', async () => {
    const reg = await http
      .post('/api/auth/register-school')
      .send({ school: { name: 'Tutor Academy', slug: 'tutor-academy' }, owner: { fullName: 'Owner', email: 'owner@tutor.test', password: 'password123' } })
      .expect(201);
    ctx.owner = reg.body.token;
    ctx.schoolId = reg.body.school.id;
    const owner = auth(ctx.owner);
    const sections = (await http.get('/api/sections').set(owner).expect(200)).body;
    const session = (await http.post('/api/sessions').set(owner).send({ name: '2026/2027' }).expect(201)).body;
    await http.post(`/api/terms/${session.terms[0].id}/make-current`).set(owner).expect(201);
    ctx.class = (await http.post('/api/classes').set(owner).send({ sectionId: sections[3].id, name: 'SS 2', arm: 'A' }).expect(201)).body.id;
    ctx.teacherId = (
      await http.post('/api/staff').set(owner).send({ fullName: 'Mr Volt', email: 'volt@tutor.test', password: 'password123', role: 'teacher' }).expect(201)
    ).body.id;
    for (const [code, name] of [['ENG', 'English Language'], ['MTH', 'Mathematics'], ['PHY', 'Physics'], ['CHE', 'Chemistry'], ['BIO', 'Biology']]) {
      ctx[code] = (await http.post('/api/subjects').set(owner).send({ name, code }).expect(201)).body.id;
      if (code !== 'BIO') await http.post(`/api/classes/${ctx.class}/subjects`).set(owner).send({ subjectId: ctx[code], teacherId: ctx.teacherId }).expect(201);
    }
    ctx.teacher = (await http.post('/api/auth/login').send({ schoolSlug: 'tutor-academy', email: 'volt@tutor.test', password: 'password123' }).expect(201)).body.token;
    await http
      .post('/api/students/import')
      .set(owner)
      .send({ classId: ctx.class, csv: 'admission_number,first_name,last_name,gender\nTA/1,Ada,Obi,F\n' })
      .expect(201);
    const pins = (await http.post(`/api/students/pins/class/${ctx.class}`).set(owner).send({}).expect(201)).body;
    ctx.student = (await http.post('/api/student/auth/login').send({ schoolSlug: 'tutor-academy', admissionNumber: 'TA/1', pin: pins.slips[0].pin }).expect(201)).body.token;
    ctx.studentId = pins.slips[0].studentId ?? (await http.get(`/api/students?classId=${ctx.class}`).set(owner).expect(200)).body[0].id;

    // A second school, to prove its staff cannot see this school's material.
    const other = await http
      .post('/api/auth/register-school')
      .send({ school: { name: 'Other School', slug: 'other-tutor' }, owner: { fullName: 'Other Owner', email: 'o@other.test', password: 'password123' } })
      .expect(201);
    ctx.otherOwner = other.body.token;
  });

  it('indexes a scheme of work, a lesson note and a PDF, and reads the weekly topics', async () => {
    const scheme = await upload(ctx.teacher, Buffer.from(SCHEME), {
      title: 'SS 2 Physics scheme of work',
      kind: 'scheme_of_work',
      fileName: 'physics-scheme.txt',
      subjectId: ctx.PHY,
      classLevel: 'SS 2',
      termNumber: '1',
    }).expect(201);
    expect(scheme.body).toMatchObject({ status: 'ready', classLevel: 'SS 2', visibleToStudents: true });
    expect(scheme.body.outline).toHaveLength(5);
    expect(scheme.body.outline[2]).toEqual({ week: 3, topic: "Ohm's law" });

    const note = await upload(ctx.teacher, Buffer.from(NOTE), { title: "Ohm's law lesson note", kind: 'lesson_note', fileName: 'ohms-law.md', subjectId: ctx.PHY, classLevel: 'SS 2' }).expect(201);
    expect(note.body.status).toBe('ready');
    ctx.noteId = note.body.id;

    const pdf = await makePdf(['Waves: a wave transfers energy without transferring matter.\nWave speed v = f x lambda.', 'Transverse and longitudinal waves differ in vibration direction.']);
    const pdfDoc = await upload(ctx.teacher, pdf, { title: 'Waves textbook extract', kind: 'textbook', fileName: 'waves.pdf', subjectId: ctx.PHY }).expect(201);
    expect(pdfDoc.body).toMatchObject({ status: 'ready', mimeType: 'application/pdf', chunkCount: 2 });
    const detail = (await http.get(`/api/kb/documents/${pdfDoc.body.id}`).set(auth(ctx.teacher)).expect(200)).body;
    expect(detail.preview[0].locator).toBe('Page 1');

    // Marking schemes stay with staff by default.
    const marking = await upload(ctx.teacher, Buffer.from('Marking scheme. Ohm law answer: R = 4 ohms. Award 2 marks.'), {
      title: 'Ohm test marking scheme',
      kind: 'marking_scheme',
      fileName: 'marking.txt',
      subjectId: ctx.PHY,
    }).expect(201);
    expect(marking.body.visibleToStudents).toBe(false);

    // Photos wait for AI; unsupported files are refused.
    const photo = await upload(ctx.teacher, Buffer.from([0x89, 0x50, 0x4e, 0x47]), { title: 'Board notes', kind: 'lesson_note', fileName: 'board.png' }).expect(201);
    expect(photo.body.status).toBe('needs_ai');
    await upload(ctx.teacher, Buffer.from('x'), { title: 'Old Word file', kind: 'lesson_note', fileName: 'notes.doc' }).expect(400);
    await upload(ctx.student, Buffer.from(NOTE), { title: 'Sneaky', kind: 'lesson_note', fileName: 'a.txt' }).expect(403);
  });

  it('answers staff questions from the school material with citations, and keeps it inside the school', async () => {
    const res = (await http.post('/api/kb/ask').set(auth(ctx.teacher)).send({ question: 'What does Ohm’s law state?', subjectId: ctx.PHY }).expect(201)).body;
    expect(res.source).toBe('search');
    expect(res.passages[0]).toMatchObject({ title: "Ohm's law lesson note", n: 1 });
    expect(res.passages.map((p: Json) => p.title)).toContain('Ohm test marking scheme');

    expect((await http.get('/api/kb/documents').set(auth(ctx.otherOwner)).expect(200)).body).toEqual([]);
    await http.get(`/api/kb/documents/${ctx.noteId}`).set(auth(ctx.otherOwner)).expect(404);
    const otherAsk = (await http.post('/api/kb/ask').set(auth(ctx.otherOwner)).send({ question: 'Ohm law' }).expect(201)).body;
    expect(otherAsk.passages).toEqual([]);
  });

  it('lets only the uploader or leadership change a document', async () => {
    await http.patch(`/api/kb/documents/${ctx.noteId}`).set(auth(ctx.teacher)).send({ termNumber: 1 }).expect(200);
    const other = (
      await http.post('/api/staff').set(auth(ctx.owner)).send({ fullName: 'Ms Other', email: 'other@tutor.test', password: 'password123', role: 'teacher' }).expect(201)
    ).body;
    const otherToken = (await http.post('/api/auth/login').send({ schoolSlug: 'tutor-academy', email: other.email, password: 'password123' }).expect(201)).body.token;
    await http.delete(`/api/kb/documents/${ctx.noteId}`).set(auth(otherToken)).expect(403);
    const file = await http.get(`/api/kb/documents/${ctx.noteId}/file`).set(auth(otherToken)).expect(200);
    expect(file.headers['content-type']).toContain('text/markdown');
  });

  it('runs the tutor without an AI key: school notes with citations, bank quizzes, and topics from the scheme of work', async () => {
    const st = auth(ctx.student);
    const topics = (await http.get(`/api/student/tutor/topics?subjectId=${ctx.PHY}`).set(st).expect(200)).body;
    expect(topics.schemeOfWork.map((t: Json) => t.topic)).toContain("Ohm's law");
    await http.get(`/api/student/tutor/topics?subjectId=${ctx.BIO}`).set(st).expect(400);

    const conv = (await http.post('/api/student/tutor/conversations').set(st).send({ subjectId: ctx.PHY, topic: "Ohm's law" }).expect(201)).body;
    ctx.conv = conv.id;
    const res = (await http.post(`/api/student/tutor/conversations/${conv.id}/messages`).set(st).send({ intent: 'explain' }).expect(201)).body;
    expect(res.reply.source).toBe('offline');
    expect(res.reply.content).toContain('directly proportional');
    expect(res.reply.citations[0]).toMatchObject({ title: "Ohm's law lesson note" });
    // Students never see marking schemes.
    expect(JSON.stringify(res)).not.toContain('Award 2 marks');

    // Quiz from the bank: the answer is hidden until the student answers.
    await http.post('/api/questions/bulk').set(auth(ctx.teacher)).send({ questions: [q(ctx.PHY, "Ohm's law", 1, 'waec', 'B')] }).expect(201);
    const quiz = (await http.post(`/api/student/tutor/conversations/${conv.id}/messages`).set(st).send({ intent: 'quiz' }).expect(201)).body.reply;
    expect(quiz.quiz.question).toContain("Ohm's law question 1");
    expect(quiz.quiz).not.toHaveProperty('answer');
    const marked = (await http.post(`/api/student/tutor/messages/${quiz.id}/quiz`).set(st).send({ choice: 'c' }).expect(201)).body;
    expect(marked.quiz).toMatchObject({ chosen: 'C', answer: 'B', correct: false });

    const full = (await http.get(`/api/student/tutor/conversations/${conv.id}`).set(st).expect(200)).body;
    expect(full.messages).toHaveLength(4);
    expect(full.aiEnabled).toBe(false);
    expect((await http.get('/api/student/tutor/conversations').set(st).expect(200)).body[0].title).toBe("Physics: Ohm's law");
  });

  it('screens unsafe messages, replies with care and shows leadership the flag', async () => {
    const st = auth(ctx.student);
    const res = (await http.post(`/api/student/tutor/conversations/${ctx.conv}/messages`).set(st).send({ text: 'I want to die, I cannot pass this exam' }).expect(201)).body;
    expect(res.reply.source).toBe('safety');
    expect(res.reply.content).toContain('adult you trust');
    const pi = (await http.post(`/api/student/tutor/conversations/${ctx.conv}/messages`).set(st).send({ text: 'my number is 08031234567' }).expect(201)).body;
    expect(pi.message.content).toBe('my number is [number removed]');

    const overview = (await http.get('/api/ai/overview').set(auth(ctx.owner)).expect(200)).body;
    expect(overview.flags).toHaveLength(1);
    expect(overview.flags[0]).toMatchObject({ category: 'safeguarding', student: 'Ada Obi', subject: 'Physics' });
    expect(overview.budget.capCents).toBe(10000);
    const thread = (await http.get(`/api/ai/flags/${ctx.conv}`).set(auth(ctx.owner)).expect(200)).body;
    expect(thread.flagged).toBe(true);
    await http.get('/api/ai/overview').set(auth(ctx.teacher)).expect(403);
    await http.get('/api/ai/overview').set(auth(ctx.student)).expect(403);
  });

  it('uses Claude with the school sources and tutoring rules once the key is set, and maps citations', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    const ai = app.get(AiService);
    const spy = vi.spyOn(ai, 'json').mockResolvedValue({
      reply: 'Ohm’s law links voltage, current and resistance [1]. What is V when I = 2 A and R = 3 ohms?',
      sources: [1, 9],
      quiz: [],
      followUps: ['Quiz me'],
    });
    const res = (await http.post(`/api/student/tutor/conversations/${ctx.conv}/messages`).set(auth(ctx.student)).send({ text: 'Just give me the answer to my homework: R when V=12, I=3' }).expect(201)).body;
    expect(res.reply).toMatchObject({ source: 'ai', citations: [{ title: "Ohm's law lesson note" }] });
    expect(res.followUps).toEqual(['Quiz me']);
    const call = spy.mock.calls[0][0] as Json;
    expect(call.feature).toBe('tutor');
    expect(call.system).toContain('Guide, do not do the work');
    expect(call.system).toContain("Week 3 Ohm's law");
    const last = call.messages.at(-1).content as string;
    expect(last).toContain('[1] Ohm');
    expect(last).not.toContain('Award 2 marks');
    expect(call.messages[0].role).toBe('user');
  });

  it('stops AI calls when the school has used its monthly budget, and per student per day', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    const dbs = app.get(DbService);
    const ai = app.get(AiService);
    await dbs.db.update(schools).set({ aiMonthlyBudgetCents: 1, aiStudentDailyLimit: 1 }).where(eq(schools.id, ctx.schoolId));
    await dbs.withSchool(ctx.schoolId, (tx) =>
      tx.insert(aiUsage).values({ schoolId: ctx.schoolId, feature: 'tutor', studentId: ctx.studentId, model: 'claude-opus-5-5', inputTokens: 1000, outputTokens: 1000, costMicroUsd: 24_000 }),
    );
    await expect(ai.json({ feature: 'x', schoolId: ctx.schoolId, system: 's', prompt: 'p', schema: {}, validate: {} as never })).rejects.toMatchObject({ status: 429 });
    const res = await http.post(`/api/student/tutor/conversations/${ctx.conv}/messages`).set(auth(ctx.student)).send({ text: 'Explain current' }).expect(429);
    expect(res.body.message).toContain('today');
    expect((await ai.budget(ctx.schoolId)).spentCents).toBe(2);
    await dbs.db.update(schools).set({ aiMonthlyBudgetCents: 10000, aiStudentDailyLimit: null }).where(eq(schools.id, ctx.schoolId));
  });

  it('sets a JAMB goal, runs a timed JAMB-style mock with per-subject scores, and plans to exam day', async () => {
    const st = auth(ctx.student);
    const bank = [
      ...Array.from({ length: 20 }, (_, i) => q(ctx.ENG, i % 2 ? 'Concord' : 'Lexis', i, 'jamb')),
      ...Array.from({ length: 12 }, (_, i) => q(ctx.MTH, 'Indices', i, 'waec')),
      ...Array.from({ length: 12 }, (_, i) => q(ctx.PHY, i % 2 ? 'Motion' : 'Waves', i, 'jamb')),
      ...Array.from({ length: 12 }, (_, i) => q(ctx.CHE, 'Mole concept', i, 'neco')),
      q(ctx.CHE, 'Mole concept', 99, 'bece'),
    ];
    await http.post('/api/questions/bulk').set(auth(ctx.teacher)).send({ questions: bank }).expect(201);

    const overview = (await http.get('/api/student/exams').set(st).expect(200)).body;
    expect(overview.exams.map((e: Json) => e.code).sort()).toEqual(['jamb', 'neco', 'waec']);
    const jamb = overview.exams.find((e: Json) => e.code === 'jamb');
    expect(jamb.questionsBySubject[ctx.ENG]).toBe(20);
    expect(jamb.questionsBySubject[ctx.CHE]).toBe(12); // the BECE question does not count

    await http.put('/api/student/exams/goal').set(st).send({ exam: 'jamb', subjectIds: [ctx.MTH, ctx.PHY, ctx.CHE] }).expect(400);
    await http.put('/api/student/exams/goal').set(st).send({ exam: 'bece', subjectIds: [ctx.MTH] }).expect(400);
    const goal = (await http.put('/api/student/exams/goal').set(st).send({ exam: 'jamb', subjectIds: [ctx.MTH, ctx.PHY, ctx.CHE, ctx.ENG] }).expect(200)).body;
    expect(goal.subjectIds[0]).toBe(ctx.ENG);

    const mock = (await http.post('/api/student/exams/mock').set(st).send({ exam: 'jamb', size: 'short' }).expect(201)).body;
    expect(mock.kind).toBe('mock');
    expect(mock.title).toBe('JAMB UTME mock');
    expect(mock.mock.subjects.map((s: Json) => [s.name, s.count])).toEqual([
      ['English Language', 15],
      ['Mathematics', 10],
      ['Physics', 10],
      ['Chemistry', 10],
    ]);
    expect(mock.questions).toHaveLength(45);
    expect(mock.secondsLeft).toBeGreaterThan(29 * 60);
    expect(mock.questions[0]).not.toHaveProperty('answer');
    const answers: Record<string, string> = {};
    for (const qn of mock.questions) answers[qn.id] = qn.subjectId === ctx.ENG ? 'A' : 'B';
    await http.put(`/api/student/attempts/${mock.id}/answers`).set(st).send({ answers }).expect(200);
    const done = (await http.post(`/api/student/attempts/${mock.id}/submit`).set(st).expect(201)).body;
    expect(done.mock.breakdown.subjects[0]).toMatchObject({ name: 'English Language', percentage: 100, grade: 'A1' });
    expect(done.mock.breakdown.jambScore).toBe(100);
    expect(done.questions[0]).toHaveProperty('answer');

    const topics = (await http.get(`/api/student/exams/topics?exam=jamb&subjectId=${ctx.PHY}`).set(st).expect(200)).body;
    expect(topics.find((t: Json) => t.topic === 'Motion')).toMatchObject({ questions: 6, accuracy: 0 });
    expect(topics.find((t: Json) => t.topic === "Ohm's law")).toMatchObject({ inSchemeOfWork: true });

    const practice = (await http.post('/api/student/prep/practice').set(st).send({ subjectId: ctx.ENG, topic: 'Concord', exam: 'jamb', count: 5 }).expect(201)).body;
    expect(practice.questions.every((x: Json) => x.topic === 'Concord')).toBe(true);

    const plan = (await http.get('/api/student/exams/plan?exam=jamb').set(st).expect(200)).body;
    expect(plan.hasGoal).toBe(true);
    expect(plan.readiness.subjects.find((s: Json) => s.subjectName === 'English Language')).toMatchObject({ predicted: 100, band: 'on_track' });
    expect(plan.readiness.jambAggregate).toBeGreaterThan(0);
    expect(plan.countdown.weeks.length).toBeGreaterThan(1);
    expect(plan.countdown.weeks[0].focus.length).toBeGreaterThan(0);
  });
});
