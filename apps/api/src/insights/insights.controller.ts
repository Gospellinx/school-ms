import { BadRequestException, Controller, Get, Param, Query } from '@nestjs/common';
import { describeForecastForParent, EXAM_BENCHMARKS, ExamCode, examsForSection, summariseCohort, topicsToReteach } from '@school-ms/core';
import { and, asc, eq, inArray, or } from 'drizzle-orm';
import { z } from 'zod';
import { ParentPrincipal, Principal } from '../auth/auth.types';
import { CurrentUser, ForAudience } from '../auth/decorators';
import { assertTeachesClass } from '../common/access';
import { parse, uuidParam } from '../common/validation';
import { Tx } from '../db/client';
import { DbService } from '../db/db.service';
import { classes, classSubjects, examGoals, sections, studentGuardians, students } from '../db/schema';
import { InsightsService, StudentForecast } from './insights.service';

const examParam = z.enum(['waec', 'neco', 'jamb', 'bece']).optional();
/** Exams a section sits, the main one first (WAEC before NECO and JAMB). */
const EXAM_ORDER: ExamCode[] = ['waec', 'neco', 'jamb', 'bece'];
const examsFor = (kind: Parameters<typeof examsForSection>[0]) => EXAM_ORDER.filter((e) => examsForSection(kind).includes(e));

/** Classes a teacher forms or takes a subject in. */
async function teacherClassIds(tx: Tx, staffId: string): Promise<string[]> {
  const rows = await tx
    .selectDistinct({ id: classes.id })
    .from(classes)
    .leftJoin(classSubjects, eq(classSubjects.classId, classes.id))
    .where(or(eq(classes.formTeacherId, staffId), eq(classSubjects.teacherId, staffId)));
  return rows.map((r) => r.id);
}

const studentView = (s: StudentForecast) => ({
  studentId: s.studentId,
  name: s.name,
  admissionNumber: s.admissionNumber,
  classId: s.classId,
  className: s.className,
  overall: s.readiness.overall,
  band: s.readiness.band,
  creditsLikely: s.readiness.creditsLikely,
  jambAggregate: s.readiness.jambAggregate,
  subjects: s.readiness.subjects,
  meetsBenchmark: s.meetsBenchmark,
  attendanceRate: s.attendanceRate,
  consecutiveAbsences: s.consecutiveAbsences,
  scoreDrop: s.scoreDrop,
  risks: s.risks,
  weakTopics: s.weakTopics,
});

const riskOrder = (s: StudentForecast) => s.risks.filter((r) => r.severity === 'high').length * 10 + s.risks.length;

/**
 * Exam forecasts (WAEC, NECO, JAMB, BECE) for the proprietor and teachers: the school and each
 * class, subject and teacher, plus students who need attention. Teachers see only their classes.
 */
@Controller('insights')
export class InsightsController {
  constructor(
    private readonly dbs: DbService,
    private readonly insights: InsightsService,
  ) {}

  @Get('forecast')
  async forecast(@CurrentUser() u: Principal, @Query('exam') examQ?: string, @Query('fresh') fresh?: string) {
    const requested = parse(examParam, examQ || undefined);
    const { exams, defaultExam, visible } = await this.dbs.withSchool(u.schoolId, async (tx) => ({
      ...(await this.insights.examsFor(tx)),
      visible: u.role === 'teacher' ? new Set(await teacherClassIds(tx, u.staffId)) : null,
    }));
    const exam = requested ?? defaultExam;
    if (!exam) return { exams, exam: null, classes: [], students: 0 };
    if (!exams.includes(exam)) throw new BadRequestException('No section in this school sits that exam');

    const f = await this.insights.school(u.schoolId, exam, { fresh: fresh === '1' });
    const classesInView = visible ? f.classes.filter((c) => visible.has(c.id)) : f.classes;
    const studentsInView = visible ? f.students.filter((s) => visible.has(s.classId)) : f.students;
    const teachers = u.role === 'teacher' ? f.teachers.filter((t) => t.teacherId === u.staffId) : f.teachers;
    const summary = summariseCohort(exam, studentsInView);
    return {
      exams,
      exam,
      examName: f.examName,
      benchmark: EXAM_BENCHMARKS[exam].label,
      generatedAt: f.generatedAt,
      scope: visible ? 'teacher' : 'school',
      summary,
      classes: classesInView.map((c) => ({ id: c.id, label: c.label, sectionKind: c.sectionKind, forecast: c.forecast })),
      teachers,
      atRisk: studentsInView
        .filter((s) => s.risks.length)
        .sort((a, b) => riskOrder(b) - riskOrder(a) || (a.readiness.overall ?? 101) - (b.readiness.overall ?? 101))
        .slice(0, 30)
        .map(studentView),
    };
  }

  @Get('forecast/classes/:classId')
  async classForecast(@CurrentUser() u: Principal, @Param('classId') id: string, @Query('exam') examQ?: string) {
    const classId = parse(uuidParam, id);
    const requested = parse(examParam, examQ || undefined);
    const { kind } = await this.dbs.withSchool(u.schoolId, async (tx) => {
      await assertTeachesClass(tx, u, classId);
      const [row] = await tx.select({ kind: sections.kind }).from(classes).innerJoin(sections, eq(sections.id, classes.sectionId)).where(eq(classes.id, classId));
      return row;
    });
    const options = examsFor(kind);
    if (!options.length) throw new BadRequestException('This class does not prepare for an external exam');
    const exam = requested ?? options[0];
    if (!options.includes(exam)) throw new BadRequestException('This class does not sit that exam');

    const f = await this.insights.school(u.schoolId, exam);
    const cls = f.classes.find((c) => c.id === classId)!;
    const rows = f.students.filter((s) => s.classId === classId);
    return {
      exams: options,
      exam,
      examName: f.examName,
      benchmark: EXAM_BENCHMARKS[exam].label,
      generatedAt: f.generatedAt,
      class: { id: cls.id, label: cls.label },
      forecast: cls.forecast,
      students: rows.sort((a, b) => (a.readiness.overall ?? 101) - (b.readiness.overall ?? 101)).map(studentView),
      reteach: topicsToReteach(f.topicStats[classId] ?? []),
    };
  }
}

/** Each child's exam forecast in plain words, for the parent portal. */
@ForAudience('parent')
@Controller('parent/forecast')
export class ParentForecastController {
  constructor(
    private readonly dbs: DbService,
    private readonly insights: InsightsService,
  ) {}

  @Get()
  get(@CurrentUser() p: ParentPrincipal) {
    return this.dbs.withSchool(p.schoolId, async (tx) => {
      const children = await tx
        .select({ id: students.id, firstName: students.firstName, lastName: students.lastName, kind: sections.kind, className: classes.name, arm: classes.arm })
        .from(studentGuardians)
        .innerJoin(students, eq(students.id, studentGuardians.studentId))
        .leftJoin(classes, eq(classes.id, students.classId))
        .leftJoin(sections, eq(sections.id, classes.sectionId))
        .where(eq(studentGuardians.guardianId, p.guardianId))
        .orderBy(asc(students.firstName));
      const ids = children.map((c) => c.id);
      const goals = ids.length ? await tx.select({ studentId: examGoals.studentId, exam: examGoals.exam }).from(examGoals).where(and(inArray(examGoals.studentId, ids))) : [];
      const out = [];
      for (const c of children) {
        const options = examsFor(c.kind);
        // WAEC (or BECE) always; JAMB and NECO only once the child has set them as a goal.
        const chosen = options.filter((e, i) => i === 0 || goals.some((g) => g.studentId === c.id && g.exam === e));
        const exams = [];
        for (const exam of chosen as ExamCode[]) {
          const f = await this.insights.compute(tx, exam, { studentIds: [c.id] });
          const s = f.students[0];
          if (!s) continue;
          exams.push({
            exam,
            examName: f.examName,
            benchmark: EXAM_BENCHMARKS[exam].label,
            overall: s.readiness.overall,
            band: s.readiness.band,
            creditsLikely: s.readiness.creditsLikely,
            jambAggregate: s.readiness.jambAggregate,
            meetsBenchmark: s.meetsBenchmark,
            subjects: s.readiness.subjects,
            weakTopics: s.weakTopics,
            text: describeForecastForParent(c.firstName, exam, s.readiness, s.weakTopics),
          });
        }
        out.push({ studentId: c.id, name: `${c.firstName} ${c.lastName}`, className: c.className ? [c.className, c.arm].filter(Boolean).join(' ') : null, exams });
      }
      return { children: out };
    });
  }
}
