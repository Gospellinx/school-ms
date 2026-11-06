import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { todayInLagos } from '../src/common/access';
import { DbService } from '../src/db/db.service';
import { platformAdmins } from '../src/db/schema';

let app: INestApplication;
let http: ReturnType<typeof request>;
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

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

describe('dashboards, super admin and portal extras', () => {
  const ctx: Record<string, string> = {};

  it('sets up a school with a class, a teacher and a student with a parent', async () => {
    const reg = await http
      .post('/api/auth/register-school')
      .send({ school: { name: 'Dash Academy', slug: 'dash-academy' }, owner: { fullName: 'Owner', email: 'owner@dash.test', password: 'password123' } })
      .expect(201);
    ctx.owner = reg.body.token;
    const owner = auth(ctx.owner);
    const sections = (await http.get('/api/sections').set(owner).expect(200)).body;
    const session = (await http.post('/api/sessions').set(owner).send({ name: '2026/2027' }).expect(201)).body;
    ctx.term = session.terms[0].id;
    await http.post(`/api/terms/${ctx.term}/make-current`).set(owner).expect(201);
    ctx.class = (await http.post('/api/classes').set(owner).send({ sectionId: sections[3].id, name: 'SS 1', arm: 'A' }).expect(201)).body.id;
    ctx.otherClass = (await http.post('/api/classes').set(owner).send({ sectionId: sections[3].id, name: 'SS 1', arm: 'B' }).expect(201)).body.id;
    ctx.mth = (await http.post('/api/subjects').set(owner).send({ name: 'Mathematics', code: 'MTH' }).expect(201)).body.id;
    ctx.teacherId = (
      await http.post('/api/staff').set(owner).send({ fullName: 'Mr Teach', email: 'teach@dash.test', password: 'password123', role: 'teacher' }).expect(201)
    ).body.id;
    await http.post(`/api/classes/${ctx.class}/subjects`).set(owner).send({ subjectId: ctx.mth, teacherId: ctx.teacherId }).expect(201);
    ctx.teacher = (await http.post('/api/auth/login').send({ schoolSlug: 'dash-academy', email: 'teach@dash.test', password: 'password123' }).expect(201)).body.token;
    const csv = 'admission_number,first_name,last_name,gender,parent_name,parent_phone\nD/1,Ada,Obi,F,Mrs Obi,08035550001\nD/2,Bayo,Ade,M,Mr Ade,08035550002\n';
    await http.post('/api/students/import').set(owner).send({ classId: ctx.class, csv }).expect(201);
    const roster = (await http.get(`/api/students?classId=${ctx.class}`).set(owner).expect(200)).body;
    ctx.ada = roster.find((s: { admissionNumber: string }) => s.admissionNumber === 'D/1').id;
  });

  it('gives leadership school-wide numbers and a teacher only their own classes', async () => {
    await http
      .put(`/api/classes/${ctx.class}/attendance/${todayInLagos()}`)
      .set(auth(ctx.teacher))
      .send({ entries: [{ studentId: ctx.ada, status: 'present' }], notifyGuardians: false })
      .expect(200);
    await http
      .put(`/api/terms/${ctx.term}/classes/${ctx.class}/subjects/${ctx.mth}/scores`)
      .set(auth(ctx.teacher))
      .send({ entries: [{ studentId: ctx.ada, scores: { ca1: 15 } }] })
      .expect(200);

    const lead = (await http.get('/api/dashboard').set(auth(ctx.owner)).expect(200)).body;
    expect(lead.currentTerm).toMatchObject({ id: ctx.term, name: 'First Term', sessionName: '2026/2027' });
    expect(lead.counts).toMatchObject({ students: 2, girls: 1, boys: 1, teachers: 1, parents: 2 });
    expect(lead.classes).toHaveLength(2);
    expect(lead.classes.find((c: { id: string }) => c.id === ctx.class)).toMatchObject({ students: 2, markedToday: 1, presentToday: 1 });
    expect(lead.scoreSheets).toEqual([expect.objectContaining({ subjectName: 'Mathematics', students: 2, entered: 1 })]);

    const mine = (await http.get('/api/dashboard').set(auth(ctx.teacher)).expect(200)).body;
    expect(mine.classes.map((c: { id: string }) => c.id)).toEqual([ctx.class]);
    expect(mine).not.toHaveProperty('fees');
    expect(mine).not.toHaveProperty('counts');
  });

  it('lets staff rename themselves and change their password', async () => {
    const t = auth(ctx.teacher);
    expect((await http.patch('/api/auth/me').set(t).send({ fullName: 'Mr Teacher' }).expect(200)).body.fullName).toBe('Mr Teacher');
    await http.post('/api/auth/password').set(t).send({ currentPassword: 'wrong-pass', newPassword: 'new-password1' }).expect(400);
    await http.post('/api/auth/password').set(t).send({ currentPassword: 'password123', newPassword: 'new-password1' }).expect(201);
    await http.post('/api/auth/login').send({ schoolSlug: 'dash-academy', email: 'teach@dash.test', password: 'new-password1' }).expect(201);
  });

  it('hands back the parent login code only while messages are just logged, and lists the parent messages', async () => {
    const sent = (await http.post('/api/parent/auth/request-code').send({ schoolSlug: 'dash-academy', phone: '0803 555 0001' }).expect(201)).body;
    expect(sent.devCode).toMatch(/^\d{6}$/);
    // Unknown numbers still get the same answer, without a code.
    expect((await http.post('/api/parent/auth/request-code').send({ schoolSlug: 'dash-academy', phone: '08099999999' }).expect(201)).body).toEqual({ sent: true });

    const parent = (await http.post('/api/parent/auth/verify').send({ schoolSlug: 'dash-academy', phone: '08035550001', code: sent.devCode }).expect(201)).body.token;
    await http.post('/api/notifications/broadcast').set(auth(ctx.owner)).send({ message: 'School resumes on Monday.' }).expect(201);
    const msgs = (await http.get('/api/parent/messages').set(auth(parent)).expect(200)).body;
    expect(msgs).toHaveLength(1);
    expect(msgs[0]).toMatchObject({ kind: 'broadcast', body: 'School resumes on Monday.' });
    expect((await http.patch('/api/parent/me').set(auth(parent)).send({ preferredChannel: 'whatsapp' }).expect(200)).body.preferredChannel).toBe('whatsapp');
    await http.get('/api/parent/messages').set(auth(ctx.owner)).expect(403);
  });

  it('lets a super admin see every school as counts only, and nothing else', async () => {
    const dbs = app.get(DbService);
    await dbs.db.insert(platformAdmins).values({ fullName: 'Super', email: 'super@platform.test', passwordHash: await bcrypt.hash('password123', 4) });
    await http.post('/api/platform/auth/login').send({ email: 'super@platform.test', password: 'nope' }).expect(401);
    const token = (await http.post('/api/platform/auth/login').send({ email: 'super@platform.test', password: 'password123' }).expect(201)).body.token;

    const schools = (await http.get('/api/platform/schools').set(auth(token)).expect(200)).body;
    const dash = schools.find((s: { slug: string }) => s.slug === 'dash-academy');
    expect(dash).toMatchObject({ students: 2, classes: 2, staff: 2, parents: 2, currentTerm: 'First Term, 2026/2027' });
    expect((await http.get('/api/platform/me').set(auth(token)).expect(200)).body.admin.email).toBe('super@platform.test');

    // A platform token is not a school token, and school tokens cannot reach the platform.
    await http.get('/api/students').set(auth(token)).expect(403);
    await http.get('/api/platform/schools').set(auth(ctx.owner)).expect(403);
  });
});
