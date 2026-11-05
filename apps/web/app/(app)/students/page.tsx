'use client';

import { useState } from 'react';
import { api, useApi } from '@/lib/api';
import { className, type SchoolClass, type Student } from '@/lib/types';
import { useSubmit } from '@/lib/useSubmit';

const TEMPLATE = 'admission_number,first_name,last_name,other_names,gender,date_of_birth\nGC/001,Ada,Okafor,,F,2011-03-02\n';

export default function StudentsPage() {
  const classes = useApi<SchoolClass[]>('classes');
  const [classId, setClassId] = useState('');
  const students = useApi<Student[]>(classId ? `students?classId=${classId}` : null);
  const [importErrors, setImportErrors] = useState<{ row: number; message: string }[]>([]);

  const add = useSubmit(async (f) => {
    const str = (k: string) => String(f.get(k) ?? '').trim();
    await api('students', {
      method: 'POST',
      body: {
        classId,
        admissionNumber: str('admissionNumber'),
        firstName: str('firstName'),
        lastName: str('lastName'),
        gender: str('gender') || undefined,
      },
    });
    await students.reload();
  });

  const importCsv = useSubmit(async (f) => {
    setImportErrors([]);
    const file = f.get('file') as File | null;
    if (!file || !file.size) throw new Error('Choose a CSV file first');
    const result = await api<{ imported: number; errors: { row: number; message: string }[] }>('students/import', {
      method: 'POST',
      body: { classId, csv: await file.text() },
    });
    if (result.errors.length) {
      setImportErrors(result.errors);
      throw new Error('Nothing was imported. Fix the rows below and upload again.');
    }
    await students.reload();
    return `Imported ${result.imported} students.`;
  });

  const templateHref = `data:text/csv;charset=utf-8,${encodeURIComponent(TEMPLATE)}`;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Students</h1>
          <p className="muted">Pick a class to see, add or import its students.</p>
        </div>
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

      {classId && (
        <>
          <form className="card form-row" onSubmit={importCsv.onSubmit}>
            <label>
              Import from Excel (save as CSV first)
              <input name="file" type="file" accept=".csv,text/csv" />
            </label>
            <button disabled={importCsv.busy}>Import</button>
            <a className="btn secondary" href={templateHref} download="students-template.csv">
              Download template
            </a>
          </form>
          {importCsv.error && <div className="alert error">{importCsv.error}</div>}
          {importCsv.notice && <div className="alert ok">{importCsv.notice}</div>}
          {importErrors.length > 0 && (
            <div className="card">
              <ul style={{ margin: 0 }}>
                {importErrors.map((e, i) => (
                  <li key={i}>{e.row ? `Row ${e.row}: ${e.message}` : e.message}</li>
                ))}
              </ul>
            </div>
          )}

          <form className="card form-row" onSubmit={add.onSubmit}>
            <label>
              Admission no.
              <input name="admissionNumber" required />
            </label>
            <label>
              First name
              <input name="firstName" required />
            </label>
            <label>
              Surname
              <input name="lastName" required />
            </label>
            <label style={{ flex: '0 1 120px' }}>
              Gender
              <select name="gender" defaultValue="">
                <option value="">–</option>
                <option value="female">Female</option>
                <option value="male">Male</option>
              </select>
            </label>
            <button disabled={add.busy}>Add student</button>
          </form>
          {add.error && <div className="alert error">{add.error}</div>}

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Admission no.</th>
                  <th>Name</th>
                  <th>Gender</th>
                </tr>
              </thead>
              <tbody>
                {students.data?.map((s) => (
                  <tr key={s.id}>
                    <td>{s.admissionNumber}</td>
                    <td>{[s.lastName, s.firstName, s.otherNames].filter(Boolean).join(' ')}</td>
                    <td>{s.gender ?? ''}</td>
                  </tr>
                ))}
                {students.data?.length === 0 && (
                  <tr>
                    <td colSpan={3} className="muted">
                      No students in this class yet.
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
