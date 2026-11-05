'use client';

import Link from 'next/link';
import { FormEvent, useState } from 'react';

export default function RegisterPage() {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const str = (k: string) => String(f.get(k) ?? '').trim();
    setBusy(true);
    setError(null);
    const res = await fetch('/session/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        school: {
          name: str('name'),
          slug: str('slug').toLowerCase(),
          motto: str('motto') || undefined,
          address: str('address') || undefined,
        },
        owner: { fullName: str('fullName'), email: str('email'), password: String(f.get('password')) },
      }),
    });
    setBusy(false);
    if (res.ok) {
      window.location.href = '/';
      return;
    }
    const body = await res.json().catch(() => ({}));
    setError(body.issues?.map((i: { path: string; message: string }) => `${i.path}: ${i.message}`).join('; ') ?? body.message ?? 'Could not register');
  }

  return (
    <div className="auth">
      <form className="card stack" onSubmit={submit}>
        <div>
          <h1>Register your school</h1>
          <p className="muted">You will be the proprietor account. You can add admins and teachers after.</p>
        </div>
        {error && <div className="alert error">{error}</div>}
        <label>
          School name
          <input name="name" required placeholder="Grace of Christ International School" />
        </label>
        <label>
          School address (used to log in)
          <input name="slug" required pattern="[a-z0-9\-]+" placeholder="gcis" title="Lowercase letters, numbers and dashes" />
        </label>
        <label>
          Motto
          <input name="motto" placeholder="Optional" />
        </label>
        <label>
          Street address
          <input name="address" placeholder="Optional" />
        </label>
        <label>
          Your full name
          <input name="fullName" required />
        </label>
        <label>
          Your email
          <input name="email" type="email" required />
        </label>
        <label>
          Password (8 characters or more)
          <input name="password" type="password" minLength={8} required autoComplete="new-password" />
        </label>
        <button disabled={busy}>{busy ? 'Creating…' : 'Create school'}</button>
        <p className="muted">
          Already registered? <Link href="/login">Sign in</Link>
        </p>
      </form>
    </div>
  );
}
