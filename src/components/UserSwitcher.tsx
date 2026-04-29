'use client';

import { useParams, usePathname, useRouter } from 'next/navigation';
import { useTransition } from 'react';
import type { UserName } from '@/lib/types';

const USERS: { name: UserName; label: string }[] = [
  { name: 'adam', label: 'Adam' },
  { name: 'anna', label: 'Anna' },
  { name: 'demo', label: 'Demo' },
];

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

function setUserCookie(user: UserName) {
  if (typeof document === 'undefined') return;
  const secure =
    typeof window !== 'undefined' && window.location.protocol === 'https:'
      ? '; Secure'
      : '';
  document.cookie = `fit_user=${user}; Max-Age=${ONE_YEAR_SECONDS}; Path=/; SameSite=Lax${secure}`;
}

export default function UserSwitcher() {
  const params = useParams<{ user?: string }>();
  const pathname = usePathname();
  const router = useRouter();
  const [, startTransition] = useTransition();

  const current: UserName | null =
    params?.user === 'adam' ||
    params?.user === 'anna' ||
    params?.user === 'demo'
      ? (params.user as UserName)
      : null;

  function switchTo(target: UserName) {
    setUserCookie(target);
    if (current && pathname) {
      const next = pathname.replace(`/${current}/`, `/${target}/`);
      startTransition(() => router.push(next));
    } else {
      startTransition(() => router.push(`/${target}/dashboard`));
    }
  }

  return (
    <div
      role="tablist"
      aria-label="Select user"
      className="inline-flex items-center rounded-full border border-slate-200 bg-white p-0.5 shadow-sm"
    >
      {USERS.map((u) => {
        const active = u.name === current;
        return (
          <button
            key={u.name}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => switchTo(u.name)}
            className={
              'min-w-[64px] rounded-full px-3 py-1.5 text-sm font-medium transition ' +
              (active
                ? 'bg-emerald-600 text-white shadow'
                : 'text-slate-600 hover:bg-slate-100')
            }
          >
            {u.label}
          </button>
        );
      })}
    </div>
  );
}
