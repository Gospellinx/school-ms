'use client';

import { useState } from 'react';
import { api, useApi } from '@/lib/api';
import { className, type SchoolClass, type Section, type Staff, type Subject } from '@/lib/types';
import { useSubmit } from '@/lib/useSubmit';

interface ClassSubject {
  id: string;
  subjectId: string;
  name: string;
  code: string;
  teacherId: string | null;
}

function ClassSubjects({ cls, subjects, teachers }: { cls: SchoolClass; subjects: Subject[]; teachers: Staff[] }) {
  const list = useApi<ClassSubject[]>(`classes/${cls.id}/subjects`);
  const [error, setError] = useState<string | null>(null);

  async function assign(subjectId: string, teacherId: string | null) {
    setError(null);
    try {
      await api(`classes/${cls.id}/subjects`, { method: 'POST', body: { subjectId, teacherId } });
      await list.reload();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const taken = new Set(list.data?.map((s) => s.subjectId));
  const remaining = subjects.filter((s) => !taken.has(s.id));

  return (
    <div className="card">
      <h2>{className(cls)}</h2>
      {error && <div className="alert error">{error}</div>}
      <div className="table-wrap" style={{ marginBottom: 12 }}>
        <table>
          <thead>
            <tr>
              <th>Subject</th>
              <th>Teacher</th>
            </tr>
          </thead>
          <tbody>
            {list.data?.map((s) => (
              <tr key={s.id}>
                <td>{s.name}</td>
                <td>
                  <select value={s.teacherId ?? ''} onChange={(e) => assign(s.subjectId, e.target.value || null)} aria-label={`Teacher for ${s.name}`}>
                    <option value="">No teacher (admins enter scores)</option>
                    {teachers.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.fullName}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
            {list.data?.length === 0 && (
              <tr>
                <td colSpan={2} className="muted">
                  No subjects yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {remaining.length > 0 && (
        <div className="form-row">
          <label>
            Add subject
            <select defaultValue="" onChange={(e) => e.target.value && assign(e.target.value, null)} aria-label={`Add subject to ${className(cls)}`}>
              <option value="">Choose a subject…</option>
              {remaining.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <button
            className="secondary"
            onClick={async () => {
              for (const s of remaining) await assign(s.id, null);
            }}
          >
            Add all {remaining.length}
          </button>
        </div>
      )}
    </div>
  );
}

export default function ClassesPage() {
  const sections = useApi<Section[]>('sections');
  const classes = useApi<SchoolClass[]>('classes');
  const subjects = useApi<Subject[]>('subjects');
  const staff = useApi<Staff[]>('staff');
  const [open, setOpen] = useState<string | null>(null);

  const create = useSubmit(async (f) => {
    await api('classes', {
      method: 'POST',
      body: { sectionId: String(f.get('sectionId')), name: String(f.get('name')).trim(), arm: String(f.get('arm')).trim() },
    });
    await classes.reload();
  });

  const teachers = staff.data ?? [];
  const opened = classes.data?.find((c) => c.id === open);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Classes</h1>
          <p className="muted">Create classes in each section, then add subjects and pick who teaches them.</p>
        </div>
      </div>
      <form className="card form-row" onSubmit={create.onSubmit}>
        <label>
          Section
          <select name="sectionId" required>
            {sections.data?.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Class name
          <input name="name" placeholder="JSS 1, Primary 4, Nursery 2" required />
        </label>
        <label style={{ flex: '0 1 120px' }}>
          Arm
          <input name="arm" placeholder="A" />
        </label>
        <button disabled={create.busy}>Add class</button>
      </form>
      {create.error && <div className="alert error">{create.error}</div>}

      {sections.data?.map((sec) => {
        const inSection = classes.data?.filter((c) => c.sectionId === sec.id) ?? [];
        if (!inSection.length) return null;
        return (
          <div className="card" key={sec.id}>
            <h2>{sec.name}</h2>
            <div className="form-row">
              {inSection.map((c) => (
                <button key={c.id} className={open === c.id ? '' : 'secondary'} onClick={() => setOpen(open === c.id ? null : c.id)}>
                  {className(c)}
                </button>
              ))}
            </div>
          </div>
        );
      })}

      {opened && <ClassSubjects key={opened.id} cls={opened} subjects={subjects.data ?? []} teachers={teachers} />}
    </>
  );
}
