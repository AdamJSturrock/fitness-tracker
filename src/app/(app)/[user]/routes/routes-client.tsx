'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import type { UserName, WalkingRoute } from '@/lib/types';
import {
  DEFAULT_PACE,
  DIFFICULTY_CHIP_CLASSES,
  DIFFICULTY_LABELS,
  estimateSteps,
  kcalForWalk,
  routeDifficulty,
} from '@/lib/walks';
import {
  archiveWalkingRoute,
  createWalkingRoute,
  updateWalkingRoute,
} from '@/server/actions';

const RouteMap = dynamic(() => import('@/components/RouteMap'), {
  ssr: false,
  loading: () => (
    <div className="h-80 w-full animate-pulse rounded-md bg-slate-100" />
  ),
});

export interface RoutesClientProps {
  userId: number;
  userSegment: UserName;
  routes: WalkingRoute[];
  latestWeightLb: number | null;
}

export default function RoutesClient({
  userId,
  routes,
  latestWeightLb,
}: RoutesClientProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [drawing, setDrawing] = useState(false);
  const [busy, setBusy] = useState(false);

  function refresh() {
    startTransition(() => {
      router.refresh();
    });
  }

  async function handleSaveNew(data: {
    name: string;
    defaultMinutes: number;
    latlngs: Array<[number, number]>;
    distanceMi: number;
    elevationGainFt: number | null;
  }) {
    setBusy(true);
    try {
      const { latlngsToGeoJson } = await import('@/lib/walks');
      await createWalkingRoute({
        userId,
        name: data.name,
        distanceMi: data.distanceMi,
        elevationGainFt: data.elevationGainFt,
        defaultMinutes: data.defaultMinutes,
        geojson: latlngsToGeoJson(data.latlngs),
      });
      setDrawing(false);
      refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setDrawing((v) => !v)}
          disabled={busy}
          className="inline-flex h-10 items-center rounded-lg bg-emerald-600 px-3 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-60"
        >
          {drawing ? 'Close drawing' : '+ New route'}
        </button>
      </div>

      {drawing ? (
        <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
          <RouteMap
            mode="draw"
            defaultCenter={[55.3098, -1.9119]}
            defaultZoom={14}
            onSave={handleSaveNew}
            onCancel={() => setDrawing(false)}
          />
        </div>
      ) : null}

      {routes.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">
          <p className="font-medium text-slate-700">No routes yet.</p>
          <p className="mt-1 text-xs">
            Click <span className="font-semibold">+ New route</span> to draw
            your first dog walk on the map.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {routes.map((r) => (
            <RouteCard
              key={r.id}
              route={r}
              latestWeightLb={latestWeightLb}
              onChange={refresh}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function RouteCard({
  route,
  latestWeightLb,
  onChange,
}: {
  route: WalkingRoute;
  latestWeightLb: number | null;
  onChange: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [name, setName] = useState(route.name);
  const [defaultMinutes, setDefaultMinutes] = useState(
    String(route.defaultMinutes),
  );

  async function persistName() {
    const trimmed = name.trim();
    if (trimmed === '' || trimmed === route.name) {
      setName(route.name);
      setEditingName(false);
      return;
    }
    setBusy(true);
    try {
      await updateWalkingRoute({ id: route.id, name: trimmed });
      setEditingName(false);
      onChange();
    } finally {
      setBusy(false);
    }
  }

  async function persistMinutes(raw: string) {
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 5) {
      setDefaultMinutes(String(route.defaultMinutes));
      return;
    }
    const value = Math.round(n);
    if (value === route.defaultMinutes) return;
    setBusy(true);
    try {
      await updateWalkingRoute({ id: route.id, defaultMinutes: value });
      onChange();
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!confirm(`Delete route "${route.name}"?`)) return;
    setBusy(true);
    try {
      await archiveWalkingRoute(route.id);
      onChange();
    } finally {
      setBusy(false);
    }
  }

  const elevRounded =
    route.elevationGainFt != null
      ? Math.round(route.elevationGainFt / 10) * 10
      : null;
  const estKcal = kcalForWalk({
    pace: DEFAULT_PACE,
    minutes: route.defaultMinutes,
    weightLb: latestWeightLb,
  });
  const difficulty = routeDifficulty(route.distanceMi, route.elevationGainFt);
  const estStepsCount = estimateSteps(route.distanceMi);

  return (
    <li className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            {editingName ? (
              <input
                autoFocus
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onBlur={persistName}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') persistName();
                  if (e.key === 'Escape') {
                    setName(route.name);
                    setEditingName(false);
                  }
                }}
                className="block h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-base font-semibold shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200"
              />
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <p className="truncate text-base font-semibold text-slate-900">
                  {route.name}
                </p>
                <span
                  className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${DIFFICULTY_CHIP_CLASSES[difficulty]}`}
                >
                  {DIFFICULTY_LABELS[difficulty]}
                </span>
              </div>
            )}
            <p className="mt-1 text-xs text-slate-500">
              {route.distanceMi.toFixed(1)} mi
              {elevRounded != null ? ` · ${elevRounded} ft gain` : ''}
              {' · '}default {route.defaultMinutes} min
              {latestWeightLb != null && estKcal > 0
                ? ` · ~${estKcal} kcal`
                : ''}
              {estStepsCount > 0
                ? ` · ~${estStepsCount.toLocaleString()} steps`
                : ''}
              {' · '}walked {route.walkCount}×
            </p>
            {latestWeightLb == null ? (
              <p className="mt-1 text-[11px] text-slate-400">
                Log a weight on Today to see kcal estimates.
              </p>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-3">
            {!editingName ? (
              <button
                type="button"
                onClick={() => setEditingName(true)}
                disabled={busy}
                className="text-xs font-medium text-emerald-700 hover:underline disabled:opacity-50"
              >
                Rename
              </button>
            ) : null}
            <button
              type="button"
              onClick={handleDelete}
              disabled={busy}
              className="text-xs font-medium text-rose-600 hover:underline disabled:opacity-50"
            >
              Delete
            </button>
          </div>
        </div>

        <div>
          <label className="block">
            <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Default minutes
            </span>
            <input
              type="text"
              inputMode="numeric"
              value={defaultMinutes}
              onChange={(e) =>
                setDefaultMinutes(e.target.value.replace(/[^0-9]/g, ''))
              }
              onBlur={(e) => persistMinutes(e.target.value)}
              className="mt-1 block h-9 w-24 rounded-md border border-slate-300 bg-white px-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200"
            />
          </label>
        </div>

        <RouteMap
          mode="preview"
          initialGeoJson={route.geojson}
          heightClass="h-40"
        />
      </div>
    </li>
  );
}
