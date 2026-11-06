'use client';

import { useCallback, useEffect, useState } from 'react';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: unknown,
  ) {
    super(message);
  }
}

function messageFrom(body: unknown, fallback: string): string {
  if (body && typeof body === 'object') {
    const b = body as { message?: unknown; issues?: { path: string; message: string }[]; problems?: { message: string }[] };
    if (b.issues?.length) return b.issues.map((i) => (i.path ? `${i.path}: ${i.message}` : i.message)).join('; ');
    if (b.problems?.length) return b.problems.map((p) => p.message).join('; ');
    if (typeof b.message === 'string') return b.message;
  }
  return fallback;
}

/** Calls the API through this app's /bff proxy. Redirects to login when the session has ended. */
export async function api<T = unknown>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const res = await fetch(`/bff/${path.replace(/^\//, '')}`, {
    method: init?.method ?? 'GET',
    headers: { 'content-type': 'application/json' },
    body: init?.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  if (res.status === 401 && typeof window !== 'undefined') {
    window.location.href = '/login';
  }
  if (!res.ok) throw new ApiError(messageFrom(body, `Request failed (${res.status})`), res.status, body);
  return body as T;
}

/** Loads `path` (skipped while null) and exposes the data, error and a reload function. */
export function useApi<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async () => {
    if (!path) {
      setData(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setData(await api<T>(path));
    } catch (e) {
      setError((e as Error).message);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [path]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { data, error, loading, reload };
}
