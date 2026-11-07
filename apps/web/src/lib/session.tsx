'use client';

import { createContext, useContext } from 'react';
import { clearOfflineData, outboxItems } from './offline';
import type { ParentMe, PlatformMe, StaffMe, StudentMe } from './types';

/** Who is signed in, loaded once per portal by its layout. */
export type SessionValue =
  | { portal: 'admin' | 'teacher'; me: StaffMe }
  | { portal: 'parent'; me: ParentMe }
  | { portal: 'student'; me: StudentMe }
  | { portal: 'super-admin'; me: PlatformMe };

export const SessionContext = createContext<SessionValue | null>(null);

function useSession(): SessionValue {
  const s = useContext(SessionContext);
  if (!s) throw new Error('useSession must be used inside a portal layout');
  return s;
}

export function useStaff(): StaffMe {
  const s = useSession();
  if (s.portal !== 'admin' && s.portal !== 'teacher') throw new Error('Not a staff session');
  return s.me;
}

export function useParent(): ParentMe {
  const s = useSession();
  if (s.portal !== 'parent') throw new Error('Not a parent session');
  return s.me;
}

export function useStudent(): StudentMe {
  const s = useSession();
  if (s.portal !== 'student') throw new Error('Not a student session');
  return s.me;
}

export function usePlatform(): PlatformMe {
  const s = useSession();
  if (s.portal !== 'super-admin') throw new Error('Not a super admin session');
  return s.me;
}

/** Display name and subtitle for the shell's profile card. */
export function sessionUser(s: SessionValue): { name: string; subtitle: string } {
  switch (s.portal) {
    case 'admin':
    case 'teacher':
      return { name: s.me.staff.fullName, subtitle: `${roleLabel(s.me.staff.role)} · ${s.me.school.name}` };
    case 'parent':
      return { name: s.me.parent.fullName, subtitle: `Parent · ${s.me.children.length} ${s.me.children.length === 1 ? 'child' : 'children'}` };
    case 'student':
      return {
        name: `${s.me.student.firstName} ${s.me.student.lastName}`,
        subtitle: [s.me.className, s.me.arm].filter(Boolean).join(' ') || s.me.student.admissionNumber,
      };
    case 'super-admin':
      return { name: s.me.admin.fullName, subtitle: 'Linx School super admin' };
  }
}

export const roleLabel = (r: string) => ({ proprietor: 'Proprietor', admin: 'School admin', teacher: 'Teacher' })[r] ?? r;

export async function signOut() {
  const waiting = (await outboxItems().catch(() => [])).filter((i) => !i.failed);
  if (waiting.length && !window.confirm(`${waiting.length} saved change(s) on this phone have not synced yet: ${waiting.map((i) => i.label).join(', ')}. Sign out and lose them?`)) return;
  await fetch('/session/logout', { method: 'POST' });
  // Shared phones: the next person must not see this person's offline copies.
  await clearOfflineData();
  window.location.href = '/';
}
