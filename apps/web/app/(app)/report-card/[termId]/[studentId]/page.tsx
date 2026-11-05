'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api, useApi } from '@/lib/api';
import { isLeader, useMe } from '@/lib/me';
import type { Component, GradeBand } from '@/lib/types';

interface ReportCard {
  school: { name: string; motto: string | null; address: string | null };
  session: string;
  term: string;
  student: { admissionNumber: string; name: string; gender: string | null };
  class: { name: string; arm: string; section: string };
  components: Component[];
  gradingScale: GradeBand[];
  subjects: {
    subjectId: string;
    name: string;
    scores: Record<string, number>;
    total: number;
    grade: string;
    remark: string;
    positionText: string;
    classAverage: number;
    classHighest: number;
    classLowest: number;
  }[];
  summary: { grandTotal: number; average: number; positionText: string; outOf: number; classAverage: number };
  comments: { teacher: string | null; head: string | null };
}

export default function ReportCardPage() {
  const { termId, studentId } = useParams<{ termId: string; studentId: string }>();
  const me = useMe();
  const card = useApi<ReportCard>(`terms/${termId}/students/${studentId}/report-card`);
  const [teacher, setTeacher] = useState('');
  const [head, setHead] = useState('');
  const [status, setStatus] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  useEffect(() => {
    setTeacher(card.data?.comments.teacher ?? '');
    setHead(card.data?.comments.head ?? '');
  }, [card.data]);

  async function saveComments() {
    setStatus(null);
    try {
      await api(`terms/${termId}/students/${studentId}/comments`, {
        method: 'PUT',
        body: isLeader(me) ? { teacherComment: teacher, headComment: head } : { teacherComment: teacher },
      });
      await card.reload();
      setStatus({ kind: 'ok', text: 'Comments saved.' });
    } catch (e) {
      setStatus({ kind: 'error', text: (e as Error).message });
    }
  }

  if (card.error) return <div className="alert error">{card.error}</div>;
  const c = card.data;
  if (!c) return <p className="muted">Loading…</p>;

  return (
    <>
      <div className="page-head no-print">
        <Link href="/results">← Back to results</Link>
        <button onClick={() => window.print()}>Print or save as PDF</button>
      </div>

      <div className="card no-print stack">
        <h2>Comments</h2>
        {status && <div className={`alert ${status.kind}`}>{status.text}</div>}
        <label>
          Class teacher&apos;s comment
          <textarea rows={2} value={teacher} onChange={(e) => setTeacher(e.target.value)} />
        </label>
        {isLeader(me) && (
          <label>
            Head&apos;s comment
            <textarea rows={2} value={head} onChange={(e) => setHead(e.target.value)} />
          </label>
        )}
        <div>
          <button className="secondary" onClick={saveComments}>
            Save comments
          </button>
        </div>
      </div>

      <article className="report">
        <header>
          <h1>{c.school.name}</h1>
          {c.school.address && <div>{c.school.address}</div>}
          {c.school.motto && <div className="motto">{c.school.motto}</div>}
          <div style={{ marginTop: 8, fontWeight: 700 }}>
            {c.term.toUpperCase()} REPORT · {c.session} SESSION
          </div>
        </header>

        <div className="meta">
          <div>
            <strong>Name:</strong> {c.student.name}
          </div>
          <div>
            <strong>Admission no.:</strong> {c.student.admissionNumber}
          </div>
          <div>
            <strong>Class:</strong> {c.class.arm ? `${c.class.name} ${c.class.arm}` : c.class.name}
          </div>
          <div>
            <strong>Gender:</strong> {c.student.gender === 'male' ? 'Male' : c.student.gender === 'female' ? 'Female' : ''}
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th>Subject</th>
              {c.components.map((k) => (
                <th key={k.key} className="num">
                  {k.label} ({k.maxScore})
                </th>
              ))}
              <th className="num">Total (100)</th>
              <th>Grade</th>
              <th>Remark</th>
              <th className="num">Pos.</th>
              <th className="num">Class avg</th>
              <th className="num">High</th>
              <th className="num">Low</th>
            </tr>
          </thead>
          <tbody>
            {c.subjects.map((s) => (
              <tr key={s.subjectId}>
                <td>{s.name}</td>
                {c.components.map((k) => (
                  <td key={k.key} className="num">
                    {s.scores[k.key] ?? '–'}
                  </td>
                ))}
                <td className="num">
                  <strong>{s.total}</strong>
                </td>
                <td>{s.grade}</td>
                <td>{s.remark}</td>
                <td className="num">{s.positionText}</td>
                <td className="num">{s.classAverage}</td>
                <td className="num">{s.classHighest}</td>
                <td className="num">{s.classLowest}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="summary">
          <div>
            <strong>Total:</strong> {c.summary.grandTotal}
          </div>
          <div>
            <strong>Average:</strong> {c.summary.average}
          </div>
          <div>
            <strong>Position:</strong> {c.summary.positionText} of {c.summary.outOf}
          </div>
          <div>
            <strong>Class average:</strong> {c.summary.classAverage}
          </div>
        </div>

        <div className="comments">
          <strong>Class teacher&apos;s comment</strong>
          <p>{c.comments.teacher}</p>
          <strong>Head&apos;s comment</strong>
          <p>{c.comments.head}</p>
        </div>

        <div className="key">
          <strong>Grading key:</strong>{' '}
          {c.gradingScale.map((g) => `${g.grade} ${Math.floor(g.min)}–${Math.floor(g.max)} ${g.remark}`).join(' · ')}
        </div>
      </article>
    </>
  );
}
