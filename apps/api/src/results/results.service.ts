import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { computeClassResults, ordinal, subjectTotal } from '@school-ms/core';
import { Principal } from '../auth/auth.types';
import { assertOwned } from '../common/owned';
import { found } from '../common/validation';
import { Tx } from '../db/client';
import { DbService } from '../db/db.service';
import { AttendanceService } from '../attendance/attendance.service';
import { config } from '../common/config';
import { NotificationsService } from '../messaging/notifications.service';
import {
  academicSessions,
  classes,
  classSubjects,
  reportComments,
  resultPublications,
  schools,
  scores,
  sections,
  students,
  subjects,
  terms,
} from '../db/schema';

export interface ScoreInput {
  studentId: string;
  scores: Record<string, number>;
}

@Injectable()
export class ResultsService {
  constructor(
    private readonly dbs: DbService,
    private readonly attendance: AttendanceService,
    private readonly notifications: NotificationsService,
  ) {}

  private async classContext(tx: Tx, classId: string) {
    const [row] = await tx
      .select({ class: classes, section: sections })
      .from(classes)
      .innerJoin(sections, eq(sections.id, classes.sectionId))
      .where(eq(classes.id, classId));
    return found(row, 'Class');
  }

  /** Teachers may only touch subjects they are assigned to; proprietors and admins may touch any. */
  private async assertCanEnter(tx: Tx, user: Principal, classId: string, subjectId: string) {
    const [link] = await tx
      .select()
      .from(classSubjects)
      .where(and(eq(classSubjects.classId, classId), eq(classSubjects.subjectId, subjectId)));
    if (!link) throw new BadRequestException('This class does not take that subject');
    if (user.role === 'teacher' && link.teacherId !== user.staffId) {
      throw new ForbiddenException('You are not the teacher for this subject in this class');
    }
  }

  /** The score sheet a teacher fills in: every student in the class, with any scores saved so far. */
  scoreSheet(user: Principal, termId: string, classId: string, subjectId: string) {
    return this.dbs.withSchool(user.schoolId, async (tx) => {
      await assertOwned(tx, terms, termId, 'Term');
      const ctx = await this.classContext(tx, classId);
      await this.assertCanEnter(tx, user, classId, subjectId);
      const roster = await tx
        .select()
        .from(students)
        .where(eq(students.classId, classId))
        .orderBy(asc(students.lastName), asc(students.firstName));
      const saved = await tx
        .select()
        .from(scores)
        .where(and(eq(scores.termId, termId), eq(scores.classId, classId), eq(scores.subjectId, subjectId)));
      const byStudent = new Map(saved.map((s) => [s.studentId, s.scores]));
      return {
        components: ctx.section.components,
        rows: roster.map((s) => {
          const entered = byStudent.get(s.id) ?? null;
          return {
            studentId: s.id,
            admissionNumber: s.admissionNumber,
            name: `${s.lastName} ${s.firstName}`,
            scores: entered,
            total: entered ? subjectTotal(entered, ctx.section.components) : null,
          };
        }),
      };
    });
  }

  saveScores(user: Principal, termId: string, classId: string, subjectId: string, entries: ScoreInput[]) {
    return this.dbs.withSchool(user.schoolId, async (tx) => {
      await assertOwned(tx, terms, termId, 'Term');
      const ctx = await this.classContext(tx, classId);
      await this.assertCanEnter(tx, user, classId, subjectId);

      const ids = [...new Set(entries.map((e) => e.studentId))];
      if (ids.length !== entries.length) throw new BadRequestException('A student appears more than once');
      const inClass = ids.length
        ? await tx
            .select({ id: students.id })
            .from(students)
            .where(and(inArray(students.id, ids), eq(students.classId, classId)))
        : [];
      if (inClass.length !== ids.length) throw new BadRequestException('Some students are not in this class');

      const problems: { studentId: string; message: string }[] = [];
      for (const e of entries) {
        try {
          subjectTotal(e.scores, ctx.section.components);
        } catch (err) {
          problems.push({ studentId: e.studentId, message: (err as Error).message });
        }
      }
      if (problems.length) throw new BadRequestException({ message: 'Some scores are invalid', problems });

      for (const e of entries) {
        await tx
          .insert(scores)
          .values({ schoolId: user.schoolId, termId, classId, subjectId, studentId: e.studentId, scores: e.scores, enteredBy: user.staffId })
          .onConflictDoUpdate({
            target: [scores.termId, scores.subjectId, scores.studentId],
            set: { scores: e.scores, classId, enteredBy: user.staffId, updatedAt: new Date() },
          });
      }
      return { saved: entries.length };
    });
  }

  private async computeForClass(tx: Tx, termId: string, classId: string) {
    const ctx = await this.classContext(tx, classId);
    const rows = await tx
      .select()
      .from(scores)
      .where(and(eq(scores.termId, termId), eq(scores.classId, classId)));
    const result = computeClassResults(
      rows.map((r) => ({ studentId: r.studentId, subjectId: r.subjectId, scores: r.scores })),
      ctx.section.components,
      ctx.section.gradingScale,
    );
    return { ctx, result };
  }

  /** The class broadsheet: every student, every subject, totals, averages and positions. */
  broadsheet(user: Principal, termId: string, classId: string) {
    return this.dbs.withSchool(user.schoolId, async (tx) => {
      await assertOwned(tx, terms, termId, 'Term');
      const { ctx, result } = await this.computeForClass(tx, termId, classId);
      const subjectRows = await tx
        .select({ id: subjects.id, name: subjects.name, code: subjects.code })
        .from(classSubjects)
        .innerJoin(subjects, eq(subjects.id, classSubjects.subjectId))
        .where(eq(classSubjects.classId, classId))
        .orderBy(asc(subjects.name));
      const studentRows = result.students.length
        ? await tx.select().from(students).where(inArray(students.id, result.students.map((s) => s.studentId)))
        : [];
      const names = new Map(studentRows.map((s) => [s.id, { name: `${s.lastName} ${s.firstName}`, admissionNumber: s.admissionNumber }]));
      return {
        class: { id: ctx.class.id, name: ctx.class.name, arm: ctx.class.arm, section: ctx.section.name },
        subjects: subjectRows,
        classAverage: result.classAverage,
        studentCount: result.studentCount,
        students: result.students.map((s) => ({
          ...s,
          ...names.get(s.studentId),
          positionText: ordinal(s.position),
        })),
      };
    });
  }

  /** Everything a printed report card needs for one student in one term. */
  reportCard(user: Principal, termId: string, studentId: string) {
    return this.dbs.withSchool(user.schoolId, (tx) => this.buildReportCard(tx, user.schoolId, termId, studentId));
  }

  /** The class a student's results for a term were entered under, or null if none were. */
  async resultClassId(tx: Tx, termId: string, studentId: string): Promise<string | null> {
    const [anyScore] = await tx
      .select({ classId: scores.classId })
      .from(scores)
      .where(and(eq(scores.termId, termId), eq(scores.studentId, studentId)))
      .limit(1);
    return anyScore?.classId ?? null;
  }

  async buildReportCard(tx: Tx, schoolId: string, termId: string, studentId: string) {
    const [term] = await tx
      .select({ term: terms, session: academicSessions })
      .from(terms)
      .innerJoin(academicSessions, eq(academicSessions.id, terms.sessionId))
      .where(eq(terms.id, termId));
    found(term, 'Term');
    const [student] = await tx.select().from(students).where(eq(students.id, studentId));
    found(student, 'Student');

    const resultClassId = await this.resultClassId(tx, termId, studentId);
    if (!resultClassId) throw new BadRequestException('No scores have been entered for this student this term');

    const { ctx, result } = await this.computeForClass(tx, termId, resultClassId);
    const mine = result.students.find((s) => s.studentId === studentId)!;
    const subjectNames = new Map(
      (await tx.select().from(subjects).where(inArray(subjects.id, mine.subjects.map((s) => s.subjectId)))).map((s) => [s.id, s]),
    );
    const [comment] = await tx
      .select()
      .from(reportComments)
      .where(and(eq(reportComments.termId, termId), eq(reportComments.studentId, studentId)));
    const [school] = await this.dbs.db.select().from(schools).where(eq(schools.id, schoolId));
    const range = await this.attendance.termRange(tx, termId);
    const attendance = range
      ? (await this.attendance.summarise(tx, [studentId], range.from, range.to, resultClassId)).get(studentId)!
      : null;

    return {
      school: { name: school.name, motto: school.motto, address: school.address },
      session: term.session.name,
      term: term.term.name,
      student: {
        id: student.id,
        admissionNumber: student.admissionNumber,
        name: [student.lastName, student.firstName, student.otherNames].filter(Boolean).join(' '),
        gender: student.gender,
      },
      class: { name: ctx.class.name, arm: ctx.class.arm, section: ctx.section.name },
      components: ctx.section.components,
      gradingScale: ctx.section.gradingScale,
      subjects: mine.subjects
        .map((s) => ({
          ...s,
          name: subjectNames.get(s.subjectId)?.name ?? '',
          positionText: ordinal(s.position),
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      summary: {
        grandTotal: mine.grandTotal,
        average: mine.average,
        position: mine.position,
        positionText: ordinal(mine.position),
        outOf: result.studentCount,
        classAverage: result.classAverage,
      },
      comments: { teacher: comment?.teacherComment ?? null, head: comment?.headComment ?? null },
      attendance,
    };
  }

  /**
   * Makes a class's term results visible to parents and students, and by default texts
   * every parent in the class that results are ready.
   */
  publish(user: Principal, termId: string, classId: string, notifyGuardians: boolean) {
    return this.dbs.withSchool(user.schoolId, async (tx) => {
      const [term] = await tx
        .select({ term: terms, session: academicSessions })
        .from(terms)
        .innerJoin(academicSessions, eq(academicSessions.id, terms.sessionId))
        .where(eq(terms.id, termId));
      found(term, 'Term');
      await this.classContext(tx, classId);
      const withScores = await tx
        .selectDistinct({ studentId: scores.studentId })
        .from(scores)
        .where(and(eq(scores.termId, termId), eq(scores.classId, classId)));
      if (withScores.length === 0) throw new BadRequestException('No scores have been entered for this class this term');

      const [existing] = await tx
        .select()
        .from(resultPublications)
        .where(and(eq(resultPublications.termId, termId), eq(resultPublications.classId, classId)));
      if (existing) return { publication: existing, parentsNotified: 0 };

      const [publication] = await tx
        .insert(resultPublications)
        .values({ schoolId: user.schoolId, termId, classId, publishedBy: user.staffId })
        .returning();
      const parentsNotified = notifyGuardians
        ? await this.notifications.queueForGuardians(
            tx,
            user.schoolId,
            withScores.map((s) => s.studentId),
            'results_published',
            (s) =>
              `Dear parent, ${s.firstName} ${s.lastName}'s ${term.term.name} ${term.session.name} result is ready. View it at ${config.portalUrl()}`,
          )
        : 0;
      return { publication, parentsNotified };
    });
  }

  unpublish(user: Principal, termId: string, classId: string) {
    return this.dbs.withSchool(user.schoolId, async (tx) => {
      await tx.delete(resultPublications).where(and(eq(resultPublications.termId, termId), eq(resultPublications.classId, classId)));
      return { unpublished: true };
    });
  }

  listPublications(user: Principal, termId: string) {
    return this.dbs.withSchool(user.schoolId, (tx) =>
      tx.select().from(resultPublications).where(eq(resultPublications.termId, termId)),
    );
  }

  async isPublished(tx: Tx, termId: string, classId: string): Promise<boolean> {
    const [row] = await tx
      .select({ id: resultPublications.id })
      .from(resultPublications)
      .where(and(eq(resultPublications.termId, termId), eq(resultPublications.classId, classId)));
    return Boolean(row);
  }

  saveComments(user: Principal, termId: string, studentId: string, input: { teacherComment?: string; headComment?: string }) {
    if (input.headComment !== undefined && user.role === 'teacher') {
      throw new ForbiddenException("Only the proprietor or an admin can write the head's comment");
    }
    return this.dbs.withSchool(user.schoolId, async (tx) => {
      await assertOwned(tx, terms, termId, 'Term');
      await assertOwned(tx, students, studentId, 'Student');
      const [row] = await tx
        .insert(reportComments)
        .values({ schoolId: user.schoolId, termId, studentId, ...input })
        .onConflictDoUpdate({ target: [reportComments.termId, reportComments.studentId], set: { ...input, updatedAt: new Date() } })
        .returning();
      return row;
    });
  }
}
