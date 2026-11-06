import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
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

const SCHEME = `SS 2 Physics Scheme of Work, Second Term
Week 1: Revision of first term work
Week 2: Electric current
Week 3: Ohm's law
Week 4: Resistors in series and parallel`;

const NOTE = `Ohm's law states that the current through a metallic conductor is directly proportional to the potential difference across its ends,
provided the temperature and other physical conditions remain constant. V = IR. The unit of resistance is the ohm.`;

describe('teacher assistant', () => {
  const ctx: Json = {};

  it('sets up an SS 2 class with Physics, two teachers, three students and two terms of scores', async () => {
    const reg = await http
      .post('/api/auth/register-school')
      .send({ school: { name: 'Assist Academy', slug: 'assist-academy' }, owner: { fullName: 'Owner', email: 'owner@assist.test', password: 'password123' } })
      .expect(201);
    ctx.owner = reg.body.token;
    const owner = auth(ctx.owner);
    const sections = (await http.get('/api/sections').set(owner).expect(200)).body;
    const session = (await http.post('/api/sessions').set(owner).send({ name: '2026/2027' }).expect(201)).body;
    ctx.prevTerm = session.terms[0].id;
    ctx.term = session.terms[1].id;
    await http.post(`/api/terms/${ctx.term}/make-current`).set(owner).expect(201);
    ctx.class = (await http.post('/api/classes').set(owner).send({ sectionId: sections[3].id, name: 'SS 2', arm: 'A' }).expect(201)).body.id;
    const teacher = (await http.post('/api/staff').set(owner).send({ fullName: 'Mr Volt', email: 'volt@assist.test', password: 'password123', role: 'teacher' }).expect(201)).body;
    await http.post('/api/staff').set(owner).send({ fullName: 'Mrs Other', email: 'other@assist.test', password: 'password123', role: 'teacher' }).expect(201);
    ctx.PHY = (await http.post('/api/subjects').set(owner).send({ name: 'Physics', code: 'PHY' }).expect(201)).body.id;
    ctx.MTH = (await http.post('/api/subjects').set(owner).send({ name: 'Mathematics', code: 'MTH' }).expect(201)).body.id;
    await http.post(`/api/classes/${ctx.class}/subjects`).set(owner).send({ subjectId: ctx.PHY, teacherId: teacher.id }).expect(201);
    await http.post(`/api/classes/${ctx.class}/subjects`).set(owner).send({ subjectId: ctx.MTH }).expect(201);
    await http.patch(`/api/classes/${ctx.class}`).set(owner).send({ formTeacherId: teacher.id }).expect(200);
    const login = async (email: string) => (await http.post('/api/auth/login').send({ schoolSlug: 'assist-academy', email, password: 'password123' }).expect(201)).body.token;
    ctx.teacher = await login('volt@assist.test');
    ctx.other = await login('other@assist.test');
    await http
      .post('/api/students/import')
      .set(owner)
      .send({ classId: ctx.class, csv: 'admission_number,first_name,last_name,gender\nAA/1,Ada,Obi,F\nAA/2,Bayo,Ade,M\nAA/3,Chi,Eze,F\n' })
      .expect(201);
    const list = (await http.get(`/api/students?classId=${ctx.class}`).set(owner).expect(200)).body as Json[];
    for (const s of list) ctx[s.admissionNumber] = s.id;

    // Last term: everyone did well. This term (CAs only): Bayo has collapsed in both subjects.
    const put = (term: string, subject: string, rows: [string, Json][]) =>
      http
        .put(`/api/terms/${term}/classes/${ctx.class}/subjects/${subject}/scores`)
        .set(owner)
        .send({ entries: rows.map(([adm, scores]) => ({ studentId: ctx[adm], scores })) })
        .expect(200);
    await put(ctx.prevTerm, ctx.PHY, [['AA/1', { ca1: 15, ca2: 15, exam: 45 }], ['AA/2', { ca1: 14, ca2: 14, exam: 40 }], ['AA/3', { ca1: 12, ca2: 12, exam: 36 }]]);
    await put(ctx.prevTerm, ctx.MTH, [['AA/1', { ca1: 16, ca2: 16, exam: 48 }], ['AA/2', { ca1: 13, ca2: 13, exam: 40 }], ['AA/3', { ca1: 12, ca2: 12, exam: 36 }]]);
    await put(ctx.term, ctx.PHY, [['AA/1', { ca1: 16, ca2: 15 }], ['AA/2', { ca1: 6, ca2: 7 }], ['AA/3', { ca1: 12, ca2: 13 }]]);
    await put(ctx.term, ctx.MTH, [['AA/1', { ca1: 17, ca2: 16 }], ['AA/2', { ca1: 7, ca2: 5 }], ['AA/3', { ca1: 12, ca2: 11 }]]);

    const upload = (body: string, q: Record<string, string>) =>
      http.post(`/api/kb/documents?${new URLSearchParams(q)}`).set(auth(ctx.teacher)).set('content-type', 'application/octet-stream').send(Buffer.from(body)).expect(201);
    await upload(SCHEME, { title: 'SS 2 Physics scheme, second term', kind: 'scheme_of_work', fileName: 'scheme.txt', subjectId: ctx.PHY, classLevel: 'SS 2', termNumber: '2' });
    await upload(NOTE, { title: "Ohm's law note", kind: 'lesson_note', fileName: 'ohm.txt', subjectId: ctx.PHY, classLevel: 'SS 2' });
    await http
      .post('/api/questions/bulk')
      .set(auth(ctx.teacher))
      .send({
        questions: [1, 2, 3].map((n) => ({
          subjectId: ctx.PHY,
          topic: "Ohm's law",
          body: `Ohm question ${n}`,
          options: ['A', 'B', 'C', 'D'].map((key) => ({ key, text: `Option ${key}` })),
          answer: 'B',
          exam: 'waec',
        })),
      })
      .expect(201);
  });

  it('keeps teachers to the subjects they teach', async () => {
    const q = `classId=${ctx.class}&subjectId=${ctx.PHY}`;
    const c = (await http.get(`/api/assistant/context?${q}`).set(auth(ctx.teacher)).expect(200)).body;
    expect(c).toMatchObject({ subject: { name: 'Physics' }, term: { number: 2 }, aiEnabled: false });
    expect(c.outline.map((o: Json) => o.topic)).toEqual(['Electric current', "Ohm's law", 'Resistors in series and parallel']);
    await http.get(`/api/assistant/context?${q}`).set(auth(ctx.other)).expect(403);
    await http.get(`/api/assistant/context?classId=${ctx.class}&subjectId=${ctx.MTH}`).set(auth(ctx.teacher)).expect(403);
  });

  it('drafts a lesson plan from the school notes without AI, and saves it to the knowledge base for staff only', async () => {
    const draft = (
      await http
        .post('/api/assistant/lesson')
        .set(auth(ctx.teacher))
        .send({ classId: ctx.class, subjectId: ctx.PHY, kind: 'lesson_plan', topic: "Ohm's law", week: 3, durationMinutes: 40 })
        .expect(201)
    ).body;
    expect(draft.source).toBe('template');
    expect(draft.body).toContain('## Behavioural objectives');
    expect(draft.body).toContain('directly proportional');
    expect(draft.citations[0]).toMatchObject({ title: "Ohm's law note" });

    const saved = (
      await http
        .post('/api/assistant/save')
        .set(auth(ctx.teacher))
        .send({ classId: ctx.class, subjectId: ctx.PHY, kind: 'lesson_plan', title: draft.title, body: draft.body })
        .expect(201)
    ).body;
    expect(saved).toMatchObject({ kind: 'lesson_plan', status: 'ready', classLevel: 'SS 2', termNumber: 2, visibleToStudents: false });
  });

  it('writes lesson notes with Claude using the school sources once the key is set', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    const spy = vi.spyOn(app.get(AiService), 'json').mockResolvedValue({ title: "Ohm's law", body: '## Topic\nOhm’s law [1] [2]', sources: [1, 2, 9] });
    const draft = (
      await http.post('/api/assistant/lesson').set(auth(ctx.teacher)).send({ classId: ctx.class, subjectId: ctx.PHY, kind: 'lesson_note', topic: "Ohm's law" }).expect(201)
    ).body;
    // Unknown source numbers are dropped, and the lesson plan saved above is never a source.
    expect(draft.source).toBe('ai');
    expect(draft.citations.map((c: Json) => c.title)).toContain("Ohm's law note");
    expect(draft.citations.every((c: Json) => c.kind !== 'lesson_plan')).toBe(true);
    const call = spy.mock.calls[0][0] as Json;
    expect(call.feature).toBe('lesson_draft');
    expect(call.prompt).toContain('Class: SS 2');
    expect(call.prompt).toContain('directly proportional');
  });

  it('builds a class test from the question bank, and asks Claude only for the rest', async () => {
    const body = { classId: ctx.class, subjectId: ctx.PHY, topics: ["Ohm's law"], objectiveCount: 5, theoryCount: 1, style: 'waec' };
    const offline = (await http.post('/api/assistant/assessment').set(auth(ctx.teacher)).send(body).expect(201)).body;
    expect(offline.objective).toHaveLength(3);
    expect(offline.objective.every((q: Json) => q.source === 'bank' && q.answer === 'B')).toBe(true);
    expect(offline.theory).toEqual([]);
    expect(offline.note).toContain('3 questions');

    process.env.ANTHROPIC_API_KEY = 'test-key';
    const spy = vi.spyOn(app.get(AiService), 'json').mockResolvedValue({
      objective: [1, 2, 3].map((n) => ({ topic: "Ohm's law", body: `New ${n}`, options: ['A', 'B', 'C', 'D'].map((key) => ({ key, text: key })), answer: 'C', explanation: 'x' })),
      theory: [{ topic: "Ohm's law", question: 'State Ohm’s law and give its formula.', points: [{ point: 'Statement', marks: 2 }, { point: 'V = IR', marks: 1 }] }],
    });
    const ai = (await http.post('/api/assistant/assessment').set(auth(ctx.teacher)).send(body).expect(201)).body;
    expect(ai.objective).toHaveLength(5);
    expect(ai.objective.filter((q: Json) => q.source === 'ai')).toHaveLength(2);
    expect(ai.theory[0].points).toHaveLength(2);
    expect((spy.mock.calls[0][0] as Json).prompt).toContain('Objective questions: 2');
  });

  it('marks written answers against a rubric, confirms marks and sends them to the 2nd CA column', async () => {
    const task = (
      await http
        .post('/api/assistant/essays')
        .set(auth(ctx.teacher))
        .send({
          classId: ctx.class,
          subjectId: ctx.PHY,
          title: "Ohm's law theory",
          question: "State Ohm's law.",
          rubricText: 'Current is directly proportional to potential difference (2)\nTemperature and physical conditions constant (1)\nUnit of resistance is the ohm (1)',
          termId: ctx.term,
          scoreComponent: 'ca2',
        })
        .expect(201)
    ).body;
    expect(task.maxMarks).toBe(4);
    ctx.task = task.id;

    const script = (
      await http
        .put(`/api/assistant/essays/${task.id}/scripts/${ctx['AA/3']}`)
        .set(auth(ctx.teacher))
        .send({ answer: 'The current in a conductor is directly proportional to the potential difference across it if temperature and physical conditions stay constant.' })
        .expect(200)
    ).body;
    expect(script.suggestion).toMatchObject({ source: 'keywords', total: 3, max: 4 });
    expect(script.status).toBe('suggested');

    // Claude's marks are clamped to each point's maximum.
    process.env.ANTHROPIC_API_KEY = 'test-key';
    vi.spyOn(app.get(AiService), 'json').mockResolvedValue({
      criteria: [{ index: 1, awarded: 5, reason: 'Correct statement' }, { index: 2, awarded: 0, reason: 'Missing' }, { index: 3, awarded: 1, reason: 'Ohm' }],
      feedback: 'Good. Add the conditions.',
    });
    const aiScript = (await http.put(`/api/assistant/essays/${task.id}/scripts/${ctx['AA/1']}`).set(auth(ctx.teacher)).send({ answer: 'Ohm’s law: V is proportional to I. Unit ohm.' }).expect(200)).body;
    expect(aiScript.suggestion.criteria.map((c: Json) => c.awarded)).toEqual([2, 0, 1]);
    expect(aiScript.suggestion).toMatchObject({ source: 'ai', total: 3 });

    // Only confirmed marks go to the score sheet, scaled from 4 to the 20-mark 2nd CA.
    await http.patch(`/api/assistant/essays/${task.id}/scripts/${ctx['AA/1']}`).set(auth(ctx.teacher)).send({ awarded: 9 }).expect(400);
    await http.patch(`/api/assistant/essays/${task.id}/scripts/${ctx['AA/1']}`).set(auth(ctx.teacher)).send({ awarded: 2 }).expect(200);
    const pushed = (await http.post(`/api/assistant/essays/${task.id}/push-scores`).set(auth(ctx.teacher)).expect(201)).body;
    expect(pushed).toMatchObject({ written: 1, component: 'ca2', outOf: 20 });
    const sheet = (await http.get(`/api/terms/${ctx.term}/classes/${ctx.class}/subjects/${ctx.PHY}/scores`).set(auth(ctx.teacher)).expect(200)).body;
    const ada = (sheet.rows ?? sheet.students).find((r: Json) => r.studentId === ctx['AA/1']);
    expect(ada.scores).toEqual({ ca1: 16, ca2: 10 });

    const detail = (await http.get(`/api/assistant/essays/${task.id}`).set(auth(ctx.teacher)).expect(200)).body;
    expect(detail.students).toHaveLength(3);
    expect(detail.students.filter((s: Json) => s.script).length).toBe(2);
    await http.get(`/api/assistant/essays/${task.id}`).set(auth(ctx.other)).expect(403);
    const list = (await http.get('/api/assistant/essays').set(auth(ctx.teacher)).expect(200)).body;
    expect(list[0]).toMatchObject({ scripts: 2, confirmed: 1, subject: 'Physics' });
  });

  it('drafts report card remarks for the whole class from their results', async () => {
    const res = (await http.post('/api/assistant/remarks').set(auth(ctx.teacher)).send({ termId: ctx.prevTerm, classId: ctx.class }).expect(201)).body;
    expect(res.source).toBe('template');
    expect(res.students).toHaveLength(3);
    const ada = res.students.find((s: Json) => s.studentId === ctx['AA/1']);
    expect(ada.draft.teacherComment).toContain('Ada');
    expect(ada.draft.teacherComment).toContain('Mathematics');
    // This term only has CAs, so remarks wait for the exam scores.
    const early = await http.post('/api/assistant/remarks').set(auth(ctx.teacher)).send({ termId: ctx.term, classId: ctx.class }).expect(400);
    expect(early.body.message).toContain('not complete');
    await http.post('/api/assistant/remarks').set(auth(ctx.other)).send({ termId: ctx.prevTerm, classId: ctx.class }).expect(403);
  });

  it('lists the students falling behind this term, with reasons, most urgent first', async () => {
    const res = (await http.get(`/api/assistant/watchlist?classId=${ctx.class}`).set(auth(ctx.teacher)).expect(200)).body;
    expect(res.counts).toMatchObject({ high: 1, total: 3 });
    expect(res.students[0]).toMatchObject({ studentId: ctx['AA/2'], level: 'high' });
    const codes = res.students[0].reasons.map((r: Json) => r.code);
    expect(codes).toContain('drop');
    expect(codes).toContain('below_pass');
    expect(res.students.find((s: Json) => s.studentId === ctx['AA/1']).level).toBeNull();
    await http.get(`/api/assistant/watchlist?classId=${ctx.class}`).set(auth(ctx.other)).expect(403);
  });
});
