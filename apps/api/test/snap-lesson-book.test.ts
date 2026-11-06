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
const ctx: Json = {};

// The smallest valid JPEG is not needed: the API only checks the type and size, then hands the bytes to Claude (mocked here).
const PHOTO = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);

beforeAll(async () => {
  const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = mod.createNestApplication();
  configureApp(app);
  await app.init();
  http = request(app.getHttpServer());

  const reg = await http
    .post('/api/auth/register-school')
    .send({ school: { name: 'Snap Academy', slug: 'snap-academy' }, owner: { fullName: 'Mrs Head', email: 'head@snap.test', password: 'password123' } })
    .expect(201);
  ctx.owner = reg.body.token;
  const owner = auth(ctx.owner);
  const sections = (await http.get('/api/sections').set(owner).expect(200)).body;
  const session = (await http.post('/api/sessions').set(owner).send({ name: '2026/2027' }).expect(201)).body;
  ctx.term = session.terms[0].id;
  await http.post(`/api/terms/${ctx.term}/make-current`).set(owner).expect(201);
  ctx.class = (await http.post('/api/classes').set(owner).send({ sectionId: sections[3].id, name: 'SS 1', arm: 'A' }).expect(201)).body.id;
  const teacher = (await http.post('/api/staff').set(owner).send({ fullName: 'Mr Okon', email: 'okon@snap.test', password: 'password123', role: 'teacher' }).expect(201)).body;
  await http.post('/api/staff').set(owner).send({ fullName: 'Mrs Other', email: 'other@snap.test', password: 'password123', role: 'teacher' }).expect(201);
  ctx.CHM = (await http.post('/api/subjects').set(owner).send({ name: 'Chemistry', code: 'CHM' }).expect(201)).body.id;
  await http.post(`/api/classes/${ctx.class}/subjects`).set(owner).send({ subjectId: ctx.CHM, teacherId: teacher.id }).expect(201);
  const login = async (email: string) => (await http.post('/api/auth/login').send({ schoolSlug: 'snap-academy', email, password: 'password123' }).expect(201)).body.token;
  ctx.teacher = await login('okon@snap.test');
  ctx.other = await login('other@snap.test');
  await http
    .post('/api/students/import')
    .set(owner)
    .send({ classId: ctx.class, csv: 'admission_number,first_name,last_name,gender\nSA/1,Toluwani,Adebayo,F\nSA/2,Chukwuemeka,Okafor,M\nSA/3,Aisha,Bello,F\n' })
    .expect(201);
  for (const s of (await http.get(`/api/students?classId=${ctx.class}`).set(owner).expect(200)).body as Json[]) ctx[s.admissionNumber] = s.id;
});

afterAll(async () => {
  await app?.close();
});

afterEach(() => {
  vi.restoreAllMocks();
  process.env.ANTHROPIC_API_KEY = '';
});

describe('snap-to-score', () => {
  const snapUrl = () => `/api/terms/${ctx.term}/classes/${ctx.class}/subjects/${ctx.CHM}/scores/snap?mimeType=image/jpeg`;
  const send = (token: string) => http.post(snapUrl()).set(auth(token)).set('content-type', 'application/octet-stream').send(PHOTO);

  it('says plainly that it needs AI when there is no key', async () => {
    expect((await http.get('/api/snap/status').set(auth(ctx.teacher)).expect(200)).body).toMatchObject({ enabled: false });
    const res = await send(ctx.teacher).expect(503);
    expect(res.body.message).toContain('Type the scores');
  });

  it('reads the photo, matches rows to the class list and saves nothing', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    const spy = vi.spyOn(app.get(AiService), 'json').mockResolvedValue({
      rows: [
        { line: 1, name: 'Adebayo Tolu', admissionNumber: '', scores: [{ key: 'ca1', value: 17 }, { key: 'ca2', value: 15 }, { key: 'exam', value: 50 }], unclear: [] },
        { line: 2, name: 'OKAFOR C.', admissionNumber: 'SA/2', scores: [{ key: 'ca1', value: 12 }, { key: 'exam', value: 65 }], unclear: ['ca1'] },
        { line: 3, name: 'Yusuf Musa', admissionNumber: '', scores: [{ key: 'ca1', value: 9 }], unclear: [] },
      ],
      notes: 'The bottom right corner is torn.',
    });

    await send(ctx.other).expect(403);
    const r = (await send(ctx.teacher).expect(201)).body;

    const call = spy.mock.calls.at(-1)![0] as Json;
    expect(call.feature).toBe('snap_score');
    expect(call.messages[0].content[0]).toMatchObject({ type: 'image', source: { media_type: 'image/jpeg' } });
    expect(call.messages[0].content[1].text).toContain('Adebayo Toluwani (SA/1)');
    expect(call.schema.properties.rows.items.properties.scores.items.properties.key.enum).toEqual(['ca1', 'ca2', 'exam']);

    expect(r.notes).toBe('The bottom right corner is torn.');
    expect(r.matches).toHaveLength(2);
    expect(r.matches[0]).toMatchObject({ studentId: ctx['SA/1'], line: 1, scores: { ca1: 17, ca2: 15, exam: 50 } });
    // Matched by admission number; the exam mark is over 60 so it is held back for the teacher.
    expect(r.matches[1]).toMatchObject({ studentId: ctx['SA/2'], confidence: 'medium', scores: { ca1: 12 } });
    expect(r.matches[1].check.sort()).toEqual(['ca1', 'exam']);
    expect(r.unmatched.map((u: Json) => u.name)).toEqual(['Yusuf Musa']);
    expect(r.missing).toEqual([ctx['SA/3']]);

    const sheet = (await http.get(`/api/terms/${ctx.term}/classes/${ctx.class}/subjects/${ctx.CHM}/scores`).set(auth(ctx.teacher)).expect(200)).body;
    expect(sheet.rows.every((row: Json) => row.scores === null)).toBe(true);
  });

  it('turns away files that are not photos', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    await http
      .post(snapUrl().replace('image/jpeg', 'application/pdf'))
      .set(auth(ctx.teacher))
      .set('content-type', 'application/octet-stream')
      .send(PHOTO)
      .expect(400);
  });
});

describe('lesson notes book', () => {
  const SCHEME = 'SS 1 Chemistry Scheme of Work, First Term\nWeek 1: Introduction to chemistry\nWeek 2: Particulate nature of matter\nWeek 3: Symbols, formulae and equations';

  it('lines notes up with the scheme of work, by week or by title', async () => {
    const upload = (body: string, q: Record<string, string>) =>
      http.post(`/api/kb/documents?${new URLSearchParams(q)}`).set(auth(ctx.teacher)).set('content-type', 'application/octet-stream').send(Buffer.from(body)).expect(201);
    await upload(SCHEME, { title: 'SS 1 Chemistry scheme', kind: 'scheme_of_work', fileName: 'scheme.txt', subjectId: ctx.CHM, classLevel: 'SS 1', termNumber: '1' });
    await upload('Matter is made of tiny particles. Evidence: diffusion and Brownian motion.', {
      title: 'Particulate nature of matter',
      kind: 'lesson_note',
      fileName: 'matter.txt',
      subjectId: ctx.CHM,
      classLevel: 'SS 1',
    });
    const base = { classId: ctx.class, subjectId: ctx.CHM };
    ctx.note1 = (
      await http
        .post('/api/assistant/save')
        .set(auth(ctx.teacher))
        .send({ ...base, kind: 'lesson_note', title: 'Lesson note: What chemistry is', body: '## Topic\nChemistry is the study of matter.', week: 1 })
        .expect(201)
    ).body.id;
    await http
      .post('/api/assistant/save')
      .set(auth(ctx.teacher))
      .send({ ...base, kind: 'lesson_plan', title: 'Lesson plan: What chemistry is', body: '## Behavioural objectives\n1. Define chemistry.', week: 1 })
      .expect(201);

    const book = (await http.get(`/api/lesson-book?classId=${ctx.class}&subjectId=${ctx.CHM}`).set(auth(ctx.teacher)).expect(200)).body;
    expect(book).toMatchObject({ school: { name: 'Snap Academy' }, class: { name: 'SS 1', arm: 'A' }, subject: { name: 'Chemistry' }, teacher: 'Mr Okon', canVet: false });
    expect(book.term).toMatchObject({ number: 1, session: '2026/2027' });
    expect(book.entries).toHaveLength(3);
    const note = book.entries.find((e: Json) => e.id === ctx.note1);
    expect(note).toMatchObject({ week: 1, format: 'markdown', author: 'Mr Okon', mine: true, vetted: null });
    expect(note.body).toContain('Chemistry is the study of matter.');
    expect(book.entries.find((e: Json) => e.title === 'Particulate nature of matter')).toMatchObject({ format: 'text', body: expect.stringContaining('Brownian') });
    expect(book.coverage.rows.map((r: Json) => [r.week, Boolean(r.noteId), Boolean(r.planId)])).toEqual([
      [1, true, true],
      [2, true, false],
      [3, false, false],
    ]);

    await http.get(`/api/lesson-book?classId=${ctx.class}&subjectId=${ctx.CHM}`).set(auth(ctx.other)).expect(403);
  });

  it('lets the head of school vet notes, and shows every class at a glance', async () => {
    await http.put(`/api/lesson-book/${ctx.note1}/vet`).set(auth(ctx.teacher)).send({}).expect(403);
    await http.put(`/api/lesson-book/${ctx.note1}/vet`).set(auth(ctx.owner)).send({ comment: 'Good. Add a class exercise.' }).expect(200);

    const book = (await http.get(`/api/lesson-book?classId=${ctx.class}&subjectId=${ctx.CHM}`).set(auth(ctx.owner)).expect(200)).body;
    expect(book.canVet).toBe(true);
    expect(book.entries.find((e: Json) => e.id === ctx.note1).vetted).toMatchObject({ by: 'Mrs Head', comment: 'Good. Add a class exercise.' });
    expect(book.coverage.rows[0].vetted).toBe(true);

    const overview = (await http.get('/api/lesson-book/overview').set(auth(ctx.owner)).expect(200)).body;
    expect(overview.rows).toEqual([
      expect.objectContaining({ className: 'SS 1', subjectName: 'Chemistry', teacher: 'Mr Okon', weeks: 3, notes: 2, plans: 1, awaitingVetting: 2 }),
    ]);
    await http.get('/api/lesson-book/overview').set(auth(ctx.teacher)).expect(403);

    await http.delete(`/api/lesson-book/${ctx.note1}/vet`).set(auth(ctx.owner)).expect(200);
  });

  it('lets the author set the week of a note', async () => {
    const book = (await http.get(`/api/lesson-book?classId=${ctx.class}&subjectId=${ctx.CHM}`).set(auth(ctx.teacher)).expect(200)).body;
    const matter = book.entries.find((e: Json) => e.title === 'Particulate nature of matter');
    await http.patch(`/api/lesson-book/${matter.id}`).set(auth(ctx.other)).send({ week: 2 }).expect(403);
    await http.patch(`/api/lesson-book/${matter.id}`).set(auth(ctx.teacher)).send({ week: 2 }).expect(200);
  });
});
