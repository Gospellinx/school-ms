'use client';

import { useEffect, useState } from 'react';
import { Select } from '@/components/ui/input';
import { useApi } from './api';
import type { Session } from './types';

/** The school's sessions and terms, and the term picked on this page (the current term to start with). */
export function useTerms() {
  const { data: sessions, error, reload } = useApi<Session[]>('sessions');
  const [termId, setTermId] = useState('');
  useEffect(() => {
    if (!termId && sessions) setTermId(currentTermId(sessions));
  }, [sessions, termId]);
  return { sessions, error, termId, setTermId, reload, label: termLabel(sessions, termId) };
}

export function TermSelect({ sessions, value, onChange, className }: { sessions: Session[] | null; value: string; onChange: (id: string) => void; className?: string }) {
  const ordered = [...(sessions ?? [])].sort((a, b) => b.name.localeCompare(a.name));
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)} className={className} aria-label="Term">
      {!value ? <option value="">Choose a term…</option> : null}
      {ordered.map((s) => (
        <optgroup key={s.id} label={s.name}>
          {s.terms.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name} {s.name}
              {t.isCurrent ? ' (current)' : ''}
            </option>
          ))}
        </optgroup>
      ))}
    </Select>
  );
}

export function currentTermId(sessions: Session[] | null): string {
  const all = sessions?.flatMap((s) => s.terms) ?? [];
  return all.find((t) => t.isCurrent)?.id ?? all[all.length - 1]?.id ?? '';
}

export function termLabel(sessions: Session[] | null, termId: string) {
  for (const s of sessions ?? []) {
    const t = s.terms.find((x) => x.id === termId);
    if (t) return `${t.name}, ${s.name}`;
  }
  return '';
}
