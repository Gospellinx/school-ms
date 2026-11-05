'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { api, useApi } from '@/lib/api';
import { currentTermId, TermPicker } from '@/lib/TermPicker';
import type { Assignment, Component, Session } from '@/lib/types';

interface SheetRow {
  studentId: string;
  admissionNumber: string;
  name: string;
  scores: Record<string, number> | null;
  total: number | null;
}

interface Sheet {
  components: Component[];
  rows: SheetRow[];
}

type Draft = Record<string, Record<string, string>>;

function ScoreEntry() {
  const params = useSearchParams();
  const sessions = useApi<Session[]>('sessions');
  const assignments = useApi<Assignment[]>('my-assignments');
  const [termId, setTermId] = useState('');
  const [pair, setPair] = useState(params.get('class') && params.get('subject') ? `${params.get('class')}:${params.get('subject')}` : '');
  const [classId, subjectId] = pair ? pair.split(':') : ['', ''];
  const sheet = useApi<Sheet>(termId && pair ? `terms/${termId}/classes/${classId}/subjects/${subjectId}/scores` : null);
  const [draft, setDraft] = useState<Draft>({});
  const [status, setStatus] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!termId && sessions.data) setTermId(currentTermId(sessions.data));
  }, [sessions.data, termId]);

  useEffect(() => {
    const next: Draft = {};
    for (const r of sheet.data?.rows ?? []) {
      next[r.studentId] = Object.fromEntries(Object.entries(r.scores ?? {}).map(([k, v]) => [k, String(v)]));
    }
    setDraft(next);
    setStatus(null);
  }, [sheet.data]);

  const components = sheet.data?.components ?? [];

  const problems = useMemo(() => {
    const bad = new Set<string>();
    for (const [studentId, scores] of Object.entries(draft)) {
      for (const c of components) {
        const raw = scores[c.key];
        if (raw === undefined || raw === '') continue;
        const n = Number(raw);
        if (!Number.isFinite(n) || n < 0 || n > c.maxScore) bad.add(`${studentId}:${c.key}`);
      }
    }
    return bad;
  }, [draft, components]);

  const totalFor = (studentId: string) => {
    const s = draft[studentId] ?? {};
    const filled = components.filter((c) => s[c.key] !== undefined && s[c.key] !== '');
    if (!filled.length) return '';
    return filled.reduce((sum, c) => sum + Number(s[c.key] || 0), 0);
  };

  function set(studentId: string, key: string, value: string) {
    setDraft((d) => ({ ...d, [studentId]: { ...d[studentId], [key]: value } }));
  }

  async function save() {
    setSaving(true);
    setStatus(null);
    const entries = Object.entries(draft)
      .map(([studentId, s]) => ({
        studentId,
        scores: Object.fromEntries(Object.entries(s).filter(([, v]) => v !== '').map(([k, v]) => [k, Number(v)])),
      }))
      .filter((e) => Object.keys(e.scores).length > 0);
    try {
      const res = await api<{ saved: number }>(`terms/${termId}/classes/${classId}/subjects/${subjectId}/scores`, {
        method: 'PUT',
        body: { entries },
      });
      setStatus({ kind: 'ok', text: `Saved scores for ${res.saved} students.` });
    } catch (e) {
      setStatus({ kind: 'error', text: (e as Error).message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Enter scores</h1>
          <p className="muted">Pick the term and the class subject. Blank boxes count as not yet entered.</p>
        </div>
      </div>
      <div className="card form-row">
        <TermPicker sessions={sessions.data} value={termId} onChange={setTermId} />
        <label>
          Class and subject
          <select value={pair} onChange={(e) => setPair(e.target.value)}>
            <option value="">Choose…</option>
            {assignments.data?.map((a) => (
              <option key={`${a.classId}:${a.subjectId}`} value={`${a.classId}:${a.subjectId}`}>
                {a.arm ? `${a.className} ${a.arm}` : a.className} · {a.subjectName}
              </option>
            ))}
          </select>
        </label>
      </div>

      {sheet.error && <div className="alert error">{sheet.error}</div>}
      {status && <div className={`alert ${status.kind}`}>{status.text}</div>}

      {sheet.data && (
        <>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Adm. no.</th>
                  <th>Student</th>
                  {components.map((c) => (
                    <th key={c.key} className="num">
                      {c.label} ({c.maxScore})
                    </th>
                  ))}
                  <th className="num">Total</th>
                </tr>
              </thead>
              <tbody>
                {sheet.data.rows.map((r) => (
                  <tr key={r.studentId}>
                    <td>{r.admissionNumber}</td>
                    <td>{r.name}</td>
                    {components.map((c) => (
                      <td key={c.key} className="num">
                        <input
                          className={`score-input${problems.has(`${r.studentId}:${c.key}`) ? ' bad' : ''}`}
                          inputMode="decimal"
                          aria-label={`${c.label} for ${r.name}`}
                          value={draft[r.studentId]?.[c.key] ?? ''}
                          onChange={(e) => set(r.studentId, c.key, e.target.value.trim())}
                        />
                      </td>
                    ))}
                    <td className="num">
                      <strong>{totalFor(r.studentId)}</strong>
                    </td>
                  </tr>
                ))}
                {sheet.data.rows.length === 0 && (
                  <tr>
                    <td colSpan={components.length + 3} className="muted">
                      No students in this class yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="form-row" style={{ marginTop: 16 }}>
            <button onClick={save} disabled={saving || problems.size > 0}>
              {saving ? 'Saving…' : 'Save scores'}
            </button>
            {problems.size > 0 && <span className="muted">Fix the boxes in red: scores must be between 0 and the maximum.</span>}
          </div>
        </>
      )}
    </>
  );
}

export default function ScoresPage() {
  return (
    <Suspense>
      <ScoreEntry />
    </Suspense>
  );
}
