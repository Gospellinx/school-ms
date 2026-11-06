'use client';

import * as React from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Avatar } from '@/components/ui/avatar';
import { useParent } from './session';
import { className, type ParentMe } from './types';
import { cn } from './utils';

type Child = ParentMe['children'][number];
const KEY = 'sms_child';

/** The child a parent is looking at: ?child= in the URL, else the last one picked, else the first. */
export function useChild(): Child | null {
  const me = useParent();
  const q = useSearchParams();
  const wanted = q.get('child');
  const [remembered, setRemembered] = React.useState<string | null>(null);
  React.useEffect(() => {
    try {
      setRemembered(localStorage.getItem(KEY));
    } catch {
      /* storage blocked */
    }
  }, []);
  const child = me.children.find((c) => c.id === wanted) ?? me.children.find((c) => c.id === remembered) ?? me.children[0] ?? null;
  React.useEffect(() => {
    if (!child) return;
    try {
      localStorage.setItem(KEY, child.id);
    } catch {
      /* storage blocked */
    }
  }, [child]);
  return child;
}

export const childName = (c: Child) => `${c.firstName} ${c.lastName}`;
export const childClass = (c: Child) => (c.className ? className({ name: c.className, arm: c.arm }) : 'No class');

/** Pill buttons to switch between children. Hidden when there is only one. */
export function ChildPicker({ current }: { current: Child | null }) {
  const me = useParent();
  const router = useRouter();
  const path = usePathname();
  if (me.children.length < 2) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {me.children.map((k) => (
        <button
          key={k.id}
          onClick={() => router.replace(`${path}?child=${k.id}`)}
          className={cn('flex items-center gap-2 rounded-2xl px-3 py-2 text-sm', k.id === current?.id ? 'bg-white font-semibold ring-2 ring-brand-500' : 'bg-white/60 text-muted hover:bg-white')}
        >
          <Avatar name={childName(k)} size={28} /> {k.firstName} <span className="text-xs text-muted">{childClass(k)}</span>
        </button>
      ))}
    </div>
  );
}
