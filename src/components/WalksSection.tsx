'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import type {
  UserName,
  WalkingRoute,
  WalkLogWithRoute,
  WalkPace,
} from '@/lib/types';

const RouteMap = dynamic(() => import('@/components/RouteMap'), {
  ssr: false,
  loading: () => (
    <div className="h-20 w-20 shrink-0 animate-pulse rounded-md bg-slate-100" />
  ),
});
import {
  DEFAULT_PACE,
  DIFFICULTY_CHIP_CLASSES,
  DIFFICULTY_LABELS,
  PACE_LABELS,
  estimateSteps,
  kcalForWalk,
  routeDifficulty,
} from '@/lib/walks';

export interface WalksSectionProps {
  userId: number;
  userSegment: UserName;
  date: string;
  routes: WalkingRoute[];
  walkLogs: WalkLogWithRoute[];
  /** Latest logged weight; used to estimate kcal. */
  weightLb: number | null;
  onLog: (input: {
    walkingRouteId: number;
    durationMin: number;
    pace: WalkPace;
  }) => Promise<void>;
  onRemove: (id: number) => Promise<void>;
}

const PACE_ORDER: WalkPace[] = ['brisk', 'normal', 'stoppy'];

export default function WalksSection({
  userSegment,
  routes,
  walkLogs,
  weightLb,
  onLog,
  onRemove,
}: WalksSectionProps) {
  const [openRouteId, setOpenRouteId] = useState<number | null>(null);

  const totalMinutes = walkLogs.reduce((sum, w) => sum + w.durationMin, 0);
  const totalKcal = walkLogs.reduce(
    (sum, w) =>
      sum +
      kcalForWalk({
        pace: w.pace,
        minutes: w.durationMin,
        weightLb,
      }),
    0,
  );

  return (
    <section
      aria-label="Walks"
      className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
    >
      <header className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-slate-900">Walks</h2>
        <Link
          href={`/${userSegment}/routes`}
          className="rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
        >
          Manage routes
        </Link>
      </header>

      {routes.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600">
          <p>No walking routes yet.</p>
          <p className="mt-1">
            Add some on the{' '}
            <Link
              href={`/${userSegment}/routes`}
              className="font-semibold text-emerald-700 hover:underline"
            >
              Walks tab
            </Link>{' '}
            so you can one-tap log your dog walks.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
            Routes
          </p>
          <ul className="space-y-2">
            {routes.map((route) => (
              <li key={route.id}>
                {openRouteId === route.id ? (
                  <LogForm
                    route={route}
                    weightLb={weightLb}
                    onCancel={() => setOpenRouteId(null)}
                    onSave={async (input) => {
                      await onLog(input);
                      setOpenRouteId(null);
                    }}
                  />
                ) : (
                  <RouteCardButton
                    route={route}
                    weightLb={weightLb}
                    onOpen={() => setOpenRouteId(route.id)}
                  />
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {walkLogs.length > 0 ? (
        <div className="space-y-2 border-t border-slate-100 pt-3">
          <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
            Today&rsquo;s walks
          </p>
          <ul className="space-y-2">
            {walkLogs.map((log) => (
              <WalkLogRow
                key={log.id}
                log={log}
                weightLb={weightLb}
                onRemove={onRemove}
              />
            ))}
          </ul>
          <p className="pt-1 text-xs text-slate-500">
            Total: {walkLogs.length} {walkLogs.length === 1 ? 'walk' : 'walks'}{' '}
            · {totalMinutes} min
            {weightLb != null ? ` · ~${totalKcal} kcal` : ''}
          </p>
        </div>
      ) : null}
    </section>
  );
}

function formatDistance(mi: number): string {
  return mi.toFixed(mi < 10 ? 1 : 0);
}

function RouteCardButton({
  route,
  weightLb,
  onOpen,
}: {
  route: WalkingRoute;
  weightLb: number | null;
  onOpen: () => void;
}) {
  const difficulty = routeDifficulty(route.distanceMi, route.elevationGainFt);
  const estKcal = kcalForWalk({
    pace: DEFAULT_PACE,
    minutes: route.defaultMinutes,
    weightLb,
  });
  const estStepsCount = estimateSteps(route.distanceMi);
  const elevRounded =
    route.elevationGainFt != null
      ? Math.round(route.elevationGainFt / 10) * 10
      : null;

  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-stretch gap-3 rounded-lg border border-slate-200 bg-white p-2 text-left transition hover:border-emerald-300 hover:bg-emerald-50"
    >
      <div className="h-20 w-20 shrink-0">
        <RouteMap
          mode="preview"
          initialGeoJson={route.geojson}
          heightClass="h-20"
        />
      </div>
      <div className="flex min-w-0 flex-1 flex-col justify-between gap-1 py-1 pr-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="min-w-0 truncate text-sm font-semibold text-slate-900">
            {route.name}
          </span>
          <span
            className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${DIFFICULTY_CHIP_CLASSES[difficulty]}`}
          >
            {DIFFICULTY_LABELS[difficulty]}
          </span>
          {route.walkCount > 0 ? (
            <span className="inline-flex shrink-0 items-center rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">
              {route.walkCount}×
            </span>
          ) : null}
        </div>
        <p className="text-[11px] leading-snug text-slate-500">
          {formatDistance(route.distanceMi)} mi
          {elevRounded != null ? ` · ${elevRounded} ft` : ''}
          {' · '}
          {route.defaultMinutes} min
          {weightLb != null && estKcal > 0 ? ` · ~${estKcal} kcal` : ''}
          {estStepsCount > 0 ? ` · ~${estStepsCount.toLocaleString()} steps` : ''}
        </p>
      </div>
    </button>
  );
}

function LogForm({
  route,
  weightLb,
  onSave,
  onCancel,
}: {
  route: WalkingRoute;
  weightLb: number | null;
  onSave: (input: {
    walkingRouteId: number;
    durationMin: number;
    pace: WalkPace;
  }) => Promise<void>;
  onCancel: () => void;
}) {
  const [minutes, setMinutes] = useState<string>(String(route.defaultMinutes));
  const [pace, setPace] = useState<WalkPace>(DEFAULT_PACE);
  const [pending, startTransition] = useTransition();

  const parsedMinutes = Number(minutes);
  const minutesValid =
    Number.isFinite(parsedMinutes) && parsedMinutes > 0;

  const liveKcal =
    minutesValid && weightLb != null
      ? kcalForWalk({ pace, minutes: parsedMinutes, weightLb })
      : null;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!minutesValid || pending) return;
    const durationMin = Math.round(parsedMinutes);
    startTransition(() => {
      void onSave({
        walkingRouteId: route.id,
        durationMin,
        pace,
      });
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      aria-label={`Log walk: ${route.name}`}
      className="space-y-3 rounded-lg border border-emerald-300 bg-emerald-50/40 p-3"
    >
      <p className="text-sm font-semibold text-slate-900">
        Log: {route.name}
      </p>

      <label className="block">
        <span className="block text-[11px] font-medium uppercase tracking-wide text-slate-500">
          Minutes
        </span>
        <input
          type="text"
          inputMode="numeric"
          value={minutes}
          onChange={(e) =>
            setMinutes(e.target.value.replace(/[^0-9]/g, ''))
          }
          disabled={pending}
          className="mt-1 block h-10 w-24 rounded-md border border-slate-300 bg-white px-2 text-sm text-slate-900 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200 disabled:opacity-60"
        />
      </label>

      <fieldset className="space-y-1">
        <legend className="block text-[11px] font-medium uppercase tracking-wide text-slate-500">
          Pace
        </legend>
        <div className="flex flex-wrap gap-2">
          {PACE_ORDER.map((p) => (
            <label
              key={p}
              className={
                'inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-1.5 text-sm transition ' +
                (pace === p
                  ? 'border-emerald-600 bg-emerald-600 text-white'
                  : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50')
              }
            >
              <input
                type="radio"
                name={`pace-${route.id}`}
                value={p}
                checked={pace === p}
                onChange={() => setPace(p)}
                disabled={pending}
                className="sr-only"
              />
              {PACE_LABELS[p]}
            </label>
          ))}
        </div>
      </fieldset>

      <p className="text-xs text-slate-600">
        {liveKcal != null ? (
          <>
            Live: <span className="font-semibold">~{liveKcal} kcal</span>
          </>
        ) : weightLb == null ? (
          <span className="text-slate-500">
            Log weight to estimate kcal.
          </span>
        ) : (
          <span className="text-slate-500">Enter minutes to estimate kcal.</span>
        )}
      </p>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={pending}
          className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={!minutesValid || pending}
          className="h-10 rounded-md border border-emerald-600 bg-emerald-600 px-3 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-60"
        >
          {pending ? 'Saving…' : 'Save walk'}
        </button>
      </div>
    </form>
  );
}

function WalkLogRow({
  log,
  weightLb,
  onRemove,
}: {
  log: WalkLogWithRoute;
  weightLb: number | null;
  onRemove: (id: number) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const kcal = kcalForWalk({
    pace: log.pace,
    minutes: log.durationMin,
    weightLb,
  });

  async function handleRemove() {
    if (busy) return;
    const ok = window.confirm(`Remove "${log.routeName}" walk?`);
    if (!ok) return;
    setBusy(true);
    try {
      await onRemove(log.id);
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="flex items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
      <span
        aria-hidden
        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-emerald-600 bg-emerald-600 text-sm font-semibold text-white"
      >
        ✓
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-slate-900">
          {log.routeName}
        </p>
        <p className="text-xs text-slate-600">
          {log.durationMin} min · {PACE_LABELS[log.pace].toLowerCase()}
          {weightLb != null ? (
            <>
              {' '}
              · <span className="font-semibold">~{kcal} kcal</span>
            </>
          ) : null}
        </p>
      </div>
      <button
        type="button"
        onClick={handleRemove}
        disabled={busy}
        aria-label={`Remove ${log.routeName} walk`}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-slate-400 transition hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50"
      >
        <span aria-hidden>✕</span>
      </button>
    </li>
  );
}
