'use client';

import { useMemo, useState } from 'react';
import type { Food } from '@/lib/types';
import FoodForm, { type FoodFormInput } from './FoodForm';

export interface FoodPickerProps {
  foods: Food[];
  recentFoods: Food[];
  /** Add an existing food to today's meals at given servings. */
  onAdd: (foodId: number, servings: number) => Promise<void> | void;
  /**
   * Create a new food in the library AND add it to today's meals (1 serving).
   * Wave 3 wires this to the real `createFood` + `addMealItem` actions.
   */
  onCreateAndAdd: (input: FoodFormInput) => Promise<void> | void;
}

export default function FoodPicker({
  foods,
  recentFoods,
  onAdd,
  onCreateAndAdd,
}: FoodPickerProps) {
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState<number | 'new' | null>(null);

  const trimmed = search.trim().toLowerCase();
  const results = useMemo(() => {
    if (trimmed === '') return [];
    return foods
      .filter((f) => !f.archived)
      .filter((f) => {
        const hay = `${f.name} ${f.brand ?? ''}`.toLowerCase();
        return hay.includes(trimmed);
      })
      .slice(0, 25);
  }, [foods, trimmed]);

  async function handleAdd(food: Food) {
    setBusy(food.id);
    try {
      await onAdd(food.id, 1);
    } finally {
      setBusy(null);
    }
  }

  async function handleCreate(input: FoodFormInput) {
    setBusy('new');
    try {
      await onCreateAndAdd(input);
      setSearch('');
      setCreating(false);
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
        Add food
      </h2>

      <input
        type="search"
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
          if (e.target.value !== '') setCreating(false);
        }}
        placeholder="Search shared library…"
        className="mt-2 block h-12 w-full rounded-lg border border-slate-300 bg-white px-3 text-base text-slate-900 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200"
      />

      {trimmed === '' && !creating ? (
        <RecentGrid
          recentFoods={recentFoods}
          busy={busy}
          onAdd={handleAdd}
        />
      ) : null}

      {trimmed !== '' && !creating ? (
        <SearchResults
          results={results}
          busy={busy}
          onAdd={handleAdd}
          onStartCreate={() => setCreating(true)}
        />
      ) : null}

      {creating ? (
        <div className="mt-3">
          <FoodForm
            initial={{ name: search.trim() }}
            submitLabel="Add to library & log"
            onSave={handleCreate}
            onCancel={() => setCreating(false)}
          />
        </div>
      ) : null}
    </section>
  );
}

function RecentGrid({
  recentFoods,
  busy,
  onAdd,
}: {
  recentFoods: Food[];
  busy: number | 'new' | null;
  onAdd: (food: Food) => void;
}) {
  if (recentFoods.length === 0) {
    return (
      <p className="mt-3 text-sm text-slate-500">
        No recent foods yet — search above or add a new food.
      </p>
    );
  }
  return (
    <>
      <p className="mt-3 text-xs font-medium uppercase tracking-wide text-slate-400">
        Recent
      </p>
      <ul className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {recentFoods.map((f) => (
          <li key={f.id}>
            <button
              type="button"
              onClick={() => onAdd(f)}
              disabled={busy === f.id}
              className="flex h-full min-h-[60px] w-full flex-col items-start justify-center gap-0.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-sm shadow-sm transition hover:border-emerald-300 hover:bg-emerald-50 disabled:opacity-50"
            >
              <span className="line-clamp-1 font-semibold text-slate-900">
                {f.name}
              </span>
              <span className="line-clamp-1 text-xs text-slate-500">
                {f.servingLabel} · {f.caloriesPerServing} kcal
              </span>
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}

function SearchResults({
  results,
  busy,
  onAdd,
  onStartCreate,
}: {
  results: Food[];
  busy: number | 'new' | null;
  onAdd: (food: Food) => void;
  onStartCreate: () => void;
}) {
  if (results.length === 0) {
    return (
      <div className="mt-3">
        <p className="text-sm text-slate-500">No foods match.</p>
        <button
          type="button"
          onClick={onStartCreate}
          className="mt-2 inline-flex h-11 items-center rounded-lg border border-emerald-300 bg-emerald-50 px-3 text-sm font-medium text-emerald-700 transition hover:bg-emerald-100"
        >
          <span className="mr-1" aria-hidden>+</span> Add new food
        </button>
      </div>
    );
  }
  return (
    <ul className="mt-3 divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
      {results.map((f) => (
        <li key={f.id}>
          <button
            type="button"
            onClick={() => onAdd(f)}
            disabled={busy === f.id}
            className="flex w-full items-center justify-between gap-3 px-3 py-3 text-left transition hover:bg-emerald-50 disabled:opacity-50"
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-slate-900">
                {f.name}
                {f.brand ? (
                  <span className="ml-1 font-normal text-slate-500">
                    · {f.brand}
                  </span>
                ) : null}
              </span>
              <span className="block truncate text-xs text-slate-500">
                {f.servingLabel} · {f.caloriesPerServing} kcal
              </span>
            </span>
            <span
              aria-hidden
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-base font-bold text-white"
            >
              +
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
