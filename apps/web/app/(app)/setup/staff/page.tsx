'use client';

import { api, useApi } from '@/lib/api';
import type { Staff } from '@/lib/types';
import { useSubmit } from '@/lib/useSubmit';

export default function StaffPage() {
  const staff = useApi<Staff[]>('staff');
  const create = useSubmit(async (f) => {
    const email = String(f.get('email')).trim();
    await api('staff', {
      method: 'POST',
      body: { fullName: String(f.get('fullName')).trim(), email, password: String(f.get('password')), role: String(f.get('role')) },
    });
    await staff.reload();
    return `Account created. Share the school address, ${email} and the password with them.`;
  });

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Staff</h1>
          <p className="muted">Teachers enter scores for their own subjects. Admins can do everything except change ownership.</p>
        </div>
      </div>
      <form className="card form-row" onSubmit={create.onSubmit}>
        <label>
          Full name
          <input name="fullName" required />
        </label>
        <label>
          Email
          <input name="email" type="email" required />
        </label>
        <label>
          Starting password
          <input name="password" type="text" minLength={8} required />
        </label>
        <label style={{ flex: '0 1 140px' }}>
          Role
          <select name="role" defaultValue="teacher">
            <option value="teacher">Teacher</option>
            <option value="admin">Admin</option>
          </select>
        </label>
        <button disabled={create.busy}>Add staff</button>
      </form>
      {create.error && <div className="alert error">{create.error}</div>}
      {create.notice && <div className="alert ok">{create.notice}</div>}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
            </tr>
          </thead>
          <tbody>
            {staff.data?.map((s) => (
              <tr key={s.id}>
                <td>{s.fullName}</td>
                <td>{s.email}</td>
                <td>{s.role}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
