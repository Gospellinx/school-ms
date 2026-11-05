'use client';

import { api, useApi } from '@/lib/api';
import type { Subject } from '@/lib/types';
import { useSubmit } from '@/lib/useSubmit';

export default function SubjectsPage() {
  const subjects = useApi<Subject[]>('subjects');
  const create = useSubmit(async (f) => {
    await api('subjects', { method: 'POST', body: { name: String(f.get('name')).trim(), code: String(f.get('code')).trim() } });
    await subjects.reload();
  });

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Subjects</h1>
          <p className="muted">The school&apos;s subject list. Add them to classes on the Classes page.</p>
        </div>
      </div>
      <form className="card form-row" onSubmit={create.onSubmit}>
        <label>
          Subject name
          <input name="name" placeholder="Mathematics" required />
        </label>
        <label style={{ flex: '0 1 140px' }}>
          Short code
          <input name="code" placeholder="MTH" maxLength={12} required />
        </label>
        <button disabled={create.busy}>Add subject</button>
      </form>
      {create.error && <div className="alert error">{create.error}</div>}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Subject</th>
              <th>Code</th>
            </tr>
          </thead>
          <tbody>
            {subjects.data?.map((s) => (
              <tr key={s.id}>
                <td>{s.name}</td>
                <td>{s.code}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
