import { Controller, Get } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { Principal } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators';
import { todayInLagos } from '../common/access';
import { Tx } from '../db/client';
import { DbService } from '../db/db.service';

type Row = Record<string, unknown>;

const num = (v: unknown) => Number(v ?? 0);

async function rows(tx: Tx, q: ReturnType<typeof sql>): Promise<Row[]> {
  return (await tx.execute(q)).rows as Row[];
}

/**
 * Headline numbers for the staff dashboards. Leadership sees the whole school; a teacher sees
 * the classes and subjects they take. Everything is counted inside the school's RLS scope.
 */
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dbs: DbService) {}

  @Get()
  get(@CurrentUser() u: Principal) {
    const today = todayInLagos();
    return this.dbs.withSchool(u.schoolId, async (tx) => {
      const [term] = await rows(
        tx,
        sql`select t.id, t.name, t.starts_on as "startsOn", t.ends_on as "endsOn", s.name as "sessionName"
            from terms t join academic_sessions s on s.id = t.session_id where t.is_current limit 1`,
      );
      const termId = (term?.id as string | undefined) ?? null;

      // Classes in view: all for leadership, the teacher's own otherwise.
      const teacherFilter =
        u.role === 'teacher'
          ? sql`and (c.form_teacher_id = ${u.staffId} or exists (select 1 from class_subjects cs where cs.class_id = c.id and cs.teacher_id = ${u.staffId}))`
          : sql``;
      const classRows = await rows(
        tx,
        sql`select c.id, c.name, c.arm, sec.name as "section", sec.kind as "sectionKind", c.form_teacher_id as "formTeacherId",
                   (select count(*)::int from students st where st.class_id = c.id) as students,
                   (select count(*)::int from attendance_records a where a.class_id = c.id and a.date = ${today}) as "markedToday",
                   (select count(*)::int from attendance_records a where a.class_id = c.id and a.date = ${today} and a.status in ('present','late')) as "presentToday"
            from classes c join sections sec on sec.id = c.section_id
            where true ${teacherFilter}
            order by sec.sort_order, c.sort_order, c.name, c.arm`,
      );

      // Last 10 days with any register taken, for the attendance trend chart.
      const classIds = classRows.map((c) => c.id as string);
      const trend = classIds.length
        ? await rows(
            tx,
            sql`select a.date::text as date, count(*)::int as marked, count(*) filter (where a.status in ('present','late'))::int as present
                from attendance_records a where a.class_id in (${sql.join(classIds.map((id) => sql`${id}`), sql`, `)})
                group by a.date order by a.date desc limit 10`,
          )
        : [];

      // Score sheets: for each class subject in view, how many students have scores this term.
      const sheetFilter = u.role === 'teacher' ? sql`and cs.teacher_id = ${u.staffId}` : sql``;
      const sheets = termId
        ? await rows(
            tx,
            sql`select c.id as "classId", c.name as "className", c.arm, sub.id as "subjectId", sub.name as "subjectName",
                       (select count(*)::int from students st where st.class_id = c.id) as students,
                       (select count(*)::int from scores sc where sc.term_id = ${termId} and sc.class_id = c.id and sc.subject_id = sub.id) as entered
                from class_subjects cs join classes c on c.id = cs.class_id join subjects sub on sub.id = cs.subject_id
                where true ${sheetFilter}
                order by c.sort_order, c.name, c.arm, sub.name`,
          )
        : [];

      const base = {
        today,
        role: u.role,
        currentTerm: term
          ? { id: termId, name: term.name, sessionName: term.sessionName, startsOn: term.startsOn, endsOn: term.endsOn }
          : null,
        classes: classRows.map((c) => ({
          id: c.id,
          name: c.name,
          arm: c.arm,
          section: c.section,
          sectionKind: c.sectionKind,
          isFormClass: c.formTeacherId === u.staffId,
          students: num(c.students),
          markedToday: num(c.markedToday),
          presentToday: num(c.presentToday),
        })),
        attendanceTrend: trend
          .map((t) => ({ date: t.date as string, marked: num(t.marked), present: num(t.present) }))
          .reverse(),
        scoreSheets: sheets.map((s) => ({
          classId: s.classId,
          className: s.arm ? `${s.className} ${s.arm}` : s.className,
          subjectId: s.subjectId,
          subjectName: s.subjectName,
          students: num(s.students),
          entered: num(s.entered),
        })),
      };

      const [cbt] = await rows(
        tx,
        sql`select count(*) filter (where status = 'published')::int as open, count(*)::int as total from cbt_tests
            where ${u.role === 'teacher' ? sql`created_by = ${u.staffId}` : sql`true`}`,
      );

      if (u.role === 'teacher') return { ...base, cbt: { open: num(cbt?.open), total: num(cbt?.total) } };

      const [counts] = await rows(
        tx,
        sql`select (select count(*)::int from students where class_id is not null) as students,
                   (select count(*)::int from students where class_id is not null and gender = 'female') as girls,
                   (select count(*)::int from students where class_id is not null and gender = 'male') as boys,
                   (select count(*)::int from staff) as staff,
                   (select count(*)::int from staff where role = 'teacher') as teachers,
                   (select count(*)::int from guardians) as parents,
                   (select count(*)::int from questions) as questions`,
      );
      const [fees] = termId
        ? await rows(
            tx,
            sql`select coalesce(sum(total_kobo),0)::bigint as expected, coalesce(sum(paid_kobo),0)::bigint as collected,
                       count(*) filter (where status <> 'paid')::int as owing
                from invoices where term_id = ${termId}`,
          )
        : [];
      const [published] = termId
        ? await rows(tx, sql`select count(*)::int as n from result_publications where term_id = ${termId}`)
        : [];
      const messages = await rows(
        tx,
        sql`select id, kind, channel, body, status, created_at as "createdAt" from notifications order by created_at desc limit 6`,
      );

      return {
        ...base,
        cbt: { open: num(cbt?.open), total: num(cbt?.total) },
        counts: {
          students: num(counts.students),
          girls: num(counts.girls),
          boys: num(counts.boys),
          staff: num(counts.staff),
          teachers: num(counts.teachers),
          parents: num(counts.parents),
          questions: num(counts.questions),
        },
        fees: fees
          ? { expectedKobo: num(fees.expected), collectedKobo: num(fees.collected), invoicesOwing: num(fees.owing) }
          : null,
        resultsPublished: num(published?.n),
        recentMessages: messages,
      };
    });
  }
}
