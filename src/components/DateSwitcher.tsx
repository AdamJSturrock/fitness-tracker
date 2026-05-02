'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { addDays } from '@/lib/dateUtils';
import type { UserName } from '@/lib/types';

export interface DateSwitcherProps {
  userSegment: UserName;
  date: string;
  todayIso: string;
}

export default function DateSwitcher({
  userSegment,
  date,
  todayIso,
}: DateSwitcherProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const isToday = date === todayIso;
  const prev = addDays(date, -1);
  const next = addDays(date, 1);
  const canGoNext = next <= todayIso;

  const base = `/${userSegment}/today`;
  const hrefFor = (d: string) => (d === todayIso ? base : `${base}?date=${d}`);

  function jumpTo(d: string) {
    if (d > todayIso || d === date) return;
    startTransition(() => {
      router.push(hrefFor(d));
    });
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="flex items-center gap-2">
        <Link
          href={hrefFor(prev)}
          aria-label="Previous day"
          className="flex h-10 w-10 items-center justify-center rounded-md border border-slate-200 bg-white text-lg font-semibold text-slate-700 hover:bg-slate-50"
        >
          ‹
        </Link>

        <input
          type="date"
          value={date}
          max={todayIso}
          onChange={(e) => jumpTo(e.target.value)}
          className="h-10 flex-1 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-900 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200"
        />

        <Link
          href={hrefFor(next)}
          aria-label="Next day"
          aria-disabled={!canGoNext || undefined}
          tabIndex={canGoNext ? undefined : -1}
          onClick={(e) => {
            if (!canGoNext) e.preventDefault();
          }}
          className={
            'flex h-10 w-10 items-center justify-center rounded-md border text-lg font-semibold ' +
            (canGoNext
              ? 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
              : 'cursor-not-allowed border-slate-100 bg-slate-50 text-slate-300')
          }
        >
          ›
        </Link>

        <Link
          href={base}
          aria-disabled={isToday || undefined}
          tabIndex={isToday ? -1 : undefined}
          onClick={(e) => {
            if (isToday) e.preventDefault();
          }}
          className={
            'h-10 rounded-md border px-3 text-sm font-medium ' +
            (isToday
              ? 'cursor-not-allowed border-slate-100 bg-slate-50 text-slate-300'
              : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50')
          }
        >
          Today
        </Link>
      </div>
      {!isToday ? (
        <p className="mt-2 text-xs text-slate-500">
          Editing a past day{pending ? ' — loading…' : ''}. Changes save to this date.
        </p>
      ) : null}
    </section>
  );
}
