export type Role = 'proprietor' | 'admin' | 'teacher';

export interface Me {
  school: { id: string; name: string; slug: string; motto: string | null; address: string | null };
  staff: { id: string; fullName: string; email: string; role: Role };
}

export interface Term {
  id: string;
  sessionId: string;
  number: number;
  name: string;
  isCurrent: boolean;
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
  kind: string;
  components: Component[];
  gradingScale: GradeBand[];
}

export interface SchoolClass {
  id: string;
  sectionId: string;
  name: string;
  arm: string;
}

export interface Subject {
  id: string;
  name: string;
  code: string;
}

export interface Staff {
  id: string;
  fullName: string;
  email: string;
  role: Role;
}

export interface Student {
  id: string;
  admissionNumber: string;
  firstName: string;
  lastName: string;
  otherNames: string | null;
  gender: 'male' | 'female' | null;
  classId: string | null;
}

export interface Assignment {
  classId: string;
  className: string;
  arm: string;
  subjectId: string;
  subjectName: string;
  teacherId: string | null;
}

export const className = (c: { name: string; arm: string }) => (c.arm ? `${c.name} ${c.arm}` : c.name);

export const termLabel = (sessions: Session[] | null, termId: string) => {
  for (const s of sessions ?? []) {
    const t = s.terms.find((x) => x.id === termId);
    if (t) return `${t.name}, ${s.name}`;
  }
  return '';
};
