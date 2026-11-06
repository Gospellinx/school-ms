import {
  boolean,
  customType,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import type { AssessmentComponent, GradingScale, MarkSuggestion, OutlineEntry, RubricPoint } from '@school-ms/core';

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
  /** Paystack subaccount that receives this school's fee payments (settles to the school's bank). */
  paystackSubaccountCode: text('paystack_subaccount_code'),
  /** When true, parents and students cannot open a report card while that term's fees are owed. */
  withholdResultsForDebt: boolean('withhold_results_for_debt').notNull().default(false),
  /** Monthly AI spending cap in US cents (Claude bills in dollars). Set by the Linx School team. */
  aiMonthlyBudgetCents: integer('ai_monthly_budget_cents').notNull().default(10000),
  /** AI tutor messages and explanations a student may use per day; null uses the platform default. */
  aiStudentDailyLimit: integer('ai_student_daily_limit'),
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
    /** Form (class) teacher: takes the daily register. */
    formTeacherId: uuid('form_teacher_id').references(() => staff.id, { onDelete: 'set null' }),
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
    /** Hash of the student's login PIN for CBT and exam prep. */
    pinHash: text('pin_hash'),
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

// ---------------------------------------------------------------- Parents

export const messageChannel = pgEnum('message_channel', ['sms', 'whatsapp']);

/** A parent or guardian. Identified by phone number, which is how they log in. */
export const guardians = pgTable(
  'guardians',
  {
    id: id(),
    schoolId: schoolId(),
    fullName: text('full_name').notNull(),
    /** International form without the plus sign, e.g. 2348031234567. */
    phone: text('phone').notNull(),
    email: text('email'),
    preferredChannel: messageChannel('preferred_channel').notNull().default('sms'),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('guardian_school_phone').on(t.schoolId, t.phone)],
);

export const studentGuardians = pgTable(
  'student_guardians',
  {
    id: id(),
    schoolId: schoolId(),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id, { onDelete: 'cascade' }),
    guardianId: uuid('guardian_id')
      .notNull()
      .references(() => guardians.id, { onDelete: 'cascade' }),
    relationship: text('relationship'),
  },
  (t) => [uniqueIndex('student_guardian_unique').on(t.studentId, t.guardianId), index('student_guardians_guardian').on(t.guardianId)],
);

/** One-time login codes sent to parents by SMS. Only a hash is stored. */
export const loginCodes = pgTable('login_codes', {
  id: id(),
  schoolId: schoolId(),
  guardianId: uuid('guardian_id')
    .notNull()
    .references(() => guardians.id, { onDelete: 'cascade' }),
  codeHash: text('code_hash').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  attempts: integer('attempts').notNull().default(0),
  usedAt: timestamp('used_at', { withTimezone: true }),
  createdAt: createdAt(),
});

/** A class's results for a term become visible to parents and students only once published. */
export const resultPublications = pgTable(
  'result_publications',
  {
    id: id(),
    schoolId: schoolId(),
    termId: uuid('term_id')
      .notNull()
      .references(() => terms.id, { onDelete: 'cascade' }),
    classId: uuid('class_id')
      .notNull()
      .references(() => classes.id, { onDelete: 'cascade' }),
    publishedBy: uuid('published_by').references(() => staff.id, { onDelete: 'set null' }),
    publishedAt: timestamp('published_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('publication_term_class').on(t.termId, t.classId)],
);

// ---------------------------------------------------------------- Attendance

export const attendanceStatus = pgEnum('attendance_status', ['present', 'absent', 'late', 'excused']);

/** The daily register: one mark per student per school day. */
export const attendanceRecords = pgTable(
  'attendance_records',
  {
    id: id(),
    schoolId: schoolId(),
    classId: uuid('class_id')
      .notNull()
      .references(() => classes.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id, { onDelete: 'cascade' }),
    date: date('date').notNull(),
    status: attendanceStatus('status').notNull(),
    note: text('note'),
    markedBy: uuid('marked_by').references(() => staff.id, { onDelete: 'set null' }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('attendance_student_date').on(t.studentId, t.date), index('attendance_class_date').on(t.classId, t.date)],
);

// ---------------------------------------------------------------- Fees

/** A fee for a term: whole school, one section (e.g. all of SS) or one class. Amounts are in kobo. */
export const feeItems = pgTable('fee_items', {
  id: id(),
  schoolId: schoolId(),
  termId: uuid('term_id')
    .notNull()
    .references(() => terms.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  amountKobo: integer('amount_kobo').notNull(),
  sectionId: uuid('section_id').references(() => sections.id, { onDelete: 'cascade' }),
  classId: uuid('class_id').references(() => classes.id, { onDelete: 'cascade' }),
  createdAt: createdAt(),
});

export const invoiceStatus = pgEnum('invoice_status', ['unpaid', 'part_paid', 'paid']);

/** What one student owes for one term. */
export const invoices = pgTable(
  'invoices',
  {
    id: id(),
    schoolId: schoolId(),
    termId: uuid('term_id')
      .notNull()
      .references(() => terms.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id, { onDelete: 'cascade' }),
    number: text('number').notNull(),
    totalKobo: integer('total_kobo').notNull(),
    paidKobo: integer('paid_kobo').notNull().default(0),
    status: invoiceStatus('status').notNull().default('unpaid'),
    createdAt: createdAt(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('invoice_term_student').on(t.termId, t.studentId), uniqueIndex('invoice_school_number').on(t.schoolId, t.number)],
);

export const invoiceLines = pgTable('invoice_lines', {
  id: id(),
  schoolId: schoolId(),
  invoiceId: uuid('invoice_id')
    .notNull()
    .references(() => invoices.id, { onDelete: 'cascade' }),
  feeItemId: uuid('fee_item_id').references(() => feeItems.id, { onDelete: 'set null' }),
  name: text('name').notNull(),
  amountKobo: integer('amount_kobo').notNull(),
});

export const paymentMethod = pgEnum('payment_method', ['paystack', 'cash', 'bank_transfer', 'pos']);
export const paymentStatus = pgEnum('payment_status', ['pending', 'success', 'failed', 'abandoned']);

export const payments = pgTable(
  'payments',
  {
    id: id(),
    schoolId: schoolId(),
    invoiceId: uuid('invoice_id')
      .notNull()
      .references(() => invoices.id, { onDelete: 'cascade' }),
    amountKobo: integer('amount_kobo').notNull(),
    method: paymentMethod('method').notNull(),
    status: paymentStatus('status').notNull(),
    /** Our reference, also sent to Paystack. Globally unique. */
    reference: text('reference').notNull().unique(),
    guardianId: uuid('guardian_id').references(() => guardians.id, { onDelete: 'set null' }),
    recordedBy: uuid('recorded_by').references(() => staff.id, { onDelete: 'set null' }),
    note: text('note'),
    channel: text('channel'),
    paidAt: timestamp('paid_at', { withTimezone: true }),
    providerData: jsonb('provider_data').$type<Record<string, unknown>>(),
    createdAt: createdAt(),
  },
  (t) => [index('payments_invoice').on(t.invoiceId)],
);

// ---------------------------------------------------------------- Messaging

export const notificationStatus = pgEnum('notification_status', ['queued', 'sending', 'sent', 'failed']);

/** Outbox of SMS and WhatsApp messages to parents. A background worker sends queued rows. */
export const notifications = pgTable(
  'notifications',
  {
    id: id(),
    schoolId: schoolId(),
    channel: messageChannel('channel').notNull(),
    to: text('to').notNull(),
    body: text('body').notNull(),
    /** e.g. attendance_absent, results_published, payment_received, fee_reminder, broadcast */
    kind: text('kind').notNull(),
    guardianId: uuid('guardian_id').references(() => guardians.id, { onDelete: 'set null' }),
    studentId: uuid('student_id').references(() => students.id, { onDelete: 'set null' }),
    status: notificationStatus('status').notNull().default('queued'),
    attempts: integer('attempts').notNull().default(0),
    providerRef: text('provider_ref'),
    error: text('error'),
    createdAt: createdAt(),
    sentAt: timestamp('sent_at', { withTimezone: true }),
  },
  (t) => [index('notifications_status').on(t.status, t.createdAt)],
);

// ---------------------------------------------------------------- CBT and question bank

export const examTag = pgEnum('exam_tag', ['school', 'bece', 'waec', 'neco', 'jamb']);

export interface QuestionOption {
  key: string;
  text: string;
}

/** Objective (multiple-choice) questions, tagged by subject, topic and exam. */
export const questions = pgTable(
  'questions',
  {
    id: id(),
    schoolId: schoolId(),
    subjectId: uuid('subject_id')
      .notNull()
      .references(() => subjects.id, { onDelete: 'cascade' }),
    topic: text('topic').notNull(),
    body: text('body').notNull(),
    options: jsonb('options').$type<QuestionOption[]>().notNull(),
    answer: text('answer').notNull(),
    explanation: text('explanation'),
    exam: examTag('exam').notNull().default('school'),
    year: integer('year'),
    /** Which section the question suits, e.g. senior_secondary for WAEC. */
    sectionKind: sectionKind('section_kind'),
    source: text('source').notNull().default('teacher'),
    createdBy: uuid('created_by').references(() => staff.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
  },
  (t) => [index('questions_subject_topic').on(t.subjectId, t.topic)],
);

export const cbtTestStatus = pgEnum('cbt_test_status', ['draft', 'published', 'closed']);

export const cbtTests = pgTable('cbt_tests', {
  id: id(),
  schoolId: schoolId(),
  title: text('title').notNull(),
  subjectId: uuid('subject_id')
    .notNull()
    .references(() => subjects.id, { onDelete: 'cascade' }),
  termId: uuid('term_id').references(() => terms.id, { onDelete: 'set null' }),
  durationMinutes: integer('duration_minutes').notNull(),
  opensAt: timestamp('opens_at', { withTimezone: true }),
  closesAt: timestamp('closes_at', { withTimezone: true }),
  status: cbtTestStatus('status').notNull().default('draft'),
  shuffleQuestions: boolean('shuffle_questions').notNull().default(true),
  /** Show score and corrections to the student after submitting. */
  showResults: boolean('show_results').notNull().default(true),
  /** If set, the CBT score can be pushed into this score component (e.g. ca1) for the term. */
  scoreComponent: text('score_component'),
  createdBy: uuid('created_by').references(() => staff.id, { onDelete: 'set null' }),
  createdAt: createdAt(),
});

export const cbtTestQuestions = pgTable(
  'cbt_test_questions',
  {
    id: id(),
    schoolId: schoolId(),
    testId: uuid('test_id')
      .notNull()
      .references(() => cbtTests.id, { onDelete: 'cascade' }),
    questionId: uuid('question_id')
      .notNull()
      .references(() => questions.id, { onDelete: 'restrict' }),
    position: integer('position').notNull(),
    marks: integer('marks').notNull().default(1),
  },
  (t) => [uniqueIndex('cbt_test_question_unique').on(t.testId, t.questionId)],
);

export const cbtTestClasses = pgTable(
  'cbt_test_classes',
  {
    id: id(),
    schoolId: schoolId(),
    testId: uuid('test_id')
      .notNull()
      .references(() => cbtTests.id, { onDelete: 'cascade' }),
    classId: uuid('class_id')
      .notNull()
      .references(() => classes.id, { onDelete: 'cascade' }),
  },
  (t) => [uniqueIndex('cbt_test_class_unique').on(t.testId, t.classId)],
);

export const attemptKind = pgEnum('attempt_kind', ['test', 'practice', 'mock']);

/** What a timed mock exam covers, so the review can score each subject (JAMB has four). */
export interface MockInfo {
  exam: 'waec' | 'neco' | 'jamb' | 'bece';
  size: 'full' | 'short';
  subjects: { subjectId: string; name: string; count: number }[];
}

/** A student's sitting of a CBT test, or a self-paced practice set from exam prep. */
export const cbtAttempts = pgTable(
  'cbt_attempts',
  {
    id: id(),
    schoolId: schoolId(),
    kind: attemptKind('kind').notNull(),
    testId: uuid('test_id').references(() => cbtTests.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id, { onDelete: 'cascade' }),
    subjectId: uuid('subject_id')
      .notNull()
      .references(() => subjects.id, { onDelete: 'cascade' }),
    /** Question ids in the order this student sees them. */
    questionIds: jsonb('question_ids').$type<string[]>().notNull(),
    answers: jsonb('answers').$type<Record<string, string>>().notNull().default({}),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    deadline: timestamp('deadline', { withTimezone: true }),
    submittedAt: timestamp('submitted_at', { withTimezone: true }),
    score: doublePrecision('score'),
    maxScore: doublePrecision('max_score'),
    percentage: doublePrecision('percentage'),
    /** Practice and mocks aimed at an external exam. */
    exam: examTag('exam'),
    mock: jsonb('mock').$type<MockInfo>(),
  },
  (t) => [uniqueIndex('cbt_attempt_test_student').on(t.testId, t.studentId), index('cbt_attempts_student').on(t.studentId)],
);

// ---------------------------------------------------------------- AI

/** Cached AI explanations, so each question and wrong option is explained once per school. */
export const questionExplanations = pgTable(
  'question_explanations',
  {
    id: id(),
    schoolId: schoolId(),
    questionId: uuid('question_id')
      .notNull()
      .references(() => questions.id, { onDelete: 'cascade' }),
    chosenKey: text('chosen_key').notNull(),
    text: text('text').notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('explanation_question_choice').on(t.questionId, t.chosenKey)],
);

/** Every AI call, for cost tracking and per-student daily limits. */
export const aiUsage = pgTable(
  'ai_usage',
  {
    id: id(),
    schoolId: schoolId(),
    feature: text('feature').notNull(),
    studentId: uuid('student_id').references(() => students.id, { onDelete: 'set null' }),
    staffId: uuid('staff_id').references(() => staff.id, { onDelete: 'set null' }),
    model: text('model').notNull(),
    inputTokens: integer('input_tokens').notNull(),
    outputTokens: integer('output_tokens').notNull(),
    /** Estimated cost in millionths of a US dollar, from the model's list price. */
    costMicroUsd: integer('cost_micro_usd').notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [index('ai_usage_student_day').on(t.studentId, t.createdAt), index('ai_usage_school_month').on(t.schoolId, t.createdAt)],
);

// ---------------------------------------------------------------- Knowledge base

const bytea = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => 'bytea' });

export const kbKind = pgEnum('kb_kind', ['scheme_of_work', 'lesson_note', 'lesson_plan', 'past_questions', 'textbook', 'marking_scheme', 'other']);
/** processing: being read; ready: searchable; needs_ai: a scan or photo waiting for AI to read it; failed: could not be read. */
export const kbStatus = pgEnum('kb_status', ['processing', 'ready', 'needs_ai', 'failed']);

/** A document a teacher or admin uploaded: scheme of work, lesson note, past questions, textbook. */
export const kbDocuments = pgTable(
  'kb_documents',
  {
    id: id(),
    schoolId: schoolId(),
    title: text('title').notNull(),
    kind: kbKind('kind').notNull(),
    subjectId: uuid('subject_id').references(() => subjects.id, { onDelete: 'cascade' }),
    /** Class level as the school names it, e.g. "SS 2" (matches classes.name). Null means every level. */
    classLevel: text('class_level'),
    /** 1, 2 or 3. Null means the whole year. */
    termNumber: integer('term_number'),
    fileName: text('file_name').notNull(),
    mimeType: text('mime_type').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    status: kbStatus('status').notNull().default('processing'),
    error: text('error'),
    chunkCount: integer('chunk_count').notNull().default(0),
    /** Weekly topics read from a scheme of work. */
    outline: jsonb('outline').$type<OutlineEntry[]>().notNull().default([]),
    visibleToStudents: boolean('visible_to_students').notNull().default(true),
    uploadedBy: uuid('uploaded_by').references(() => staff.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
  },
  (t) => [index('kb_documents_subject').on(t.schoolId, t.subjectId)],
);

/** The original uploaded file, kept so it can be re-read (e.g. by AI once a key is added) or downloaded. */
export const kbFiles = pgTable('kb_files', {
  id: id(),
  schoolId: schoolId(),
  documentId: uuid('document_id')
    .notNull()
    .unique()
    .references(() => kbDocuments.id, { onDelete: 'cascade' }),
  data: bytea('data').notNull(),
});

/** Searchable passages of a document. A generated tsvector column (see migration 0007) powers search. */
export const kbChunks = pgTable(
  'kb_chunks',
  {
    id: id(),
    schoolId: schoolId(),
    documentId: uuid('document_id')
      .notNull()
      .references(() => kbDocuments.id, { onDelete: 'cascade' }),
    ordinal: integer('ordinal').notNull(),
    locator: text('locator'),
    text: text('text').notNull(),
  },
  (t) => [index('kb_chunks_document').on(t.documentId)],
);

// ---------------------------------------------------------------- AI tutor

export interface Citation {
  documentId: string;
  title: string;
  locator: string | null;
  kind: string;
}

export interface TutorQuiz {
  question: string;
  options: QuestionOption[];
  answer: string;
  explanation: string;
  /** Set when the quiz came from the school's question bank. */
  questionId?: string;
}

/** One chat with the tutor, about one subject (and usually one topic). */
export const tutorConversations = pgTable(
  'tutor_conversations',
  {
    id: id(),
    schoolId: schoolId(),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id, { onDelete: 'cascade' }),
    subjectId: uuid('subject_id')
      .notNull()
      .references(() => subjects.id, { onDelete: 'cascade' }),
    topic: text('topic'),
    title: text('title').notNull(),
    /** A message in it needed a safeguarding or content check. Leadership sees flagged chats. */
    flagged: boolean('flagged').notNull().default(false),
    createdAt: createdAt(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('tutor_conversations_student').on(t.studentId, t.updatedAt)],
);

export const tutorRole = pgEnum('tutor_role', ['student', 'tutor']);

export const tutorMessages = pgTable(
  'tutor_messages',
  {
    id: id(),
    schoolId: schoolId(),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => tutorConversations.id, { onDelete: 'cascade' }),
    role: tutorRole('role').notNull(),
    /** What the student asked for: ask, explain, example, quiz or hint. */
    intent: text('intent'),
    content: text('content').notNull(),
    citations: jsonb('citations').$type<Citation[]>().notNull().default([]),
    quiz: jsonb('quiz').$type<TutorQuiz>(),
    quizAnswer: text('quiz_answer'),
    quizCorrect: boolean('quiz_correct'),
    /** Safety category if the student's message was flagged. */
    safety: text('safety'),
    /** ai, offline (stand-in without an AI key) or safety (fixed reply). */
    source: text('source').notNull().default('ai'),
    createdAt: createdAt(),
  },
  (t) => [index('tutor_messages_conversation').on(t.conversationId, t.createdAt)],
);

/** An external exam a student is preparing for, with the date, for the countdown plan. */
export const examGoals = pgTable(
  'exam_goals',
  {
    id: id(),
    schoolId: schoolId(),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id, { onDelete: 'cascade' }),
    exam: examTag('exam').notNull(),
    examDate: date('exam_date').notNull(),
    subjectIds: jsonb('subject_ids').$type<string[]>().notNull().default([]),
    createdAt: createdAt(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('exam_goal_student_exam').on(t.studentId, t.exam)],
);

// ---------------------------------------------------------------- Teacher assistant: essay and theory marking

/** A written question a teacher marks against a rubric, for one class and subject. */
export const essayTasks = pgTable(
  'essay_tasks',
  {
    id: id(),
    schoolId: schoolId(),
    classId: uuid('class_id')
      .notNull()
      .references(() => classes.id, { onDelete: 'cascade' }),
    subjectId: uuid('subject_id')
      .notNull()
      .references(() => subjects.id, { onDelete: 'cascade' }),
    /** The term and score component (e.g. ca2) confirmed marks can be sent to. */
    termId: uuid('term_id').references(() => terms.id, { onDelete: 'set null' }),
    scoreComponent: text('score_component'),
    title: text('title').notNull(),
    question: text('question').notNull(),
    rubric: jsonb('rubric').$type<RubricPoint[]>().notNull(),
    maxMarks: doublePrecision('max_marks').notNull(),
    createdBy: uuid('created_by').references(() => staff.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
  },
  (t) => [index('essay_tasks_class').on(t.schoolId, t.classId)],
);

export const essayScriptStatus = pgEnum('essay_script_status', ['suggested', 'confirmed']);

/** One student's answer to an essay task, the suggested marks, and the teacher's final mark. */
export const essayScripts = pgTable(
  'essay_scripts',
  {
    id: id(),
    schoolId: schoolId(),
    taskId: uuid('task_id')
      .notNull()
      .references(() => essayTasks.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id, { onDelete: 'cascade' }),
    answer: text('answer').notNull(),
    /** ai: marked by Claude; keywords: the rough stand-in used without AI. */
    suggestion: jsonb('suggestion').$type<MarkSuggestion & { source: 'ai' | 'keywords' }>(),
    awarded: doublePrecision('awarded'),
    teacherNote: text('teacher_note'),
    status: essayScriptStatus('status').notNull().default('suggested'),
    markedBy: uuid('marked_by').references(() => staff.id, { onDelete: 'set null' }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('essay_script_task_student').on(t.taskId, t.studentId)],
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
  'guardians',
  'student_guardians',
  'login_codes',
  'result_publications',
  'attendance_records',
  'fee_items',
  'invoices',
  'invoice_lines',
  'payments',
  'notifications',
  'questions',
  'cbt_tests',
  'cbt_test_questions',
  'cbt_test_classes',
  'cbt_attempts',
  'question_explanations',
  'ai_usage',
  'kb_documents',
  'kb_files',
  'kb_chunks',
  'tutor_conversations',
  'tutor_messages',
  'exam_goals',
  'essay_tasks',
  'essay_scripts',
] as const;

/**
 * Linx School platform staff (super admins). Not tied to a school, so there is no row-level
 * security here; school-scoped transactions (role school_app) cannot read this table.
 */
export const platformAdmins = pgTable('platform_admins', {
  id: id(),
  fullName: text('full_name').notNull(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  createdAt: createdAt(),
});
