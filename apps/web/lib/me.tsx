'use client';

import { createContext, useContext } from 'react';
import type { Me } from './types';

export const MeContext = createContext<Me | null>(null);

export function useMe(): Me {
  const me = useContext(MeContext);
  if (!me) throw new Error('useMe must be used inside the signed-in layout');
  return me;
}

export const isLeader = (me: Me) => me.staff.role === 'proprietor' || me.staff.role === 'admin';
