'use client';

import { useState } from 'react';

/** Runs an API call from a button or form: tracks busy state, the error message, and a success notice. */
export function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function run<T>(fn: () => Promise<T>, success?: string | ((r: T) => string)): Promise<T | undefined> {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const r = await fn();
      if (success) setNotice(typeof success === 'function' ? success(r) : success);
      return r;
    } catch (e) {
      setError((e as Error).message);
      return undefined;
    } finally {
      setBusy(false);
    }
  }

  return { busy, error, notice, run, setError, setNotice };
}
