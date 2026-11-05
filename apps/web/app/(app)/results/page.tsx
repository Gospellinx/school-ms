'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useApi } from '@/lib/api';
import { currentTermId, TermPicker } from '@/lib/TermPicker';
import { className, type SchoolClass, type Session } from '@/lib/types';

interface Broadsheet {
  class: { name: string; arm: string; section: string };
  subjects: { id: string; name: string; code: string }[];
  classAverage: number;
  studentCount: number;
  students: {
    studentId: string;
    name: string;
    admissionNumber: string;
    grandTotal: number;
    average: number;
    positionText: string;
    subjects: { subjectId: string; total: number; grade: string }[];
  }[];
}

export default function ResultsPage() {
  const sessions = useApi<Session[]>('sessions');
  const classes = useApi<SchoolClass[]>('classes');
  const [termId, setTermId] = useState('');
  const [classId, setClassId] = useState('');
  const sheet = useApi<Broadsheet>(termId && classId ? `terms/${termId}/classes/${classId}/results` : null);

  useEffect(() => {
    if (!termId && sessions.data) setTermId(currentTermId(sessions.data));
  }, [sessions.data, termId]);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Results and report cards</h1>
          <p className="muted">The broadsheet updates as teachers save scores. Open a student to print their report card.</p>
        </div>
      </div>
      <div className="card form-row">
        <TermPicker sessions={sessions.data} value={termId} onChange={setTermId} />
        <label>
          Class
          <select value={classId} onChange={(e) => setClassId(e.target.value)}>
            <option value="">Choose a class…</option>
            {classes.data?.map((c) => (
              <option key={c.id} value={c.id}>
                {className(c)}
              </option>
            ))}
          </select>
        </label>
      </div>

      {sheet.error && <div className="alert error">{sheet.error}</div>}
      {sheet.data && (
        <>
          <p className="muted">
            {sheet.data.studentCount} students with scores · class average {sheet.data.classAverage}
          </p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Pos.</th>
                  <th>Student</th>
                  {sheet.data.subjects.map((s) => (
                    <th key={s.id} className="num" title={s.name}>
                      {s.code}
                    </th>
                  ))}
                  <th className="num">Total</th>
                  <th className="num">Average</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {sheet.data.students.map((st) => (
                  <tr key={st.studentId}>
                    <td>{st.positionText}</td>
                    <td>
                      {st.name}
                      <div className="muted" style={{ fontSize: 12 }}>
                        {st.admissionNumber}
                      </div>
                    </td>
                    {sheet.data!.subjects.map((s) => {
                      const r = st.subjects.find((x) => x.subjectId === s.id);
                      return (
                        <td key={s.id} className="num">
                          {r ? `${r.total} ${r.grade}` : '–'}
                        </td>
                      );
                    })}
                    <td className="num">{st.grandTotal}</td>
                    <td className="num">
                      <strong>{st.average}</strong>
                    </td>
                    <td className="num">
                      <Link href={`/report-card/${termId}/${st.studentId}`}>Report card</Link>
                    </td>
                  </tr>
                ))}
                {sheet.data.students.length === 0 && (
                  <tr>
                    <td colSpan={sheet.data.subjects.length + 5} className="muted">
                      No scores entered for this class this term yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}
