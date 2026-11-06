import { BadRequestException, Injectable } from '@nestjs/common';
import { and, asc, eq, gte, inArray, lte, sql } from 'drizzle-orm';
import { Principal } from '../auth/auth.types';
import { assertTeachesClass, todayInLagos } from '../common/access';
import { found } from '../common/validation';
import { Tx } from '../db/client';
import { DbService } from '../db/db.service';
import { attendanceRecords, classes, students, terms } from '../db/schema';
import { NotificationsService } from '../messaging/notifications.service';

export type AttendanceStatus = 'present' | 'absent' | 'late' | 'excused';

export interface AttendanceSummary {
  /** Days the class register was taken ("times school opened" on a report card). */
  opened: number;
  present: number;
  absent: number;
  late: number;
  excused: number;
}

function prettyDate(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-NG', { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'UTC' });
}

@Injectable()
export class AttendanceService {
  constructor(
    private readonly dbs: DbService,
    private readonly notifications: NotificationsService,
  ) {}

  register(user: Principal, classId: string, date: string) {
    return this.dbs.withSchool(user.schoolId, async (tx) => {
      await assertTeachesClass(tx, user, classId);
      const roster = await tx
        .select()
        .from(students)
        .where(eq(students.classId, classId))
        .orderBy(asc(students.lastName), asc(students.firstName));
      const marks = await tx
        .select()
        .from(attendanceRecords)
        .where(and(eq(attendanceRecords.classId, classId), eq(attendanceRecords.date, date)));
      const byStudent = new Map(marks.map((m) => [m.studentId, m]));
      return {
        date,
        taken: marks.length > 0,
        rows: roster.map((s) => ({
          studentId: s.id,
          admissionNumber: s.admissionNumber,
          name: `${s.lastName} ${s.firstName}`,
          status: byStudent.get(s.id)?.status ?? null,
          note: byStudent.get(s.id)?.note ?? null,
        })),
      };
    });
  }

  /**
   * Saves the register for one day. Parents of students newly marked absent get an SMS or
   * WhatsApp alert (re-saving the same register does not alert them twice).
   */
  saveRegister(
    user: Principal,
    classId: string,
    date: string,
    entries: { studentId: string; status: AttendanceStatus; note?: string }[],
    notifyGuardians: boolean,
  ) {
    if (date > todayInLagos()) throw new BadRequestException('You cannot take the register for a future date');
    return this.dbs.withSchool(user.schoolId, async (tx) => {
      await assertTeachesClass(tx, user, classId);
      const ids = [...new Set(entries.map((e) => e.studentId))];
      if (ids.length !== entries.length) throw new BadRequestException('A student appears more than once');
      const inClass = ids.length
        ? await tx.select().from(students).where(and(inArray(students.id, ids), eq(students.classId, classId)))
        : [];
      if (inClass.length !== ids.length) throw new BadRequestException('Some students are not in this class');

      const before = ids.length
        ? await tx
            .select()
            .from(attendanceRecords)
            .where(and(inArray(attendanceRecords.studentId, ids), eq(attendanceRecords.date, date)))
        : [];
      const previous = new Map(before.map((b) => [b.studentId, b.status]));

      for (const e of entries) {
        await tx
          .insert(attendanceRecords)
          .values({ schoolId: user.schoolId, classId, studentId: e.studentId, date, status: e.status, note: e.note, markedBy: user.staffId })
          .onConflictDoUpdate({
            target: [attendanceRecords.studentId, attendanceRecords.date],
            set: { status: e.status, note: e.note ?? null, classId, markedBy: user.staffId, updatedAt: new Date() },
          });
      }

      const newlyAbsent = entries.filter((e) => e.status === 'absent' && previous.get(e.studentId) !== 'absent').map((e) => e.studentId);
      const alerted =
        notifyGuardians && date === todayInLagos()
          ? await this.notifications.queueForGuardians(
              tx,
              user.schoolId,
              newlyAbsent,
              'attendance_absent',
              (s) => `Dear parent, ${s.firstName} ${s.lastName} was marked absent from school today (${prettyDate(date)}). Please contact the school if this is unexpected.`,
            )
          : 0;
      return { saved: entries.length, absent: entries.filter((e) => e.status === 'absent').length, parentsAlerted: alerted };
    });
  }

  /** Attendance totals per student between two dates (inclusive). */
  async summarise(tx: Tx, studentIds: string[], from: string, to: string, classId?: string) {
    const result = new Map<string, AttendanceSummary>();
    if (studentIds.length === 0) return result;
    const rows = await tx
      .select({ studentId: attendanceRecords.studentId, status: attendanceRecords.status, n: sql<number>`count(*)::int` })
      .from(attendanceRecords)
      .where(and(inArray(attendanceRecords.studentId, studentIds), gte(attendanceRecords.date, from), lte(attendanceRecords.date, to)))
      .groupBy(attendanceRecords.studentId, attendanceRecords.status);
    const openedRows = await tx
      .select({ classId: attendanceRecords.classId, days: sql<number>`count(distinct ${attendanceRecords.date})::int` })
      .from(attendanceRecords)
      .where(and(gte(attendanceRecords.date, from), lte(attendanceRecords.date, to), classId ? eq(attendanceRecords.classId, classId) : undefined))
      .groupBy(attendanceRecords.classId);
    const opened = Math.max(0, ...openedRows.map((o) => o.days));
    for (const id of studentIds) result.set(id, { opened, present: 0, absent: 0, late: 0, excused: 0 });
    for (const r of rows) {
      const s = result.get(r.studentId)!;
      s[r.status] += r.n;
    }
    return result;
  }

  async termRange(tx: Tx, termId: string): Promise<{ from: string; to: string } | null> {
    const [term] = await tx.select().from(terms).where(eq(terms.id, termId));
    found(term, 'Term');
    if (!term.startsOn || !term.endsOn) return null;
    return { from: term.startsOn, to: term.endsOn };
  }

  classTermSummary(user: Principal, termId: string, classId: string) {
    return this.dbs.withSchool(user.schoolId, async (tx) => {
      await assertTeachesClass(tx, user, classId);
      const range = await this.termRange(tx, termId);
      if (!range) throw new BadRequestException('Set the term start and end dates first');
      const roster = await tx.select().from(students).where(eq(students.classId, classId)).orderBy(asc(students.lastName));
      const totals = await this.summarise(tx, roster.map((s) => s.id), range.from, range.to, classId);
      return {
        ...range,
        students: roster.map((s) => ({
          studentId: s.id,
          admissionNumber: s.admissionNumber,
          name: `${s.lastName} ${s.firstName}`,
          ...totals.get(s.id)!,
        })),
      };
    });
  }

  studentHistory(schoolId: string, studentId: string, from: string, to: string) {
    return this.dbs.withSchool(schoolId, async (tx) => {
      const [student] = await tx.select().from(students).where(eq(students.id, studentId));
      found(student, 'Student');
      const records = await tx
        .select({ date: attendanceRecords.date, status: attendanceRecords.status, note: attendanceRecords.note, className: classes.name })
        .from(attendanceRecords)
        .innerJoin(classes, eq(classes.id, attendanceRecords.classId))
        .where(and(eq(attendanceRecords.studentId, studentId), gte(attendanceRecords.date, from), lte(attendanceRecords.date, to)))
        .orderBy(asc(attendanceRecords.date));
      const summary = (await this.summarise(tx, [studentId], from, to, student.classId ?? undefined)).get(studentId)!;
      return { from, to, summary, records };
    });
  }
}
