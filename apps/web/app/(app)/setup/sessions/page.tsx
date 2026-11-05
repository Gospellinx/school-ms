'use client';

import { api, useApi } from '@/lib/api';
import type { Session } from '@/lib/types';
import { useSubmit } from '@/lib/useSubmit';

export default function SessionsPage() {
  const sessions = useApi<Session[]>('sessions');
  const create = useSubmit(async (f) => {
    await api('sessions', { method: 'POST', body: { name: String(f.get('name')).trim() } });
    await sessions.reload();
    return 'Session created with First, Second and Third term.';
  });

  async function makeCurrent(termId: string) {
    await api(`terms/${termId}/make-current`, { method: 'POST' });
    await sessions.reload();
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Sessions and terms</h1>
          <p className="muted">Each session gets three terms. Mark the term you are in as current.</p>
        </div>
      </div>

      <form className="card form-row" onSubmit={create.onSubmit}>
        <label>
          New session
          <input name="name" placeholder="2025/2026" pattern="\d{4}/\d{4}" title="Like 2025/2026" required />
        </label>
        <button disabled={create.busy}>Create session</button>
      </form>
      {create.error && <div className="alert error">{create.error}</div>}
      {create.notice && <div className="alert ok">{create.notice}</div>}

      {sessions.data?.map((s) => (
        <div className="card" key={s.id}>
          <h2>{s.name}</h2>
          <div className="table-wrap">
            <table>
              <tbody>
                {s.terms.map((t) => (
                  <tr key={t.id}>
                    <td>{t.name}</td>
                    <td className="num">
                      {t.isCurrent ? (
                        <span className="pill">Current term</span>
                      ) : (
                        <button className="secondary" onClick={() => makeCurrent(t.id)}>
                          Make current
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
      {sessions.data?.length === 0 && <p className="muted">No sessions yet.</p>}
    </>
  );
}
