'use client';

import { FormEvent, useState } from 'react';

/** Wraps a form submit: tracks busy state, shows the API's error message, and resets the form on success. */
export function useSubmit(run: (form: FormData) => Promise<string | void>) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const message = await run(new FormData(form));
      form.reset();
      if (message) setNotice(message);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return { busy, error, notice, onSubmit, setError };
}
