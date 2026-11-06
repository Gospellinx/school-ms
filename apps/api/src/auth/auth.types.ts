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

/** Linx School platform staff (super admin): sees every school, but no school's private records. */
export interface PlatformPrincipal {
  adminId: string;
  role: 'platform';
}

export type Audience = 'staff' | 'parent' | 'student' | 'platform';
export type TokenRole = Role | 'parent' | 'student' | 'platform';
