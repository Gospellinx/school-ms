import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { absenceStreak, ExamCode, formatNaira } from '@school-ms/core';
import { sql } from 'drizzle-orm';
import { Client } from 'pg';
import { filter, Observable, Subject } from 'rxjs';
import { Principal } from '../auth/auth.types';
import { todayInLagos } from '../common/access';
import { config } from '../common/config';
import { databaseUrl, Tx } from '../db/client';
import { DbService } from '../db/db.service';
import { InsightsService } from '../insights/insights.service';
import { AiService } from '../prep/ai.service';

/** A change in one school, as sent by the database triggers in migration 0009. */
export interface LiveChange {
  schoolId: string;
  table: string;
}

type Row = Record<string, unknown>;
const num = (v: unknown) => Number(v ?? 0);
const label = (name: unknown, arm: unknown) => [name, arm].filter(Boolean).join(' ');

export interface LiveAlert {
  id: string;
  severity: 'high' | 'medium' | 'info';
  kind: string;
  title: string;
  detail: string;
  href?: string;
}

export interface LiveActivity {
  id: string;
  at: string;
  kind: 'attendance' | 'payment' | 'cbt' | 'safety' | 'results';
  text: string;
  tone: 'good' | 'bad' | 'neutral';
}

const dayStart = sql`(date_trunc('day', now() at time zone 'Africa/Lagos') at time zone 'Africa/Lagos')`;
const EXAM_LABEL: Record<string, string> = { waec: 'WAEC', neco: 'NECO', jamb: 'JAMB', bece: 'BECE' };
/** After this hour (Lagos time) on a school day, a class with no register is flagged. */
const REGISTER_DUE_HOUR = 9;

async function rows(tx: Tx, q: ReturnType<typeof sql>): Promise<Row[]> {
  return (await tx.execute(q)).rows as Row[];
}

/**
 * Real-time monitoring. One Postgres connection per API server LISTENs for changes the database
 * triggers announce (attendance, payments, CBT, AI usage, safety flags) and fans them out to the
 * dashboards streaming from this server. Works the same with several API servers behind a load
 * balancer, because every server hears every change. `snapshot` builds what a dashboard shows.
 */
@Injectable()
export class LiveService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(LiveService.name);
  private readonly changes = new Subject<LiveChange>();
  private client: Client | null = null;
  private closing = false;
  private retryMs = 1000;
  /** Resolves once the server is listening; tests wait on it. */
  ready: Promise<void> = Promise.resolve();

  constructor(
    private readonly dbs: DbService,
    private readonly insights: InsightsService,
    private readonly ai: AiService,
  ) {}

  onModuleInit() {
    if (process.env.LIVE_LISTEN === '0') return;
    this.ready = this.connect();
  }

  async onModuleDestroy() {
    this.closing = true;
    this.changes.complete();
    await this.client?.end().catch(() => undefined);
  }

  private async connect(): Promise<void> {
    const client = new Client({ connectionString: databaseUrl() });
    client.on('notification', (msg) => {
      try {
        const p = JSON.parse(msg.payload ?? '{}') as { s?: string; t?: string };
        if (p.s && p.t) this.publish({ schoolId: p.s, table: p.t });
      } catch {
        // Not ours; ignore.
      }
    });
    const retry = () => {
      if (this.closing || this.client !== client) return;
      this.client = null;
      client.end().catch(() => undefined);
      setTimeout(() => {
        if (!this.closing) this.ready = this.connect();
      }, this.retryMs).unref();
      this.retryMs = Math.min(this.retryMs * 2, 30_000);
    };
    client.on('error', (err) => {
      this.log.warn(`Live updates connection lost: ${err.message}`);
      retry();
    });
    client.on('end', retry);
    this.client = client;
    try {
      await client.connect();
      await client.query('LISTEN linx_live');
      this.retryMs = 1000;
    } catch (err) {
      this.log.warn(`Live updates unavailable, retrying: ${(err as Error).message}`);
      retry();
    }
  }

  /** Announce a change by hand (also used by tests). Database triggers cover normal writes. */
  publish(change: LiveChange) {
    this.changes.next(change);
    if (change.table === 'result_publications' || change.table === 'cbt_attempts') this.insights.invalidate(change.schoolId);
  }

  forSchool(schoolId: string): Observable<LiveChange> {
    return this.changes.pipe(filter((c) => c.schoolId === schoolId));
  }

  // ------------------------------------------------------------ Snapshot

  /** Everything a live dashboard shows, scoped like the rest of the app: teachers see their own classes. */
  async snapshot(u: Principal) {
    const leadership = u.role !== 'teacher';
    const today = todayInLagos();
    const lagosHour = (new Date().getUTCHours() + 1) % 24;
    const weekday = new Date(`${today}T12:00:00Z`).getUTCDay();
    const schoolDay = weekday >= 1 && weekday <= 5;

    const base = await this.dbs.withSchool(u.schoolId, async (tx) => {
      const mine = leadership
        ? null
        : (
            await rows(
              tx,
              sql`select distinct c.id from classes c left join class_subjects cs on cs.class_id = c.id
                  where c.form_teacher_id = ${u.staffId} or cs.teacher_id = ${u.staffId}`,
            )
          ).map((r) => r.id as string);
      const inClasses = (col: ReturnType<typeof sql>) =>
        mine === null ? sql`true` : mine.length ? sql`${col} in (${sql.join(mine.map((id) => sql`${id}`), sql`, `)})` : sql`false`;

      // Today's registers, class by class.
      const attendance = await rows(
        tx,
        sql`select c.id, c.name, c.arm,
                   (select count(*)::int from students st where st.class_id = c.id) as students,
                   count(a.id)::int as marked,
                   count(a.id) filter (where a.status = 'present')::int as present,
                   count(a.id) filter (where a.status = 'late')::int as late,
                   count(a.id) filter (where a.status = 'absent')::int as absent,
                   max(a.updated_at) as "markedAt"
            from classes c join sections sec on sec.id = c.section_id
            left join attendance_records a on a.class_id = c.id and a.date = ${today}
            where ${inClasses(sql`c.id`)}
            group by c.id, sec.sort_order order by sec.sort_order, c.sort_order, c.name, c.arm`,
      );

      // CBT sittings open right now, plus those finished in the last hour, grouped by test or mock.
      const cbt = await rows(
        tx,
        sql`select a.kind, a.test_id as "testId", t.title, a.exam, sub.name as subject,
                   count(*) filter (where a.submitted_at is null)::int as active,
                   count(*) filter (where a.submitted_at is not null)::int as finished,
                   round(avg(a.percentage) filter (where a.submitted_at is not null))::int as average,
                   max(a.deadline) filter (where a.submitted_at is null) as "endsAt"
            from cbt_attempts a
            join subjects sub on sub.id = a.subject_id
            join students st on st.id = a.student_id
            left join cbt_tests t on t.id = a.test_id
            where ${inClasses(sql`st.class_id`)}
              and ((a.submitted_at is null and a.started_at > now() - interval '4 hours' and (a.deadline is null or a.deadline > now()))
                   or a.submitted_at > now() - interval '1 hour')
            group by a.kind, a.test_id, t.title, a.exam, sub.name
            order by count(*) filter (where a.submitted_at is null) desc, max(a.started_at) desc`,
      );
      const [cbtToday] = await rows(
        tx,
        sql`select count(*)::int as submitted, round(avg(a.percentage))::int as average
            from cbt_attempts a join students st on st.id = a.student_id
            where a.submitted_at >= ${dayStart} and ${inClasses(sql`st.class_id`)}`,
      );

      // Registers from the last three weeks, for absence runs.
      const registers = await rows(
        tx,
        sql`select st.id, st.first_name || ' ' || st.last_name as name, c.name as "className", c.arm,
                   array_agg(a.status::text order by a.date desc) as statuses, max(a.date)::text as latest
            from attendance_records a join students st on st.id = a.student_id join classes c on c.id = st.class_id
            where a.date >= ${today}::date - 21 and ${inClasses(sql`c.id`)}
            group by st.id, c.name, c.arm`,
      );
      const streaks = registers
        .map((r) => ({ id: r.id as string, name: r.name as string, className: label(r.className, r.arm), latest: r.latest as string, days: absenceStreak(r.statuses as string[]) }))
        .filter((r) => r.days >= 3 && r.latest >= addDays(today, -7))
        .sort((a, b) => b.days - a.days);

      // Recent activity: registers taken and CBT finished (everyone); payments and safety (leadership).
      const regFeed = await rows(
        tx,
        sql`select c.id, c.name, c.arm, max(a.updated_at) as at, count(*)::int as marked,
                   count(*) filter (where a.status in ('present','late'))::int as present
            from attendance_records a join classes c on c.id = a.class_id
            where a.date = ${today} and ${inClasses(sql`c.id`)} group by c.id`,
      );
      const cbtFeed = await rows(
        tx,
        sql`select a.id, a.submitted_at as at, a.kind, a.exam, a.percentage, t.title, sub.name as subject,
                   st.first_name || ' ' || st.last_name as student
            from cbt_attempts a join students st on st.id = a.student_id join subjects sub on sub.id = a.subject_id
            left join cbt_tests t on t.id = a.test_id
            where a.submitted_at > now() - interval '24 hours' and ${inClasses(sql`st.class_id`)}
            order by a.submitted_at desc limit 15`,
      );

      let leader: Record<string, unknown> | null = null;
      if (leadership) {
        const [fees] = await rows(
          tx,
          sql`select coalesce(sum(amount_kobo) filter (where status = 'success' and paid_at >= ${dayStart}), 0)::bigint as "collectedToday",
                     count(*) filter (where status = 'success' and paid_at >= ${dayStart})::int as "paymentsToday",
                     count(*) filter (where status = 'failed' and created_at >= ${dayStart})::int as "failedToday",
                     count(*) filter (where status = 'pending' and created_at > now() - interval '1 hour')::int as "pendingNow"
              from payments`,
        );
        const [term] = await rows(
          tx,
          sql`select coalesce(sum(i.total_kobo),0)::bigint as expected, coalesce(sum(i.paid_kobo),0)::bigint as collected,
                     count(*) filter (where i.status <> 'paid')::int as owing, t.name, s.name as "sessionName"
              from terms t join academic_sessions s on s.id = t.session_id left join invoices i on i.term_id = t.id
              where t.is_current group by t.id, s.name`,
        );
        const daily = await rows(
          tx,
          sql`select (paid_at at time zone 'Africa/Lagos')::date::text as date, sum(amount_kobo)::bigint as kobo
              from payments where status = 'success' and paid_at >= ${dayStart} - interval '6 days'
              group by 1 order by 1`,
        );
        const payFeed = await rows(
          tx,
          sql`select p.id, p.paid_at as at, p.amount_kobo as kobo, p.method, st.first_name || ' ' || st.last_name as student
              from payments p join invoices i on i.id = p.invoice_id join students st on st.id = i.student_id
              where p.status = 'success' and p.paid_at > now() - interval '24 hours' order by p.paid_at desc limit 15`,
        );
        const [ai] = await rows(
          tx,
          sql`select count(*)::int as "callsToday", coalesce(sum(cost_micro_usd),0)::bigint as "costMicroToday",
                     count(distinct student_id) filter (where created_at > now() - interval '15 minutes')::int as "studentsNow"
              from ai_usage where created_at >= ${dayStart}`,
        );
        const [tutorNow] = await rows(
          tx,
          sql`select count(distinct c.student_id)::int as n from tutor_messages m join tutor_conversations c on c.id = m.conversation_id
              where m.role = 'student' and m.created_at > now() - interval '15 minutes'`,
        );
        const flags = await rows(
          tx,
          sql`select m.id, m.created_at as at, m.safety as category, c.id as "conversationId", st.first_name || ' ' || st.last_name as student
              from tutor_messages m join tutor_conversations c on c.id = m.conversation_id join students st on st.id = c.student_id
              where m.safety is not null and m.safety <> 'personal_info' and m.created_at > now() - interval '24 hours'
              order by m.created_at desc limit 10`,
        );
        const published = await rows(
          tx,
          sql`select rp.id, rp.published_at as at, c.name, c.arm, t.name as term from result_publications rp
              join classes c on c.id = rp.class_id join terms t on t.id = rp.term_id
              where rp.published_at > now() - interval '24 hours' order by rp.published_at desc limit 5`,
        );
        leader = { fees, term, daily, payFeed, ai, tutorNow, flags, published };
      }
      const exams = await this.insights.examsFor(tx);
      return { mine, attendance, cbt, cbtToday, streaks, regFeed, cbtFeed, leader, exams };
    });

    // Forecast at-risk counts for the main exam of each section (cached; at most every two minutes).
    const forecastExams = (['waec', 'bece'] as ExamCode[]).filter((e) => base.exams.exams.includes(e));
    const forecasts = [];
    for (const exam of forecastExams) {
      try {
        const f = await this.insights.school(u.schoolId, exam);
        const visible = f.students.filter((s) => base.mine === null || base.mine.includes(s.classId));
        const atRisk = visible.filter((s) => s.risks.some((r) => r.severity === 'high'));
        forecasts.push({
          exam,
          examName: f.examName,
          students: visible.length,
          onTrack: visible.filter((s) => s.meetsBenchmark === true).length,
          atRisk: atRisk.length,
          names: atRisk.slice(0, 4).map((s) => `${s.name} (${s.className})`),
        });
      } catch (err) {
        this.log.warn(`Forecast for live view failed: ${(err as Error).message}`);
      }
    }

    // ---- Shape the answer.
    const classes = base.attendance.map((c) => ({
      id: c.id as string,
      label: label(c.name, c.arm),
      students: num(c.students),
      marked: num(c.marked),
      present: num(c.present),
      late: num(c.late),
      absent: num(c.absent),
      markedAt: c.markedAt ? new Date(c.markedAt as string).toISOString() : null,
    }));
    const totals = classes.reduce(
      (t, c) => ({ students: t.students + c.students, marked: t.marked + c.marked, present: t.present + c.present, late: t.late + c.late, absent: t.absent + c.absent }),
      { students: 0, marked: 0, present: 0, late: 0, absent: 0 },
    );
    const unmarked = classes.filter((c) => c.students > 0 && c.marked === 0);
    const sessions = base.cbt.map((s) => ({
      key: `${s.kind}:${s.testId ?? s.exam ?? s.subject}`,
      kind: s.kind as string,
      title: (s.title as string | null) ?? (s.kind === 'mock' ? `${EXAM_LABEL[s.exam as string] ?? 'Exam'} mock` : `${s.subject} practice`),
      subject: s.subject as string,
      active: num(s.active),
      finished: num(s.finished),
      average: s.average === null ? null : num(s.average),
      endsAt: s.endsAt ? new Date(s.endsAt as string).toISOString() : null,
    }));

    const alerts: LiveAlert[] = [];
    if (schoolDay && lagosHour >= REGISTER_DUE_HOUR && unmarked.length) {
      alerts.push({
        id: 'unmarked',
        severity: 'medium',
        kind: 'attendance',
        title: `${unmarked.length} ${unmarked.length === 1 ? 'class has' : 'classes have'} not taken the register`,
        detail: unmarked.slice(0, 6).map((c) => c.label).join(', '),
        href: leadership ? '/admin/attendance' : '/teacher/attendance',
      });
    }
    for (const c of classes) {
      if (c.marked >= 5 && (c.present + c.late) / c.marked < 0.75) {
        alerts.push({
          id: `low-${c.id}`,
          severity: 'medium',
          kind: 'attendance',
          title: `Low attendance in ${c.label}`,
          detail: `${c.present + c.late} of ${c.marked} present today`,
        });
      }
    }
    if (base.streaks.length) {
      alerts.push({
        id: 'streaks',
        severity: 'high',
        kind: 'attendance',
        title: `${base.streaks.length} ${base.streaks.length === 1 ? 'student has' : 'students have'} been absent 3+ days in a row`,
        detail: base.streaks.slice(0, 5).map((s) => `${s.name} (${s.className}, ${s.days} days)`).join('; '),
      });
    }
    for (const f of forecasts) {
      if (f.atRisk) {
        alerts.push({
          id: `forecast-${f.exam}`,
          severity: 'high',
          kind: 'forecast',
          title: `${f.atRisk} ${f.examName} ${f.atRisk === 1 ? 'candidate needs' : 'candidates need'} attention`,
          detail: f.names.join('; ') + (f.atRisk > f.names.length ? ` and ${f.atRisk - f.names.length} more` : ''),
          href: `${leadership ? '/admin' : '/teacher'}/forecast?exam=${f.exam}`,
        });
      }
    }

    const activity: LiveActivity[] = [
      ...base.regFeed.map((r) => ({
        id: `reg-${r.id}`,
        at: new Date(r.at as string).toISOString(),
        kind: 'attendance' as const,
        text: `${label(r.name, r.arm)} register taken: ${num(r.present)} of ${num(r.marked)} present`,
        tone: num(r.present) / Math.max(1, num(r.marked)) < 0.75 ? ('bad' as const) : ('neutral' as const),
      })),
      ...base.cbtFeed.map((r) => ({
        id: `cbt-${r.id}`,
        at: new Date(r.at as string).toISOString(),
        kind: 'cbt' as const,
        text: `${r.student} finished ${(r.title as string | null) ?? (r.kind === 'mock' ? `a ${EXAM_LABEL[r.exam as string] ?? ''} mock` : `${r.subject} practice`)}: ${Math.round(num(r.percentage))}%`,
        tone: num(r.percentage) >= 50 ? ('good' as const) : ('bad' as const),
      })),
    ];

    let fees = null;
    let ai = null;
    if (base.leader) {
      const L = base.leader as { fees: Row; term: Row | undefined; daily: Row[]; payFeed: Row[]; ai: Row; tutorNow: Row; flags: Row[]; published: Row[] };
      const budget = await this.ai.budget(u.schoolId);
      const usedPct = budget.capCents ? Math.round((budget.spentCents / budget.capCents) * 100) : 0;
      const days = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6));
      fees = {
        collectedTodayKobo: num(L.fees.collectedToday),
        paymentsToday: num(L.fees.paymentsToday),
        failedToday: num(L.fees.failedToday),
        pendingNow: num(L.fees.pendingNow),
        term: L.term ? { name: `${L.term.name} ${L.term.sessionName}`, expectedKobo: num(L.term.expected), collectedKobo: num(L.term.collected), invoicesOwing: num(L.term.owing) } : null,
        last7Days: days.map((d) => ({ date: d, kobo: num(L.daily.find((x) => x.date === d)?.kobo) })),
      };
      ai = {
        enabled: this.ai.enabled,
        callsToday: num(L.ai.callsToday),
        costTodayNaira: Math.round((num(L.ai.costMicroToday) / 1_000_000) * config.usdToNgn()),
        studentsUsingTutorNow: num(L.tutorNow.n),
        budgetUsedPct: usedPct,
        flagsToday: L.flags.length,
      };
      if (L.flags.length) {
        alerts.unshift({
          id: 'safety',
          severity: 'high',
          kind: 'safety',
          title: `${L.flags.length} tutor safety ${L.flags.length === 1 ? 'flag' : 'flags'} in the last 24 hours`,
          detail: L.flags.slice(0, 3).map((f) => `${f.student}: ${String(f.category).replace(/_/g, ' ')}`).join('; '),
          href: '/admin/ai',
        });
      }
      if (budget.capCents && usedPct >= 80) {
        alerts.push({
          id: 'ai-budget',
          severity: usedPct >= 100 ? 'high' : 'medium',
          kind: 'ai',
          title: usedPct >= 100 ? 'AI allowance used up for this month' : `AI allowance ${usedPct}% used`,
          detail: 'Students and teachers lose AI help when it runs out. Raise it in AI Usage & Safety.',
          href: '/admin/ai',
        });
      }
      if (fees.failedToday) {
        alerts.push({ id: 'pay-failed', severity: 'info', kind: 'fees', title: `${fees.failedToday} failed ${fees.failedToday === 1 ? 'payment' : 'payments'} today`, detail: 'Parents may need help to try again.', href: '/admin/fees' });
      }
      activity.push(
        ...L.payFeed.map((p) => ({
          id: `pay-${p.id}`,
          at: new Date(p.at as string).toISOString(),
          kind: 'payment' as const,
          text: `${formatNaira(num(p.kobo))} received for ${p.student} (${String(p.method).replace('_', ' ')})`,
          tone: 'good' as const,
        })),
        ...L.flags.map((f) => ({
          id: `flag-${f.id}`,
          at: new Date(f.at as string).toISOString(),
          kind: 'safety' as const,
          text: `Safety flag for ${f.student}: ${String(f.category).replace(/_/g, ' ')}`,
          tone: 'bad' as const,
        })),
        ...L.published.map((r) => ({
          id: `pub-${r.id}`,
          at: new Date(r.at as string).toISOString(),
          kind: 'results' as const,
          text: `${r.term} results released for ${label(r.name, r.arm)}`,
          tone: 'neutral' as const,
        })),
      );
    }
    const order = { high: 0, medium: 1, info: 2 };
    alerts.sort((a, b) => order[a.severity] - order[b.severity]);
    activity.sort((a, b) => b.at.localeCompare(a.at));

    return {
      at: new Date().toISOString(),
      today,
      scope: leadership ? 'school' : 'teacher',
      attendance: { classes, totals, unmarked: unmarked.length },
      cbt: { inProgress: sessions.reduce((a, s) => a + s.active, 0), sessions, submittedToday: num(base.cbtToday?.submitted), averageToday: base.cbtToday?.average == null ? null : num(base.cbtToday.average) },
      fees,
      ai,
      forecasts,
      alerts,
      activity: activity.slice(0, 25),
    };
  }
}

function addDays(iso: string, days: number) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export type LiveSnapshot = Awaited<ReturnType<LiveService['snapshot']>>;
