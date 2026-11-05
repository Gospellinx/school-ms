import {
  boolean,
  date,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import type { AssessmentComponent, GradingScale } from '@school-ms/core';

/**
 * Every table except `schools` carries school_id and is protected by a Postgres
 * row-level security policy (see drizzle/0001_row_level_security.sql), so one school
 * can never read another school's rows even if a query forgets a filter.
 */

export const sectionKind = pgEnum('section_kind', ['nursery', 'primary', 'junior_secondary', 'senior_secondary']);
export const staffRole = pgEnum('staff_role', ['proprietor', 'admin', 'teacher']);
export const gender = pgEnum('gender', ['male', 'female']);

const id = () => uuid('id').primaryKey().defaultRandom();
const schoolId = () =>
  uuid('school_id')
    .notNull()
    .references(() => schools.id, { onDelete: 'cascade' });
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();

export const schools = pgTable('schools', {
  id: id(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  motto: text('motto'),
  address: text('address'),
  phone: text('phone'),
  email: text('email'),
  createdAt: createdAt(),
});

export const staff = pgTable(
  'staff',
  {
    id: id(),
    schoolId: schoolId(),
    fullName: text('full_name').notNull(),
    email: text('email').notNull(),
    passwordHash: text('password_hash').notNull(),
    role: staffRole('role').notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('staff_school_email').on(t.schoolId, t.email)],
);

/** A school section such as Nursery, Primary, JSS or SS, each with its own grading and score split. */
export const sections = pgTable('sections', {
  id: id(),
  schoolId: schoolId(),
  name: text('name').notNull(),
  kind: sectionKind('kind').notNull(),
  gradingScale: jsonb('grading_scale').$type<GradingScale>().notNull(),
  components: jsonb('components').$type<AssessmentComponent[]>().notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
});

export const academicSessions = pgTable(
  'academic_sessions',
  {
    id: id(),
    schoolId: schoolId(),
    name: text('name').notNull(),
    startsOn: date('starts_on'),
    endsOn: date('ends_on'),
  },
  (t) => [uniqueIndex('session_school_name').on(t.schoolId, t.name)],
);

export const terms = pgTable(
  'terms',
  {
    id: id(),
    schoolId: schoolId(),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => academicSessions.id, { onDelete: 'cascade' }),
    number: integer('number').notNull(),
    name: text('name').notNull(),
    startsOn: date('starts_on'),
    endsOn: date('ends_on'),
    isCurrent: boolean('is_current').notNull().default(false),
  },
  (t) => [uniqueIndex('term_session_number').on(t.sessionId, t.number)],
);

export const classes = pgTable(
  'classes',
  {
    id: id(),
    schoolId: schoolId(),
    sectionId: uuid('section_id')
      .notNull()
      .references(() => sections.id, { onDelete: 'restrict' }),
    name: text('name').notNull(),
    arm: text('arm').notNull().default(''),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (t) => [uniqueIndex('class_school_name_arm').on(t.schoolId, t.name, t.arm)],
);

export const subjects = pgTable(
  'subjects',
  {
    id: id(),
    schoolId: schoolId(),
    name: text('name').notNull(),
    code: text('code').notNull(),
  },
  (t) => [uniqueIndex('subject_school_code').on(t.schoolId, t.code)],
);

/** Which subjects a class takes, and which teacher enters its scores. */
export const classSubjects = pgTable(
  'class_subjects',
  {
    id: id(),
    schoolId: schoolId(),
    classId: uuid('class_id')
      .notNull()
      .references(() => classes.id, { onDelete: 'cascade' }),
    subjectId: uuid('subject_id')
      .notNull()
      .references(() => subjects.id, { onDelete: 'cascade' }),
    teacherId: uuid('teacher_id').references(() => staff.id, { onDelete: 'set null' }),
  },
  (t) => [uniqueIndex('class_subject_unique').on(t.classId, t.subjectId)],
);

export const students = pgTable(
  'students',
  {
    id: id(),
    schoolId: schoolId(),
    admissionNumber: text('admission_number').notNull(),
    firstName: text('first_name').notNull(),
    lastName: text('last_name').notNull(),
    otherNames: text('other_names'),
    gender: gender('gender'),
    dateOfBirth: date('date_of_birth'),
    classId: uuid('class_id').references(() => classes.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('student_school_admission').on(t.schoolId, t.admissionNumber)],
);

/** One row per student, subject and term. `scores` maps assessment component keys to marks. */
export const scores = pgTable(
  'scores',
  {
    id: id(),
    schoolId: schoolId(),
    termId: uuid('term_id')
      .notNull()
      .references(() => terms.id, { onDelete: 'cascade' }),
    classId: uuid('class_id')
      .notNull()
      .references(() => classes.id, { onDelete: 'cascade' }),
    subjectId: uuid('subject_id')
      .notNull()
      .references(() => subjects.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id, { onDelete: 'cascade' }),
    scores: jsonb('scores').$type<Record<string, number>>().notNull(),
    enteredBy: uuid('entered_by').references(() => staff.id, { onDelete: 'set null' }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('score_term_subject_student').on(t.termId, t.subjectId, t.studentId)],
);

export const reportComments = pgTable(
  'report_comments',
  {
    id: id(),
    schoolId: schoolId(),
    termId: uuid('term_id')
      .notNull()
      .references(() => terms.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id, { onDelete: 'cascade' }),
    teacherComment: text('teacher_comment'),
    headComment: text('head_comment'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('comment_term_student').on(t.termId, t.studentId)],
);

export const tenantTables = [
  'staff',
  'sections',
  'academic_sessions',
  'terms',
  'classes',
  'subjects',
  'class_subjects',
  'students',
  'scores',
  'report_comments',
] as const;
