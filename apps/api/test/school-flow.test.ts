import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Client } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';

let app: INestApplication;
let http: ReturnType<typeof request>;

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

async function registerSchool(slug: string) {
  const res = await http
    .post('/api/auth/register-school')
    .send({
      school: { name: `School ${slug}`, slug, motto: 'Excellence in Learning and Character' },
      owner: { fullName: 'Owner', email: `owner@${slug}.test`, password: 'password123' },
    })
    .expect(201);
  return res.body as { token: string; school: { id: string } };
}

beforeAll(async () => {
  const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = mod.createNestApplication();
  app.setGlobalPrefix('api');
  await app.init();
  http = request(app.getHttpServer());
});

afterAll(async () => {
  await app?.close();
});

describe('a school runs a term end to end', () => {
  const ctx: Record<string, string> = {};

  it('registers a school with nursery, primary, junior and senior sections', async () => {
    const { token } = await registerSchool('gcis');
    ctx.owner = token;
    const sections = (await http.get('/api/sections').set(auth(token)).expect(200)).body;
    expect(sections.map((s: { kind: string }) => s.kind)).toEqual([
      'nursery',
      'primary',
      'junior_secondary',
      'senior_secondary',
    ]);
    ctx.ss = sections[3].id;
  });

  it('rejects a duplicate school address', async () => {
    await http
      .post('/api/auth/register-school')
      .send({ school: { name: 'Again', slug: 'gcis' }, owner: { fullName: 'X', email: 'x@y.test', password: 'password123' } })
      .expect(400);
  });

  it('logs in through the school address only with the right password', async () => {
    await http.post('/api/auth/login').send({ schoolSlug: 'gcis', email: 'owner@gcis.test', password: 'nope' }).expect(401);
    const res = await http
      .post('/api/auth/login')
      .send({ schoolSlug: 'gcis', email: 'OWNER@gcis.test', password: 'password123' })
      .expect(201);
    expect(res.body.staff.role).toBe('proprietor');
  });

  it('creates a session with three terms', async () => {
    const res = await http.post('/api/sessions').set(auth(ctx.owner)).send({ name: '2025/2026' }).expect(201);
    expect(res.body.terms.map((t: { name: string }) => t.name)).toEqual(['First Term', 'Second Term', 'Third Term']);
    ctx.term = res.body.terms[0].id;
    await http.post(`/api/terms/${ctx.term}/make-current`).set(auth(ctx.owner)).expect(201);
  });

  it('sets up a class, subjects and a teacher', async () => {
    ctx.class = (await http.post('/api/classes').set(auth(ctx.owner)).send({ sectionId: ctx.ss, name: 'SS 1', arm: 'A' }).expect(201)).body.id;
    ctx.eng = (await http.post('/api/subjects').set(auth(ctx.owner)).send({ name: 'English Language', code: 'eng' }).expect(201)).body.id;
    ctx.mth = (await http.post('/api/subjects').set(auth(ctx.owner)).send({ name: 'Mathematics', code: 'MTH' }).expect(201)).body.id;
    ctx.teacherId = (
      await http
        .post('/api/staff')
        .set(auth(ctx.owner))
        .send({ fullName: 'Mrs Bello', email: 'bello@gcis.test', password: 'password123', role: 'teacher' })
        .expect(201)
    ).body.id;
    await http.post(`/api/classes/${ctx.class}/subjects`).set(auth(ctx.owner)).send({ subjectId: ctx.mth, teacherId: ctx.teacherId }).expect(201);
    await http.post(`/api/classes/${ctx.class}/subjects`).set(auth(ctx.owner)).send({ subjectId: ctx.eng }).expect(201);
    ctx.teacher = (
      await http.post('/api/auth/login').send({ schoolSlug: 'gcis', email: 'bello@gcis.test', password: 'password123' }).expect(201)
    ).body.token;
  });

  it('lists only a teacher’s own class subjects, and all of them for leadership', async () => {
    const mine = (await http.get('/api/my-assignments').set(auth(ctx.teacher)).expect(200)).body;
    expect(mine.map((a: { subjectName: string }) => a.subjectName)).toEqual(['Mathematics']);
    const all = (await http.get('/api/my-assignments').set(auth(ctx.owner)).expect(200)).body;
    expect(all.map((a: { subjectName: string }) => a.subjectName)).toEqual(['English Language', 'Mathematics']);
  });

  it('stops teachers from doing setup', async () => {
    await http.post('/api/subjects').set(auth(ctx.teacher)).send({ name: 'Biology', code: 'BIO' }).expect(403);
  });

  it('imports students from a CSV and can re-import the same file', async () => {
    const csv = [
      'Admission Number,First Name,Last Name,Other Names,Gender,Date of Birth',
      'GC/001,Ada,Okafor,,F,2011-03-02',
      'GC/002,Bayo,Adeyemi,"Oluwaseun, Jr",m,',
      'GC/003,Chidi,Eze,,male,2010-12-25',
    ].join('\r\n');
    const first = await http.post('/api/students/import').set(auth(ctx.owner)).send({ classId: ctx.class, csv }).expect(201);
    expect(first.body).toEqual({ imported: 3, errors: [] });
    await http.post('/api/students/import').set(auth(ctx.owner)).send({ classId: ctx.class, csv }).expect(201);
    const list = (await http.get(`/api/students?classId=${ctx.class}`).set(auth(ctx.owner)).expect(200)).body;
    expect(list).toHaveLength(3);
    const bayo = list.find((s: { admissionNumber: string }) => s.admissionNumber === 'GC/002');
    expect(bayo.otherNames).toBe('Oluwaseun, Jr');
    for (const s of list) ctx[s.admissionNumber] = s.id;
  });

  it('reports bad CSV rows without importing anything', async () => {
    const csv = 'admission_number,first_name,last_name\nGC/009,,Musa\n';
    const res = await http.post('/api/students/import').set(auth(ctx.owner)).send({ classId: ctx.class, csv }).expect(201);
    expect(res.body.imported).toBe(0);
    expect(res.body.errors[0].row).toBe(2);
  });

  it('lets the subject teacher enter scores, and only for their subject', async () => {
    const url = `/api/terms/${ctx.term}/classes/${ctx.class}/subjects/${ctx.mth}/scores`;
    await http
      .put(url)
      .set(auth(ctx.teacher))
      .send({
        entries: [
          { studentId: ctx['GC/001'], scores: { ca1: 15, ca2: 15, exam: 40 } }, // 70
          { studentId: ctx['GC/002'], scores: { ca1: 20, ca2: 20, exam: 60 } }, // 100
          { studentId: ctx['GC/003'], scores: { ca1: 10, ca2: 10, exam: 20 } }, // 40
        ],
      })
      .expect(200);
    const sheet = (await http.get(url).set(auth(ctx.teacher)).expect(200)).body;
    expect(sheet.rows.map((r: { total: number }) => r.total).sort()).toEqual([100, 40, 70].sort());

    await http
      .put(`/api/terms/${ctx.term}/classes/${ctx.class}/subjects/${ctx.eng}/scores`)
      .set(auth(ctx.teacher))
      .send({ entries: [{ studentId: ctx['GC/001'], scores: { exam: 50 } }] })
      .expect(403);
  });

  it('rejects scores above the maximum', async () => {
    const res = await http
      .put(`/api/terms/${ctx.term}/classes/${ctx.class}/subjects/${ctx.eng}/scores`)
      .set(auth(ctx.owner))
      .send({ entries: [{ studentId: ctx['GC/001'], scores: { ca1: 25 } }] })
      .expect(400);
    expect(res.body.problems[0].message).toMatch(/outside 0-20/);
  });

  it('produces a broadsheet with positions', async () => {
    await http
      .put(`/api/terms/${ctx.term}/classes/${ctx.class}/subjects/${ctx.eng}/scores`)
      .set(auth(ctx.owner))
      .send({
        entries: [
          { studentId: ctx['GC/001'], scores: { ca1: 18, ca2: 17, exam: 50 } }, // 85
          { studentId: ctx['GC/002'], scores: { ca1: 10, ca2: 10, exam: 30 } }, // 50
          { studentId: ctx['GC/003'], scores: { ca1: 18, ca2: 17, exam: 50 } }, // 85
        ],
      })
      .expect(200);
    const sheet = (await http.get(`/api/terms/${ctx.term}/classes/${ctx.class}/results`).set(auth(ctx.owner)).expect(200)).body;
    expect(sheet.studentCount).toBe(3);
    // Ada (85 + 70) / 2 = 77.5, Bayo (50 + 100) / 2 = 75, Chidi (85 + 40) / 2 = 62.5
    expect(sheet.students.map((s: { admissionNumber: string; positionText: string }) => [s.admissionNumber, s.positionText])).toEqual([
      ['GC/001', '1st'],
      ['GC/002', '2nd'],
      ['GC/003', '3rd'],
    ]);
  });

  it('builds a report card with WAEC grades and comments', async () => {
    await http
      .put(`/api/terms/${ctx.term}/students/${ctx['GC/001']}/comments`)
      .set(auth(ctx.teacher))
      .send({ headComment: 'Well done' })
      .expect(403);
    await http
      .put(`/api/terms/${ctx.term}/students/${ctx['GC/001']}/comments`)
      .set(auth(ctx.owner))
      .send({ teacherComment: 'A diligent student.', headComment: 'Keep it up.' })
      .expect(200);

    const card = (await http.get(`/api/terms/${ctx.term}/students/${ctx['GC/001']}/report-card`).set(auth(ctx.owner)).expect(200)).body;
    expect(card.school.motto).toBe('Excellence in Learning and Character');
    expect(card.session).toBe('2025/2026');
    expect(card.term).toBe('First Term');
    expect(card.subjects.map((s: { name: string; grade: string; positionText: string }) => [s.name, s.grade, s.positionText])).toEqual([
      ['English Language', 'A1', '1st'],
      ['Mathematics', 'B2', '2nd'],
    ]);
    expect(card.summary).toMatchObject({ average: 77.5, positionText: '1st', outOf: 3 });
    expect(card.comments).toEqual({ teacher: 'A diligent student.', head: 'Keep it up.' });
  });

  describe('tenant isolation', () => {
    it('hides one school’s data from another school', async () => {
      const other = await registerSchool('other-school');
      expect((await http.get('/api/students').set(auth(other.token)).expect(200)).body).toEqual([]);
      await http.get(`/api/students/${ctx['GC/001']}`).set(auth(other.token)).expect(404);
      await http.get(`/api/terms/${ctx.term}/students/${ctx['GC/001']}/report-card`).set(auth(other.token)).expect(404);
      await http.get(`/api/terms/${ctx.term}/classes/${ctx.class}/results`).set(auth(other.token)).expect(404);
    });

    it('blocks linking to another school’s rows by id', async () => {
      const other = await registerSchool('third-school');
      await http
        .post('/api/students')
        .set(auth(other.token))
        .send({ admissionNumber: 'X1', firstName: 'A', lastName: 'B', classId: ctx.class })
        .expect(404);
      await http.post('/api/classes').set(auth(other.token)).send({ sectionId: ctx.ss, name: 'SS 1' }).expect(404);
    });

    it('returns no rows at the database level when no school is set', async () => {
      const client = new Client({ connectionString: process.env.DATABASE_URL });
      await client.connect();
      try {
        await client.query('set role school_app');
        const res = await client.query('select count(*)::int as n from students');
        expect(res.rows[0].n).toBe(0);
      } finally {
        await client.end();
      }
    });
  });

  it('rejects requests without a token', async () => {
    await http.get('/api/students').expect(401);
    await http.get('/api/health').expect(200);
  });
});
