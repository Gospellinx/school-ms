/**
 * Demo data for local development and sales demos, modelled on the GCIS Abuja case study.
 *
 * Creates (or recreates) two demo schools through the real API, so every rule the API
 * enforces also holds for the demo data:
 *   - gcis-demo: five classes from Nursery to SS 3, staff, students with parents, last two
 *     terms' results (published), this term's scores so far, attendance, fees with payments,
 *     a question bank, CBT tests with attempts, and parent messages.
 *     It also gets a public website with online admissions and applicants at every stage.
 *   - bright-future-demo: a small second school, so the super admin has more than one school.
 * Also creates the platform (super admin) login.
 *
 * Run: pnpm db:seed   (deletes and rebuilds only the two demo schools above)
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import bcrypt from 'bcryptjs';
import { eq, inArray } from 'drizzle-orm';
import { AppModule } from '../app.module';
import { configureApp } from '../app.setup';
import { todayInLagos } from '../common/access';
import { DbService } from './db.service';
import { seedAdmissions } from './seed-admissions';
import { seedAiLearning } from './seed-ai';
import { platformAdmins, schools, students } from './schema';

export const DEMO_PASSWORD = 'demo-password';
export const DEMO_PIN = '123456';
const DEMO_SLUGS = ['gcis-demo', 'bright-future-demo'];

// ---------------------------------------------------------------- helpers

/** Deterministic pseudo-random numbers, so every seed run produces the same school. */
let state = 20261106;
function rand(): number {
  state = (state * 1664525 + 1013904223) % 4294967296;
  return state / 4294967296;
}
const pick = <T>(xs: T[]) => xs[Math.floor(rand() * xs.length)];
const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (date: string, days: number) => iso(new Date(Date.parse(`${date}T12:00:00Z`) + days * 86400000));
const isWeekday = (date: string) => {
  const d = new Date(`${date}T12:00:00Z`).getUTCDay();
  return d !== 0 && d !== 6;
};

type Json = Record<string, any>;

function client(base: string) {
  return async function call<T = any>(token: string | null, method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${base}/api/${path}`, {
      method,
      headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    const data = text ? JSON.parse(text) : null;
    if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}: ${text}`);
    return data as T;
  };
}

// ---------------------------------------------------------------- calendar

/**
 * Nigerian school year: First term Sep to Dec, Second Jan to Apr, Third late Apr to Jul.
 * The demo always sits in "this" term, worked out from today's date.
 */
function calendar(today: string) {
  const y = Number(today.slice(0, 4));
  const m = Number(today.slice(5, 7));
  const startYear = m >= 9 ? y : y - 1;
  const termDates = (sy: number) => [
    { startsOn: `${sy}-09-08`, endsOn: `${sy}-12-12` },
    { startsOn: `${sy + 1}-01-06`, endsOn: `${sy + 1}-04-02` },
    { startsOn: `${sy + 1}-04-27`, endsOn: `${sy + 1}-07-24` },
  ];
  const current = m >= 9 ? 0 : m <= 4 ? 1 : 2;
  return {
    previous: { name: `${startYear - 1}/${startYear}`, terms: termDates(startYear - 1) },
    current: { name: `${startYear}/${startYear + 1}`, terms: termDates(startYear) },
    currentIndex: current,
  };
}

// ---------------------------------------------------------------- people

const FIRST = {
  female: ['Chiamaka', 'Adaeze', 'Zainab', 'Funmilayo', 'Blessing', 'Halima', 'Temitope', 'Ngozi', 'Esther', 'Aisha', 'Ifeoma', 'Damilola', 'Ruth', 'Hauwa', 'Precious', 'Oluwaseun', 'Amarachi', 'Joy'],
  male: ['Obinna', 'Tunde', 'Ibrahim', 'Emeka', 'Samuel', 'Musa', 'Chukwudi', 'Daniel', 'Yusuf', 'Olumide', 'David', 'Kelechi', 'Abubakar', 'Femi', 'Joshua', 'Ikenna', 'Sadiq', 'Victor'],
};
const LAST = ['Adeyemi', 'Okonkwo', 'Bello', 'Eze', 'Ogunleye', 'Danjuma', 'Nwosu', 'Abdullahi', 'Okoro', 'Afolabi', 'Ibe', 'Garba', 'Olatunji', 'Uche', 'Lawal', 'Akande', 'Onyeka', 'Suleiman', 'Ajayi', 'Nnamdi'];
const TITLES = { female: 'Mrs.', male: 'Mr.' } as const;

interface DemoStudent {
  admission: string;
  firstName: string;
  lastName: string;
  gender: 'male' | 'female';
  parentName: string;
  parentPhone: string;
  /** 0..1: how strong the student is overall. */
  ability: number;
  /** Per-subject-code adjustments, e.g. weak at Physics. */
  bias?: Record<string, number>;
}

let phoneSeq = 1000;
function makeStudents(prefix: string, count: number, fixed: DemoStudent[] = []): DemoStudent[] {
  const out = [...fixed];
  const used = new Set(fixed.map((s) => `${s.firstName} ${s.lastName}`));
  while (out.length < count) {
    const gender = rand() < 0.5 ? 'female' : 'male';
    const firstName = pick(FIRST[gender]);
    const lastName = pick(LAST);
    if (used.has(`${firstName} ${lastName}`)) continue;
    used.add(`${firstName} ${lastName}`);
    const parentGender = rand() < 0.55 ? 'female' : 'male';
    out.push({
      admission: '',
      firstName,
      lastName,
      gender,
      parentName: `${TITLES[parentGender]} ${pick(FIRST[parentGender])} ${lastName}`,
      parentPhone: `080${String(52000000 + phoneSeq++ * 37).padStart(8, '0')}`,
      ability: 0.38 + rand() * 0.55,
    });
  }
  return out.map((s, i) => ({ ...s, admission: `${prefix}/${String(i + 1).padStart(3, '0')}` }));
}

function score(ability: number, max: number, bias = 0): number {
  return Math.round(clamp(ability + bias + (rand() - 0.5) * 0.22, 0.12, 0.99) * max);
}

// ---------------------------------------------------------------- question bank

type Q = { topic: string; body: string; options: [string, string, string, string]; answer: 'A' | 'B' | 'C' | 'D'; explanation: string; year?: number };

const QUESTIONS: Record<string, Q[]> = {
  MTH: [
    { topic: 'Quadratic equations', body: 'Solve x² − 5x + 6 = 0.', options: ['x = 1 or 6', 'x = 2 or 3', 'x = −2 or −3', 'x = −1 or 6'], answer: 'B', explanation: '(x − 2)(x − 3) = 0, so x = 2 or x = 3.', year: 2019 },
    { topic: 'Quadratic equations', body: 'Find the sum of the roots of 2x² − 7x + 3 = 0.', options: ['7/2', '−7/2', '3/2', '2/7'], answer: 'A', explanation: 'Sum of roots = −b/a = 7/2.', year: 2021 },
    { topic: 'Quadratic equations', body: 'For what value of k does x² + kx + 9 = 0 have equal roots (k > 0)?', options: ['3', '6', '9', '18'], answer: 'B', explanation: 'Equal roots when b² = 4ac: k² = 36, so k = 6.', year: 2018 },
    { topic: 'Indices', body: 'Simplify 2³ × 2⁴ ÷ 2⁵.', options: ['2', '4', '8', '16'], answer: 'B', explanation: '2^(3+4−5) = 2² = 4.', year: 2020 },
    { topic: 'Indices', body: 'Evaluate 27^(2/3).', options: ['6', '9', '18', '3'], answer: 'B', explanation: 'Cube root of 27 is 3, and 3² = 9.', year: 2017 },
    { topic: 'Logarithms', body: 'Evaluate log₁₀ 1000.', options: ['2', '3', '10', '100'], answer: 'B', explanation: '10³ = 1000.', year: 2019 },
    { topic: 'Logarithms', body: 'Simplify log 8 ÷ log 2.', options: ['3', '4', 'log 4', '2'], answer: 'A', explanation: 'log 8 = 3 log 2.', year: 2022 },
    { topic: 'Probability', body: 'A fair die is thrown once. What is the probability of getting an even number?', options: ['1/6', '1/3', '1/2', '2/3'], answer: 'C', explanation: '3 even numbers out of 6.', year: 2020 },
    { topic: 'Probability', body: 'Two fair coins are tossed. What is the probability of two heads?', options: ['1/2', '1/3', '1/4', '3/4'], answer: 'C', explanation: '1/2 × 1/2 = 1/4.', year: 2016 },
    { topic: 'Statistics', body: 'Find the mean of 4, 7, 9, 10 and 15.', options: ['8', '9', '10', '45'], answer: 'B', explanation: '45 ÷ 5 = 9.', year: 2021 },
    { topic: 'Statistics', body: 'What is the median of 3, 8, 1, 9, 5?', options: ['1', '5', '8', '9'], answer: 'B', explanation: 'In order: 1, 3, 5, 8, 9. The middle value is 5.', year: 2018 },
    { topic: 'Variation', body: 'y varies directly as x. If y = 12 when x = 4, find y when x = 7.', options: ['14', '21', '28', '16'], answer: 'B', explanation: 'y = 3x, so y = 21.', year: 2019 },
  ],
  PHY: [
    { topic: 'Motion', body: 'A car moves from rest with uniform acceleration 2 m/s². Find its speed after 5 s.', options: ['2.5 m/s', '7 m/s', '10 m/s', '25 m/s'], answer: 'C', explanation: 'v = u + at = 0 + 2 × 5 = 10 m/s.', year: 2020 },
    { topic: 'Motion', body: 'Which of these is a vector quantity?', options: ['Speed', 'Mass', 'Displacement', 'Time'], answer: 'C', explanation: 'Displacement has both size and direction.', year: 2018 },
    { topic: 'Electricity', body: 'A 12 V battery drives 3 A through a resistor. What is its resistance?', options: ['0.25 Ω', '4 Ω', '15 Ω', '36 Ω'], answer: 'B', explanation: 'R = V/I = 12/3 = 4 Ω.', year: 2021 },
    { topic: 'Electricity', body: 'Two 6 Ω resistors are connected in parallel. What is the combined resistance?', options: ['3 Ω', '6 Ω', '12 Ω', '36 Ω'], answer: 'A', explanation: '1/R = 1/6 + 1/6, so R = 3 Ω.', year: 2019 },
    { topic: 'Waves', body: 'A wave has frequency 50 Hz and wavelength 2 m. Find its speed.', options: ['25 m/s', '52 m/s', '100 m/s', '48 m/s'], answer: 'C', explanation: 'v = fλ = 50 × 2 = 100 m/s.', year: 2017 },
    { topic: 'Heat', body: 'The SI unit of specific heat capacity is', options: ['J/kg', 'J/kg K', 'J/K', 'W/m K'], answer: 'B', explanation: 'Energy per kilogram per kelvin.', year: 2022 },
  ],
  ENG: [
    { topic: 'Concord', body: 'Choose the correct option: Neither the teacher nor the students ___ in the hall.', options: ['was', 'were', 'is', 'has been'], answer: 'B', explanation: 'With neither…nor, the verb agrees with the nearer subject, "students".', year: 2020 },
    { topic: 'Concord', body: 'Choose the correct option: Each of the boys ___ a book.', options: ['have', 'are having', 'has', 'were having'], answer: 'C', explanation: '"Each" is singular.', year: 2019 },
    { topic: 'Lexis', body: 'Choose the word nearest in meaning to "candid".', options: ['Frank', 'Hidden', 'Rude', 'Careful'], answer: 'A', explanation: 'Candid means honest and direct.', year: 2018 },
    { topic: 'Lexis', body: 'Choose the word opposite in meaning to "scarce".', options: ['Rare', 'Plentiful', 'Costly', 'Small'], answer: 'B', explanation: 'Scarce means in short supply.', year: 2021 },
    { topic: 'Oral English', body: 'Which word has a different vowel sound? ', options: ['seat', 'meet', 'sit', 'beat'], answer: 'C', explanation: '"sit" has /ɪ/; the others have /iː/.', year: 2017 },
  ],
  CHE: [
    { topic: 'Mole concept', body: 'How many moles are in 36 g of water (H₂O = 18 g/mol)?', options: ['0.5', '1', '2', '18'], answer: 'C', explanation: '36 ÷ 18 = 2 moles.', year: 2020 },
    { topic: 'Mole concept', body: 'Avogadro\'s number is about', options: ['6.02 × 10²³', '3.0 × 10⁸', '1.6 × 10⁻¹⁹', '9.8'], answer: 'A', explanation: 'Particles in one mole.', year: 2019 },
    { topic: 'Periodic table', body: 'Elements in the same group have the same number of', options: ['protons', 'neutrons', 'valence electrons', 'shells'], answer: 'C', explanation: 'Groups share outer-shell electrons.', year: 2021 },
  ],
};

// ---------------------------------------------------------------- main

async function resetDemo(dbs: DbService) {
  // Foreign keys cascade from schools to every school-owned table.
  await dbs.db.delete(schools).where(inArray(schools.slug, DEMO_SLUGS));
}

async function seedPlatform(dbs: DbService) {
  const email = 'super@linxschool.test';
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const [existing] = await dbs.db.select().from(platformAdmins).where(eq(platformAdmins.email, email));
  if (existing) await dbs.db.update(platformAdmins).set({ passwordHash }).where(eq(platformAdmins.id, existing.id));
  else await dbs.db.insert(platformAdmins).values({ fullName: 'Gospel Ocheni', email, passwordHash });
}

async function setPins(dbs: DbService, schoolId: string) {
  const pinHash = await bcrypt.hash(DEMO_PIN, 8);
  await dbs.withSchool(schoolId, (tx) => tx.update(students).set({ pinHash }));
}

async function seedGcis(app: INestApplication, call: ReturnType<typeof client>, base: string) {
  const dbs = app.get(DbService);
  const today = todayInLagos();
  const cal = calendar(today);

  const reg = await call(null, 'POST', 'auth/register-school', {
    school: {
      name: 'Grace of Christ International School (Demo)',
      slug: 'gcis-demo',
      motto: 'Excellence in Learning and Character',
      address: 'Gidan Daya, Karshi Road, Abuja',
      phone: '08030000000',
      email: 'info@gcis-demo.test',
    },
    owner: { fullName: 'Mrs. Grace Adeyemi', email: 'proprietor@demo.test', password: DEMO_PASSWORD },
  });
  const owner: string = reg.token;
  const schoolId: string = reg.school.id;

  // ---- calendar
  const prev = await call(owner, 'POST', 'sessions', { name: cal.previous.name });
  const cur = await call(owner, 'POST', 'sessions', { name: cal.current.name });
  for (const [i, t] of prev.terms.entries()) await call(owner, 'PATCH', `terms/${t.id}`, cal.previous.terms[i]);
  for (const [i, t] of cur.terms.entries()) await call(owner, 'PATCH', `terms/${t.id}`, cal.current.terms[i]);
  const allTerms: Json[] = [...prev.terms, ...cur.terms];
  const currentTerm = cur.terms[cal.currentIndex];
  await call(owner, 'POST', `terms/${currentTerm.id}/make-current`);
  const historyTerms = allTerms.slice(3 + cal.currentIndex - 2, 3 + cal.currentIndex);

  // ---- staff
  const staffDefs = [
    { key: 'admin', fullName: 'Mrs. Ngozi Eze', email: 'admin@demo.test', role: 'admin' },
    { key: 'bakare', fullName: 'Mr. Tunde Bakare', email: 'teacher@demo.test', role: 'teacher' },
    { key: 'musa', fullName: 'Mrs. Amina Musa', email: 'amina.musa@demo.test', role: 'teacher' },
    { key: 'okeke', fullName: 'Mr. Chinedu Okeke', email: 'chinedu.okeke@demo.test', role: 'teacher' },
    { key: 'adeleke', fullName: 'Ms. Funmi Adeleke', email: 'funmi.adeleke@demo.test', role: 'teacher' },
    { key: 'yusuf', fullName: 'Mr. Bello Yusuf', email: 'bello.yusuf@demo.test', role: 'teacher' },
    { key: 'ojo', fullName: 'Mrs. Patience Ojo', email: 'patience.ojo@demo.test', role: 'teacher' },
    { key: 'danjuma', fullName: 'Mrs. Ruth Danjuma', email: 'ruth.danjuma@demo.test', role: 'teacher' },
  ];
  const staffIds: Record<string, string> = {};
  for (const s of staffDefs) {
    staffIds[s.key] = (await call(owner, 'POST', 'staff', { fullName: s.fullName, email: s.email, role: s.role, password: DEMO_PASSWORD })).id;
  }
  const login = async (email: string) => (await call(null, 'POST', 'auth/login', { schoolSlug: 'gcis-demo', email, password: DEMO_PASSWORD })).token as string;
  const teacherTokens: Record<string, string> = {};
  for (const s of staffDefs) teacherTokens[s.key] = await login(s.email);

  // ---- subjects
  const subjectDefs: [string, string][] = [
    ['NUM', 'Numeracy'], ['LIT', 'Literacy'], ['MTH', 'Mathematics'], ['ENG', 'English Language'],
    ['BST', 'Basic Science and Technology'], ['CRS', 'Christian Religious Studies'], ['BUS', 'Business Studies'],
    ['PHY', 'Physics'], ['CHE', 'Chemistry'], ['BIO', 'Biology'], ['ECO', 'Economics'], ['CIV', 'Civic Education'],
  ];
  const subjectIds: Record<string, string> = {};
  for (const [code, name] of subjectDefs) subjectIds[code] = (await call(owner, 'POST', 'subjects', { name, code })).id;

  // ---- classes, subjects and teachers
  const sections: Json[] = await call(owner, 'GET', 'sections');
  const sectionId = (kind: string) => sections.find((s) => s.kind === kind)!.id as string;

  const okafor = { parentName: 'Mr. Emeka Okafor', parentPhone: '08031234567' };
  const classDefs = [
    { key: 'n2', section: 'nursery', name: 'Nursery 2', arm: 'Rose', sort: 1, size: 6, form: 'danjuma', prefix: 'GCIS/N', subjects: { NUM: 'danjuma', LIT: 'danjuma' } },
    {
      key: 'p4', section: 'primary', name: 'Primary 4', arm: 'Gold', sort: 2, size: 10, form: 'ojo', prefix: 'GCIS/P',
      subjects: { MTH: 'ojo', ENG: 'ojo', BST: 'ojo', CRS: 'ojo' },
      fixed: [{ admission: '', firstName: 'Obinna', lastName: 'Okafor', gender: 'male' as const, ...okafor, ability: 0.66 }],
    },
    { key: 'j3', section: 'junior_secondary', name: 'JSS 3', arm: 'Blue', sort: 3, size: 10, form: 'adeleke', prefix: 'GCIS/J', subjects: { MTH: 'bakare', ENG: 'musa', BST: 'adeleke', BUS: 'yusuf', CRS: 'yusuf' } },
    {
      key: 's2', section: 'senior_secondary', name: 'SS 2', arm: 'Gold', sort: 4, size: 12, form: 'bakare', prefix: 'GCIS/S',
      subjects: { MTH: 'bakare', ENG: 'musa', PHY: 'okeke', CHE: 'okeke', BIO: 'adeleke', ECO: 'yusuf', CIV: 'yusuf' },
      fixed: [{ admission: '', firstName: 'Chiamaka', lastName: 'Okafor', gender: 'female' as const, ...okafor, ability: 0.74, bias: { PHY: -0.22, CHE: -0.08, MTH: 0.06 } }],
    },
    { key: 's3', section: 'senior_secondary', name: 'SS 3', arm: 'Gold', sort: 5, size: 10, form: 'musa', prefix: 'GCIS/T', subjects: { MTH: 'bakare', ENG: 'musa', PHY: 'okeke', CHE: 'okeke', BIO: 'adeleke', ECO: 'yusuf' } },
  ];

  const classes: Record<string, { id: string; def: (typeof classDefs)[number]; roster: (DemoStudent & { id: string })[] }> = {};
  for (const def of classDefs) {
    const cls = await call(owner, 'POST', 'classes', { sectionId: sectionId(def.section), name: def.name, arm: def.arm, sortOrder: def.sort });
    await call(owner, 'PATCH', `classes/${cls.id}`, { formTeacherId: staffIds[def.form] });
    for (const [code, teacher] of Object.entries(def.subjects)) {
      await call(owner, 'POST', `classes/${cls.id}/subjects`, { subjectId: subjectIds[code], teacherId: staffIds[teacher] });
    }
    const roster = makeStudents(def.prefix, def.size, def.fixed ?? []);
    const csv = [
      'admission_number,first_name,last_name,gender,parent_name,parent_phone',
      ...roster.map((s) => [s.admission, s.firstName, s.lastName, s.gender === 'female' ? 'F' : 'M', s.parentName, s.parentPhone].join(',')),
    ].join('\n');
    const imported = await call(owner, 'POST', 'students/import', { classId: cls.id, csv });
    if (imported.errors.length) throw new Error(`Import failed for ${def.name}: ${JSON.stringify(imported.errors)}`);
    const rows: Json[] = await call(owner, 'GET', `students?classId=${cls.id}`);
    const byAdmission = new Map(rows.map((r) => [r.admissionNumber, r.id as string]));
    classes[def.key] = { id: cls.id, def, roster: roster.map((s) => ({ ...s, id: byAdmission.get(s.admission)! })) };
  }
  await setPins(dbs, schoolId);

  // ---- scores: the last two terms in full (and published), this term's CAs so far
  const fill = async (termId: string, part: 'full' | 'cas') => {
    for (const c of Object.values(classes)) {
      for (const code of Object.keys(c.def.subjects)) {
        const entries = c.roster.map((s, i) => {
          const b = s.bias?.[code] ?? 0;
          const scores: Record<string, number> = { ca1: score(s.ability, 20, b) };
          // This term: 2nd CA is in for most subjects, exams have not been written yet.
          if (part === 'full' || (code !== 'ECO' && code !== 'BUS')) scores.ca2 = score(s.ability, 20, b);
          if (part === 'full') scores.exam = score(s.ability, 60, b);
          // One sheet this term is only half done, so the teacher dashboard has work to show.
          if (part === 'cas' && code === 'CHE' && i % 2 === 1) return null;
          return { studentId: s.id, scores };
        });
        await call(owner, 'PUT', `terms/${termId}/classes/${c.id}/subjects/${subjectIds[code]}/scores`, {
          entries: entries.filter(Boolean),
        });
      }
    }
  };
  for (const t of historyTerms) await fill(t.id, 'full');
  await fill(currentTerm.id, 'cas');

  const remark = (avg: number) =>
    avg >= 70 ? 'An excellent result. Keep up the good work.' : avg >= 55 ? 'A good term. More effort in weaker subjects will help.' : 'Needs to work harder and attend extra lessons.';
  for (const t of historyTerms) {
    for (const c of Object.values(classes)) {
      const sheet = await call(owner, 'GET', `terms/${t.id}/classes/${c.id}/results`);
      for (const row of sheet.students ?? sheet.rows ?? []) {
        const avg = Number(row.average ?? 60);
        await call(owner, 'PUT', `terms/${t.id}/students/${row.studentId}/comments`, {
          teacherComment: remark(avg),
          headComment: avg >= 55 ? 'Promising. Well done.' : 'See me with your parent.',
        });
      }
      await call(owner, 'POST', `terms/${t.id}/classes/${c.id}/publish`, { notifyGuardians: t.id === historyTerms[1].id });
    }
  }

  // ---- attendance: every school day this term up to today (today only for some classes)
  const termStart = cal.current.terms[cal.currentIndex].startsOn;
  let day = today < termStart ? today : addDays(today, -27);
  if (day < termStart) day = termStart;
  for (; day <= today; day = addDays(day, 1)) {
    if (!isWeekday(day)) continue;
    for (const c of Object.values(classes)) {
      if (day === today && (c.def.key === 'j3' || c.def.key === 's3')) continue;
      const entries = c.roster.map((s) => {
        const r = rand();
        const reliability = 0.86 + s.ability * 0.12;
        const status = r < reliability ? 'present' : r < reliability + 0.04 ? 'late' : r < reliability + 0.07 ? 'excused' : 'absent';
        return { studentId: s.id, status };
      });
      await call(teacherTokens[c.def.form], 'PUT', `classes/${c.id}/attendance/${day}`, { entries, notifyGuardians: day === today });
    }
  }

  // ---- fees for this term
  const feeItems = [
    { name: 'Tuition', amountKobo: 85_000_00, sectionId: sectionId('nursery') },
    { name: 'Tuition', amountKobo: 120_000_00, sectionId: sectionId('primary') },
    { name: 'Tuition', amountKobo: 150_000_00, sectionId: sectionId('junior_secondary') },
    { name: 'Tuition', amountKobo: 180_000_00, sectionId: sectionId('senior_secondary') },
    { name: 'Development levy', amountKobo: 15_000_00 },
    { name: 'PTA levy', amountKobo: 5_000_00 },
    { name: 'Books and materials', amountKobo: 22_500_00, sectionId: sectionId('primary') },
    { name: 'Science laboratory', amountKobo: 12_000_00, sectionId: sectionId('senior_secondary') },
    { name: 'WAEC registration', amountKobo: 32_000_00, classId: classes.s3.id },
  ];
  for (const f of feeItems) await call(owner, 'POST', 'fees/items', { termId: currentTerm.id, ...f });
  await call(owner, 'POST', `terms/${currentTerm.id}/invoices/generate`, {});
  const invoices: Json[] = await call(owner, 'GET', `terms/${currentTerm.id}/invoices`);
  const methods = ['bank_transfer', 'cash', 'pos', 'bank_transfer'] as const;
  for (const inv of invoices) {
    const studentId = inv.studentId ?? inv.student?.id;
    const isChiamaka = studentId === classes.s2.roster[0].id;
    const isObinna = studentId === classes.p4.roster[0].id;
    if (isObinna) continue; // unpaid, so the parent portal shows something to pay
    const r = rand();
    const total = Number(inv.totalKobo);
    const amount = isChiamaka ? 120_000_00 : r < 0.55 ? total : r < 0.8 ? Math.round((total * (0.4 + rand() * 0.4)) / 100_000) * 100_000 : 0;
    if (amount > 0) {
      await call(owner, 'POST', `invoices/${inv.id}/payments`, { amountKobo: Math.min(amount, total), method: pick([...methods]), note: 'Demo payment' });
    }
  }

  // ---- question bank, CBT tests and attempts
  const bakare = teacherTokens.bakare;
  const questionIds: Record<string, string[]> = {};
  for (const [code, qs] of Object.entries(QUESTIONS)) {
    const author = code === 'ENG' ? teacherTokens.musa : code === 'MTH' ? bakare : teacherTokens.okeke;
    const saved: Json[] = await call(author, 'POST', 'questions/bulk', {
      questions: qs.map((q) => ({
        subjectId: subjectIds[code],
        topic: q.topic,
        body: q.body,
        options: q.options.map((text, i) => ({ key: 'ABCD'[i], text })),
        answer: q.answer,
        explanation: q.explanation,
        exam: 'waec',
        year: q.year,
        sectionKind: 'senior_secondary',
      })),
    });
    questionIds[code] = saved.map((q) => q.id);
  }

  const mathsTest = await call(bakare, 'POST', 'cbt/tests', {
    title: 'SS 2 Mathematics: 1st CA test',
    subjectId: subjectIds.MTH,
    termId: currentTerm.id,
    durationMinutes: 20,
    classIds: [classes.s2.id],
    questionIds: questionIds.MTH.slice(0, 10),
    scoreComponent: 'ca1',
  });
  await call(bakare, 'POST', `cbt/tests/${mathsTest.id}/publish`);
  const physicsTest = await call(teacherTokens.okeke, 'POST', 'cbt/tests', {
    title: 'SS 2 Physics: Motion and electricity quiz',
    subjectId: subjectIds.PHY,
    termId: currentTerm.id,
    durationMinutes: 15,
    classIds: [classes.s2.id],
    questionIds: questionIds.PHY,
  });
  await call(teacherTokens.okeke, 'POST', `cbt/tests/${physicsTest.id}/publish`);
  await call(teacherTokens.musa, 'POST', 'cbt/tests', {
    title: 'SS 3 English: Concord and lexis (draft)',
    subjectId: subjectIds.ENG,
    termId: currentTerm.id,
    durationMinutes: 15,
    classIds: [classes.s3.id],
    questionIds: questionIds.ENG,
  });

  // Most of SS 2 has sat the maths test; Chiamaka (first on the roster) has not, so her portal has a test waiting.
  const answerKey = new Map(QUESTIONS.MTH.map((q, i) => [questionIds.MTH[i], q.answer]));
  for (const s of classes.s2.roster.slice(1, 10)) {
    const token = (await call(null, 'POST', 'student/auth/login', { schoolSlug: 'gcis-demo', admissionNumber: s.admission, pin: DEMO_PIN })).token;
    const attempt = await call(token, 'POST', `student/tests/${mathsTest.id}/start`);
    const answers: Record<string, string> = {};
    for (const q of attempt.questions as Json[]) {
      const right = answerKey.get(q.id)!;
      answers[q.id] = rand() < s.ability ? right : pick(['A', 'B', 'C', 'D'].filter((k) => k !== right));
    }
    await call(token, 'PUT', `student/attempts/${attempt.id}/answers`, { answers });
    await call(token, 'POST', `student/attempts/${attempt.id}/submit`);
  }

  // A practice set for Chiamaka, so her exam prep page has history.
  const chiamaka = (await call(null, 'POST', 'student/auth/login', { schoolSlug: 'gcis-demo', admissionNumber: classes.s2.roster[0].admission, pin: DEMO_PIN })).token;
  const practice = await call(chiamaka, 'POST', 'student/prep/practice', { subjectId: subjectIds.CHE, count: 5 });
  const chemistryKey = new Map(QUESTIONS.CHE.map((q, i) => [questionIds.CHE[i], q.answer]));
  const practiceAnswers: Record<string, string> = {};
  for (const [i, q] of (practice.questions as Json[]).entries()) practiceAnswers[q.id] = i % 2 === 0 ? chemistryKey.get(q.id)! : 'D';
  await call(chiamaka, 'PUT', `student/attempts/${practice.id}/answers`, { answers: practiceAnswers });
  await call(chiamaka, 'POST', `student/attempts/${practice.id}/submit`);

  // ---- messages to parents
  await call(owner, 'POST', 'notifications/broadcast', {
    message: `Dear parent, mid-term break runs from Thursday to Friday next week. School resumes on Monday. Thank you. GCIS`,
  });
  await call(owner, 'POST', 'notifications/broadcast', {
    classId: classes.s3.id,
    message: 'Dear parent, WAEC registration closes at the end of this month. Please complete payment at the bursary or online.',
  });
  await call(owner, 'POST', 'notifications/dispatch');

  // ---- AI learning layer: exam bank, knowledge base, goals, mocks and tutor chats
  await seedAiLearning({
    base,
    call,
    owner,
    tokens: teacherTokens,
    subjectIds,
    chiamaka: classes.s2.roster[0].admission,
    ss3Student: classes.s3.roster[0].admission,
    jss3Student: classes.j3.roster[0].admission,
    pin: DEMO_PIN,
    rand,
  });

  // ---- public website and online admissions (JSS 1 with a CBT entrance exam, Primary 1)
  await seedAdmissions({ call, dbs, schoolId, owner, sectionId, subjectIds, rand });

  return { schoolId, students: Object.values(classes).reduce((n, c) => n + c.roster.length, 0) };
}

async function seedSecondSchool(app: INestApplication, call: ReturnType<typeof client>) {
  const cal = calendar(todayInLagos());
  const reg = await call(null, 'POST', 'auth/register-school', {
    school: { name: 'Bright Future Academy (Demo)', slug: 'bright-future-demo', address: 'Allen Avenue, Ikeja, Lagos', motto: 'Light and Learning' },
    owner: { fullName: 'Mr. Kunle Ajayi', email: 'owner@brightfuture.test', password: DEMO_PASSWORD },
  });
  const owner = reg.token as string;
  const session = await call(owner, 'POST', 'sessions', { name: cal.current.name });
  await call(owner, 'POST', `terms/${session.terms[cal.currentIndex].id}/make-current`);
  const sections: Json[] = await call(owner, 'GET', 'sections');
  const js = sections.find((s) => s.kind === 'junior_secondary')!.id;
  const cls = await call(owner, 'POST', 'classes', { sectionId: js, name: 'JSS 1', arm: 'A' });
  const roster = makeStudents('BFA', 8);
  const csv = [
    'admission_number,first_name,last_name,gender,parent_name,parent_phone',
    ...roster.map((s) => [s.admission, s.firstName, s.lastName, s.gender === 'female' ? 'F' : 'M', s.parentName, s.parentPhone].join(',')),
  ].join('\n');
  await call(owner, 'POST', 'students/import', { classId: cls.id, csv });
  await call(owner, 'POST', 'staff', { fullName: 'Mrs. Bisi Olatunji', email: 'bisi@brightfuture.test', role: 'teacher', password: DEMO_PASSWORD });
}

async function seed() {
  // Seeding never texts anyone, even when a Termii key is set: messages are only logged.
  process.env.MESSAGING_PROVIDER = 'log';
  process.env.EMAIL_PROVIDER = 'log';
  const app = await NestFactory.create(AppModule, { logger: ['error'] });
  configureApp(app);
  await app.listen(0);
  const { port } = app.getHttpServer().address() as { port: number };
  const base = `http://127.0.0.1:${port}`;
  const call = client(base);
  try {
    const dbs = app.get(DbService);
    await resetDemo(dbs);
    await seedPlatform(dbs);
    const gcis = await seedGcis(app, call, base);
    await seedSecondSchool(app, call);
    console.log(
      [
        `Seeded GCIS demo (${gcis.students} students) and Bright Future Academy demo.`,
        '',
        'Staff        school "gcis-demo": proprietor@demo.test, admin@demo.test, teacher@demo.test (password demo-password)',
        'Parent       school "gcis-demo", phone 0803 123 4567 (the code is shown on screen while no SMS key is set)',
        `Student      school "gcis-demo", admission number GCIS/S/001 (SS 2, JAMB and WAEC prep), GCIS/T/001 (SS 3), GCIS/J/001 (JSS 3, BECE), PIN ${DEMO_PIN}`,
        'Super admin  super@linxschool.test / demo-password',
        'Website      /s/gcis-demo (admissions open for JSS 1 with a CBT entrance exam, and Primary 1)',
      ].join('\n'),
    );
  } finally {
    await app.close();
  }
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
