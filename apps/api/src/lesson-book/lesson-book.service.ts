import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { lessonCoverage, LessonBookEntry, OutlineEntry, weekOfTerm } from '@school-ms/core';
import { and, asc, eq, inArray, isNull, or } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { Principal } from '../auth/auth.types';
import { assertTeachesSubject, todayInLagos } from '../common/access';
import { found } from '../common/validation';
import { Tx } from '../db/client';
import { DbService } from '../db/db.service';
import { academicSessions, classes, classSubjects, kbChunks, kbDocuments, kbFiles, schools, sections, staff, subjects, terms } from '../db/schema';

const LESSON_KINDS = ['lesson_note', 'lesson_plan'] as const;
const author = alias(staff, 'author');
const vetter = alias(staff, 'vetter');

/**
 * The lesson notes book: every lesson note and plan for a class and subject in a term, lined up
 * with the scheme of work, with who vetted each one. It prints as the document school inspectors
 * (and SUBEB or ministry quality assurance visits) ask to see.
 */
@Injectable()
export class LessonBookService {
  constructor(private readonly dbs: DbService) {}

  private async term(tx: Tx, termId?: string) {
    const [t] = await tx
      .select({ term: terms, session: academicSessions.name })
      .from(terms)
      .innerJoin(academicSessions, eq(academicSessions.id, terms.sessionId))
      .where(termId ? eq(terms.id, termId) : eq(terms.isCurrent, true))
      .limit(1);
    if (termId) found(t, 'Term');
    return t ?? null;
  }

  private async schemes(tx: Tx, termNumber: number | null) {
    const docs = await tx
      .select({ subjectId: kbDocuments.subjectId, classLevel: kbDocuments.classLevel, termNumber: kbDocuments.termNumber, outline: kbDocuments.outline })
      .from(kbDocuments)
      .where(and(eq(kbDocuments.kind, 'scheme_of_work'), eq(kbDocuments.status, 'ready')))
      .orderBy(asc(kbDocuments.createdAt));
    return docs.filter((d) => termNumber === null || d.termNumber === null || d.termNumber === termNumber);
  }

  /** Weekly topics for one subject and class level, this term. A scheme for the right term beats a whole-year one. */
  private outlineFor(schemes: Awaited<ReturnType<LessonBookService['schemes']>>, subjectId: string, classLevel: string): OutlineEntry[] {
    const fit = schemes.filter((d) => d.subjectId === subjectId && (d.classLevel === null || d.classLevel === classLevel));
    const best = fit.filter((d) => d.termNumber !== null);
    const weeks = new Map<number, OutlineEntry>();
    for (const d of best.length ? best : fit) for (const o of d.outline) if (!weeks.has(o.week)) weeks.set(o.week, o);
    return [...weeks.values()].sort((a, b) => a.week - b.week);
  }

  private lessonDocs(tx: Tx, f: { subjectIds?: string[]; termNumber: number | null }) {
    return tx
      .select({
        id: kbDocuments.id,
        kind: kbDocuments.kind,
        title: kbDocuments.title,
        subjectId: kbDocuments.subjectId,
        classLevel: kbDocuments.classLevel,
        termNumber: kbDocuments.termNumber,
        week: kbDocuments.week,
        mimeType: kbDocuments.mimeType,
        status: kbDocuments.status,
        createdAt: kbDocuments.createdAt,
        uploadedBy: kbDocuments.uploadedBy,
        author: author.fullName,
        vettedAt: kbDocuments.vettedAt,
        vettedBy: vetter.fullName,
        vetComment: kbDocuments.vetComment,
      })
      .from(kbDocuments)
      .leftJoin(author, eq(author.id, kbDocuments.uploadedBy))
      .leftJoin(vetter, eq(vetter.id, kbDocuments.vettedBy))
      .where(
        and(
          inArray(kbDocuments.kind, [...LESSON_KINDS]),
          f.subjectIds ? inArray(kbDocuments.subjectId, f.subjectIds.length ? f.subjectIds : ['00000000-0000-0000-0000-000000000000']) : undefined,
          f.termNumber === null ? undefined : or(isNull(kbDocuments.termNumber), eq(kbDocuments.termNumber, f.termNumber)),
        ),
      )
      .orderBy(asc(kbDocuments.week), asc(kbDocuments.createdAt));
  }

  /** The full book for one class and subject, with each note's text, ready to print. */
  book(user: Principal, classId: string, subjectId: string, termId?: string) {
    return this.dbs.withSchool(user.schoolId, async (tx) => {
      const cls = await assertTeachesSubject(tx, user, classId, subjectId);
      const [school] = await tx.select().from(schools).where(eq(schools.id, user.schoolId));
      const [section] = await tx.select().from(sections).where(eq(sections.id, cls.sectionId));
      const [subject] = await tx.select().from(subjects).where(eq(subjects.id, subjectId));
      const [link] = await tx
        .select({ teacher: staff.fullName })
        .from(classSubjects)
        .leftJoin(staff, eq(staff.id, classSubjects.teacherId))
        .where(and(eq(classSubjects.classId, classId), eq(classSubjects.subjectId, subjectId)));
      const t = await this.term(tx, termId);
      const termNumber = t?.term.number ?? null;

      const outline = this.outlineFor(await this.schemes(tx, termNumber), subjectId, cls.name);
      const docs = (await this.lessonDocs(tx, { subjectIds: [subjectId], termNumber })).filter((d) => d.classLevel === null || d.classLevel === cls.name);
      const bodies = await this.bodies(tx, docs);
      const entries = docs.map((d) => ({
        id: d.id,
        kind: d.kind as LessonBookEntry['kind'],
        title: d.title,
        week: d.week,
        createdAt: d.createdAt,
        author: d.author,
        mine: d.uploadedBy === user.staffId,
        vetted: d.vettedAt ? { by: d.vettedBy, at: d.vettedAt, comment: d.vetComment } : null,
        body: bodies.get(d.id) ?? null,
        format: d.mimeType === 'text/markdown' ? ('markdown' as const) : ('text' as const),
      }));
      const currentWeek = t?.term.isCurrent && t.term.startsOn ? weekOfTerm(t.term.startsOn, todayInLagos()) : null;
      const coverage = lessonCoverage(
        outline,
        entries.map((e) => ({ id: e.id, kind: e.kind, title: e.title, week: e.week, vetted: Boolean(e.vetted) })),
        currentWeek,
      );
      return {
        school: { name: school!.name, address: school!.address, motto: school!.motto, phone: school!.phone, email: school!.email },
        class: { id: cls.id, name: cls.name, arm: cls.arm, section: section?.name ?? null },
        subject: { id: subjectId, name: found(subject, 'Subject').name },
        teacher: link?.teacher ?? null,
        term: t ? { id: t.term.id, name: t.term.name, number: t.term.number, session: t.session, startsOn: t.term.startsOn, endsOn: t.term.endsOn } : null,
        currentWeek,
        canVet: user.role !== 'teacher',
        entries,
        coverage,
      };
    });
  }

  /** Text of each document: the Markdown the assistant saved, or the text read from an uploaded file. */
  private async bodies(tx: Tx, docs: { id: string; mimeType: string; status: string }[]) {
    const out = new Map<string, string>();
    const md = docs.filter((d) => d.mimeType === 'text/markdown' || d.mimeType === 'text/plain').map((d) => d.id);
    if (md.length) {
      for (const f of await tx.select({ id: kbFiles.documentId, data: kbFiles.data }).from(kbFiles).where(inArray(kbFiles.documentId, md))) {
        out.set(f.id, Buffer.from(f.data).toString('utf8'));
      }
    }
    const other = docs.filter((d) => !out.has(d.id) && d.status === 'ready').map((d) => d.id);
    if (other.length) {
      const chunks = await tx
        .select({ id: kbChunks.documentId, text: kbChunks.text })
        .from(kbChunks)
        .where(inArray(kbChunks.documentId, other))
        .orderBy(asc(kbChunks.documentId), asc(kbChunks.ordinal));
      for (const c of chunks) out.set(c.id, out.has(c.id) ? `${out.get(c.id)}\n\n${c.text}` : c.text);
    }
    return out;
  }

  /** For the head of school: every class and subject this term, with how many weeks have notes and how many are vetted. */
  overview(user: Principal, termId?: string) {
    return this.dbs.withSchool(user.schoolId, async (tx) => {
      const t = await this.term(tx, termId);
      const termNumber = t?.term.number ?? null;
      const currentWeek = t?.term.isCurrent && t.term.startsOn ? weekOfTerm(t.term.startsOn, todayInLagos()) : null;
      const pairs = await tx
        .select({ classId: classes.id, className: classes.name, arm: classes.arm, subjectId: subjects.id, subjectName: subjects.name, teacher: staff.fullName })
        .from(classSubjects)
        .innerJoin(classes, eq(classes.id, classSubjects.classId))
        .innerJoin(subjects, eq(subjects.id, classSubjects.subjectId))
        .leftJoin(staff, eq(staff.id, classSubjects.teacherId))
        .orderBy(asc(classes.sortOrder), asc(classes.name), asc(classes.arm), asc(subjects.name));
      const schemes = await this.schemes(tx, termNumber);
      const docs = await this.lessonDocs(tx, { termNumber });
      const rows = pairs.map((p) => {
        const mine = docs.filter((d) => d.subjectId === p.subjectId && (d.classLevel === null || d.classLevel === p.className));
        const outline = this.outlineFor(schemes, p.subjectId, p.className);
        const cov = lessonCoverage(
          outline,
          mine.map((d) => ({ id: d.id, kind: d.kind as LessonBookEntry['kind'], title: d.title, week: d.week, vetted: Boolean(d.vettedAt) })),
          currentWeek,
        );
        return {
          ...p,
          weeks: outline.length,
          notes: mine.filter((d) => d.kind === 'lesson_note').length,
          plans: mine.filter((d) => d.kind === 'lesson_plan').length,
          awaitingVetting: mine.filter((d) => !d.vettedAt).length,
          missingWeeks: cov.missingWeeks,
          percent: outline.length ? cov.percent : null,
        };
      });
      return {
        term: t ? { id: t.term.id, name: t.term.name, number: t.term.number, session: t.session } : null,
        currentWeek,
        rows,
      };
    });
  }

  /** Marks a note or plan as checked by the head of school or HOD, with an optional comment. */
  vet(user: Principal, documentId: string, comment: string | null) {
    return this.dbs.withSchool(user.schoolId, async (tx) => {
      await this.lessonDoc(tx, documentId);
      const [d] = await tx
        .update(kbDocuments)
        .set({ vettedBy: user.staffId, vettedAt: new Date(), vetComment: comment })
        .where(eq(kbDocuments.id, documentId))
        .returning({ id: kbDocuments.id, vettedAt: kbDocuments.vettedAt, vetComment: kbDocuments.vetComment });
      return d;
    });
  }

  unvet(user: Principal, documentId: string) {
    return this.dbs.withSchool(user.schoolId, async (tx) => {
      await this.lessonDoc(tx, documentId);
      await tx.update(kbDocuments).set({ vettedBy: null, vettedAt: null, vetComment: null }).where(eq(kbDocuments.id, documentId));
      return { ok: true };
    });
  }

  /** Sets the week of term a note or plan is for. Its author or leadership. */
  setWeek(user: Principal, documentId: string, week: number | null) {
    return this.dbs.withSchool(user.schoolId, async (tx) => {
      const d = await this.lessonDoc(tx, documentId);
      if (user.role === 'teacher' && d.uploadedBy !== user.staffId) throw new ForbiddenException('Only the teacher who added this note can change its week');
      await tx.update(kbDocuments).set({ week }).where(eq(kbDocuments.id, documentId));
      return { id: documentId, week };
    });
  }

  private async lessonDoc(tx: Tx, documentId: string) {
    const [d] = await tx.select().from(kbDocuments).where(eq(kbDocuments.id, documentId));
    found(d, 'Lesson note');
    if (!(LESSON_KINDS as readonly string[]).includes(d.kind)) throw new BadRequestException('Only lesson notes and plans can be vetted');
    return d;
  }
}
