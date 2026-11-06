import { ForbiddenException } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { Principal } from '../auth/auth.types';
import { Tx } from '../db/client';
import { classes, classSubjects } from '../db/schema';
import { found } from './validation';

/** Leadership, the class's form teacher, or any teacher who takes a subject in the class. */
export async function assertTeachesClass(tx: Tx, user: Principal, classId: string) {
  const [cls] = await tx.select().from(classes).where(eq(classes.id, classId));
  found(cls, 'Class');
  if (user.role !== 'teacher' || cls.formTeacherId === user.staffId) return cls;
  const [link] = await tx
    .select({ id: classSubjects.id })
    .from(classSubjects)
    .where(and(eq(classSubjects.classId, classId), eq(classSubjects.teacherId, user.staffId)))
    .limit(1);
  if (!link) throw new ForbiddenException('You do not teach this class');
  return cls;
}

/** Today's date in Nigeria (West Africa Time, UTC+1) as YYYY-MM-DD. */
export function todayInLagos(): string {
  return new Date(Date.now() + 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** Leadership, or a teacher assigned to this subject in this class. */
export async function assertTeachesSubject(tx: Tx, user: Principal, classId: string, subjectId: string) {
  const [cls] = await tx.select().from(classes).where(eq(classes.id, classId));
  found(cls, 'Class');
  const [link] = await tx
    .select({ id: classSubjects.id, teacherId: classSubjects.teacherId })
    .from(classSubjects)
    .where(and(eq(classSubjects.classId, classId), eq(classSubjects.subjectId, subjectId)))
    .limit(1);
  if (!link) throw new ForbiddenException('This class does not take that subject');
  if (user.role === 'teacher' && link.teacherId !== user.staffId) throw new ForbiddenException('You do not teach this subject in this class');
  return cls;
}
