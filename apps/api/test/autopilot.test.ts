import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { AutomationsService } from '../src/autopilot/automations.service';
import { todayInLagos } from '../src/common/access';
import { InitializeParams, PaystackClient } from '../src/fees/paystack.client';
import { EmailProvider, LogEmailProvider } from '../src/messaging/email.provider';
import { LogProvider, MessagingProvider } from '../src/messaging/messaging.provider';
import { NotificationsService } from '../src/messaging/notifications.service';

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
let sms: LogProvider;
let mail: LogEmailProvider;
let notifications: NotificationsService;
let autopilot: AutomationsService;
const paystack = new FakePaystack();
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const today = todayInLagos();
const shiftDays = (iso: string, days: number) => new Date(Date.parse(`${iso}T12:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
/** Midday in Lagos on `date`, inside the default sending window. */
const noon = (date = today) => new Date(`${date}T11:00:00Z`);
const weekday = new Date(`${today}T12:00:00Z`).getUTCDay();

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
  sms = app.get(MessagingProvider) as LogProvider;
  mail = app.get(EmailProvider) as LogEmailProvider;
  notifications = app.get(NotificationsService);
  autopilot = app.get(AutomationsService);
});

afterAll(async () => {
  await app?.close();
});

describe('fee recovery autopilot and parent follow-ups', () => {
  const ctx: Record<string, string> = {};
  const owner = () => auth(ctx.owner);
  const run = async (date = today) => {
    const r = await autopilot.runForSchool(ctx.schoolId, noon(date));
    await notifications.dispatchForSchool(ctx.schoolId, 500);
    return r;
  };

  it('sets up a school whose fees fell due six days ago', async () => {
    const reg = await http
      .post('/api/auth/register-school')
      .send({ school: { name: 'Autopilot Academy', slug: 'autopilot-academy' }, owner: { fullName: 'Mrs Proprietor', email: 'owner@autopilot.test', password: 'password123' } })
      .expect(201);
    ctx.owner = reg.body.token;
    ctx.schoolId = reg.body.school.id;
    await http.patch('/api/school').set(owner()).send({ phone: '08030000000', email: 'bursar@autopilot.test' }).expect(200);
    const sections = (await http.get('/api/sections').set(owner()).expect(200)).body;
    const ss = sections.find((s: { kind: string }) => s.kind === 'senior_secondary').id;
    const session = (await http.post('/api/sessions').set(owner()).send({ name: '2026/2027' }).expect(201)).body;
    ctx.term = session.terms[0].id;
    await http.patch(`/api/terms/${ctx.term}`).set(owner()).send({ startsOn: shiftDays(today, -20), endsOn: shiftDays(today, 60) }).expect(200);
    await http.post(`/api/terms/${ctx.term}/make-current`).set(owner()).expect(201);
    ctx.class = (await http.post('/api/classes').set(owner()).send({ sectionId: ss, name: 'SS 1', arm: 'A' }).expect(201)).body.id;
    const csv = [
      'admission_number,first_name,last_name,gender,parent_name,parent_phone,parent_email',
      'AP/001,Ada,Okafor,F,Mrs Okafor,08031234567,okafor@parents.test',
      'AP/002,Bayo,Adeyemi,M,Mr Adeyemi,08051112222,',
    ].join('\n');
    await http.post('/api/students/import').set(owner()).send({ classId: ctx.class, csv }).expect(201);
    for (const s of (await http.get(`/api/students?classId=${ctx.class}`).set(owner()).expect(200)).body) ctx[s.admissionNumber] = s.id;
    await http.post('/api/fees/items').set(owner()).send({ termId: ctx.term, name: 'Tuition', amountKobo: 100_000_00 }).expect(201);
    await http.post(`/api/terms/${ctx.term}/invoices/generate`).set(owner()).send({}).expect(201);
    for (const i of (await http.get(`/api/terms/${ctx.term}/invoices`).set(owner()).expect(200)).body) ctx[`inv:${i.student.admissionNumber}`] = i.id;
  });

  it('starts with every automation off, the default sequences ready and gateways in sandbox', async () => {
    const o = (await http.get('/api/automations').set(owner()).expect(200)).body;
    expect(o.sequences.map((s: { trigger: string; enabled: boolean }) => [s.trigger, s.enabled])).toEqual([
      ['fee_overdue', false],
      ['new_parent', false],
      ['absent_streak', false],
    ]);
    expect(o.feeDueDate).toBe(shiftDays(today, -6));
    expect(o.providers).toEqual({ sms: 'sandbox', email: 'sandbox', paystack: 'test' });
    expect(await run()).toMatchObject({ feeReminders: 0, messages: 0 });
    await http.get('/api/automations').set(auth('nonsense')).expect(401);
  });

  it('sends the due fee reminder once, by SMS and email, with a pay link', async () => {
    const preview = (await http.get('/api/automations/fee-recovery').set(owner()).expect(200)).body;
    expect(preview).toMatchObject({ enabled: false, owingBills: 2, owingKobo: 200_000_00 });
    // Due six days ago: the "due today" step (index 1) is the latest one reached; the -3 step is skipped.
    expect(preview.dueToday.map((d: { step: number }) => d.step)).toEqual([1, 1]);

    await http.patch('/api/automations/sequences/fee_overdue').set(owner()).send({ enabled: true }).expect(200);
    const emailsBefore = mail.sent.length;
    const r = await run();
    expect(r).toMatchObject({ feeReminders: 2, messages: 3 });
    const email = mail.sent.slice(emailsBefore).find((e) => e.to === 'okafor@parents.test')!;
    expect(email).toMatchObject({ subject: 'Ada’s fees are due today', fromName: 'Autopilot Academy', replyTo: 'bursar@autopilot.test' });
    expect(email.text).toMatch(/Dear Mrs Okafor, Ada’s fees of ₦100,000 are due today/);
    const link = email.text.match(/http:\/\/localhost:3000\/pay\/([A-Za-z0-9_-]+)/)!;
    ctx.adaLink = link[1];
    expect(sms.sent.find((m) => m.to === '2348051112222')!.body).toMatch(/Bayo’s fees of ₦100,000 are due today/);

    expect(await run()).toMatchObject({ feeReminders: 0, messages: 0 });
    // A week later the overdue step goes out.
    expect(await run(shiftDays(today, 2))).toMatchObject({ feeReminders: 2 });
  });

  it('lets a parent pay from the link without signing in', async () => {
    const page = (await http.get(`/api/pay-links/${ctx.adaLink}`).expect(200)).body;
    expect(page).toMatchObject({ school: { name: 'Autopilot Academy' }, student: 'Ada O.', balanceKobo: 100_000_00, amountDueKobo: 100_000_00, plan: null });
    expect(JSON.stringify(page)).not.toMatch(/Okafor|AP\/001/);
    await http.get('/api/pay-links/doesnotexist').expect(404);
    await http.get('/api/pay-links/bad!').expect(400);

    const checkout = (await http.post(`/api/pay-links/${ctx.adaLink}/checkout`).send({ option: 'full' }).expect(201)).body;
    const started = paystack.started.get(checkout.reference)!;
    expect(started).toMatchObject({ amountKobo: 100_000_00, email: 'okafor@parents.test', callbackUrl: `http://localhost:3000/pay/${ctx.adaLink}/done` });
    const done = (await http.get(`/api/pay-links/${ctx.adaLink}/payments/${checkout.reference}`).expect(200)).body;
    expect(done).toMatchObject({ status: 'success', amountKobo: 100_000_00, balanceKobo: 0 });
    await http.post(`/api/pay-links/${ctx.adaLink}/checkout`).send({}).expect(400);

    const recovery = (await http.get('/api/automations/fee-recovery').set(owner()).expect(200)).body;
    expect(recovery).toMatchObject({ recoveredKobo: 100_000_00, recoveredBills: 1, owingBills: 1 });
  });

  it('agrees an instalment plan, reminds before each instalment and keeps results open while on track', async () => {
    const bad = await http
      .put(`/api/invoices/${ctx['inv:AP/002']}/plan`)
      .set(owner())
      .send({ schedule: [{ dueOn: shiftDays(today, 3), amountKobo: 10_000_00 }] })
      .expect(400);
    expect(bad.body.message).toMatch(/add up/);

    const before = sms.sent.length;
    const plan = (await http.put(`/api/invoices/${ctx['inv:AP/002']}/plan`).set(owner()).send({ count: 2, firstDueOn: shiftDays(today, 3), everyDays: 30 }).expect(200)).body;
    expect(plan.schedule.map((i: { amountKobo: number }) => i.amountKobo)).toEqual([50_000_00, 50_000_00]);
    expect(plan.progress).toMatchObject({ onTrack: true, behindKobo: 0 });
    await notifications.dispatchForSchool(ctx.schoolId);
    expect(sms.sent.slice(before).map((m) => m.body).join()).toMatch(/payment plan for Bayo's fees: 1\. ₦50,000 by/);

    // Three days before the first instalment: the friendly step, for the instalment amount only.
    expect(await run()).toMatchObject({ feeReminders: 1 });
    expect(sms.sent.at(-1)!.body).toMatch(/fees of ₦50,000 are due on .* This is instalment 1 of 2 on your payment plan\./);

    const bill = (await http.get(`/api/invoices/${ctx['inv:AP/002']}`).set(owner()).expect(200)).body;
    expect(bill.plan.progress.next).toMatchObject({ dueOn: shiftDays(today, 3), outstandingKobo: 50_000_00 });
    const list = (await http.get('/api/fees/plans').set(owner()).expect(200)).body;
    expect(list).toHaveLength(1);

    // Results are withheld for debt, but an on-track plan keeps them open.
    await http.patch('/api/school').set(owner()).send({ withholdResultsForDebt: true }).expect(200);
    const subj = (await http.post('/api/subjects').set(owner()).send({ name: 'Mathematics', code: 'MTH' }).expect(201)).body.id;
    await http.post(`/api/classes/${ctx.class}/subjects`).set(owner()).send({ subjectId: subj }).expect(201);
    await http
      .put(`/api/terms/${ctx.term}/classes/${ctx.class}/subjects/${subj}/scores`)
      .set(owner())
      .send({ entries: [{ studentId: ctx['AP/002'], scores: { ca1: 15, ca2: 15, exam: 40 } }] })
      .expect(200);
    await http.post(`/api/terms/${ctx.term}/classes/${ctx.class}/publish`).set(owner()).send({}).expect(201);
    await http.post('/api/parent/auth/request-code').send({ schoolSlug: 'autopilot-academy', phone: '08051112222' }).expect(201);
    const code = sms.sent.at(-1)!.body.match(/\b(\d{6})\b/)![1];
    const parent = (await http.post('/api/parent/auth/verify').send({ schoolSlug: 'autopilot-academy', phone: '08051112222', code }).expect(201)).body.token;
    await http.get(`/api/parent/children/${ctx['AP/002']}/results/${ctx.term}`).set(auth(parent)).expect(200);

    await http.patch('/api/automations/settings').set(owner()).send({ holdAllowsPlans: false }).expect(200);
    await http.get(`/api/parent/children/${ctx['AP/002']}/results/${ctx.term}`).set(auth(parent)).expect(402);
    await http.patch('/api/automations/settings').set(owner()).send({ holdAllowsPlans: true }).expect(200);

    // Cancelling the plan puts the bill back on the term's schedule.
    await http.delete(`/api/invoices/${ctx['inv:AP/002']}/plan`).set(owner()).expect(200);
    await http.get(`/api/parent/children/${ctx['AP/002']}/results/${ctx.term}`).set(auth(parent)).expect(402);
  });

  it('sends each parent one weekly report covering attendance, scores and fees', async () => {
    await http
      .put(`/api/classes/${ctx.class}/attendance/${today}`)
      .set(owner())
      .send({ entries: [{ studentId: ctx['AP/001'], status: 'present' }, { studentId: ctx['AP/002'], status: 'absent' }] })
      .expect(200);
    const preview = (await http.get('/api/automations/weekly-report/preview').set(owner()).expect(200)).body;
    expect(preview.sms).toMatch(/Autopilot Academy weekly update\./);

    await http.patch('/api/automations/settings').set(owner()).send({ weeklyReport: true, weeklyDay: weekday, weeklyHour: 9 }).expect(200);
    const emailsBefore = mail.sent.length;
    expect(await run()).toMatchObject({ weeklyReports: 2 });
    const report = mail.sent.slice(emailsBefore).find((e) => e.to === 'okafor@parents.test')!;
    expect(report.subject).toMatch(/^Weekly update for Ada/);
    expect(report.text).toMatch(/Attendance: present 1 of 1 school days\./);
    const bayo = sms.sent.filter((m) => m.to === '2348051112222').at(-1)!;
    expect(bayo.body).toMatch(/Bayo: at school 0 of 1 days \(1 absent\); new scores: Mathematics 70; fees owed ₦100,000\./);
    expect(await run()).toMatchObject({ weeklyReports: 0 });
  });

  it('sends the proprietor a daily summary on WhatsApp and email', async () => {
    await http
      .patch('/api/automations/settings')
      .set(owner())
      .send({ dailySummary: true, dailyHour: 9, digestRecipients: [{ name: 'Proprietor', phone: '0803 999 8888', channel: 'whatsapp' }, { name: 'Owner', email: 'owner@autopilot.test', channel: 'email' }] })
      .expect(200);
    await http.patch('/api/automations/settings').set(owner()).send({ digestRecipients: [{ name: 'X', channel: 'whatsapp' }] }).expect(400);
    const preview = (await http.get('/api/automations/daily-summary/preview').set(owner()).expect(200)).body;
    expect(preview.figures.paymentsToday).toEqual({ count: 1, kobo: 100_000_00 });
    expect(preview.figures.attendance).toMatchObject({ classes: 1, marked: 1, present: 1, absent: 1 });

    expect(await run()).toMatchObject({ dailySummaries: 1 });
    const wa = sms.sent.find((m) => m.to === '2348039998888')!;
    expect(wa.channel).toBe('whatsapp');
    expect(wa.body).toMatch(/Fees today: ₦100,000 from 1 payment/);
    expect(wa.body).toMatch(/₦100k of ₦200k collected \(50%\), ₦100k outstanding/);
    expect(mail.sent.at(-1)!.subject).toMatch(/^Autopilot Academy daily summary/);
    expect(await run()).toMatchObject({ dailySummaries: 0 });
  });

  it('welcomes only parents added after the sequence is switched on', async () => {
    await http.patch('/api/automations/sequences/new_parent').set(owner()).send({ enabled: true }).expect(200);
    expect(await run()).toMatchObject({ newParents: 0 });
    const csv = 'admission_number,first_name,last_name,parent_name,parent_phone,parent_email\nAP/003,Chioma,Eze,Mrs Eze,08061234567,eze@parents.test\n';
    await http.post('/api/students/import').set(owner()).send({ classId: ctx.class, csv }).expect(201);
    expect(await run()).toMatchObject({ newParents: 1 });
    expect(sms.sent.filter((m) => m.to === '2348061234567').map((m) => m.body).join('\n')).toMatch(/Welcome to Autopilot Academy, Mrs Eze! You can now see Chioma’s results.*Sign in with your phone number 08061234567/);
    expect(await run()).toMatchObject({ newParents: 0 });
    // Three days on, the email-only tips step.
    const r = await run(shiftDays(today, 3));
    expect(r.newParents).toBe(1);
    expect(mail.sent.filter((e) => e.to === 'eze@parents.test').at(-1)!.subject).toBe('Paying fees and tracking Chioma’s progress');
  });

  it('follows up when a child misses several days in a row', async () => {
    await http.patch('/api/automations/sequences/absent_streak').set(owner()).send({ enabled: true, threshold: 2 }).expect(200);
    expect(await run()).toMatchObject({ absences: 0 });
    await http
      .put(`/api/classes/${ctx.class}/attendance/${shiftDays(today, -1)}`)
      .set(owner())
      .send({ entries: [{ studentId: ctx['AP/002'], status: 'absent' }] })
      .expect(200);
    expect(await run()).toMatchObject({ absences: 1 });
    expect(sms.sent.at(-1)!.body).toMatch(/Bayo has been absent for 2 school days in a row/);
    expect(await run()).toMatchObject({ absences: 0 });
  });

  it('edits sequence wording and keeps schools apart', async () => {
    const res = await http
      .patch('/api/automations/sequences/fee_overdue')
      .set(owner())
      .send({ steps: [{ offsetDays: 10, channels: ['sms'], subject: 'Later', body: 'Pay {{amount_due}} at {{pay_link}}' }, { offsetDays: 0, channels: ['email'], subject: 'Now', body: 'Due today' }] })
      .expect(200);
    expect(res.body.steps.map((s: { offsetDays: number }) => s.offsetDays)).toEqual([0, 10]);
    await http.patch('/api/automations/sequences/fee_overdue').set(owner()).send({ steps: [{ offsetDays: 0, channels: [], subject: 'x', body: 'hello' }] }).expect(400);
    await http.post('/api/automations/sequences/fee_overdue/reset').set(owner()).expect(201);

    const activity = (await http.get('/api/automations/activity').set(owner()).expect(200)).body;
    expect(activity.runs.length).toBeGreaterThan(5);
    expect(activity.runs.map((r: { kind: string }) => r.kind)).toEqual(expect.arrayContaining(['fee_reminder', 'weekly_report', 'daily_summary', 'new_parent', 'absent_streak']));
    expect(activity.providers.email).toBe('sandbox');
    expect(activity.schedule.weeklyReport).toMatchObject({ hour: 9 });

    const other = await http
      .post('/api/auth/register-school')
      .send({ school: { name: 'Other School', slug: 'other-autopilot' }, owner: { fullName: 'Other', email: 'o@other.test', password: 'password123' } })
      .expect(201);
    const theirs = (await http.get('/api/automations/activity').set(auth(other.body.token)).expect(200)).body;
    expect(theirs.runs).toEqual([]);
    await http.put(`/api/invoices/${ctx['inv:AP/002']}/plan`).set(auth(other.body.token)).send({ count: 2 }).expect(404);
  });
});
