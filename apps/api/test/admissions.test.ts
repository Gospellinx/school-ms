import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { sql } from 'drizzle-orm';
import { createHmac } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { DbService } from '../src/db/db.service';
import { EmailProvider, LogEmailProvider } from '../src/email/email.provider';
import { EmailService } from '../src/email/email.service';
import { InitializeParams, PaystackClient } from '../src/fees/paystack.client';
import { LogProvider, MessagingProvider } from '../src/messaging/messaging.provider';

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

let app: INestApplication;
let http: ReturnType<typeof request>;
let mailbox: LogEmailProvider;
let email: EmailService;
let dbs: DbService;
const paystack = new FakePaystack();
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

beforeAll(async () => {
  const mod = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(PaystackClient)
    .useValue(paystack)
    .overrideProvider(MessagingProvider)
    .useValue(new LogProvider())
    .overrideProvider(EmailProvider)
    .useValue(new LogEmailProvider())
    .compile();
  app = mod.createNestApplication({ rawBody: true });
  app.setGlobalPrefix('api');
  await app.init();
  http = request(app.getHttpServer());
  mailbox = app.get(EmailProvider) as LogEmailProvider;
  email = app.get(EmailService);
  dbs = app.get(DbService);
});

afterAll(async () => {
  await app?.close();
});

describe('school website and online admissions', () => {
  const ctx: Record<string, string> = {};
  const owner = () => auth(ctx.owner);
  const answers: Record<string, string> = {};
  const pub = (path: string) => `/api/public/schools/admit-academy${path}`;

  it('sets up a school with a question bank', async () => {
    const reg = await http
      .post('/api/auth/register-school')
      .send({
        school: { name: 'Admit Academy', slug: 'admit-academy', email: 'office@admit.test' },
        owner: { fullName: 'Owner', email: 'owner@admit.test', password: 'password123' },
      })
      .expect(201);
    ctx.owner = reg.body.token;
    ctx.schoolId = reg.body.school.id;
    const sections = (await http.get('/api/sections').set(owner()).expect(200)).body;
    const jss = sections.find((s: { kind: string }) => s.kind === 'junior_secondary').id;
    ctx.jss1 = (await http.post('/api/classes').set(owner()).send({ sectionId: jss, name: 'JSS 1' }).expect(201)).body.id;
    ctx.mth = (await http.post('/api/subjects').set(owner()).send({ name: 'Mathematics', code: 'MTH' }).expect(201)).body.id;
    ctx.eng = (await http.post('/api/subjects').set(owner()).send({ name: 'English Language', code: 'ENG' }).expect(201)).body.id;
    const qs = [];
    for (let i = 1; i <= 3; i++) {
      qs.push({ subjectId: ctx.mth, topic: 'Arithmetic', body: `What is ${i} + ${i}?`, options: ['A', 'B', 'C', 'D'].map((k, j) => ({ key: k, text: String(2 * i + j) })), answer: 'A' });
      qs.push({ subjectId: ctx.eng, topic: 'Grammar', body: `Pick the noun (${i})`, options: [{ key: 'A', text: 'run' }, { key: 'B', text: 'table' }, { key: 'C', text: 'quickly' }], answer: 'B' });
    }
    await http.post('/api/questions/bulk').set(owner()).send({ questions: qs }).expect(201);

    await http.post('/api/staff').set(owner()).send({ fullName: 'Teacher', email: 't@admit.test', password: 'password123', role: 'teacher' }).expect(201);
    ctx.teacher = (await http.post('/api/auth/login').send({ schoolSlug: 'admit-academy', email: 't@admit.test', password: 'password123' }).expect(201)).body.token;
  });

  it('builds an entrance exam from the question bank through the CBT module', async () => {
    const tooMany = await http
      .post('/api/admissions/entrance-exams')
      .set(owner())
      .send({ title: 'JSS 1 Entrance', durationMinutes: 30, parts: [{ subjectId: ctx.mth, count: 10 }] })
      .expect(400);
    expect(tooMany.body.message).toMatch(/only 3 Mathematics questions/);

    const exam = (
      await http
        .post('/api/admissions/entrance-exams')
        .set(owner())
        .send({ title: 'JSS 1 Entrance', durationMinutes: 30, parts: [{ subjectId: ctx.mth, count: 2 }, { subjectId: ctx.eng, count: 2 }] })
        .expect(201)
    ).body;
    expect(exam).toMatchObject({ questions: 4, totalMarks: 4 });
    ctx.exam = exam.id;
    const list = (await http.get('/api/admissions/entrance-exams').set(owner()).expect(200)).body;
    expect(list[0]).toMatchObject({ id: exam.id, status: 'published', questions: 4 });
    expect(list[0].subjects.map((s: { name: string }) => s.name).sort()).toEqual(['English Language', 'Mathematics']);

    // Entrance exams stay out of teachers' CBT lists, and teachers cannot make them.
    const teacherTests = (await http.get('/api/cbt/tests').set(auth(ctx.teacher)).expect(200)).body;
    expect(teacherTests.find((t: { id: string }) => t.id === exam.id)).toBeUndefined();
    await http.post(`/api/cbt/tests/${exam.id}/close`).set(auth(ctx.teacher)).expect(403);
    await http
      .post('/api/cbt/tests')
      .set(auth(ctx.teacher))
      .send({ title: 'Sneaky', subjectId: ctx.mth, durationMinutes: 10, purpose: 'entrance' })
      .expect(403);
    // Ordinary class tests still need a class.
    await http.post('/api/cbt/tests').set(owner()).send({ title: 'No class', subjectId: ctx.mth, durationMinutes: 10 }).expect(400);
  });

  it('publishes the website and opens admissions', async () => {
    await http.get(pub('')).expect(404);
    await http
      .put('/api/admissions/site')
      .set(owner())
      .send({
        published: true,
        tagline: 'Excellence in learning',
        about: 'A school.',
        highlights: [{ title: 'CBT ready', text: 'Every class sits CBT.' }],
        admissionsOpen: true,
        admissionSession: '2026/2027',
        applicationFeeKobo: 5_000_00,
        admissionsEmail: 'admissions@admit.test',
        accentColor: '#1d4ed8',
      })
      .expect(200);
    const classes = (await http.post('/api/admissions/classes').set(owner()).send({ classId: ctx.jss1, entranceTestId: ctx.exam, passMark: 50, seats: 1 }).expect(201)).body;
    ctx.ac = classes[0].id;
    expect(classes[0]).toMatchObject({ className: 'JSS 1', seats: 1, seatsTaken: 0, passMark: 50 });

    const site = (await http.get(pub('')).expect(200)).body;
    expect(site.school).toMatchObject({ name: 'Admit Academy', slug: 'admit-academy' });
    expect(site.site.highlights).toHaveLength(1);
    expect(site.admissions).toMatchObject({ open: true, feeKobo: 500000, session: '2026/2027' });
    expect(site.admissions.classes).toEqual([{ id: ctx.ac, className: 'JSS 1', hasExam: true, examMinutes: 30 }]);
  });

  const form = (first: string) => ({
    admissionClassId: ctx.ac,
    firstName: first,
    lastName: 'Bello',
    gender: 'female',
    dateOfBirth: '2015-03-02',
    parentName: 'Mrs Bello',
    parentEmail: 'Bello@Parents.test',
    parentPhone: '0803 555 1234',
    relationship: 'Mother',
  });

  it('takes an application and waits for the form fee, with follow-ups scheduled', async () => {
    await http.post(pub('/applications')).send({ ...form('Amina'), parentPhone: '123' }).expect(400);
    await http.post(pub('/applications')).send({ ...form('Amina'), website: 'http://spam' }).expect(400);

    const res = (await http.post(pub('/applications')).send(form('Amina')).expect(201)).body;
    expect(res).toMatchObject({ reference: `ADM-${new Date().getFullYear()}-0001`, status: 'pending_payment', feeKobo: 500000, existing: false });
    ctx.ref = res.reference;
    ctx.key = res.key;
    // A double submit returns the same application.
    const again = (await http.post(pub('/applications')).send(form('Amina')).expect(201)).body;
    expect(again).toMatchObject({ reference: ctx.ref, existing: true });

    await http.get(pub(`/applications/${ctx.ref}?key=wrong`)).expect(404);
    const status = (await http.get(pub(`/applications/${ctx.ref}?key=${ctx.key}`)).expect(200)).body;
    expect(status.application).toMatchObject({ status: 'pending_payment', childName: 'Amina Bello', className: 'JSS 1', fee: { amountKobo: 500000, paid: false } });

    const sent = await email.dispatchForSchool(ctx.schoolId);
    expect(sent.sent).toBe(1); // the "complete your application" email; reminders wait
    expect(mailbox.sent.at(-1)).toMatchObject({ to: 'bello@parents.test', fromName: 'Admit Academy', replyTo: 'office@admit.test' });
    expect(mailbox.sent.at(-1)!.text).toContain(`/s/admit-academy/application?ref=${ctx.ref}&key=${ctx.key}`);
    expect(mailbox.sent.at(-1)!.html).toContain('#1d4ed8');
  });

  it('confirms the Paystack form fee from the webhook and moves the application on', async () => {
    const pay = (await http.post(pub(`/applications/${ctx.ref}/pay?key=${ctx.key}`)).expect(201)).body;
    const started = paystack.started.get(pay.reference)!;
    expect(started).toMatchObject({ amountKobo: 500000, email: 'bello@parents.test' });
    expect(started.metadata).toMatchObject({ purpose: 'admission_fee', school_id: ctx.schoolId });
    expect(started.callbackUrl).toContain(`/s/admit-academy/application?ref=${ctx.ref}`);

    const event = { event: 'charge.success', data: { reference: pay.reference, metadata: started.metadata } };
    const raw = JSON.stringify(event);
    const sig = createHmac('sha512', 'sk_test_fake').update(raw).digest('hex');
    const hook = await http.post('/api/webhooks/paystack').set('x-paystack-signature', sig).set('content-type', 'application/json').send(raw).expect(200);
    expect(hook.body).toMatchObject({ handled: true, status: 'success' });
    // The return page can confirm again safely.
    expect((await http.get(pub(`/payments/${pay.reference}/verify`)).expect(200)).body).toMatchObject({ status: 'success', reference: ctx.ref });

    const status = (await http.get(pub(`/applications/${ctx.ref}?key=${ctx.key}`)).expect(200)).body.application;
    expect(status).toMatchObject({ status: 'applied', fee: { paid: true } });

    // Fee reminders fall due later but are skipped because the fee is paid.
    await dbs.withSchool(ctx.schoolId, (tx) => tx.execute(sql`update email_outbox set send_after = now() - interval '1 minute' where status = 'queued'`));
    const r = await email.dispatchForSchool(ctx.schoolId);
    expect(r.skipped).toBe(2);
    const subjects = mailbox.sent.map((m) => m.subject);
    expect(subjects).toContain(`Application received: Amina Bello (${ctx.ref})`);
    expect(subjects).toContain('New application: Amina Bello for JSS 1');
    expect(mailbox.sent.find((m) => m.subject.startsWith('New application'))!.to).toBe('admissions@admit.test');
  });

  it('runs the CBT entrance exam for the applicant', async () => {
    const list = (await http.get('/api/admissions/applications').set(owner()).expect(200)).body;
    ctx.app = list[0].id;
    await http.post(pub(`/applications/${ctx.ref}/exam/start?key=${ctx.key}`)).expect(400);

    const opensAt = new Date(Date.now() - 60_000).toISOString();
    const closesAt = new Date(Date.now() + 2 * 86400_000).toISOString();
    const sched = (await http.post('/api/admissions/schedule-exam').set(owner()).send({ applicationIds: [ctx.app], opensAt, closesAt }).expect(201)).body;
    expect(sched).toEqual({ scheduled: 1, skipped: [] });

    const exam = (await http.post(pub(`/applications/${ctx.ref}/exam/start?key=${ctx.key}`)).expect(201)).body;
    expect(exam.questions).toHaveLength(4);
    expect(exam.questions[0].answer).toBeUndefined();
    expect(exam.secondsLeft).toBeGreaterThan(29 * 60);
    // Starting again resumes the same sitting.
    const resumed = (await http.post(pub(`/applications/${ctx.ref}/exam/start?key=${ctx.key}`)).expect(201)).body;
    expect(resumed.id).toBe(exam.id);

    for (const q of exam.questions) answers[q.id] = q.subject === 'Mathematics' ? 'A' : 'C'; // maths right, English wrong
    await http.put(pub(`/applications/${ctx.ref}/exam/answers?key=${ctx.key}`)).send({ answers }).expect(200);
    const done = (await http.post(pub(`/applications/${ctx.ref}/exam/submit?key=${ctx.key}`)).expect(201)).body;
    expect(done).toMatchObject({ submitted: true, questions: [] });
    await http.put(pub(`/applications/${ctx.ref}/exam/answers?key=${ctx.key}`)).send({ answers }).expect(400);

    const detail = (await http.get(`/api/admissions/applications/${ctx.app}`).set(owner()).expect(200)).body;
    expect(detail.exam).toMatchObject({ percentage: 50, score: 2, maxScore: 4, answered: 4 });
    expect(detail.exam.subjects.find((s: { name: string }) => s.name === 'Mathematics')).toMatchObject({ correct: 2, percentage: 100 });
    expect(detail.events.map((e: { kind: string }) => e.kind)).toEqual(expect.arrayContaining(['submitted', 'fee_paid', 'exam_scheduled', 'exam_started', 'exam_submitted']));
    const row = (await http.get('/api/admissions/applications?status=exam').set(owner()).expect(200)).body[0];
    expect(row).toMatchObject({ examPercentage: 50, passMark: 50, recommended: true });
    // The "exam closes soon" nudge is cancelled once the exam is done.
    expect(detail.emails.find((e: { kind: string }) => e.kind === 'admission_exam_missed').status).toBe('skipped');
  });

  it('offers a place, respects the seat limit, and the family accepts online', async () => {
    await http.post(`/api/admissions/applications/${ctx.app}/enrol`).set(owner()).send({}).expect(400);
    await http.post(`/api/admissions/applications/${ctx.app}/offer`).set(owner()).send({ note: 'Resumption is 8 September.' }).expect(201);

    const second = (await http.post(pub('/applications')).send(form('Zainab')).expect(201)).body;
    const list = (await http.get('/api/admissions/applications?q=Zainab').set(owner()).expect(200)).body;
    await http.post(`/api/admissions/applications/${list[0].id}/mark-paid`).set(owner()).send({ method: 'cash' }).expect(201);
    expect((await http.get(pub(`/applications/${second.reference}?key=${second.key}`)).expect(200)).body.application.status).toBe('applied');
    const full = await http.post(`/api/admissions/applications/${list[0].id}/offer`).set(owner()).send({}).expect(400);
    expect(full.body.message).toMatch(/All 1 places/);
    await http.post(`/api/admissions/applications/${list[0].id}/reject`).set(owner()).send({}).expect(201);

    const status = (await http.get(pub(`/applications/${ctx.ref}?key=${ctx.key}`)).expect(200)).body.application;
    expect(status).toMatchObject({ status: 'offered', offer: { note: 'Resumption is 8 September.' } });
    await http.post(pub(`/applications/${ctx.ref}/accept?key=${ctx.key}`)).expect(201);
    expect((await http.get(pub(`/applications/${ctx.ref}?key=${ctx.key}`)).expect(200)).body.application.status).toBe('accepted');

    await email.dispatchForSchool(ctx.schoolId);
    const subjects = mailbox.sent.map((m) => m.subject);
    expect(subjects).toContain('Offer of admission: Amina Bello');
    expect(subjects).toContain('Offer accepted: welcome to Admit Academy');
    expect(subjects).toContain('Update on Zainab\'s application (' + second.reference + ')');
  });

  it('enrols the applicant as a student with a parent account and portal PIN', async () => {
    const res = (await http.post(`/api/admissions/applications/${ctx.app}/enrol`).set(owner()).send({}).expect(201)).body;
    expect(res.student.admissionNumber).toBe(`ADMIT/${new Date().getFullYear()}/001`);
    expect(res.pin).toMatch(/^\d{6}$/);

    const students = (await http.get(`/api/students?classId=${ctx.jss1}`).set(owner()).expect(200)).body;
    expect(students).toHaveLength(1);
    expect(students[0]).toMatchObject({ firstName: 'Amina', lastName: 'Bello', admissionNumber: res.student.admissionNumber, hasPin: true });
    const parents = (await http.get('/api/guardians').set(owner()).expect(200)).body;
    expect(parents[0]).toMatchObject({ fullName: 'Mrs Bello', phone: '2348035551234', email: 'bello@parents.test' });

    await http.post('/api/student/auth/login').send({ schoolSlug: 'admit-academy', admissionNumber: res.student.admissionNumber, pin: res.pin }).expect(201);

    await email.dispatchForSchool(ctx.schoolId);
    const welcome = mailbox.sent.find((m) => m.subject === 'Welcome to Admit Academy, Amina!')!;
    expect(welcome.text).toContain(res.pin);

    const overview = (await http.get('/api/admissions/overview').set(owner()).expect(200)).body;
    expect(overview.counts).toMatchObject({ enrolled: 1, rejected: 1 });
    expect(overview.fees).toMatchObject({ collectedKobo: 1_000_000, paid: 2 });
    expect(overview.exam).toMatchObject({ sat: 1, averagePercentage: 50 });
    expect(overview.funnel.find((f: { key: string }) => f.key === 'enrolled').n).toBe(1);
    expect(overview.activity[0].kind).toBe('enrolled');
    expect(overview.emails.failed).toBe(0);
  });

  it('keeps applications private to the school', async () => {
    const other = await http
      .post('/api/auth/register-school')
      .send({ school: { name: 'Other', slug: 'other-admit' }, owner: { fullName: 'Other Owner', email: 'o@other.test', password: 'password123' } })
      .expect(201);
    await http.get(`/api/admissions/applications/${ctx.app}`).set(auth(other.body.token)).expect(404);
    expect((await http.get('/api/admissions/applications').set(auth(other.body.token)).expect(200)).body).toEqual([]);
    // The status link only works on its own school's site.
    await http.get(`/api/public/schools/other-admit/applications/${ctx.ref}?key=${ctx.key}`).expect(404);
    await http.get('/api/admissions/overview').set(auth(ctx.teacher)).expect(403);
  });
});
