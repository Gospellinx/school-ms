export type Role = 'proprietor' | 'admin' | 'teacher';

export interface Principal {
  staffId: string;
  schoolId: string;
  role: Role;
}
