'use client';

import { useEffect, useRef, useState } from 'react';
import { api } from './api';

export type ExamCode = 'waec' | 'neco' | 'jamb' | 'bece';
export type Band = 'on_track' | 'borderline' | 'at_risk' | 'unknown';

export interface SubjectReadiness {
  subjectId: string;
  subjectName: string;
  predicted: number | null;
  grade: string | null;
  band: Band;
  confidence: 'low' | 'medium' | 'high';
}

export interface SubjectForecast {
  subjectId: string;
  subjectName: string;
  students: number;
  average: number | null;
  credits: number;
  creditRate: number | null;
  atRisk: number;
}

export interface CohortForecast {
  students: number;
  withEvidence: number;
  bands: Record<Band, number>;
  average: number | null;
  benchmark: { likely: number; undecided: number; unlikely: number; label: string };
  projectedRate: { low: number; high: number } | null;
  subjects: SubjectForecast[];
}

export interface Risk {
  code: string;
  severity: 'high' | 'medium';
  label: string;
}

export interface StudentForecast {
  studentId: string;
  name: string;
  admissionNumber: string;
  classId: string;
  className: string;
  overall: number | null;
  band: Band;
  creditsLikely: number;
  jambAggregate: number | null;
  subjects: SubjectReadiness[];
  meetsBenchmark: boolean | null;
  attendanceRate: number | null;
  consecutiveAbsences: number;
  scoreDrop: number | null;
  risks: Risk[];
  weakTopics: { subjectId: string; subjectName: string; topic: string; accuracy: number }[];
}

export interface SchoolForecastView {
  exams: ExamCode[];
  exam: ExamCode | null;
  examName: string;
  benchmark: string;
  generatedAt: string;
  scope: 'school' | 'teacher';
  summary: CohortForecast;
  classes: { id: string; label: string; sectionKind: string; forecast: CohortForecast }[];
  teachers: { teacherId: string; teacherName: string; subjectName: string; classes: string[]; students: number; average: number | null; creditRate: number | null }[];
  atRisk: StudentForecast[];
}

export interface ClassForecastView {
  exams: ExamCode[];
  exam: ExamCode;
  examName: string;
  benchmark: string;
  generatedAt: string;
  class: { id: string; label: string };
  forecast: CohortForecast;
  students: StudentForecast[];
  reteach: { subjectName: string; topic: string; attempted: number; students: number; accuracy: number }[];
}

export interface ParentForecastView {
  children: {
    studentId: string;
    name: string;
    className: string | null;
    exams: {
      exam: ExamCode;
      examName: string;
      benchmark: string;
      overall: number | null;
      band: Band;
      creditsLikely: number;
      jambAggregate: number | null;
      meetsBenchmark: boolean | null;
      subjects: SubjectReadiness[];
      weakTopics: { subjectName: string; topic: string; accuracy: number }[];
      text: { headline: string; lines: string[]; atHome: string[] };
    }[];
  }[];
}

export interface LiveSnapshot {
  at: string;
  today: string;
  scope: 'school' | 'teacher';
  attendance: {
    classes: { id: string; label: string; students: number; marked: number; present: number; late: number; absent: number; markedAt: string | null }[];
    totals: { students: number; marked: number; present: number; late: number; absent: number };
    unmarked: number;
  };
  cbt: {
    inProgress: number;
    sessions: { key: string; kind: string; title: string; subject: string; active: number; finished: number; average: number | null; endsAt: string | null }[];
    submittedToday: number;
    averageToday: number | null;
  };
  fees: {
    collectedTodayKobo: number;
    paymentsToday: number;
    failedToday: number;
    pendingNow: number;
    term: { name: string; expectedKobo: number; collectedKobo: number; invoicesOwing: number } | null;
    last7Days: { date: string; kobo: number }[];
  } | null;
  ai: { enabled: boolean; callsToday: number; costTodayNaira: number; studentsUsingTutorNow: number; budgetUsedPct: number; flagsToday: number } | null;
  forecasts: { exam: ExamCode; examName: string; students: number; onTrack: number; atRisk: number; names: string[] }[];
  alerts: { id: string; severity: 'high' | 'medium' | 'info'; kind: string; title: string; detail: string; href?: string }[];
  activity: { id: string; at: string; kind: string; text: string; tone: 'good' | 'bad' | 'neutral' }[];
}

export type LiveStatus = 'connecting' | 'live' | 'reconnecting';

/**
 * Subscribes to the live monitoring stream (Server-Sent Events through the /bff proxy, so the
 * session cookie authenticates it). The browser reconnects by itself after a dropped connection.
 * `fresh` holds ids of activity rows that arrived since the last update, for a brief highlight.
 */
export function useLive() {
  const [snap, setSnap] = useState<LiveSnapshot | null>(null);
  const [status, setStatus] = useState<LiveStatus>('connecting');
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const [attempt, setAttempt] = useState(0);
  const seen = useRef<Set<string> | null>(null);

  useEffect(() => {
    const take = (data: LiveSnapshot) => {
      const ids = data.activity.map((a) => a.id);
      setFresh(seen.current ? new Set(ids.filter((id) => !seen.current!.has(id))) : new Set());
      seen.current = new Set(ids);
      setSnap(data);
    };
    const es = new EventSource('/bff/live/stream');
    let retry: ReturnType<typeof setTimeout> | undefined;
    es.addEventListener('open', () => setStatus('live'));
    es.addEventListener('error', () => {
      setStatus('reconnecting');
      if (es.readyState === EventSource.CLOSED) {
        // The server refused the stream (signed out, or the API restarted): fetch once, which
        // sends a signed-out user to the login page, then try the stream again shortly.
        api<LiveSnapshot>('live').then(take, () => undefined);
        retry = setTimeout(() => setAttempt((n) => n + 1), 5000);
      }
    });
    es.addEventListener('snapshot', (e) => {
      take(JSON.parse((e as MessageEvent).data) as LiveSnapshot);
      setStatus('live');
    });
    return () => {
      es.close();
      if (retry) clearTimeout(retry);
    };
  }, [attempt]);

  return { snap, status, fresh };
}

export const BAND: Record<Band, { label: string; tone: 'green' | 'amber' | 'red' | 'gray'; color: string }> = {
  on_track: { label: 'On track', tone: 'green', color: '#10b981' },
  borderline: { label: 'Borderline', tone: 'amber', color: '#f59e0b' },
  at_risk: { label: 'At risk', tone: 'red', color: '#f43f5e' },
  unknown: { label: 'No evidence yet', tone: 'gray', color: '#d4d4d8' },
};

export const EXAM_SHORT: Record<ExamCode, string> = { waec: 'WAEC', neco: 'NECO', jamb: 'JAMB', bece: 'BECE' };
