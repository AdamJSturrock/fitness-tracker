'use client';

import { useEffect, useState } from 'react';
import type { Food, MealItemWithFood } from '@/lib/types';

function parseGramsFromLabel(label: string): number | null {
  const m = label.match(/(\d+(?:\.\d+)?)\s*g\b/i);
  return m ? Number(m[1]) : null;
}

function macroPreview(food: Food, servings: number): string {
  const parts: string[] = [`${Math.round(food.caloriesPerServing * servings)} kcal`];
  if (food.proteinG != null) parts.push(`${(food.proteinG * servings).toFixed(1)}g P`);
  if (food.carbsG != null) parts.push(`${(food.carbsG * servings).toFixed(1)}g C`);
  if (food.fatG != null) parts.push(`${(food.fatG * servings).toFixed(1)}g F`);
  if (food.fiberG != null) parts.push(`${(food.fiberG * servings).toFixed(1)}g fiber`);
  if (food.satFatG != null) parts.push(`${(food.satFatG * servings).toFixed(1)}g sat-fat`);
  return parts.join(' · ');
}

export interface TodaysMealsProps {
  meals: MealItemWithFood[];
  dailyCalorieTarget: number | null;
  onUpdateServings: (id: number, servings: number) => Promise<void> | void;
  onRemove: (id: number) => Promise<void> | void;
}

function calsFor(m: MealItemWithFood): number {
  return Math.round(m.food.caloriesPerServing * m.servings);
}

export default function TodaysMeals({
  meals,
  dailyCalorieTarget,
  onUpdateServings,
  onRemove,
}: TodaysMealsProps) {
  const total = meals.reduce((sum, m) => sum + calsFor(m), 0);

  const status = useTotalStatus(total, dailyCalorieTarget);

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <header className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Today&rsquo;s meals
        </h2>
        <span className="text-xs text-slate-400">
          {meals.length} {meals.length === 1 ? 'item' : 'items'}
        </span>
      </header>

      {meals.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">
          Nothing logged yet — add your first food below.
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-slate-100">
          {meals.map((m) => (
            <MealRow
              key={m.id}
              meal={m}
              onUpdateServings={onUpdateServings}
              onRemove={onRemove}
            />
          ))}
        </ul>
      )}

      <CalorieFooter
        total={total}
        target={dailyCalorieTarget}
        status={status}
      />
    </section>
  );
}

type Status = 'under' | 'near' | 'over' | 'unknown';

function useTotalStatus(total: number, target: number | null): Status {
  if (target == null) return 'unknown';
  if (total > target + 200) return 'over';
  if (total > target) return 'near';
  return 'under';
}

function MealRow({
  meal,
  onUpdateServings,
  onRemove,
}: {
  meal: MealItemWithFood;
  onUpdateServings: (id: number, servings: number) => Promise<void> | void;
  onRemove: (id: number) => Promise<void> | void;
}) {
  const [val, setVal] = useState<string>(String(meal.servings));
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);

  // Keep local value in sync if parent changes (e.g. re-fetch).
  useEffect(() => {
    setVal(String(meal.servings));
  }, [meal.servings]);

  async function commit(next: number) {
    if (!Number.isFinite(next) || next <= 0) return;
    if (next === meal.servings) return;
    setBusy(true);
    try {
      await onUpdateServings(meal.id, next);
    } finally {
      setBusy(false);
    }
  }

  function step(delta: number) {
    const cur = Number(val);
    const base = Number.isFinite(cur) ? cur : meal.servings;
    const next = Math.max(0.1, Math.round((base + delta) * 10) / 10);
    setVal(String(next));
    void commit(next);
  }

  async function handleRemove() {
    setBusy(true);
    try {
      await onRemove(meal.id);
    } finally {
      setBusy(false);
    }
  }

  const currentServings = Number(val) || meal.servings;
  const cals = calsFor({ ...meal, servings: currentServings });
  const servingGrams = parseGramsFromLabel(meal.food.servingLabel);
  const currentPct = Math.round(currentServings * 100);
  const currentGrams =
    servingGrams != null ? Math.round(servingGrams * currentServings) : null;

  function setFromPct(raw: string) {
    const pct = Number(raw.replace(/[^0-9.]/g, ''));
    if (!Number.isFinite(pct) || pct <= 0) return;
    const nextServings = Math.round((pct / 100) * 100) / 100;
    setVal(String(nextServings));
    void commit(nextServings);
  }

  function setFromGrams(raw: string) {
    if (servingGrams == null) return;
    const g = Number(raw.replace(/[^0-9.]/g, ''));
    if (!Number.isFinite(g) || g <= 0) return;
    const nextServings = Math.round((g / servingGrams) * 100) / 100;
    setVal(String(nextServings));
    void commit(nextServings);
  }

  return (
    <li className="flex flex-col gap-2 py-2.5">
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-slate-900">
            {meal.food.name}
            {meal.food.brand ? (
              <span className="ml-1 font-normal text-slate-500">
                · {meal.food.brand}
              </span>
            ) : null}
          </p>
          <p className="truncate text-xs text-slate-500">
            {meal.food.servingLabel} · {meal.food.caloriesPerServing} kcal
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => step(-0.5)}
            disabled={busy}
            aria-label="Decrease servings"
            className="flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-700 transition hover:bg-slate-100 disabled:opacity-50"
          >
            <span aria-hidden>−</span>
          </button>
          <input
            type="text"
            inputMode="decimal"
            value={val}
            onChange={(e) =>
              setVal(e.target.value.replace(/[^0-9.]/g, ''))
            }
            onBlur={() => {
              const n = Number(val);
              if (Number.isFinite(n) && n > 0) {
                void commit(Math.round(n * 100) / 100);
              } else {
                setVal(String(meal.servings));
              }
            }}
            aria-label="Servings"
            className="h-9 w-14 rounded-md border border-slate-200 bg-white text-center text-sm font-semibold text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200"
          />
          <button
            type="button"
            onClick={() => step(0.5)}
            disabled={busy}
            aria-label="Increase servings"
            className="flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-700 transition hover:bg-slate-100 disabled:opacity-50"
          >
            <span aria-hidden>+</span>
          </button>
        </div>

        <button
          type="button"
          onClick={() => setEditing((e) => !e)}
          aria-label={editing ? 'Close portion editor' : 'Edit portion'}
          aria-expanded={editing}
          className={
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-md border transition ' +
            (editing
              ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
              : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-100')
          }
        >
          <span aria-hidden>✎</span>
        </button>

        <div className="w-16 shrink-0 text-right text-sm font-semibold tabular-nums text-slate-700">
          {cals} <span className="text-xs font-normal text-slate-500">kcal</span>
        </div>

        <button
          type="button"
          onClick={handleRemove}
          disabled={busy}
          aria-label="Remove"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-slate-400 transition hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50"
        >
          <span aria-hidden>✕</span>
        </button>
      </div>

      {editing ? (
        <div className="ml-0 rounded-lg border border-emerald-100 bg-emerald-50/50 p-3">
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col text-xs font-medium text-slate-600">
              % consumed
              <input
                type="text"
                inputMode="decimal"
                value={String(currentPct)}
                onChange={(e) => setFromPct(e.target.value)}
                className="mt-1 h-9 w-20 rounded-md border border-slate-200 bg-white text-center text-sm font-semibold text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200"
              />
            </label>
            {servingGrams != null ? (
              <label className="flex flex-col text-xs font-medium text-slate-600">
                grams eaten (of {servingGrams}g)
                <input
                  type="text"
                  inputMode="decimal"
                  value={currentGrams != null ? String(currentGrams) : ''}
                  onChange={(e) => setFromGrams(e.target.value)}
                  className="mt-1 h-9 w-24 rounded-md border border-slate-200 bg-white text-center text-sm font-semibold text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200"
                />
              </label>
            ) : (
              <p className="text-xs text-slate-500">
                Serving isn&rsquo;t in grams — use % only.
              </p>
            )}
            <div className="flex flex-wrap gap-1">
              {[25, 50, 75, 100].map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setFromPct(String(p))}
                  className="h-7 rounded-md border border-slate-200 bg-white px-2 text-xs font-medium text-slate-600 hover:bg-emerald-50 hover:text-emerald-700"
                >
                  {p}%
                </button>
              ))}
            </div>
          </div>
          <p className="mt-2 text-xs text-slate-600">
            {macroPreview(meal.food, currentServings)}
          </p>
        </div>
      ) : null}
    </li>
  );
}

function CalorieFooter({
  total,
  target,
  status,
}: {
  total: number;
  target: number | null;
  status: Status;
}) {
  const pct = target ? Math.min(150, Math.round((total / target) * 100)) : 0;
  const barWidth = target ? Math.min(100, (total / target) * 100) : 0;

  const barColor =
    status === 'over'
      ? 'bg-rose-600'
      : status === 'near'
        ? 'bg-amber-500'
        : 'bg-emerald-600';

  const textColor =
    status === 'over'
      ? 'text-rose-700'
      : status === 'near'
        ? 'text-amber-700'
        : 'text-emerald-700';

  return (
    <div className="mt-3 border-t border-slate-100 pt-3">
      <div className="flex items-baseline justify-between">
        <span className={'text-base font-semibold tabular-nums ' + textColor}>
          {total} {target ? `/ ${target}` : ''} kcal
        </span>
        {target ? (
          <span className="text-xs text-slate-500">{pct}%</span>
        ) : (
          <span className="text-xs text-slate-400">No target set</span>
        )}
      </div>
      {target ? (
        <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-slate-100">
          <div
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={target}
            aria-valuenow={total}
            className={'h-full transition-all ' + barColor}
            style={{ width: `${barWidth}%` }}
          />
        </div>
      ) : null}
    </div>
  );
}
