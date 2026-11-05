'use client';

import Link from 'next/link';
import { useApi } from '@/lib/api';
import { isLeader, useMe } from '@/lib/me';
import type { Assignment, SchoolClass, Session, Student } from '@/lib/types';

export default function Dashboard() {
  const me = useMe();
  const leader = isLeader(me);
  const sessions = useApi<Session[]>('sessions');
  const classes = useApi<SchoolClass[]>('classes');
  const students = useApi<Student[]>(leader ? 'students' : null);
  const assignments = useApi<Assignment[]>('my-assignments');

  const current = sessions.data?.flatMap((s) => s.terms.map((t) => ({ ...t, session: s.name }))).find((t) => t.isCurrent);

  const steps = leader
    ? [
        { done: (sessions.data?.length ?? 0) > 0 && !!current, text: 'Create the session and mark the current term', href: '/setup/sessions' },
        { done: (classes.data?.length ?? 0) > 0, text: 'Create classes', href: '/setup/classes' },
        { done: (assignments.data?.length ?? 0) > 0, text: 'Add subjects and assign teachers to each class', href: '/setup/classes' },
        { done: (students.data?.length ?? 0) > 0, text: 'Import students', href: '/students' },
      ]
    : [];

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Welcome, {me.staff.fullName.split(' ')[0]}</h1>
          <p className="muted">{current ? `${current.name}, ${current.session}` : 'No current term set yet'}</p>
        </div>
      </div>

      <div className="stats">
        <div className="stat">
          <div className="n">{classes.data?.length ?? '–'}</div>
          <div className="l">Classes</div>
        </div>
        {leader && (
          <div className="stat">
            <div className="n">{students.data?.length ?? '–'}</div>
            <div className="l">Students</div>
          </div>
        )}
        <div className="stat">
          <div className="n">{assignments.data?.length ?? '–'}</div>
          <div className="l">{leader ? 'Class subjects' : 'Your class subjects'}</div>
        </div>
      </div>

      {leader && steps.some((s) => !s.done) && (
        <div className="card">
          <h2>Get your school ready</h2>
          <ol className="stack" style={{ paddingLeft: 18, margin: 0 }}>
            {steps.map((s) => (
              <li key={s.text}>
                {s.done ? '✓ ' : ''}
                <Link href={s.href}>{s.text}</Link>
              </li>
            ))}
          </ol>
        </div>
      )}

      <div className="card">
        <h2>{leader ? 'All class subjects' : 'Your classes'}</h2>
        {assignments.data?.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Class</th>
                  <th>Subject</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {assignments.data.map((a) => (
                  <tr key={`${a.classId}-${a.subjectId}`}>
                    <td>{a.arm ? `${a.className} ${a.arm}` : a.className}</td>
                    <td>{a.subjectName}</td>
                    <td className="num">
                      <Link href={`/scores?class=${a.classId}&subject=${a.subjectId}`}>Enter scores</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="muted">{leader ? 'No subjects assigned to classes yet.' : 'You have not been assigned any class subjects yet. Ask your admin.'}</p>
        )}
      </div>
    </>
  );
}
