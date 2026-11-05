'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useApi } from '@/lib/api';
import { isLeader, MeContext } from '@/lib/me';
import type { Me } from '@/lib/types';

const LEADER_LINKS = [
  { group: 'Setup' },
  { href: '/setup/sessions', label: 'Sessions and terms' },
  { href: '/setup/classes', label: 'Classes' },
  { href: '/setup/subjects', label: 'Subjects' },
  { href: '/setup/staff', label: 'Staff' },
  { href: '/students', label: 'Students' },
] as const;

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { data: me, error } = useApi<Me>('auth/me');

  if (error) return <div className="main"><div className="alert error">{error}</div></div>;
  if (!me) return <div className="main muted">Loading…</div>;

  const link = (href: string, label: string) => (
    <Link key={href} href={href} className={pathname === href || (href !== '/' && pathname.startsWith(href)) ? 'active' : ''}>
      {label}
    </Link>
  );

  async function logout() {
    await fetch('/session/logout', { method: 'POST' });
    window.location.href = '/login';
  }

  return (
    <MeContext.Provider value={me}>
      <div className="shell">
        <nav className="sidebar no-print">
          <div className="school">{me.school.name}</div>
          <div className="who">
            {me.staff.fullName} · {me.staff.role}
          </div>
          {link('/', 'Dashboard')}
          {link('/scores', 'Enter scores')}
          {link('/results', 'Results and report cards')}
          {isLeader(me) &&
            LEADER_LINKS.map((l) => ('group' in l ? <div key={l.group} className="group">{l.group}</div> : link(l.href, l.label)))}
          <div className="spacer" />
          <button className="link" onClick={logout} style={{ textAlign: 'left', padding: '8px 10px' }}>
            Sign out
          </button>
        </nav>
        <main className="main">{children}</main>
      </div>
    </MeContext.Provider>
  );
}
