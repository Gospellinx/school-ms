export type Role = 'proprietor' | 'admin' | 'teacher';

/** A logged-in staff member. */
export interface Principal {
  staffId: string;
  schoolId: string;
  role: Role;
}

/** A logged-in parent or guardian. */
export interface ParentPrincipal {
  guardianId: string;
  schoolId: string;
  role: 'parent';
}

/** A logged-in student (CBT and exam prep). */
export interface StudentPrincipal {
  studentId: string;
  schoolId: string;
  role: 'student';
}

export type Audience = 'staff' | 'parent' | 'student';
export type TokenRole = Role | 'parent' | 'student';
