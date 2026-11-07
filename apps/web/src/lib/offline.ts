'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from './api';

/**
 * Offline mode for staff. Score sheets and registers saved with no connection go into an outbox
 * on this device (IndexedDB) and are sent, oldest first, as soon as the connection is back.
 * A later save of the same sheet or register replaces the waiting one, so nothing is sent twice.
 */

export interface OutboxItem {
  /** "owner METHOD path": one waiting change per person and score sheet or register. */
  key: string;
  method: 'PUT' | 'POST';
  path: string;
  body: unknown;
  /** What the teacher sees, e.g. "SS 2 A Physics scores". */
  label: string;
  queuedAt: number;
  /** Staff id of who saved it. Only sent while that person is signed in on this device. */
  owner: string | null;
  /** Set when the server turned the change down (e.g. a score above the maximum); it is not retried. */
  failed?: string;
}

const DB_NAME = 'linx-offline';
const STORE = 'outbox';
const EVENT = 'linx-outbox';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'key' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const t = db.transaction(STORE, mode);
      const req = fn(t.objectStore(STORE));
      t.oncomplete = () => resolve(req.result);
      t.onerror = () => reject(t.error);
    });
  } finally {
    db.close();
  }
}

const changed = () => window.dispatchEvent(new Event(EVENT));

let owner: string | null = null;
/** Who is signed in. Set by the app shell; queued changes are stamped with it and only sent for them. */
export function setOutboxOwner(id: string | null) {
  if (owner === id) return;
  owner = id;
  changed();
  if (id && navigator.onLine) void flushOutbox();
}
const mine = (i: OutboxItem) => i.owner === owner;

export async function outboxItems(): Promise<OutboxItem[]> {
  if (typeof indexedDB === 'undefined') return [];
  const items = await tx<OutboxItem[]>('readonly', (s) => s.getAll() as IDBRequest<OutboxItem[]>);
  return items.filter(mine).sort((a, b) => a.queuedAt - b.queuedAt);
}

/** The change waiting to be sent for this path, if any, so a screen can show it instead of the older copy. */
export async function pendingFor(path: string): Promise<OutboxItem | undefined> {
  return (await outboxItems()).find((i) => i.path === path && !i.failed);
}

async function enqueue(item: Omit<OutboxItem, 'key' | 'queuedAt' | 'owner'>) {
  await tx('readwrite', (s) => s.put({ ...item, owner, key: `${owner ?? ''} ${item.method} ${item.path}`, queuedAt: Date.now() }));
  changed();
}

export async function dropOutboxItem(key: string) {
  await tx('readwrite', (s) => s.delete(key));
  changed();
}

/** True when the request never reached the server (no signal, airplane mode, server unreachable). */
export function isNetworkError(e: unknown) {
  return e instanceof TypeError || (typeof navigator !== 'undefined' && navigator.onLine === false);
}

/**
 * Sends a change now, or keeps it on this device when there is no connection.
 * Returns `{ queued: true }` when it was kept for later.
 */
export async function sendOrQueue<T>(path: string, init: { method: 'PUT' | 'POST'; body: unknown; label: string }): Promise<{ queued: false; data: T } | { queued: true }> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    await enqueue({ path, method: init.method, body: init.body, label: init.label });
    return { queued: true };
  }
  try {
    const data = await api<T>(path, { method: init.method, body: init.body });
    // This save is newer than anything still waiting for the same sheet.
    await dropOutboxItem(`${owner ?? ''} ${init.method} ${path}`).catch(() => undefined);
    return { queued: false, data };
  } catch (e) {
    if (!isNetworkError(e)) throw e;
    await enqueue({ path, method: init.method, body: init.body, label: init.label });
    return { queued: true };
  }
}

let flushing: Promise<{ sent: number; failed: number }> | null = null;

/** Sends everything waiting, oldest first. Stops at the first network failure and tries again later. */
export function flushOutbox(): Promise<{ sent: number; failed: number }> {
  flushing ??= (async () => {
    let sent = 0;
    let failed = 0;
    try {
      for (const item of await outboxItems()) {
        if (item.failed) continue;
        let res: Response;
        try {
          res = await fetch(`/bff/${item.path}`, { method: item.method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(item.body) });
        } catch {
          break; // Still offline.
        }
        if (res.ok) {
          await tx('readwrite', (s) => s.delete(item.key));
          sent++;
        } else if (res.status === 401) {
          break; // Signed out: keep everything until they sign in again on this device.
        } else if (res.status >= 500 || res.status === 429 || res.status === 408) {
          break; // Server trouble: try again later.
        } else {
          const body = (await res.json().catch(() => null)) as { message?: string; problems?: { message: string }[] } | null;
          const message = body?.problems?.map((p) => p.message).join('; ') || body?.message || `Not saved (${res.status})`;
          await tx('readwrite', (s) => s.put({ ...item, failed: message }));
          failed++;
        }
      }
    } finally {
      flushing = null;
      changed();
    }
    return { sent, failed };
  })();
  return flushing;
}

/**
 * Clears the offline copies of pages and data, e.g. on sign-out on a shared phone, and this
 * person's outbox too when `outbox` is set.
 */
export async function clearOfflineData({ outbox = true } = {}) {
  try {
    if (outbox && typeof indexedDB !== 'undefined') for (const i of await outboxItems()) await tx('readwrite', (s) => s.delete(i.key));
  } catch {
    /* nothing stored */
  }
  try {
    if ('caches' in window) for (const k of await caches.keys()) if (k.startsWith('linx-')) await caches.delete(k);
  } catch {
    /* no cache storage */
  }
}

/** Live view of the outbox and connection, and a way to sync now. Syncs on reconnect and every 30 seconds while items wait. */
export function useOutbox() {
  const [items, setItems] = useState<OutboxItem[]>([]);
  const [online, setOnline] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [lastSent, setLastSent] = useState(0);

  const refresh = useCallback(async () => setItems(await outboxItems().catch(() => [])), []);
  const sync = useCallback(async () => {
    setSyncing(true);
    try {
      const r = await flushOutbox();
      if (r.sent) setLastSent(r.sent);
    } finally {
      setSyncing(false);
      await refresh();
    }
  }, [refresh]);

  useEffect(() => {
    setOnline(navigator.onLine);
    void refresh().then(() => (navigator.onLine ? sync() : undefined));
    const on = () => {
      setOnline(true);
      void sync();
    };
    const off = () => setOnline(false);
    const upd = () => void refresh();
    const vis = () => document.visibilityState === 'visible' && navigator.onLine && void sync();
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    window.addEventListener(EVENT, upd);
    document.addEventListener('visibilitychange', vis);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
      window.removeEventListener(EVENT, upd);
      document.removeEventListener('visibilitychange', vis);
    };
  }, [refresh, sync]);

  const waiting = items.filter((i) => !i.failed).length;
  useEffect(() => {
    if (!waiting || !online) return;
    const t = setInterval(() => void sync(), 30_000);
    return () => clearInterval(t);
  }, [waiting, online, sync]);

  return { items, waiting, failed: items.filter((i) => i.failed), online, syncing, lastSent, clearLastSent: () => setLastSent(0), sync };
}
