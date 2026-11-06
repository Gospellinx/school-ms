'use client';

import { ApiError } from './api';

/** Calls the API's public routes (school website and admissions) through /public-api. No login. */
export async function publicApi<T = unknown>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const res = await fetch(`/public-api/${path.replace(/^\//, '')}`, {
    method: init?.method ?? 'GET',
    headers: { 'content-type': 'application/json' },
    body: init?.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const b = body as { message?: string; issues?: { path: string; message: string }[] } | null;
    const msg = b?.issues?.length ? b.issues.map((i) => i.message).join('; ') : typeof b?.message === 'string' ? b.message : `Request failed (${res.status})`;
    throw new ApiError(msg, res.status, body);
  }
  return body as T;
}

/** The private key from the family's status link, remembered on this device so the Paystack return page works. */
export function rememberKey(reference: string, key: string) {
  try {
    localStorage.setItem(`adm:${reference}`, key);
  } catch {
    /* private mode: the emailed link still works */
  }
}

export function recallKey(reference: string): string | null {
  try {
    return localStorage.getItem(`adm:${reference}`);
  } catch {
    return null;
  }
}

export type ApplicationStatus = 'pending_payment' | 'applied' | 'exam' | 'offered' | 'accepted' | 'enrolled' | 'rejected' | 'withdrawn';

export const STATUS_LABEL: Record<ApplicationStatus, string> = {
  pending_payment: 'Awaiting form fee',
  applied: 'Applied',
  exam: 'Entrance exam',
  offered: 'Offered',
  accepted: 'Accepted',
  enrolled: 'Enrolled',
  rejected: 'Not successful',
  withdrawn: 'Withdrawn',
};

export const STATUS_TONE: Record<ApplicationStatus, 'amber' | 'blue' | 'brand' | 'orchid' | 'green' | 'red' | 'gray'> = {
  pending_payment: 'amber',
  applied: 'blue',
  exam: 'brand',
  offered: 'orchid',
  accepted: 'green',
  enrolled: 'green',
  rejected: 'red',
  withdrawn: 'gray',
};

export interface PublicSchool {
  id: string;
  name: string;
  slug: string;
  motto: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
}

export interface PublicSite {
  school: PublicSchool;
  site: {
    tagline: string | null;
    about: string | null;
    heroImageUrl: string | null;
    logoUrl: string | null;
    accentColor: string | null;
    highlights: { title: string; text: string }[];
    gallery: string[];
    whatsapp: string | null;
    mapUrl: string | null;
  };
  sections: { name: string; kind: string }[];
  admissions: {
    open: boolean;
    session: string | null;
    feeKobo: number;
    instructions: string | null;
    classes: { id: string; className: string; hasExam: boolean; examMinutes: number | null }[];
  };
}

export interface PublicStatus {
  school: PublicSchool;
  accentColor: string | null;
  application: {
    reference: string;
    status: ApplicationStatus;
    statusLabel: string;
    childName: string;
    className: string;
    parentName: string;
    parentEmail: string;
    createdAt: string;
    fee: { amountKobo: number; paid: boolean; paidAt: string | null };
    exam: { title: string; durationMinutes: number | null; opensAt: string | null; closesAt: string | null; isOpen: boolean; started: boolean; submitted: boolean } | null;
    offer: { note: string | null; offeredAt: string; acceptedAt: string | null } | null;
    decisionNote: string | null;
    steps: { key: string; label: string; done: boolean }[];
  };
}

export interface ApplicantExam {
  id: string;
  title: string;
  schoolName: string;
  childName: string;
  deadline: string;
  secondsLeft: number | null;
  submitted: boolean;
  questions: { number: number; id: string; subject: string; body: string; options: { key: string; text: string }[]; chosen: string | null }[];
}

export interface AdmissionClass {
  id: string;
  classId: string;
  className: string;
  open: boolean;
  seats: number | null;
  seatsTaken: number;
  passMark: number | null;
  entranceTest: { id: string; title: string; durationMinutes: number } | null;
}

export interface EntranceExam {
  id: string;
  title: string;
  durationMinutes: number;
  status: string;
  questions: number;
  totalMarks: number;
  subjects: { name: string; questions: number }[];
  sittings: number;
  averagePercentage: number | null;
}

export interface ApplicationRow {
  id: string;
  reference: string;
  childName: string;
  className: string;
  admissionClassId: string;
  status: ApplicationStatus;
  parentName: string;
  parentPhone: string;
  parentEmail: string;
  feeKobo: number;
  feePaid: boolean;
  hasExam: boolean;
  examOpensAt: string | null;
  examPercentage: number | null;
  passMark: number | null;
  recommended: boolean | null;
  createdAt: string;
  updatedAt: string;
}

export interface ApplicationEvent {
  id: string;
  applicationId: string;
  kind: string;
  detail: string | null;
  staffId: string | null;
  createdAt: string;
}

export interface ApplicationDetail extends Omit<ApplicationRow, 'feePaid' | 'recommended' | 'hasExam'> {
  firstName: string;
  lastName: string;
  otherNames: string | null;
  gender: 'male' | 'female' | null;
  dateOfBirth: string | null;
  previousSchool: string | null;
  relationship: string | null;
  address: string | null;
  notes: string | null;
  feePaidAt: string | null;
  feeMethod: string | null;
  examClosesAt: string | null;
  offerNote: string | null;
  offeredAt: string | null;
  acceptedAt: string | null;
  decisionNote: string | null;
  enrolledAt: string | null;
  statusLabel: string;
  entranceTestId: string | null;
  statusLink: string;
  exam: {
    startedAt: string;
    submittedAt: string | null;
    score: number | null;
    maxScore: number | null;
    percentage: number | null;
    answered: number;
    questions: number;
    subjects: { name: string; questions: number; correct: number; percentage: number }[];
  } | null;
  student: { id: string; admissionNumber: string } | null;
  events: ApplicationEvent[];
  emails: { id: string; subject: string; kind: string; status: string; to: string; sendAfter: string; sentAt: string | null; error: string | null }[];
}

export interface AdmissionsOverview {
  site: { published: boolean; admissionsOpen: boolean; feeKobo: number; url: string };
  total: number;
  counts: Record<ApplicationStatus, number>;
  funnel: { key: string; label: string; n: number }[];
  fees: { collectedKobo: number; paid: number; awaiting: number };
  exam: { sat: number; averagePercentage: number | null };
  daily: { day: string; n: number }[];
  classes: AdmissionClass[];
  emails: { sent: number; queued: number; scheduled: number; failed: number; skipped: number };
  activity: (ApplicationEvent & { reference: string; childName: string })[];
  serverTime: string;
}

export interface SiteSettings {
  school: PublicSchool;
  url: string;
  site: {
    published: boolean;
    tagline: string | null;
    about: string | null;
    heroImageUrl: string | null;
    logoUrl: string | null;
    accentColor: string | null;
    highlights: { title: string; text: string }[];
    gallery: string[];
    whatsapp: string | null;
    mapUrl: string | null;
    admissionsOpen: boolean;
    admissionSession: string | null;
    applicationFeeKobo: number;
    admissionInstructions: string | null;
    admissionsEmail: string | null;
  } | null;
}

/** Words for the activity feed. */
export const EVENT_LABEL: Record<string, string> = {
  submitted: 'Application started',
  fee_paid: 'Form fee paid',
  exam_scheduled: 'Invited to the entrance exam',
  exam_started: 'Started the entrance exam',
  exam_submitted: 'Finished the entrance exam',
  offered: 'Offered a place',
  accepted: 'Accepted the offer',
  enrolled: 'Enrolled',
  rejected: 'Not offered a place',
  email_sent: 'Email sent',
  note: 'Note',
};

export function timeAgo(v: string, now = Date.now()) {
  const s = Math.max(0, Math.round((now - Date.parse(v)) / 1000));
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return `${d} day${d === 1 ? '' : 's'} ago`;
}
