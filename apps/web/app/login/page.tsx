'use client';

import Link from 'next/link';
import { FormEvent, useState } from 'react';

export default function LoginPage() {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    const res = await fetch('/session/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        schoolSlug: String(f.get('schoolSlug')).trim().toLowerCase(),
        email: String(f.get('email')).trim(),
        password: String(f.get('password')),
      }),
    });
    setBusy(false);
    if (res.ok) window.location.href = '/';
    else setError((await res.json().catch(() => ({}))).message ?? 'Could not log in');
  }

  return (
    <div className="auth">
      <form className="card stack" onSubmit={submit}>
        <div>
          <h1>Staff login</h1>
          <p className="muted">Proprietors, admins and teachers sign in here.</p>
        </div>
        {error && <div className="alert error">{error}</div>}
        <label>
          School address
          <input name="schoolSlug" placeholder="e.g. gcis" required autoComplete="organization" />
        </label>
        <label>
          Email
          <input name="email" type="email" required autoComplete="email" />
        </label>
        <label>
          Password
          <input name="password" type="password" required autoComplete="current-password" />
        </label>
        <button disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
        <p className="muted">
          New school? <Link href="/register">Register your school</Link>
        </p>
      </form>
    </div>
  );
}
