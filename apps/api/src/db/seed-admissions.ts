/**
 * Demo data for the GCIS public website and online admissions: the site content, JSS 1 and
 * Primary 1 open for admission, a JSS 1 CBT entrance exam, and families at every stage
 * (awaiting the form fee, applied, invited to the exam, sat it, offered, accepted, enrolled).
 * Goes through the real API, like the rest of the seed.
 */
import { inArray, sql } from 'drizzle-orm';
import { DbService } from './db.service';
import { applicationEvents, applications, emailOutbox, questions } from './schema';

type Json = Record<string, any>;
type Call = <T = any>(token: string | null, method: string, path: string, body?: unknown) => Promise<T>;

export interface AdmissionsSeedContext {
  call: Call;
  dbs: DbService;
  schoolId: string;
  owner: string;
  sectionId: (kind: string) => string;
  subjectIds: Record<string, string>;
  rand: () => number;
}

const FAMILIES: [first: string, last: string, gender: 'male' | 'female', parent: string][] = [
  ['Daniel', 'Adebayo', 'male', 'Mrs. Funke Adebayo'],
  ['Esther', 'Nwachukwu', 'female', 'Mr. Ikenna Nwachukwu'],
  ['Ibrahim', 'Sani', 'male', 'Alhaji Musa Sani'],
  ['Precious', 'Okon', 'female', 'Mrs. Mfon Okon'],
  ['Samuel', 'Ogunleye', 'male', 'Mr. Femi Ogunleye'],
  ['Hadiza', 'Abdullahi', 'female', 'Mrs. Zainab Abdullahi'],
  ['Joshua', 'Eze', 'male', 'Dr. Chuka Eze'],
  ['Favour', 'Akpan', 'female', 'Mrs. Grace Akpan'],
  ['David', 'Olaniyan', 'male', 'Mr. Segun Olaniyan'],
  ['Blessing', 'Ugwu', 'female', 'Mrs. Ada Ugwu'],
  ['Michael', 'Danladi', 'male', 'Mr. Yakubu Danladi'],
  ['Deborah', 'Chukwu', 'female', 'Mrs. Ifeoma Chukwu'],
  ['Emmanuel', 'Bassey', 'male', 'Mr. Effiong Bassey'],
  ['Ruth', 'Lawal', 'female', 'Mrs. Kemi Lawal'],
];

export async function seedAdmissions(ctx: AdmissionsSeedContext) {
  const { call, dbs, schoolId, owner, sectionId, subjectIds, rand } = ctx;
  const year = new Date().getFullYear();
  const session = `${year}/${year + 1}`;

  // ---- entry classes: the new intake has no students yet
  const jss1 = await call(owner, 'POST', 'classes', { sectionId: sectionId('junior_secondary'), name: 'JSS 1', arm: 'Gold', sortOrder: 0 });
  const pry1 = await call(owner, 'POST', 'classes', { sectionId: sectionId('primary'), name: 'Primary 1', arm: 'Gold', sortOrder: 0 });

  // ---- the JSS 1 entrance exam, built from the question bank by the CBT module
  const exam = await call(owner, 'POST', 'admissions/entrance-exams', {
    title: `JSS 1 Entrance Examination ${session}`,
    durationMinutes: 30,
    parts: [
      { subjectId: subjectIds.MTH, count: 10 },
      { subjectId: subjectIds.ENG, count: 10 },
    ],
  });

  // ---- the website
  await call(owner, 'PUT', 'admissions/site', {
    published: true,
    tagline: 'Excellence in Learning and Character',
    about:
      'Grace of Christ International School is a Christian, co-educational day and boarding school in Gidan Daya, off Karshi Road, Abuja. ' +
      'We teach from Nursery to Senior Secondary, preparing children for BECE, WAEC, NECO and JAMB with small classes, ' +
      'caring teachers and a computer-based testing centre.\n\n' +
      'Every child has a personal AI study tutor, sits regular CBT practice, and parents follow results, attendance and fees on their phones.',
    accentColor: '#1d4ed8',
    highlights: [
      { title: 'Nursery to SS 3', text: 'One campus from the first steps in Nursery to WAEC and JAMB in SS 3.' },
      { title: 'Day and boarding', text: 'Safe, supervised boarding for boys and girls, with day school for families nearby.' },
      { title: 'CBT exam centre', text: 'Children practise WAEC, NECO and JAMB on computers long before the real exam.' },
      { title: 'Parents in the loop', text: 'Results, attendance and fee receipts on WhatsApp and SMS.' },
    ],
    whatsapp: '08030000000',
    admissionsOpen: true,
    admissionSession: session,
    applicationFeeKobo: 5_000_00,
    admissionInstructions:
      'Bring the child\'s birth certificate, last school report and two passport photographs on resumption. School fees are payable online or at the bursary.',
    admissionsEmail: 'admissions@gcis-demo.test',
  });
  const entry: Json[] = await call(owner, 'POST', 'admissions/classes', { classId: jss1.id, entranceTestId: exam.id, passMark: 50, seats: 40 });
  await call(owner, 'POST', 'admissions/classes', { classId: pry1.id, seats: 25 });
  const all: Json[] = await call(owner, 'GET', 'admissions/classes');
  const jssEntry = entry.find((c) => c.classId === jss1.id)!.id as string;
  const pryEntry = all.find((c) => c.classId === pry1.id)!.id as string;

  // ---- families at every stage
  const pub = (path: string) => `public/schools/gcis-demo/${path}`;
  type App = { id: string; reference: string; key: string };
  const apply = async (i: number, admissionClassId: string): Promise<App> => {
    const [first, last, gender, parent] = FAMILIES[i];
    const res = await call(null, 'POST', pub('applications'), {
      admissionClassId,
      firstName: first,
      lastName: last,
      gender,
      dateOfBirth: `${year - (admissionClassId === jssEntry ? 11 : 6)}-0${1 + (i % 9)}-1${i % 9}`,
      previousSchool: admissionClassId === jssEntry ? 'Divine Grace Primary School, Kubwa' : 'Little Stars Nursery, Lugbe',
      parentName: parent,
      parentEmail: `${last.toLowerCase()}.family@parents.test`,
      parentPhone: `0805${String(1000000 + i * 7919).slice(0, 7)}`,
      relationship: parent.startsWith('Mrs') ? 'Mother' : 'Father',
      address: 'Abuja',
    });
    const list: Json[] = await call(owner, 'GET', `admissions/applications?q=${res.reference}`);
    return { id: list[0].id, reference: res.reference, key: res.key };
  };
  const paid = (a: App, method = 'bank_transfer') => call(owner, 'POST', `admissions/applications/${a.id}/mark-paid`, { method });

  const apps: App[] = [];
  for (let i = 0; i < FAMILIES.length; i++) apps.push(await apply(i, i >= 11 ? pryEntry : jssEntry));
  // 0, 1: still owe the form fee. Everyone else paid.
  for (const a of apps.slice(2)) await paid(a, rand() < 0.5 ? 'bank_transfer' : 'cash');

  // 4-9 invited to the exam: 4-5 next Saturday, 6-9 in a window that is open now.
  const day = 86400_000;
  const nextSat = new Date();
  nextSat.setUTCDate(nextSat.getUTCDate() + ((6 - nextSat.getUTCDay() + 7) % 7 || 7));
  nextSat.setUTCHours(8, 0, 0, 0); // 9am in Lagos
  await call(owner, 'POST', 'admissions/schedule-exam', {
    applicationIds: apps.slice(4, 6).map((a) => a.id),
    opensAt: nextSat.toISOString(),
    closesAt: new Date(nextSat.getTime() + 8 * 3600_000).toISOString(),
  });
  await call(owner, 'POST', 'admissions/schedule-exam', {
    applicationIds: apps.slice(6, 11).map((a) => a.id),
    opensAt: new Date(Date.now() - 2 * day).toISOString(),
    closesAt: new Date(Date.now() + 3 * day).toISOString(),
  });

  // 6-10 sit it with different abilities.
  const answerKey = new Map<string, string>();
  const rows = await dbs.withSchool(schoolId, (tx) =>
    tx.select({ id: questions.id, answer: questions.answer }).from(questions).where(inArray(questions.subjectId, [subjectIds.MTH, subjectIds.ENG])),
  );
  for (const r of rows) answerKey.set(r.id, r.answer);
  const ability = [0.85, 0.7, 0.62, 0.4, 0.55];
  for (const [k, a] of apps.slice(6, 11).entries()) {
    const sitting = await call(null, 'POST', pub(`applications/${a.reference}/exam/start?key=${a.key}`));
    const answers: Record<string, string> = {};
    for (const q of sitting.questions as Json[]) {
      const right = answerKey.get(q.id)!;
      answers[q.id] = rand() < ability[k] ? right : (q.options as Json[]).find((o) => o.key !== right)!.key;
    }
    await call(null, 'PUT', pub(`applications/${a.reference}/exam/answers?key=${a.key}`), { answers });
    await call(null, 'POST', pub(`applications/${a.reference}/exam/submit?key=${a.key}`));
  }

  // Decisions: 6 and 7 offered (6 accepted online), 9 not successful; Primary 1: 11 enrolled, 12 offered.
  await call(owner, 'POST', `admissions/applications/${apps[6].id}/offer`, { note: 'Resumption is on the second Monday of September. Boarding places are available.' });
  await call(null, 'POST', pub(`applications/${apps[6].reference}/accept?key=${apps[6].key}`));
  await call(owner, 'POST', `admissions/applications/${apps[7].id}/offer`, {});
  await call(owner, 'POST', `admissions/applications/${apps[9].id}/reject`, { note: 'You are welcome to apply again for the next session.' });
  await call(owner, 'POST', `admissions/applications/${apps[11].id}/offer`, {});
  await call(null, 'POST', pub(`applications/${apps[11].reference}/accept?key=${apps[11].key}`));
  await call(owner, 'POST', `admissions/applications/${apps[11].id}/enrol`, { admissionNumber: `GCIS/P1/${String(year).slice(2)}01` });
  await call(owner, 'POST', `admissions/applications/${apps[12].id}/offer`, {});
  await call(owner, 'POST', `admissions/applications/${apps[13].id}/notes`, { text: 'Mother called: will bring the birth certificate on Monday.' });

  // Spread the applications over the last week, so the dashboard's daily chart has a shape.
  await dbs.withSchool(schoolId, async (tx) => {
    for (const [i, a] of apps.entries()) {
      const shift = `${Math.max(0, 6 - Math.floor(i / 2))} days ${Math.floor(rand() * 10)} hours`;
      await tx.execute(sql`update ${applications} set created_at = created_at - ${shift}::interval where id = ${a.id}`);
      await tx.execute(sql`update ${applicationEvents} set created_at = created_at - ${shift}::interval where application_id = ${a.id} and kind = 'submitted'`);
    }
    // Emails that would have gone out already are shown as sent.
    await tx.execute(sql`update ${emailOutbox} set status = 'sent', sent_at = now(), provider_ref = 'demo' where status = 'queued' and send_after <= now()`);
  });

  return { applications: apps.length, examId: exam.id as string };
}
