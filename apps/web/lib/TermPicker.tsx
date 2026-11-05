'use client';

import type { Session } from './types';

/** All terms across sessions, newest session first. */
export function TermPicker({ sessions, value, onChange }: { sessions: Session[] | null; value: string; onChange: (id: string) => void }) {
  const ordered = [...(sessions ?? [])].sort((a, b) => b.name.localeCompare(a.name));
  return (
    <label>
      Term
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Choose a term…</option>
        {ordered.map((s) => (
          <optgroup key={s.id} label={s.name}>
            {s.terms.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
                {t.isCurrent ? ' (current)' : ''}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </label>
  );
}

export function currentTermId(sessions: Session[] | null): string {
  return sessions?.flatMap((s) => s.terms).find((t) => t.isCurrent)?.id ?? '';
}
