/** Shapes returned by the API (apps/api). Money is always in kobo (₦1 = 100 kobo). */

export type StaffRole = 'proprietor' | 'admin' | 'teacher';

export interface School {
  id: string;
  name: string;
  slug: string;
  motto: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  withholdResultsForDebt: boolean;
  paystackSubaccountCode: string | null;
}

export interface StaffMe {
  school: School;
  staff: { id: string; fullName: string; email: string; role: StaffRole };
}

export interface ParentMe {
  parent: { id: string; fullName: string; phone: string; email: string | null; preferredChannel: "sms" | "whatsapp" };
  school: { id: string; name: string; motto: string | null; phone: string | null };
  children: { id: string; firstName: string; lastName: string; admissionNumber: string; className: string | null; arm: string | null }[];
}

export interface StudentMe {
  student: {
    id: string;
    admissionNumber: string;
    firstName: string;
    lastName: string;
    otherNames: string | null;
    gender: 'male' | 'female' | null;
    classId: string | null;
  };
  className: string | null;
  arm: string | null;
  subjects: { id: string; name: string; code: string }[];
}

export interface PlatformMe {
  admin: { id: string; fullName: string; email: string };
}

export interface Term {
  id: string;
  sessionId: string;
  number: number;
  name: string;
  isCurrent: boolean;
  startsOn: string | null;
  endsOn: string | null;
}

export interface Session {
  id: string;
  name: string;
  terms: Term[];
}

export interface Component {
  key: string;
  label: string;
  maxScore: number;
}

export interface GradeBand {
  min: number;
  max: number;
  grade: string;
  remark: string;
}

export interface Section {
  id: string;
  name: string;
  kind: 'nursery' | 'primary' | 'junior_secondary' | 'senior_secondary';
  components: Component[];
  gradingScale: GradeBand[];
}

export interface SchoolClass {
  id: string;
  sectionId: string;
  name: string;
  arm: string;
  sortOrder: number;
  formTeacherId: string | null;
}

export interface Subject {
  id: string;
  name: string;
  code: string;
}

export interface ClassSubject {
  id: string;
  subjectId: string;
  name: string;
  code: string;
  teacherId: string | null;
}

export interface Staff {
  id: string;
  fullName: string;
  email: string;
  role: StaffRole;
}

export interface Student {
  id: string;
  admissionNumber: string;
  firstName: string;
  lastName: string;
  otherNames: string | null;
  gender: 'male' | 'female' | null;
  classId: string | null;
  hasPin: boolean;
}

export interface Guardian {
  id: string;
  fullName: string;
  phone: string;
  email: string | null;
  preferredChannel: 'sms' | 'whatsapp';
  students: { studentId: string; relationship: string | null }[];
}

export interface Assignment {
  classId: string;
  className: string;
  arm: string;
  subjectId: string;
  subjectName: string;
  teacherId: string | null;
}

export interface Dashboard {
  today: string;
  role: StaffRole;
  currentTerm: { id: string; name: string; sessionName: string; startsOn: string | null; endsOn: string | null } | null;
  classes: {
    id: string;
    name: string;
    arm: string;
    section: string;
    sectionKind: Section['kind'];
    isFormClass: boolean;
    students: number;
    markedToday: number;
    presentToday: number;
  }[];
  attendanceTrend: { date: string; marked: number; present: number }[];
  scoreSheets: { classId: string; className: string; subjectId: string; subjectName: string; students: number; entered: number }[];
  cbt: { open: number; total: number };
  counts?: { students: number; girls: number; boys: number; staff: number; teachers: number; parents: number; questions: number };
  fees?: { expectedKobo: number; collectedKobo: number; invoicesOwing: number } | null;
  resultsPublished?: number;
  recentMessages?: { id: string; kind: string; channel: string; body: string; recipients: number; sent: number; createdAt: string }[];
}

export interface ScoreSheet {
  components: Component[];
  rows: { studentId: string; admissionNumber: string; name: string; scores: Record<string, number> | null; total: number | null }[];
}

export interface SubjectResult {
  subjectId: string;
  scores: Record<string, number>;
  total: number;
  grade: string;
  remark: string;
  position: number;
  classAverage: number;
  classHighest: number;
  classLowest: number;
  name?: string;
  positionText?: string;
}

export interface Broadsheet {
  class: { id: string; name: string; arm: string; section: string };
  subjects: Subject[];
  classAverage: number;
  studentCount: number;
  students: {
    studentId: string;
    name: string;
    admissionNumber: string;
    subjects: SubjectResult[];
    grandTotal: number;
    average: number;
    position: number;
    positionText: string;
    subjectCount: number;
  }[];
}

export interface AttendanceSummary {
  opened: number;
  present: number;
  absent: number;
  late: number;
  excused: number;
}

export interface ReportCard {
  school: { name: string; motto: string | null; address: string | null };
  session: string;
  term: string;
  student: { id: string; admissionNumber: string; name: string; gender: string | null };
  class: { name: string; arm: string; section: string };
  components: Component[];
  gradingScale: GradeBand[];
  subjects: (SubjectResult & { name: string; positionText: string })[];
  summary: { grandTotal: number; average: number; position: number; positionText: string; outOf: number; classAverage: number };
  comments: { teacher: string | null; head: string | null };
  attendance: AttendanceSummary | null;
}

export type AttendanceStatus = 'present' | 'absent' | 'late' | 'excused';

export interface Register {
  date: string;
  taken: boolean;
  rows: { studentId: string; admissionNumber: string; name: string; status: AttendanceStatus | null; note: string | null }[];
}

export interface ClassAttendance {
  from: string;
  to: string;
  students: ({ studentId: string; admissionNumber: string; name: string } & AttendanceSummary)[];
}

export interface StudentAttendance {
  from: string;
  to: string;
  summary: AttendanceSummary;
  records: { date: string; status: AttendanceStatus; note: string | null; className: string | null }[];
}

export interface Publication {
  id: string;
  termId: string;
  classId: string;
  publishedAt: string;
}

export interface FeeItem {
  id: string;
  termId: string;
  name: string;
  amountKobo: number;
  sectionId: string | null;
  classId: string | null;
}

export type InvoiceStatus = 'unpaid' | 'part_paid' | 'paid';

export interface Invoice {
  id: string;
  termId: string;
  studentId: string;
  number: string;
  totalKobo: number;
  paidKobo: number;
  balanceKobo: number;
  status: InvoiceStatus;
  createdAt: string;
  student: { id: string; name: string; admissionNumber: string; classId?: string | null };
}

export interface InvoiceDetail extends Invoice {
  term: string;
  session: string;
  lines: { id: string; name: string; amountKobo: number }[];
  payments: { id: string; amountKobo: number; method: string; status: string; reference: string; paidAt: string | null; note: string | null; createdAt: string }[];
}

export interface FeeSummary {
  expectedKobo: number;
  collectedKobo: number;
  outstandingKobo: number;
  invoices: number;
  paid: number;
  partPaid: number;
  unpaid: number;
  byClass: {
    classId: string;
    className: string;
    arm: string;
    invoices: number;
    expectedKobo: number;
    collectedKobo: number;
    outstandingKobo: number;
    paid: number;
    partPaid: number;
    unpaid: number;
  }[];
}

export interface Notification {
  id: string;
  channel: 'sms' | 'whatsapp';
  to?: string;
  body: string;
  kind: string;
  status: 'queued' | 'sending' | 'sent' | 'failed';
  studentId: string | null;
  createdAt: string;
  sentAt?: string | null;
  error?: string | null;
}

export interface Question {
  id: string;
  subjectId: string;
  topic: string;
  body: string;
  options: { key: string; text: string }[];
  answer: string;
  explanation: string | null;
  exam: 'school' | 'bece' | 'waec' | 'neco' | 'jamb';
  year: number | null;
  source: string;
}

export interface CbtTest {
  id: string;
  title: string;
  subjectId: string;
  termId: string | null;
  durationMinutes: number;
  opensAt: string | null;
  closesAt: string | null;
  status: 'draft' | 'published' | 'closed';
  scoreComponent: string | null;
  createdBy: string | null;
  createdAt: string;
}

export interface CbtTestDetail extends CbtTest {
  classes: { id: string; name: string; arm: string }[];
  totalMarks: number;
  questions: (Question & { marks?: number })[];
}

export interface CbtResults {
  test: { id: string; title: string; totalMarks: number; status: CbtTest['status'] };
  submittedCount: number;
  averagePercentage: number | null;
  students: {
    studentId: string;
    admissionNumber: string;
    name: string;
    classId: string;
    status: 'not_started' | 'in_progress' | 'submitted';
    score: number | null;
    maxScore: number | null;
    percentage: number | null;
  }[];
  items: { questionId: string; topic: string; answered: number; correct: number; percentCorrect: number | null }[];
}

export interface StudentTest {
  id: string;
  title: string;
  subject: string;
  durationMinutes: number;
  opensAt: string | null;
  closesAt: string | null;
  isOpen: boolean;
  attempt: { id: string; submitted: boolean; percentage: number | null } | null;
}

export interface Attempt {
  id: string;
  kind: 'test' | 'practice';
  title: string;
  subjectId: string;
  deadline: string | null;
  secondsLeft: number | null;
  submitted: boolean;
  result: { score: number; maxScore: number; percentage: number } | null;
  questions: {
    number: number;
    id: string;
    topic: string;
    body: string;
    options: { key: string; text: string }[];
    marks: number;
    chosen: string | null;
    answer?: string;
    correct?: boolean;
    explanation?: string | null;
  }[];
}

export interface StudyProfile {
  student: { id: string; name: string; className: string | null };
  sectionKind: string;
  targetExam: string;
  subjects: {
    subjectId: string;
    subjectName: string;
    latestScore: number | null;
    latestTerm: string | null;
    trend: number | null;
    belowCredit: boolean;
    weakTopics: { topic: string; accuracy: number; attempts: number }[];
    priority: number;
    reasons: string[];
  }[];
  overallAverage: number | null;
}

export interface StudyPlan {
  summary: string;
  weeks: { week: number; focus: { subject: string; topic: string; activities: string[] }[] }[];
  tips: string[];
}

export interface PrepResponse {
  profile: StudyProfile;
  plan: StudyPlan | null;
}

export interface PublishedTerm {
  id: string;
  name: string;
  number: number;
  session: string;
}

export interface SchoolSummary {
  id: string;
  name: string;
  slug: string;
  address: string | null;
  createdAt: string;
  paystackConnected: boolean;
  students: number;
  staff: number;
  classes: number;
  parents: number;
  questions: number;
  questionsByExam: Record<string, number>;
  currentTerm: string | null;
  feesCollectedKobo: number;
  publishedResults: number;
}

export const className = (c: { name: string; arm?: string | null }) => (c.arm ? `${c.name} ${c.arm}` : c.name);
