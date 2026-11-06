import { Injectable } from '@nestjs/common';
import {
  absenceStreak,
  ClassTopicStat,
  CohortForecast,
  EXAM_FORMATS,
  ExamCode,
  estimateReadiness,
  examsForSection,
  meetsBenchmark,
  Readiness,
  ReadinessInput,
  Risk,
  riskReasons,
  SectionKindCode,
  subjectTotal,
  summariseCohort,
  topicsToReteach,
} from '@school-ms/core';
import { and, eq, gte, inArray, isNotNull } from 'drizzle-orm';
import { todayInLagos } from '../common/access';
import { Tx } from '../db/client';
import { DbService } from '../db/db.service';
import {
  academicSessions,
  attendanceRecords,
  cbtAttempts,
  classes,
  classSubjects,
  examGoals,
  questions,
  resultPublications,
  scores,
  sections,
  staff,
  students,
  subjects,
  terms,
  tutorConversations,
  tutorMessages,
} from '../db/schema';

export interface ForecastClass {
  id: string;
  name: string;
  arm: string;
  label: string;
  sectionKind: SectionKindCode;
  formTeacherId: string | null;
  forecast: CohortForecast;
}

export interface StudentForecast {
  studentId: string;
  name: string;
  firstName: string;
  admissionNumber: string;
  classId: string;
  className: string;
  readiness: Readiness;
  meetsBenchmark: boolean | null;
  attendanceRate: number | null;
  consecutiveAbsences: number;
  scoreDrop: number | null;
  risks: Risk[];
  /** Topics this student keeps getting wrong in practice (accuracy under 50%, three or more answers). */
  weakTopics: { subjectId: string; subjectName: string; topic: string; accuracy: number }[];
}

export interface TeacherForecast {
  teacherId: string;
  teacherName: string;
  subjectId: string;
  subjectName: string;
  classIds: string[];
  classes: string[];
  students: number;
  average: number | null;
  creditRate: number | null;
}

export interface SchoolForecast {
  exam: ExamCode;
  examName: string;
  generatedAt: string;
  classes: ForecastClass[];
  students: StudentForecast[];
  teachers: TeacherForecast[];
  topicStats: Record<string, ClassTopicStat[]>;
}

type Question = { id: string; subjectId: string; topic: string; answer: string };

const DEFAULT_TTL_MS = 2 * 60 * 1000;
const label = (name: string, arm: string | null) => (arm ? `${name} ${arm}` : name);

function addDays(iso: string, days: number) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Exam readiness forecasts for whole classes and the school (phase 3 insights). Uses the same
 * evidence and formula as the student's own Exam Prep page (released school results, mocks,
 * practice and tutor quizzes), so a parent, teacher and student always see the same prediction.
 * School-wide results are cached for two minutes because the live dashboard asks often.
 */
@Injectable()
export class InsightsService {
  private readonly cache = new Map<string, { at: number; value: Promise<SchoolForecast> }>();
  ttlMs = DEFAULT_TTL_MS;

  constructor(private readonly dbs: DbService) {}

  /** Exams this school's sections prepare for, and the one to show first. */
  async examsFor(tx: Tx): Promise<{ exams: ExamCode[]; defaultExam: ExamCode | null }> {
    const kinds = await tx.selectDistinct({ kind: sections.kind }).from(sections);
    const exams = (['waec', 'neco', 'jamb', 'bece'] as ExamCode[]).filter((e) => kinds.some((k) => examsForSection(k.kind).includes(e)));
    return { exams, defaultExam: exams[0] ?? null };
  }

  /** The whole school's forecast for one exam, cached briefly. */
  school(schoolId: string, exam: ExamCode, opts: { fresh?: boolean } = {}): Promise<SchoolForecast> {
    const key = `${schoolId}:${exam}`;
    const hit = this.cache.get(key);
    if (!opts.fresh && hit && Date.now() - hit.at < this.ttlMs) return hit.value;
    const value = this.dbs.withSchool(schoolId, (tx) => this.compute(tx, exam, {}));
    this.cache.set(key, { at: Date.now(), value });
    value.catch(() => this.cache.delete(key));
    return value;
  }

  /** Drops cached forecasts, e.g. after results are published. */
  invalidate(schoolId: string) {
    for (const key of this.cache.keys()) if (key.startsWith(`${schoolId}:`)) this.cache.delete(key);
  }

  /**
   * Forecasts for every student in the classes whose section sits `exam`, or only the given
   * students. Loads all evidence in a handful of queries rather than one set per student.
   */
  async compute(tx: Tx, exam: ExamCode, filter: { studentIds?: string[] }): Promise<SchoolForecast> {
    const today = todayInLagos();
    const kinds = EXAM_FORMATS[exam].sections;
    const classRows = await tx
      .select({
        id: classes.id,
        name: classes.name,
        arm: classes.arm,
        formTeacherId: classes.formTeacherId,
        sectionKind: sections.kind,
        components: sections.components,
      })
      .from(classes)
      .innerJoin(sections, eq(sections.id, classes.sectionId))
      .where(inArray(sections.kind, kinds))
      .orderBy(sections.sortOrder, classes.sortOrder, classes.name, classes.arm);
    const classIds = classRows.map((c) => c.id);
    const empty: SchoolForecast = { exam, examName: EXAM_FORMATS[exam].name, generatedAt: new Date().toISOString(), classes: [], students: [], teachers: [], topicStats: {} };
    if (!classIds.length || filter.studentIds?.length === 0) return empty;

    const studentRows = await tx
      .select({ id: students.id, firstName: students.firstName, lastName: students.lastName, admissionNumber: students.admissionNumber, classId: students.classId })
      .from(students)
      .where(filter.studentIds ? and(inArray(students.classId, classIds), inArray(students.id, filter.studentIds)) : inArray(students.classId, classIds))
      .orderBy(students.lastName, students.firstName);
    const ids = studentRows.map((s) => s.id);

    const links = await tx
      .select({ classId: classSubjects.classId, subjectId: subjects.id, subjectName: subjects.name, code: subjects.code, teacherId: classSubjects.teacherId, teacherName: staff.fullName })
      .from(classSubjects)
      .innerJoin(subjects, eq(subjects.id, classSubjects.subjectId))
      .leftJoin(staff, eq(staff.id, classSubjects.teacherId))
      .where(inArray(classSubjects.classId, classIds))
      .orderBy(subjects.name);
    const subjectsByClass = new Map<string, typeof links>();
    for (const l of links) subjectsByClass.set(l.classId, [...(subjectsByClass.get(l.classId) ?? []), l]);
    const subjectRefs = new Map(links.map((l) => [l.subjectId, { id: l.subjectId, name: l.subjectName, code: l.code }]));

    const goals = ids.length
      ? await tx.select({ studentId: examGoals.studentId, subjectIds: examGoals.subjectIds }).from(examGoals).where(and(eq(examGoals.exam, exam), inArray(examGoals.studentId, ids)))
      : [];
    const goalSubjects = new Map(goals.map((g) => [g.studentId, g.subjectIds]));

    // Released school results: the latest term per subject, and each term's average for the trend.
    const released = ids.length
      ? await tx
          .select({
            studentId: scores.studentId,
            subjectId: scores.subjectId,
            scores: scores.scores,
            components: sections.components,
            sessionName: academicSessions.name,
            termNumber: terms.number,
          })
          .from(scores)
          .innerJoin(resultPublications, and(eq(resultPublications.termId, scores.termId), eq(resultPublications.classId, scores.classId)))
          .innerJoin(terms, eq(terms.id, scores.termId))
          .innerJoin(academicSessions, eq(academicSessions.id, terms.sessionId))
          .innerJoin(classes, eq(classes.id, scores.classId))
          .innerJoin(sections, eq(sections.id, classes.sectionId))
          .where(inArray(scores.studentId, ids))
      : [];
    const latestScore = new Map<string, { order: number; total: number }>();
    const termTotals = new Map<string, Map<number, number[]>>();
    for (const r of released) {
      let total: number;
      try {
        total = subjectTotal(r.scores, r.components);
      } catch {
        continue; // Scores entered under an older split; left out, as on the student's own page.
      }
      const order = Number(r.sessionName.slice(0, 4)) * 10 + r.termNumber;
      const key = `${r.studentId}:${r.subjectId}`;
      const prev = latestScore.get(key);
      if (!prev || order > prev.order) latestScore.set(key, { order, total });
      const byTerm = termTotals.get(r.studentId) ?? new Map<number, number[]>();
      byTerm.set(order, [...(byTerm.get(order) ?? []), total]);
      termTotals.set(r.studentId, byTerm);
    }

    // CBT tests, practice and mocks: per question, so mocks can be split by subject (JAMB has four).
    const attempts = ids.length
      ? await tx
          .select({ studentId: cbtAttempts.studentId, kind: cbtAttempts.kind, questionIds: cbtAttempts.questionIds, answers: cbtAttempts.answers, submittedAt: cbtAttempts.submittedAt })
          .from(cbtAttempts)
          .where(and(inArray(cbtAttempts.studentId, ids), isNotNull(cbtAttempts.submittedAt)))
          .orderBy(cbtAttempts.submittedAt)
      : [];
    const qIds = [...new Set(attempts.flatMap((a) => a.questionIds))];
    const qById = new Map<string, Question>();
    for (let i = 0; i < qIds.length; i += 5000) {
      const rows = await tx
        .select({ id: questions.id, subjectId: questions.subjectId, topic: questions.topic, answer: questions.answer })
        .from(questions)
        .where(inArray(questions.id, qIds.slice(i, i + 5000)));
      for (const q of rows) qById.set(q.id, q);
    }
    const quizzes = ids.length
      ? await tx
          .select({ studentId: tutorConversations.studentId, subjectId: tutorConversations.subjectId, topic: tutorConversations.topic, correct: tutorMessages.quizCorrect })
          .from(tutorMessages)
          .innerJoin(tutorConversations, eq(tutorConversations.id, tutorMessages.conversationId))
          .where(and(inArray(tutorConversations.studentId, ids), isNotNull(tutorMessages.quizAnswer), isNotNull(tutorConversations.topic)))
      : [];

    // studentId -> subjectId -> topic -> [attempted, correct]
    const practice = new Map<string, Map<string, Map<string, [number, number]>>>();
    const mocks = new Map<string, Map<string, number[]>>();
    const tally = (studentId: string, subjectId: string, topic: string, ok: boolean) => {
      const bySubject = practice.get(studentId) ?? new Map();
      const byTopic = bySubject.get(subjectId) ?? new Map();
      const t = byTopic.get(topic) ?? [0, 0];
      t[0]++;
      if (ok) t[1]++;
      byTopic.set(topic, t);
      bySubject.set(subjectId, byTopic);
      practice.set(studentId, bySubject);
    };
    for (const a of attempts) {
      const mockTally = new Map<string, [number, number]>();
      for (const qid of a.questionIds) {
        const q = qById.get(qid);
        if (!q) continue;
        const ok = a.answers[qid] === q.answer;
        tally(a.studentId, q.subjectId, q.topic, ok);
        if (a.kind === 'mock') {
          const m = mockTally.get(q.subjectId) ?? [0, 0];
          m[0]++;
          if (ok) m[1]++;
          mockTally.set(q.subjectId, m);
        }
      }
      for (const [subjectId, [n, ok]] of mockTally) {
        const bySubject = mocks.get(a.studentId) ?? new Map<string, number[]>();
        bySubject.set(subjectId, [...(bySubject.get(subjectId) ?? []), Math.round((ok / n) * 100)]);
        mocks.set(a.studentId, bySubject);
      }
    }
    for (const qz of quizzes) tally(qz.studentId, qz.subjectId, qz.topic!, Boolean(qz.correct));

    // Registers from the last three weeks: the rate over the last ten marked days, and any absence run.
    const registers = ids.length
      ? await tx
          .select({ studentId: attendanceRecords.studentId, date: attendanceRecords.date, status: attendanceRecords.status })
          .from(attendanceRecords)
          .where(and(inArray(attendanceRecords.studentId, ids), gte(attendanceRecords.date, addDays(today, -21))))
      : [];
    const statuses = new Map<string, { date: string; status: string }[]>();
    for (const r of registers) statuses.set(r.studentId, [...(statuses.get(r.studentId) ?? []), r]);

    const classById = new Map(classRows.map((c) => [c.id, c]));
    const studentsOut: StudentForecast[] = [];
    for (const s of studentRows) {
      const cls = classById.get(s.classId!)!;
      const offered = subjectsByClass.get(cls.id) ?? [];
      const wanted = goalSubjects.get(s.id);
      const chosen = wanted?.length ? offered.filter((o) => wanted.includes(o.subjectId)) : offered;
      const bySubject = practice.get(s.id);
      const inputs: ReadinessInput[] = chosen.map((o) => {
        const topics = [...(bySubject?.get(o.subjectId)?.values() ?? [])];
        const answered = topics.reduce((a, [n]) => a + n, 0);
        return {
          subjectId: o.subjectId,
          subjectName: o.subjectName,
          schoolScore: latestScore.get(`${s.id}:${o.subjectId}`)?.total ?? null,
          mockScores: mocks.get(s.id)?.get(o.subjectId) ?? [],
          practiceAccuracy: answered ? Math.round((topics.reduce((a, [, c]) => a + c, 0) / answered) * 100) : null,
          practiceAnswered: answered,
        };
      });
      const readiness = estimateReadiness(exam, inputs);

      const marks = (statuses.get(s.id) ?? []).sort((a, b) => b.date.localeCompare(a.date));
      const recent = marks.slice(0, 10).filter((m) => m.status !== 'excused');
      const attendanceRate = recent.length >= 3 ? Math.round((recent.filter((m) => m.status !== 'absent').length / recent.length) * 100) : null;
      const consecutiveAbsences = absenceStreak(marks.map((m) => m.status));

      const byTerm = [...(termTotals.get(s.id)?.entries() ?? [])].sort((a, b) => b[0] - a[0]);
      const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
      const scoreDrop = byTerm.length >= 2 ? Math.round((mean(byTerm[1][1]) - mean(byTerm[0][1])) * 10) / 10 : null;

      const weakTopics = [];
      for (const o of offered) {
        for (const [topic, [n, ok]] of bySubject?.get(o.subjectId) ?? []) {
          const accuracy = Math.round((ok / n) * 100);
          if (n >= 3 && accuracy < 50) weakTopics.push({ subjectId: o.subjectId, subjectName: o.subjectName, topic, accuracy });
        }
      }
      weakTopics.sort((a, b) => a.accuracy - b.accuracy);

      studentsOut.push({
        studentId: s.id,
        name: `${s.firstName} ${s.lastName}`,
        firstName: s.firstName,
        admissionNumber: s.admissionNumber,
        classId: cls.id,
        className: label(cls.name, cls.arm),
        readiness,
        meetsBenchmark: meetsBenchmark(exam, readiness, chosen.map((o) => subjectRefs.get(o.subjectId)!)),
        attendanceRate,
        consecutiveAbsences,
        scoreDrop,
        risks: riskReasons({
          attendanceRate,
          consecutiveAbsences,
          readinessBand: readiness.overall === null ? null : readiness.band,
          scoreDrop,
          subjectsAtRisk: readiness.subjects.filter((x) => x.predicted !== null && x.predicted < 50).length,
        }),
        weakTopics: weakTopics.slice(0, 6),
      });
    }

    // Class topic accuracy, for "what to reteach".
    const topicStats: Record<string, ClassTopicStat[]> = {};
    for (const cls of classRows) {
      const agg = new Map<string, ClassTopicStat & { who: Set<string> }>();
      for (const s of studentsOut.filter((x) => x.classId === cls.id)) {
        for (const o of subjectsByClass.get(cls.id) ?? []) {
          for (const [topic, [n, ok]] of practice.get(s.studentId)?.get(o.subjectId) ?? []) {
            const key = `${o.subjectId}::${topic}`;
            const t = agg.get(key) ?? { subjectId: o.subjectId, subjectName: o.subjectName, topic, attempted: 0, correct: 0, students: 0, who: new Set() };
            t.attempted += n;
            t.correct += ok;
            t.who.add(s.studentId);
            t.students = t.who.size;
            agg.set(key, t);
          }
        }
      }
      topicStats[cls.id] = [...agg.values()].map(({ who: _who, ...rest }) => rest);
    }

    const classesOut: ForecastClass[] = classRows
      .filter((c) => !filter.studentIds || studentsOut.some((s) => s.classId === c.id))
      .map((c) => ({
        id: c.id,
        name: c.name,
        arm: c.arm,
        label: label(c.name, c.arm),
        sectionKind: c.sectionKind,
        formTeacherId: c.formTeacherId,
        forecast: summariseCohort(exam, studentsOut.filter((s) => s.classId === c.id)),
      }));

    // Each teacher's subject across the classes they take it in.
    const teacherMap = new Map<string, TeacherForecast & { values: number[] }>();
    for (const l of links) {
      if (!l.teacherId) continue;
      const key = `${l.teacherId}:${l.subjectId}`;
      const t = teacherMap.get(key) ?? {
        teacherId: l.teacherId,
        teacherName: l.teacherName ?? 'Teacher',
        subjectId: l.subjectId,
        subjectName: l.subjectName,
        classIds: [],
        classes: [],
        students: 0,
        average: null,
        creditRate: null,
        values: [],
      };
      const cls = classById.get(l.classId)!;
      t.classIds.push(cls.id);
      t.classes.push(label(cls.name, cls.arm));
      for (const s of studentsOut.filter((x) => x.classId === cls.id)) {
        const p = s.readiness.subjects.find((x) => x.subjectId === l.subjectId)?.predicted;
        if (p !== null && p !== undefined) t.values.push(p);
      }
      teacherMap.set(key, t);
    }
    const teachers = [...teacherMap.values()]
      .map(({ values, ...t }) => ({
        ...t,
        students: values.length,
        average: values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : null,
        creditRate: values.length ? Math.round((values.filter((v) => v >= 50).length / values.length) * 100) : null,
      }))
      .sort((a, b) => a.subjectName.localeCompare(b.subjectName) || (b.average ?? -1) - (a.average ?? -1));

    return { ...empty, classes: classesOut, students: studentsOut, teachers, topicStats };
  }

  /** Re-exported so callers can build cohort summaries over any subset of students. */
  static summarise(exam: ExamCode, rows: StudentForecast[]) {
    return summariseCohort(exam, rows);
  }

  static reteach(stats: ClassTopicStat[]) {
    return topicsToReteach(stats);
  }
}
