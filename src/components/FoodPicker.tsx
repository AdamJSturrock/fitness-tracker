'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { Food, UserName } from '@/lib/types';
import FoodForm, { type FoodFormInput } from './FoodForm';

export interface FoodPickerProps {
  foods: Food[];
  recentFoods: Food[];
  favorites: Food[];
  /** Add an existing food to today's meals at given servings. */
  onAdd: (foodId: number, servings: number) => Promise<void> | void;
  /**
   * Create a new food in the library AND add it to today's meals (1 serving).
   * Wave 3 wires this to the real `createFood` + `addMealItem` actions.
   */
  onCreateAndAdd: (input: FoodFormInput) => Promise<void> | void;
  /** Toggle favorite state for a food. Parent decides add-vs-remove. */
  onToggleFavorite?: (foodId: number) => Promise<void> | void;
  /** One-tap add 1 serving of the given food to today's meals. */
  onQuickAdd?: (foodId: number) => Promise<void> | void;
  /**
   * URL segment of the current user (e.g. 'adam'). When provided, the picker
   * shows a camera-icon button that links to `/{userSegment}/today/scan`.
   */
  userSegment?: UserName;
}

export default function FoodPicker({
  foods,
  recentFoods,
  favorites,
  onAdd,
  onCreateAndAdd,
  onToggleFavorite,
  onQuickAdd,
  userSegment,
}: FoodPickerProps) {
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState<number | 'new' | null>(null);
  const [favBusy, setFavBusy] = useState<number | null>(null);

  const favoriteIds = useMemo(
    () => new Set(favorites.map((f) => f.id)),
    [favorites],
  );

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

  async function handleQuickAdd(food: Food) {
    if (!onQuickAdd) {
      await handleAdd(food);
      return;
    }
    setBusy(food.id);
    try {
      await onQuickAdd(food.id);
    } finally {
      setBusy(null);
    }
  }

  async function handleToggleFavorite(food: Food) {
    if (!onToggleFavorite) return;
    setFavBusy(food.id);
    try {
      await onToggleFavorite(food.id);
    } finally {
      setFavBusy(null);
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

  const showFavorites = favorites.length > 0 && trimmed === '' && !creating;
  const showRecents = trimmed === '' && !creating;

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
        Add food
      </h2>

      <div className="mt-2 flex gap-2">
        <input
          type="search"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            if (e.target.value !== '') setCreating(false);
          }}
          placeholder="Search shared library…"
          className="block h-12 w-full flex-1 rounded-lg border border-slate-300 bg-white px-3 text-base text-slate-900 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200"
        />
        {userSegment ? (
          <Link
            href={`/${userSegment}/today/scan`}
            aria-label="Scan a barcode"
            title="Scan a barcode"
            className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-slate-300 bg-white text-xl text-slate-700 shadow-sm transition hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700"
          >
            <span aria-hidden>
              {/* Camera icon — inline SVG keeps us free of an icon dep. */}
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-6 w-6"
              >
                <path d="M4 7h3l2-2h6l2 2h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1z" />
                <circle cx="12" cy="13" r="4" />
              </svg>
            </span>
          </Link>
        ) : null}
      </div>

      {showFavorites ? (
        <FavoriteGrid
          favorites={favorites}
          busy={busy}
          favBusy={favBusy}
          onQuickAdd={handleQuickAdd}
          onToggleFavorite={handleToggleFavorite}
        />
      ) : null}

      {showRecents ? (
        <RecentGrid
          recentFoods={recentFoods}
          favoriteIds={favoriteIds}
          busy={busy}
          favBusy={favBusy}
          onQuickAdd={handleQuickAdd}
          onToggleFavorite={handleToggleFavorite}
        />
      ) : null}

      {trimmed !== '' && !creating ? (
        <SearchResults
          results={results}
          favoriteIds={favoriteIds}
          busy={busy}
          favBusy={favBusy}
          onAdd={handleAdd}
          onToggleFavorite={handleToggleFavorite}
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

function FavoriteGrid({
  favorites,
  busy,
  favBusy,
  onQuickAdd,
  onToggleFavorite,
}: {
  favorites: Food[];
  busy: number | 'new' | null;
  favBusy: number | null;
  onQuickAdd: (food: Food) => void;
  onToggleFavorite: (food: Food) => void;
}) {
  return (
    <>
      <p className="mt-3 text-xs font-medium uppercase tracking-wide text-slate-400">
        Favorites
      </p>
      <ul className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {favorites.map((f) => (
          <li
            key={f.id}
            className="relative flex h-full min-h-[60px] flex-col items-start justify-center gap-0.5 rounded-lg border border-amber-200 bg-amber-50/40 px-3 py-2 pr-12 shadow-sm transition hover:border-emerald-300"
          >
            <button
              type="button"
              onClick={() => onToggleFavorite(f)}
              disabled={favBusy === f.id}
              aria-label="Remove from favorites"
              aria-pressed={true}
              className="absolute right-2 top-2 inline-flex h-7 w-7 items-center justify-center rounded-full text-base leading-none text-amber-500 transition hover:bg-amber-100 disabled:opacity-50"
            >
              <span aria-hidden>★</span>
            </button>
            <div className="min-w-0">
              <p className="line-clamp-1 text-sm font-semibold text-slate-900">
                {f.name}
              </p>
              {f.brand ? (
                <p className="line-clamp-1 text-xs text-slate-500">{f.brand}</p>
              ) : null}
              <p className="line-clamp-1 text-xs text-slate-500">
                {f.servingLabel} · {f.caloriesPerServing} kcal
              </p>
            </div>
            <button
              type="button"
              onClick={() => onQuickAdd(f)}
              disabled={busy === f.id}
              aria-label={`Add 1 serving of ${f.name}`}
              className="mt-1 inline-flex h-8 items-center justify-center rounded-full bg-emerald-600 px-3 text-xs font-bold text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-50"
            >
              +1
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}

function RecentGrid({
  recentFoods,
  favoriteIds,
  busy,
  favBusy,
  onQuickAdd,
  onToggleFavorite,
}: {
  recentFoods: Food[];
  favoriteIds: Set<number>;
  busy: number | 'new' | null;
  favBusy: number | null;
  onQuickAdd: (food: Food) => void;
  onToggleFavorite: (food: Food) => void;
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
        {recentFoods.map((f) => {
          const fav = favoriteIds.has(f.id);
          return (
            <li
              key={f.id}
              className="relative flex h-full min-h-[60px] flex-col items-start justify-center gap-0.5 rounded-lg border border-slate-200 bg-white px-3 py-2 pr-12 shadow-sm transition hover:border-emerald-300"
            >
              <button
                type="button"
                onClick={() => onToggleFavorite(f)}
                disabled={favBusy === f.id}
                aria-label={fav ? 'Remove from favorites' : 'Add to favorites'}
                aria-pressed={fav}
                className={`absolute right-2 top-2 inline-flex h-7 w-7 items-center justify-center rounded-full text-base leading-none transition disabled:opacity-50 ${
                  fav
                    ? 'text-amber-500 hover:bg-amber-100'
                    : 'text-slate-400 hover:bg-slate-100 hover:text-amber-500'
                }`}
              >
                <span aria-hidden>{fav ? '★' : '☆'}</span>
              </button>
              <div className="min-w-0">
                <p className="line-clamp-1 text-sm font-semibold text-slate-900">
                  {f.name}
                </p>
                {f.brand ? (
                  <p className="line-clamp-1 text-xs text-slate-500">
                    {f.brand}
                  </p>
                ) : null}
                <p className="line-clamp-1 text-xs text-slate-500">
                  {f.servingLabel} · {f.caloriesPerServing} kcal
                </p>
              </div>
              <button
                type="button"
                onClick={() => onQuickAdd(f)}
                disabled={busy === f.id}
                aria-label={`Add 1 serving of ${f.name}`}
                className="mt-1 inline-flex h-8 items-center justify-center rounded-full bg-emerald-600 px-3 text-xs font-bold text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-50"
              >
                +1
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
}

function SearchResults({
  results,
  favoriteIds,
  busy,
  favBusy,
  onAdd,
  onToggleFavorite,
  onStartCreate,
}: {
  results: Food[];
  favoriteIds: Set<number>;
  busy: number | 'new' | null;
  favBusy: number | null;
  onAdd: (food: Food) => void;
  onToggleFavorite: (food: Food) => void;
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
      {results.map((f) => {
        const fav = favoriteIds.has(f.id);
        return (
          <li key={f.id} className="flex items-center gap-2 px-3 py-3">
            <button
              type="button"
              onClick={() => onToggleFavorite(f)}
              disabled={favBusy === f.id}
              aria-label={fav ? 'Remove from favorites' : 'Add to favorites'}
              aria-pressed={fav}
              className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-lg leading-none transition disabled:opacity-50 ${
                fav
                  ? 'text-amber-500 hover:bg-amber-100'
                  : 'text-slate-400 hover:bg-slate-100 hover:text-amber-500'
              }`}
            >
              <span aria-hidden>{fav ? '★' : '☆'}</span>
            </button>
            <button
              type="button"
              onClick={() => onAdd(f)}
              disabled={busy === f.id}
              className="flex flex-1 items-center justify-between gap-3 text-left transition hover:bg-emerald-50 disabled:opacity-50"
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
        );
      })}
    </ul>
  );
}
