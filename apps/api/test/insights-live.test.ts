import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AddressInfo } from 'node:net';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { DbService } from '../src/db/db.service';
import { cbtAttempts } from '../src/db/schema';
import { InsightsService } from '../src/insights/insights.service';
import { LiveService } from '../src/live/live.service';

let app: INestApplication;
let http: ReturnType<typeof request>;
let baseUrl: string;
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
type Json = Record<string, any>;

const today = new Date(Date.now() + 60 * 60 * 1000).toISOString().slice(0, 10);
const shiftDays = (iso: string, days: number) => new Date(Date.parse(`${iso}T12:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
/** Today and the `n - 1` weekdays before it. */
function schoolDays(n: number): string[] {
  const out: string[] = [today];
  for (let d = shiftDays(today, -1); out.length < n; d = shiftDays(d, -1)) {
    const day = new Date(`${d}T12:00:00Z`).getUTCDay();
    if (day !== 0 && day !== 6) out.unshift(d);
  }
  return out;
}

beforeAll(async () => {
  const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = mod.createNestApplication();
  configureApp(app);
  await app.init();
  await app.listen(0);
  baseUrl = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}/api`;
  http = request(app.getHttpServer());
  await app.get(LiveService).ready;
});

afterAll(async () => {
  await app?.close();
});

/** Reads Server-Sent Events from the live stream until `until` returns true for a snapshot. */
async function readStream(token: string, until: (snap: Json, count: number) => boolean, onOpen?: () => Promise<void>) {
  const ctrl = new AbortController();
  const res = await fetch(`${baseUrl}/live/stream`, { headers: auth(token), signal: ctrl.signal });
  expect(res.headers.get('content-type')).toContain('text/event-stream');
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  let count = 0;
  let opened = false;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) throw new Error('stream ended');
      buf += decoder.decode(value, { stream: true });
      let i: number;
      while ((i = buf.indexOf('\n\n')) >= 0) {
        const block = buf.slice(0, i);
        buf = buf.slice(i + 2);
        const type = /^event: (.*)$/m.exec(block)?.[1];
        const data = /^data: (.*)$/m.exec(block)?.[1];
        if (type !== 'snapshot' || !data) continue;
        const snap = JSON.parse(data);
        count++;
        if (until(snap, count)) return snap;
        if (!opened && onOpen) {
          opened = true;
          await onOpen();
        }
      }
    }
  } finally {
    ctrl.abort();
  }
}

describe('exam forecast and live monitoring', () => {
  const ctx: Json = {};

  it('sets up SS 3 (WAEC) and JSS 3 (BECE) with two released terms, registers and a parent', async () => {
    const reg = await http
      .post('/api/auth/register-school')
      .send({ school: { name: 'Forecast College', slug: 'forecast-college' }, owner: { fullName: 'Owner', email: 'owner@forecast.test', password: 'password123' } })
      .expect(201);
    ctx.owner = reg.body.token;
    ctx.schoolId = reg.body.school?.id ?? reg.body.schoolId;
    const owner = auth(ctx.owner);
    const sections = (await http.get('/api/sections').set(owner).expect(200)).body as Json[];
    const senior = sections.find((s) => s.kind === 'senior_secondary')!;
    const junior = sections.find((s) => s.kind === 'junior_secondary')!;
    const session = (await http.post('/api/sessions').set(owner).send({ name: '2026/2027' }).expect(201)).body;
    ctx.prevTerm = session.terms[0].id;
    ctx.term = session.terms[1].id;
    await http.post(`/api/terms/${ctx.term}/make-current`).set(owner).expect(201);
    await http.patch(`/api/terms/${ctx.term}`).set(owner).send({ startsOn: shiftDays(today, -40), endsOn: shiftDays(today, 60) }).expect(200);

    ctx.ss3 = (await http.post('/api/classes').set(owner).send({ sectionId: senior.id, name: 'SS 3', arm: 'A' }).expect(201)).body.id;
    ctx.jss3 = (await http.post('/api/classes').set(owner).send({ sectionId: junior.id, name: 'JSS 3', arm: 'A' }).expect(201)).body.id;
    const teacher = (await http.post('/api/staff').set(owner).send({ fullName: 'Mrs Numbers', email: 'num@forecast.test', password: 'password123', role: 'teacher' }).expect(201)).body;
    await http.post('/api/staff').set(owner).send({ fullName: 'Mr Elsewhere', email: 'else@forecast.test', password: 'password123', role: 'teacher' }).expect(201);
    const subjects: Record<string, string> = {};
    for (const [code, name] of [['ENG', 'English Language'], ['MTH', 'Mathematics'], ['PHY', 'Physics'], ['CHE', 'Chemistry'], ['BIO', 'Biology']]) {
      subjects[code] = (await http.post('/api/subjects').set(owner).send({ name, code }).expect(201)).body.id;
      await http.post(`/api/classes/${ctx.ss3}/subjects`).set(owner).send({ subjectId: subjects[code], teacherId: code === 'MTH' ? teacher.id : undefined }).expect(201);
    }
    await http.post(`/api/classes/${ctx.jss3}/subjects`).set(owner).send({ subjectId: subjects.ENG }).expect(201);
    await http.patch(`/api/classes/${ctx.ss3}`).set(owner).send({ formTeacherId: teacher.id }).expect(200);
    ctx.subjects = subjects;
    const login = async (email: string) => (await http.post('/api/auth/login').send({ schoolSlug: 'forecast-college', email, password: 'password123' }).expect(201)).body.token;
    ctx.teacher = await login('num@forecast.test');
    ctx.elsewhere = await login('else@forecast.test');

    await http
      .post('/api/students/import')
      .set(owner)
      .send({ classId: ctx.ss3, csv: 'admission_number,first_name,last_name,gender\nFC/1,Ada,Obi,F\nFC/2,Bayo,Ade,M\nFC/3,Chi,Eze,F\n' })
      .expect(201);
    await http.post('/api/students/import').set(owner).send({ classId: ctx.jss3, csv: 'admission_number,first_name,last_name,gender\nFC/J1,Dayo,Ola,M\n' }).expect(201);
    for (const s of (await http.get('/api/students').set(owner).expect(200)).body as Json[]) ctx[s.admissionNumber] = s.id;

    // Two released terms. Ada strong throughout, Chi middling, Bayo has fallen sharply.
    const marks: Record<string, [number, number]> = { 'FC/1': [72, 74], 'FC/2': [62, 38], 'FC/3': [55, 56] };
    for (const [term, idx] of [[ctx.prevTerm, 0], [ctx.term, 1]] as const) {
      for (const code of Object.keys(subjects)) {
        await http
          .put(`/api/terms/${term}/classes/${ctx.ss3}/subjects/${subjects[code]}/scores`)
          .set(owner)
          .send({
            entries: Object.entries(marks).map(([adm, m]) => {
              const total = m[idx];
              const ca = Math.round(total * 0.2);
              return { studentId: ctx[adm], scores: { ca1: ca, ca2: ca, exam: total - 2 * ca } };
            }),
          })
          .expect(200);
      }
      await http.post(`/api/terms/${term}/classes/${ctx.ss3}/publish`).set(owner).send({}).expect(201);
    }

    // Bayo has missed the last three school days.
    for (const [i, day] of schoolDays(3).entries()) {
      await http
        .put(`/api/classes/${ctx.ss3}/attendance/${day}`)
        .set(auth(ctx.teacher))
        .send({
          entries: [
            { studentId: ctx['FC/1'], status: 'present' },
            { studentId: ctx['FC/2'], status: 'absent' },
            { studentId: ctx['FC/3'], status: i === 0 ? 'late' : 'present' },
          ],
          notifyGuardians: false,
        })
        .expect(200);
    }

    await http.post('/api/guardians').set(owner).send({ fullName: 'Mrs Ade', phone: '08035550099', students: [{ studentId: ctx['FC/2'] }] }).expect(201);
    const code = (await http.post('/api/parent/auth/request-code').send({ schoolSlug: 'forecast-college', phone: '08035550099' }).expect(201)).body.devCode;
    ctx.parent = (await http.post('/api/parent/auth/verify').send({ schoolSlug: 'forecast-college', phone: '08035550099', code }).expect(201)).body.token;
  });

  it('forecasts WAEC for the school, each class, subject and teacher, and lists who needs attention', async () => {
    const f = (await http.get('/api/insights/forecast').set(auth(ctx.owner)).expect(200)).body;
    expect(f.exams).toEqual(['waec', 'neco', 'jamb', 'bece']);
    expect(f).toMatchObject({ exam: 'waec', scope: 'school', benchmark: '5 credits including English and Mathematics' });
    expect(f.summary).toMatchObject({ students: 3, withEvidence: 3, bands: { on_track: 1, borderline: 1, at_risk: 1, unknown: 0 } });
    expect(f.summary.benchmark).toMatchObject({ likely: 2, unlikely: 1 });
    expect(f.summary.projectedRate).toEqual({ low: 67, high: 67 });
    expect(f.classes.map((c: Json) => c.label)).toEqual(['SS 3 A']);
    expect(f.teachers).toEqual([expect.objectContaining({ teacherName: 'Mrs Numbers', subjectName: 'Mathematics', classes: ['SS 3 A'], students: 3, average: 56, creditRate: 67 })]);

    const bayo = f.atRisk[0];
    expect(bayo).toMatchObject({ name: 'Bayo Ade', band: 'at_risk', consecutiveAbsences: 3, scoreDrop: 24, meetsBenchmark: false });
    expect(bayo.risks.map((r: Json) => r.code)).toEqual(['absent_streak', 'readiness', 'score_drop']);
    expect(f.atRisk.map((s: Json) => s.name)).not.toContain('Ada Obi');

    const bece = (await http.get('/api/insights/forecast?exam=bece').set(auth(ctx.owner)).expect(200)).body;
    expect(bece.classes.map((c: Json) => c.label)).toEqual(['JSS 3 A']);
    expect(bece.summary).toMatchObject({ students: 1, withEvidence: 0, projectedRate: null });
  });

  it('shows a class forecast with topics to reteach, and keeps teachers to their own classes', async () => {
    const dbs = app.get(DbService);
    const PHY = ctx.subjects.PHY;
    const qs = (
      await http
        .post('/api/questions/bulk')
        .set(auth(ctx.owner))
        .send({
          questions: [1, 2, 3, 4].map((n) => ({
            subjectId: PHY,
            topic: n <= 2 ? "Ohm's law" : 'Motion',
            body: `Question ${n}`,
            options: ['A', 'B', 'C', 'D'].map((key) => ({ key, text: `Option ${key}` })),
            answer: 'A',
            exam: 'waec',
          })),
        })
        .expect(201)
    ).body as Json[];
    const ids = qs.map((q) => q.id);
    // Everyone gets Ohm's law wrong and Motion right, over two practice sets each.
    await dbs.withSchool(ctx.schoolId, async (tx) => {
      for (const adm of ['FC/1', 'FC/2', 'FC/3']) {
        for (let k = 0; k < 2; k++) {
          await tx.insert(cbtAttempts).values({
            schoolId: ctx.schoolId,
            kind: 'practice',
            studentId: ctx[adm],
            subjectId: PHY,
            questionIds: ids,
            answers: { [ids[0]]: 'B', [ids[1]]: 'C', [ids[2]]: 'A', [ids[3]]: 'A' },
            submittedAt: new Date(),
            percentage: 50,
            exam: 'waec',
          });
        }
      }
    });
    app.get(InsightsService).invalidate(ctx.schoolId);

    const c = (await http.get(`/api/insights/forecast/classes/${ctx.ss3}`).set(auth(ctx.teacher)).expect(200)).body;
    expect(c).toMatchObject({ exam: 'waec', class: { label: 'SS 3 A' }, exams: ['waec', 'neco', 'jamb'] });
    expect(c.students.map((s: Json) => s.name)).toEqual(['Bayo Ade', 'Chi Eze', 'Ada Obi']);
    expect(c.reteach).toEqual([expect.objectContaining({ subjectName: 'Physics', topic: "Ohm's law", accuracy: 0, students: 3, attempted: 12 })]);
    expect(c.students[0].weakTopics).toEqual([expect.objectContaining({ topic: "Ohm's law", accuracy: 0 })]);

    await http.get(`/api/insights/forecast/classes/${ctx.ss3}`).set(auth(ctx.elsewhere)).expect(403);
    const mine = (await http.get('/api/insights/forecast').set(auth(ctx.teacher)).expect(200)).body;
    expect(mine).toMatchObject({ scope: 'teacher' });
    expect(mine.teachers.every((t: Json) => t.teacherName === 'Mrs Numbers')).toBe(true);
    const none = (await http.get('/api/insights/forecast').set(auth(ctx.elsewhere)).expect(200)).body;
    expect(none.classes).toEqual([]);
    expect(none.summary.students).toBe(0);
    await http.get('/api/insights/forecast?exam=nope').set(auth(ctx.owner)).expect(400);
    await http.get('/api/insights/forecast').set(auth(ctx.parent)).expect(403);
  });

  it("tells a parent their child's forecast in plain words", async () => {
    const p = (await http.get('/api/parent/forecast').set(auth(ctx.parent)).expect(200)).body;
    expect(p.children).toHaveLength(1);
    const child = p.children[0];
    expect(child).toMatchObject({ name: 'Bayo Ade', className: 'SS 3 A' });
    expect(child.exams.map((e: Json) => e.exam)).toEqual(['waec']);
    expect(child.exams[0].text.headline).toBe('Bayo needs extra support to be ready for WAEC (WASSCE).');
    expect(child.exams[0].text.atHome[0]).toContain("Ohm's law (Physics)");
    await http.get('/api/parent/forecast').set(auth(ctx.owner)).expect(403);
  });

  it('gives leadership a live picture with alerts, and teachers only their classes', async () => {
    const snap = (await http.get('/api/live').set(auth(ctx.owner)).expect(200)).body;
    const ss3 = snap.attendance.classes.find((c: Json) => c.id === ctx.ss3);
    expect(ss3).toMatchObject({ students: 3, marked: 3, present: 2, late: 0, absent: 1 });
    expect(snap.alerts.map((a: Json) => a.id)).toEqual(expect.arrayContaining(['streaks', 'forecast-waec']));
    expect(snap.alerts.find((a: Json) => a.id === 'streaks').detail).toContain('Bayo Ade (SS 3 A, 3 days)');
    expect(snap.fees).toMatchObject({ collectedTodayKobo: 0, paymentsToday: 0 });
    expect(snap.fees.last7Days).toHaveLength(7);
    expect(snap.ai).toMatchObject({ enabled: false, callsToday: 0 });
    expect(snap.cbt.submittedToday).toBe(6);
    expect(snap.activity.some((a: Json) => a.kind === 'attendance' && a.text.startsWith('SS 3 A register taken'))).toBe(true);
    expect(snap.forecasts).toEqual([
      expect.objectContaining({ exam: 'waec', students: 3, onTrack: 2, atRisk: 1 }),
      expect.objectContaining({ exam: 'bece', students: 1, onTrack: 0, atRisk: 0 }),
    ]);

    const t = (await http.get('/api/live').set(auth(ctx.teacher)).expect(200)).body;
    expect(t.scope).toBe('teacher');
    expect(t.attendance.classes.map((c: Json) => c.id)).toEqual([ctx.ss3]);
    expect(t.fees).toBeNull();
    expect(t.ai).toBeNull();
    const other = (await http.get('/api/live').set(auth(ctx.elsewhere)).expect(200)).body;
    expect(other.attendance.classes).toEqual([]);
    expect(other.alerts.find((a: Json) => a.id === 'streaks')).toBeUndefined();
    await http.get('/api/live').set(auth(ctx.parent)).expect(403);
  });

  it('pushes a fresh snapshot down the stream when a payment lands, straight from the database trigger', async () => {
    const owner = auth(ctx.owner);
    await http.post('/api/fees/items').set(owner).send({ termId: ctx.term, name: 'Tuition', amountKobo: 50_000_00 }).expect(201);
    await http.post(`/api/terms/${ctx.term}/invoices/generate`).set(owner).send({}).expect(201);
    const invoices = (await http.get(`/api/terms/${ctx.term}/invoices`).set(owner).expect(200)).body as Json[];
    const bayo = invoices.find((i) => i.studentId === ctx['FC/2']) ?? invoices[0];

    const snap = await readStream(
      ctx.owner,
      (s) => s.fees.paymentsToday === 1,
      async () => {
        await http.post(`/api/invoices/${bayo.id}/payments`).set(owner).send({ amountKobo: 20_000_00, method: 'cash' }).expect(201);
      },
    );
    expect(snap.fees).toMatchObject({ collectedTodayKobo: 20_000_00, paymentsToday: 1 });
    expect(snap.fees.term).toMatchObject({ collectedKobo: 20_000_00 });
    expect(snap.activity[0]).toMatchObject({ kind: 'payment', tone: 'good' });
    expect(snap.activity[0].text).toContain('₦20,000');
  });

  it('refuses the stream to parents and anonymous callers', async () => {
    expect((await fetch(`${baseUrl}/live/stream`)).status).toBe(401);
    expect((await fetch(`${baseUrl}/live/stream`, { headers: auth(ctx.parent) })).status).toBe(403);
  });
});
