import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { createHmac } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { todayInLagos } from '../src/common/access';
import { InitializeParams, PaystackClient } from '../src/fees/paystack.client';
import { LogProvider, MessagingProvider } from '../src/messaging/messaging.provider';
import { NotificationsService } from '../src/messaging/notifications.service';
import { AiService, JsonRequest } from '../src/prep/ai.service';

/** Stands in for Paystack: remembers what was initialised and reports it as paid when verified. */
class FakePaystack extends PaystackClient {
  readonly started = new Map<string, InitializeParams>();
  async initialize(p: InitializeParams) {
    this.started.set(p.reference, p);
    return { authorization_url: `https://checkout.paystack.test/${p.reference}`, access_code: 'ac_test', reference: p.reference };
  }
  async verify(reference: string) {
    const p = this.started.get(reference)!;
    return { status: 'success', reference, amount: p.amountKobo, currency: 'NGN', channel: 'card', paid_at: new Date().toISOString(), metadata: p.metadata };
  }
}

/** Stands in for Claude: returns a canned reply that matches each feature's schema. */
const aiCalls: JsonRequest<unknown>[] = [];
const fakeAi = {
  enabled: true,
  async json<T>(req: JsonRequest<T>): Promise<T> {
    aiCalls.push(req as JsonRequest<unknown>);
    const replies: Record<string, unknown> = {
      prep_plan: {
        summary: 'Mathematics needs the most work.',
        weeks: [{ week: 1, focus: [{ subject: 'Mathematics', topic: 'Quadratic equations', activities: ['Do 10 past questions'] }] }],
        tips: ['Practise daily'],
      },
      explain: { explanation: 'x = 2 because 2 + 2 = 4.', tip: 'Substitute the options back in.' },
      question_drafts: {
        questions: [
          { body: 'Solve x + 1 = 3', options: ['A', 'B', 'C', 'D'].map((k, i) => ({ key: k, text: String(i + 1) })), answer: 'B', explanation: 'x = 2' },
          { body: 'Broken draft', options: [{ key: 'A', text: '1' }], answer: 'D', explanation: 'answer not among options' },
        ],
      },
      report_comment: { teacherComment: 'Ada works hard.', headComment: 'Keep it up.' },
    };
    return req.validate.parse(replies[req.feature]);
  },
};

let app: INestApplication;
let http: ReturnType<typeof request>;
let messages: LogProvider;
let notifications: NotificationsService;
const paystack = new FakePaystack();
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const today = todayInLagos();
const shiftDays = (iso: string, days: number) => new Date(Date.parse(`${iso}T12:00:00Z`) + days * 86400000).toISOString().slice(0, 10);

beforeAll(async () => {
  const mod = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(PaystackClient)
    .useValue(paystack)
    .overrideProvider(MessagingProvider)
    .useValue(new LogProvider())
    .overrideProvider(AiService)
    .useValue(fakeAi)
    .compile();
  app = mod.createNestApplication({ rawBody: true });
  app.setGlobalPrefix('api');
  await app.init();
  http = request(app.getHttpServer());
  messages = app.get(MessagingProvider) as LogProvider;
  notifications = app.get(NotificationsService);
});

afterAll(async () => {
  await app?.close();
});

describe('parents, attendance, fees, CBT and exam prep', () => {
  const ctx: Record<string, string> = {};
  const owner = () => auth(ctx.owner);

  it('sets up a senior secondary class with parents from the CSV import', async () => {
    const reg = await http
      .post('/api/auth/register-school')
      .send({
        school: { name: 'Linx Academy', slug: 'linx-academy' },
        owner: { fullName: 'Owner', email: 'owner@linx.test', password: 'password123' },
      })
      .expect(201);
    ctx.owner = reg.body.token;
    ctx.schoolId = reg.body.school.id;
    const sections = (await http.get('/api/sections').set(owner()).expect(200)).body;
    ctx.ss = sections.find((s: { kind: string }) => s.kind === 'senior_secondary').id;

    const session = (await http.post('/api/sessions').set(owner()).send({ name: '2025/2026' }).expect(201)).body;
    ctx.term = session.terms[0].id;
    ctx.term2 = session.terms[1].id;
    await http.patch(`/api/terms/${ctx.term}`).set(owner()).send({ startsOn: shiftDays(today, -30), endsOn: shiftDays(today, 60) }).expect(200);

    ctx.class = (await http.post('/api/classes').set(owner()).send({ sectionId: ctx.ss, name: 'SS 2', arm: 'A' }).expect(201)).body.id;
    ctx.otherClass = (await http.post('/api/classes').set(owner()).send({ sectionId: ctx.ss, name: 'SS 2', arm: 'B' }).expect(201)).body.id;
    ctx.mth = (await http.post('/api/subjects').set(owner()).send({ name: 'Mathematics', code: 'MTH' }).expect(201)).body.id;
    ctx.eng = (await http.post('/api/subjects').set(owner()).send({ name: 'English Language', code: 'ENG' }).expect(201)).body.id;
    const staff = async (name: string, email: string) =>
      (await http.post('/api/staff').set(owner()).send({ fullName: name, email, password: 'password123', role: 'teacher' }).expect(201)).body.id;
    ctx.teacherId = await staff('Mr Musa', 'musa@linx.test');
    await staff('Mrs Obi', 'obi@linx.test');
    await http.post(`/api/classes/${ctx.class}/subjects`).set(owner()).send({ subjectId: ctx.mth, teacherId: ctx.teacherId }).expect(201);
    await http.post(`/api/classes/${ctx.class}/subjects`).set(owner()).send({ subjectId: ctx.eng }).expect(201);
    const login = async (email: string) =>
      (await http.post('/api/auth/login').send({ schoolSlug: 'linx-academy', email, password: 'password123' }).expect(201)).body.token;
    ctx.teacher = await login('musa@linx.test');
    ctx.outsider = await login('obi@linx.test');

    const csv = [
      'admission_number,first_name,last_name,gender,parent_name,parent_phone,parent_email',
      'LX/001,Ada,Okafor,F,Mrs Okafor,0803 123 4567,okafor@parents.test',
      'LX/002,Bayo,Adeyemi,M,Mr Adeyemi,08051112222,',
      'LX/003,Chidi,Okafor,M,Mrs Okafor,+2348031234567,',
    ].join('\n');
    const res = await http.post('/api/students/import').set(owner()).send({ classId: ctx.class, csv }).expect(201);
    expect(res.body).toMatchObject({ imported: 3, parentsLinked: 3 });
    for (const s of (await http.get(`/api/students?classId=${ctx.class}`).set(owner()).expect(200)).body) ctx[s.admissionNumber] = s.id;

    // Ada and Chidi share one parent, recognised by phone number however it was written.
    const parents = (await http.get('/api/guardians').set(owner()).expect(200)).body;
    expect(parents).toHaveLength(2);
    const okafor = parents.find((g: { phone: string }) => g.phone === '2348031234567');
    expect(okafor.students).toHaveLength(2);
  });

  it('rejects a bad parent phone number in the import', async () => {
    const csv = 'admission_number,first_name,last_name,parent_name,parent_phone\nLX/009,Musa,Bello,Mr Bello,12345\n';
    const res = await http.post('/api/students/import').set(owner()).send({ classId: ctx.class, csv }).expect(201);
    expect(res.body.imported).toBe(0);
    expect(res.body.errors[0].message).toMatch(/not a valid Nigerian mobile/);
  });

  describe('attendance', () => {
    it('lets a teacher of the class take the register and alerts parents of absent students once', async () => {
      const url = `/api/classes/${ctx.class}/attendance/${today}`;
      const entries = [
        { studentId: ctx['LX/001'], status: 'absent' },
        { studentId: ctx['LX/002'], status: 'present' },
        { studentId: ctx['LX/003'], status: 'late' },
      ];
      const first = await http.put(url).set(auth(ctx.teacher)).send({ entries }).expect(200);
      expect(first.body).toMatchObject({ saved: 3, absent: 1, parentsAlerted: 1 });
      const again = await http.put(url).set(auth(ctx.teacher)).send({ entries }).expect(200);
      expect(again.body.parentsAlerted).toBe(0);

      const sheet = (await http.get(url).set(auth(ctx.teacher)).expect(200)).body;
      expect(sheet.taken).toBe(true);
      expect(sheet.rows.find((r: { studentId: string }) => r.studentId === ctx['LX/001']).status).toBe('absent');

      const sent = await notifications.dispatchForSchool(ctx.schoolId);
      expect(sent.sent).toBe(1);
      expect(messages.sent.at(-1)).toMatchObject({ to: '2348031234567', channel: 'sms' });
      expect(messages.sent.at(-1)!.body).toMatch(/Ada Okafor was marked absent/);
    });

    it('blocks teachers who do not teach the class, and future dates', async () => {
      await http
        .put(`/api/classes/${ctx.class}/attendance/${today}`)
        .set(auth(ctx.outsider))
        .send({ entries: [] })
        .expect(403);
      await http
        .put(`/api/classes/${ctx.class}/attendance/${shiftDays(today, 2)}`)
        .set(auth(ctx.teacher))
        .send({ entries: [] })
        .expect(400);
    });

    it('totals attendance for the term', async () => {
      const res = (await http.get(`/api/terms/${ctx.term}/classes/${ctx.class}/attendance`).set(owner()).expect(200)).body;
      const ada = res.students.find((s: { studentId: string }) => s.studentId === ctx['LX/001']);
      expect(ada).toMatchObject({ opened: 1, absent: 1, present: 0 });
    });
  });

  describe('parent portal', () => {
    it('publishes results and texts parents', async () => {
      await http
        .put(`/api/terms/${ctx.term}/classes/${ctx.class}/subjects/${ctx.eng}/scores`)
        .set(owner())
        .send({
          entries: [
            { studentId: ctx['LX/001'], scores: { ca1: 15, ca2: 15, exam: 40 } },
            { studentId: ctx['LX/002'], scores: { ca1: 10, ca2: 10, exam: 30 } },
          ],
        })
        .expect(200);
      const pub = await http.post(`/api/terms/${ctx.term}/classes/${ctx.class}/publish`).set(owner()).send({}).expect(201);
      expect(pub.body.parentsNotified).toBe(2);
      await http.post(`/api/terms/${ctx.term}/classes/${ctx.class}/publish`).set(auth(ctx.teacher)).send({}).expect(403);
    });

    it('logs a parent in with a code sent by SMS, without revealing unknown numbers', async () => {
      const before = messages.sent.length;
      await http.post('/api/parent/auth/request-code').send({ schoolSlug: 'linx-academy', phone: '08099999999' }).expect(201);
      expect(messages.sent.length).toBe(before);

      await http.post('/api/parent/auth/request-code').send({ schoolSlug: 'linx-academy', phone: '08031234567' }).expect(201);
      const sms = messages.sent.at(-1)!;
      expect(sms).toMatchObject({ to: '2348031234567', transactional: true });
      const code = sms.body.match(/\b(\d{6})\b/)![1];

      const wrong = code === '000000' ? '111111' : '000000';
      await http.post('/api/parent/auth/verify').send({ schoolSlug: 'linx-academy', phone: '08031234567', code: wrong }).expect(401);
      const ok = await http.post('/api/parent/auth/verify').send({ schoolSlug: 'linx-academy', phone: '+234 803 123 4567', code }).expect(201);
      ctx.parent = ok.body.token;
      // A code works only once.
      await http.post('/api/parent/auth/verify').send({ schoolSlug: 'linx-academy', phone: '08031234567', code }).expect(401);
    });

    it('shows a parent only their own children and released results', async () => {
      const me = (await http.get('/api/parent/me').set(auth(ctx.parent)).expect(200)).body;
      expect(me.children.map((c: { firstName: string }) => c.firstName)).toEqual(['Ada', 'Chidi']);

      const terms = (await http.get(`/api/parent/children/${ctx['LX/001']}/results`).set(auth(ctx.parent)).expect(200)).body;
      expect(terms.map((t: { id: string }) => t.id)).toEqual([ctx.term]);
      const card = (await http.get(`/api/parent/children/${ctx['LX/001']}/results/${ctx.term}`).set(auth(ctx.parent)).expect(200)).body;
      expect(card.subjects[0]).toMatchObject({ name: 'English Language', total: 70, grade: 'B2' });
      expect(card.attendance).toMatchObject({ opened: 1, present: 0, absent: 1 });

      // Not their child; not a released term; not a staff route.
      await http.get(`/api/parent/children/${ctx['LX/002']}/results`).set(auth(ctx.parent)).expect(404);
      await http.get(`/api/parent/children/${ctx['LX/001']}/results/${ctx.term2}`).set(auth(ctx.parent)).expect(404);
      await http.get('/api/students').set(auth(ctx.parent)).expect(403);
      await http.get('/api/parent/me').set(owner()).expect(403);

      const att = (await http.get(`/api/parent/children/${ctx['LX/001']}/attendance`).set(auth(ctx.parent)).expect(200)).body;
      expect(att.summary.absent).toBe(1);
    });
  });

  describe('fees and Paystack', () => {
    it('builds term bills from school, section and class fees', async () => {
      const item = (body: object) => http.post('/api/fees/items').set(owner()).send({ termId: ctx.term, ...body }).expect(201);
      await item({ name: 'Tuition', amountKobo: 150_000_00 });
      await item({ name: 'SS exam levy', amountKobo: 20_000_00, sectionId: ctx.ss });
      await item({ name: 'SS 2A excursion', amountKobo: 5_000_00, classId: ctx.class });
      await item({ name: 'SS 2B lab', amountKobo: 9_000_00, classId: ctx.otherClass });

      const gen = await http.post(`/api/terms/${ctx.term}/invoices/generate`).set(owner()).send({}).expect(201);
      expect(gen.body).toMatchObject({ created: 3, updated: 0 });
      const again = await http.post(`/api/terms/${ctx.term}/invoices/generate`).set(owner()).send({}).expect(201);
      expect(again.body).toMatchObject({ created: 0, updated: 3 });

      const list = (await http.get(`/api/terms/${ctx.term}/invoices`).set(owner()).expect(200)).body;
      expect(list.map((i: { totalKobo: number }) => i.totalKobo)).toEqual([175_000_00, 175_000_00, 175_000_00]);
      for (const i of list) ctx[`inv:${i.student.admissionNumber}`] = i.id;
      await http.get(`/api/terms/${ctx.term}/invoices`).set(auth(ctx.teacher)).expect(403);
    });

    it('records a cash part-payment and texts a receipt', async () => {
      const res = await http
        .post(`/api/invoices/${ctx['inv:LX/002']}/payments`)
        .set(owner())
        .send({ amountKobo: 100_000_00, method: 'cash' })
        .expect(201);
      expect(res.body).toMatchObject({ status: 'part_paid', paidKobo: 100_000_00, balanceKobo: 75_000_00 });
      await http.post(`/api/invoices/${ctx['inv:LX/002']}/payments`).set(owner()).send({ amountKobo: 80_000_00, method: 'cash' }).expect(400);
      await notifications.dispatchForSchool(ctx.schoolId);
      expect(messages.sent.at(-1)!.body).toMatch(/Payment of ₦100,000 received for Bayo Adeyemi.*Balance: ₦75,000/);
    });

    it('withholds results from parents who owe, until they pay online', async () => {
      await http.patch('/api/school').set(owner()).send({ withholdResultsForDebt: true }).expect(200);
      const blocked = await http.get(`/api/parent/children/${ctx['LX/001']}/results/${ctx.term}`).set(auth(ctx.parent)).expect(402);
      expect(blocked.body.message).toMatch(/₦175,000/);

      const bills = (await http.get(`/api/parent/children/${ctx['LX/001']}/invoices`).set(auth(ctx.parent)).expect(200)).body;
      expect(bills[0].lines.map((l: { name: string }) => l.name).sort()).toEqual(['SS 2A excursion', 'SS exam levy', 'Tuition']);
      await http.post(`/api/parent/invoices/${ctx['inv:LX/002']}/pay`).set(auth(ctx.parent)).send({}).expect(404);

      const checkout = await http.post(`/api/parent/invoices/${bills[0].id}/pay`).set(auth(ctx.parent)).send({}).expect(201);
      expect(checkout.body.authorizationUrl).toMatch(/^https:\/\/checkout\.paystack\.test\//);
      const started = paystack.started.get(checkout.body.reference)!;
      expect(started).toMatchObject({ amountKobo: 175_000_00, email: 'okafor@parents.test' });
      expect(started.metadata.school_id).toBe(ctx.schoolId);

      const event = JSON.stringify({ event: 'charge.success', data: { reference: checkout.body.reference, metadata: { school_id: ctx.schoolId } } });
      await http.post('/api/webhooks/paystack').set('Content-Type', 'application/json').set('x-paystack-signature', 'forged').send(event).expect(401);
      const signature = createHmac('sha512', 'sk_test_fake').update(event).digest('hex');
      const hook = await http.post('/api/webhooks/paystack').set('Content-Type', 'application/json').set('x-paystack-signature', signature).send(event).expect(200);
      expect(hook.body).toEqual({ handled: true, status: 'success' });
      // Paystack retries webhooks; a repeat must not count the payment twice.
      await http.post('/api/webhooks/paystack').set('Content-Type', 'application/json').set('x-paystack-signature', signature).send(event).expect(200);

      const verified = (await http.get(`/api/parent/payments/${checkout.body.reference}/verify`).set(auth(ctx.parent)).expect(200)).body;
      expect(verified.invoice).toMatchObject({ status: 'paid', paidKobo: 175_000_00 });
      await http.get(`/api/parent/children/${ctx['LX/001']}/results/${ctx.term}`).set(auth(ctx.parent)).expect(200);
    });

    it('summarises collections for the bursar', async () => {
      const s = (await http.get(`/api/terms/${ctx.term}/fees/summary`).set(owner()).expect(200)).body;
      expect(s).toMatchObject({
        expectedKobo: 525_000_00,
        collectedKobo: 275_000_00,
        outstandingKobo: 250_000_00,
        paid: 1,
        partPaid: 1,
        unpaid: 1,
      });
      const r = (await http.post(`/api/terms/${ctx.term}/fees/reminders`).set(owner()).send({}).expect(201)).body;
      expect(r).toMatchObject({ studentsOwing: 2, messagesQueued: 2 });
    });
  });

  describe('CBT', () => {
    it('gives students PINs and logs them in', async () => {
      const pins = (await http.post(`/api/students/pins/class/${ctx.class}`).set(owner()).send({}).expect(201)).body;
      expect(pins.issued).toBe(3);
      const ada = pins.slips.find((s: { admissionNumber: string }) => s.admissionNumber === 'LX/001');
      await http.post('/api/student/auth/login').send({ schoolSlug: 'linx-academy', admissionNumber: 'LX/001', pin: '999999x' }).expect(401);
      const res = await http.post('/api/student/auth/login').send({ schoolSlug: 'linx-academy', admissionNumber: 'lx/001', pin: ada.pin }).expect(201);
      ctx.student = res.body.token;
      await http.get('/api/students').set(auth(ctx.student)).expect(403);
      expect((await http.get(`/api/students/${ctx['LX/001']}`).set(owner()).expect(200)).body).not.toHaveProperty('pinHash');
      // Second run only issues PINs to students without one.
      expect((await http.post(`/api/students/pins/class/${ctx.class}`).set(owner()).send({}).expect(201)).body.issued).toBe(0);
    });

    it('builds a question bank from CSV', async () => {
      const rows = [
        'subject_code,topic,question,option_a,option_b,option_c,option_d,answer,explanation,exam,year',
        ...[1, 2, 3, 4].map((n) => `MTH,Quadratic equations,Q${n}: roots of x^2-${n * n}=0?,${n},-${n},±${n},0,C,x = ±${n},waec,2019`),
        ...[1, 2, 3, 4].map((n) => `MTH,Indices,I${n}: 2^${n}?,${2 ** n},${n},${n * 2 + 1},0,A,,waec,`),
      ];
      const res = await http.post('/api/questions/import').set(auth(ctx.teacher)).send({ csv: rows.join('\n') }).expect(201);
      expect(res.body).toMatchObject({ imported: 8, errors: [] });
      const bad = await http.post('/api/questions/import').set(auth(ctx.teacher)).send({ csv: 'subject_code,topic,question,option_a,option_b,answer\nXYZ,T,Q,1,2,A\nMTH,T,Q,1,2,C\n' }).expect(201);
      expect(bad.body.errors.map((e: { message: string }) => e.message)).toEqual([
        expect.stringMatching(/Unknown subject code "XYZ"/),
        expect.stringMatching(/answer must be one of the options/),
      ]);
      const qs = (await http.get(`/api/questions?subjectId=${ctx.mth}`).set(auth(ctx.teacher)).expect(200)).body;
      ctx.quad = JSON.stringify(qs.filter((q: { topic: string }) => q.topic === 'Quadratic equations').map((q: { id: string }) => q.id));
    });

    it('runs a timed test and pushes the score into 1st CA', async () => {
      const quad: string[] = JSON.parse(ctx.quad);
      await http
        .post('/api/cbt/tests')
        .set(auth(ctx.teacher))
        .send({ title: 'English CA', subjectId: ctx.eng, durationMinutes: 20, classIds: [ctx.class] })
        .expect(403);
      const test = (
        await http
          .post('/api/cbt/tests')
          .set(auth(ctx.teacher))
          .send({ title: 'Maths CA 1', subjectId: ctx.mth, termId: ctx.term, durationMinutes: 20, classIds: [ctx.class], questionIds: quad, scoreComponent: 'ca1' })
          .expect(201)
      ).body;
      expect(test.totalMarks).toBe(4);
      ctx.test = test.id;

      expect((await http.get('/api/student/tests').set(auth(ctx.student)).expect(200)).body).toEqual([]);
      await http.post(`/api/cbt/tests/${ctx.test}/publish`).set(auth(ctx.teacher)).expect(201);
      const available = (await http.get('/api/student/tests').set(auth(ctx.student)).expect(200)).body;
      expect(available).toHaveLength(1);
      expect(available[0]).toMatchObject({ title: 'Maths CA 1', isOpen: true, attempt: null });

      const attempt = (await http.post(`/api/student/tests/${ctx.test}/start`).set(auth(ctx.student)).expect(201)).body;
      expect(attempt.questions).toHaveLength(4);
      expect(attempt.questions[0]).not.toHaveProperty('answer');
      expect(attempt.secondsLeft).toBeGreaterThan(1100);
      const resumed = (await http.post(`/api/student/tests/${ctx.test}/start`).set(auth(ctx.student)).expect(201)).body;
      expect(resumed.id).toBe(attempt.id);
      expect(resumed.questions.map((q: { id: string }) => q.id)).toEqual(attempt.questions.map((q: { id: string }) => q.id));

      // Three right, one wrong: 75%, which is 15 of the 20 marks for 1st CA.
      const [a, b, c, d] = attempt.questions.map((q: { id: string }) => q.id);
      await http.put(`/api/student/attempts/${attempt.id}/answers`).set(auth(ctx.student)).send({ answers: { [a]: 'c', [b]: 'C' } }).expect(200);
      await http.put(`/api/student/attempts/${attempt.id}/answers`).set(auth(ctx.student)).send({ answers: { [c]: 'C', [d]: 'A' } }).expect(200);
      await http.put(`/api/student/attempts/${attempt.id}/answers`).set(auth(ctx.student)).send({ answers: { 'b3c1f1de-0000-4000-8000-000000000000': 'A' } }).expect(400);
      const done = (await http.post(`/api/student/attempts/${attempt.id}/submit`).set(auth(ctx.student)).expect(201)).body;
      expect(done.result).toEqual({ score: 3, maxScore: 4, percentage: 75 });
      expect(done.questions.find((q: { id: string }) => q.id === d)).toMatchObject({ chosen: 'A', answer: 'C', correct: false });
      await http.put(`/api/student/attempts/${attempt.id}/answers`).set(auth(ctx.student)).send({ answers: { [d]: 'C' } }).expect(400);

      const results = (await http.get(`/api/cbt/tests/${ctx.test}/results`).set(auth(ctx.teacher)).expect(200)).body;
      expect(results).toMatchObject({ submittedCount: 1, averagePercentage: 75 });
      expect(results.students.filter((s: { status: string }) => s.status === 'not_started')).toHaveLength(2);
      expect(results.items.find((i: { questionId: string }) => i.questionId === d).correct).toBe(0);

      const pushed = (await http.post(`/api/cbt/tests/${ctx.test}/push-scores`).set(auth(ctx.teacher)).expect(201)).body;
      expect(pushed).toMatchObject({ written: 1, component: 'ca1', skipped: [] });
      const sheet = (await http.get(`/api/terms/${ctx.term}/classes/${ctx.class}/subjects/${ctx.mth}/scores`).set(auth(ctx.teacher)).expect(200)).body;
      expect(sheet.rows.find((r: { studentId: string }) => r.studentId === ctx['LX/001']).scores).toEqual({ ca1: 15 });
    });
  });

  describe('AI exam prep', () => {
    it('ranks subjects from the student’s own results and CBT topics', async () => {
      await http
        .put(`/api/terms/${ctx.term}/classes/${ctx.class}/subjects/${ctx.mth}/scores`)
        .set(auth(ctx.teacher))
        .send({ entries: [{ studentId: ctx['LX/001'], scores: { ca1: 15, ca2: 10, exam: 15 } }] })
        .expect(200);
      const res = (await http.get('/api/student/prep/plan?ai=false').set(auth(ctx.student)).expect(200)).body;
      expect(res.plan).toBeNull();
      expect(res.profile.targetExam).toMatch(/WAEC/);
      expect(res.profile.subjects.map((s: { subjectName: string }) => s.subjectName)).toEqual(['Mathematics', 'English Language']);
      expect(res.profile.subjects[0]).toMatchObject({ latestScore: 40, belowCredit: true });

      const withAi = (await http.get('/api/student/prep/plan').set(auth(ctx.student)).expect(200)).body;
      expect(withAi.plan.weeks[0].focus[0].topic).toBe('Quadratic equations');
      expect(aiCalls.at(-1)!.prompt).toContain('below');
    });

    it('builds practice that avoids questions in live tests, then explains answers after submitting', async () => {
      const practice = (await http.post('/api/student/prep/practice').set(auth(ctx.student)).send({ subjectId: ctx.mth, count: 10 }).expect(201)).body;
      expect(practice.kind).toBe('practice');
      // The four quadratic questions are in the open CA test, so only the indices questions are used.
      expect(practice.questions.map((q: { topic: string }) => q.topic)).toEqual(['Indices', 'Indices', 'Indices', 'Indices']);
      const qid = practice.questions[0].id;
      await http.post(`/api/student/prep/explain/${qid}`).set(auth(ctx.student)).expect(404);

      await http.put(`/api/student/attempts/${practice.id}/answers`).set(auth(ctx.student)).send({ answers: { [qid]: 'B' } }).expect(200);
      const done = (await http.post(`/api/student/attempts/${practice.id}/submit`).set(auth(ctx.student)).expect(201)).body;
      expect(done.questions[0]).toHaveProperty('answer', 'A');

      const first = (await http.post(`/api/student/prep/explain/${qid}`).set(auth(ctx.student)).expect(201)).body;
      expect(first).toMatchObject({ chosen: 'B', answer: 'A', correct: false, source: 'ai' });
      const cached = (await http.post(`/api/student/prep/explain/${qid}`).set(auth(ctx.student)).expect(201)).body;
      expect(cached.source).toBe('cache');

      // A submitted test that shows results can be explained too.
      const quad: string[] = JSON.parse(ctx.quad);
      expect((await http.post(`/api/student/prep/explain/${quad[0]}`).set(auth(ctx.student)).expect(201)).body.source).toBe('ai');
    });

    it('drafts questions and report card remarks for teachers', async () => {
      const drafts = (
        await http.post('/api/questions/generate').set(auth(ctx.teacher)).send({ subjectId: ctx.mth, topic: 'Linear equations', count: 2 }).expect(201)
      ).body;
      expect(drafts.questions).toHaveLength(1); // the draft whose answer is not an option is dropped
      await http.post('/api/questions/bulk').set(auth(ctx.teacher)).send({ questions: drafts.questions }).expect(201);

      const remarks = (await http.post(`/api/terms/${ctx.term}/students/${ctx['LX/001']}/comments/draft`).set(owner()).expect(201)).body;
      expect(remarks).toEqual({ teacherComment: 'Ada works hard.', headComment: 'Keep it up.' });
    });
  });

  describe('tenant isolation for the new features', () => {
    it('keeps parents, bills, tests and messages inside their school', async () => {
      const other = await http
        .post('/api/auth/register-school')
        .send({ school: { name: 'Other', slug: 'other-linx' }, owner: { fullName: 'Other Owner', email: 'o@o.test', password: 'password123' } })
        .expect(201);
      const t = auth(other.body.token);
      expect((await http.get('/api/guardians').set(t).expect(200)).body).toEqual([]);
      expect((await http.get('/api/notifications').set(t).expect(200)).body).toEqual([]);
      expect((await http.get('/api/cbt/tests').set(t).expect(200)).body).toEqual([]);
      expect((await http.get(`/api/questions`).set(t).expect(200)).body).toEqual([]);
      await http.get(`/api/invoices/${ctx['inv:LX/001']}`).set(t).expect(404);
      await http.get(`/api/cbt/tests/${ctx.test}`).set(t).expect(404);
      await http.post(`/api/guardians`).set(t).send({ fullName: 'X Y', phone: '08030000000', students: [{ studentId: ctx['LX/001'] }] }).expect(404);
      // A parent of one school cannot log in to another with the same phone number.
      await http.post('/api/parent/auth/request-code').send({ schoolSlug: 'other-linx', phone: '08031234567' }).expect(201);
      // A webhook that names the wrong school is ignored.
      const event = JSON.stringify({ event: 'charge.success', data: { reference: [...paystack.started.keys()][0], metadata: { school_id: other.body.school.id } } });
      const signature = createHmac('sha512', 'sk_test_fake').update(event).digest('hex');
      const hook = await http.post('/api/webhooks/paystack').set('Content-Type', 'application/json').set('x-paystack-signature', signature).send(event).expect(200);
      expect(hook.body).toEqual({ handled: false });
    });
  });
});
