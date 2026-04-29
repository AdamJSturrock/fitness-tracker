'use client';

import Link from 'next/link';
import { useParams, usePathname } from 'next/navigation';
import type { UserName } from '@/lib/types';

const TABS = [
  { slug: 'dashboard', label: 'Dashboard' },
  { slug: 'today', label: 'Today' },
  { slug: 'routines', label: 'Routines' },
  { slug: 'foods', label: 'Foods' },
  { slug: 'profile', label: 'Profile' },
] as const;

export default function NavTabs() {
  const params = useParams<{ user?: string }>();
  const pathname = usePathname() ?? '';
  const user: UserName =
    params?.user === 'adam' ||
    params?.user === 'anna' ||
    params?.user === 'demo'
      ? (params.user as UserName)
      : 'adam';

  return (
    <nav
      aria-label="Sections"
      className="mx-auto max-w-3xl px-2 pb-2 sm:px-4"
    >
      <ul className="grid grid-cols-5 gap-1">
        {TABS.map((t) => {
          const href = `/${user}/${t.slug}`;
          const active = pathname.startsWith(href);
          return (
            <li key={t.slug}>
              <Link
                href={href}
                aria-current={active ? 'page' : undefined}
                className={
                  'flex h-11 items-center justify-center rounded-md px-1 text-center text-xs font-medium transition sm:text-sm ' +
                  (active
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200')
                }
              >
                {t.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
