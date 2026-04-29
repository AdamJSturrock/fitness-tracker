'use client';

import { useState } from 'react';
import type { Food } from '@/lib/types';
import FoodForm, { type FoodFormInput } from '@/components/FoodForm';

export interface FoodsClientProps {
  foods: Food[];
}

export default function FoodsClient({ foods: initial }: FoodsClientProps) {
  const [foods, setFoods] = useState(initial);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  function nextId(): number {
    return Math.max(0, ...foods.map((f) => f.id)) + 1;
  }

  async function handleCreate(input: FoodFormInput) {
    const newFood: Food = {
      id: nextId(),
      name: input.name,
      brand: input.brand,
      servingLabel: input.servingLabel,
      caloriesPerServing: input.caloriesPerServing,
      proteinG: input.proteinG,
      carbsG: input.carbsG,
      fatG: input.fatG,
      archived: false,
      createdBy: null,
      createdAt: new Date().toISOString(),
    };
    setFoods((prev) => [...prev, newFood]);
    setAdding(false);
    // eslint-disable-next-line no-console
    console.log('mock createFood', input);
  }

  async function handleUpdate(id: number, input: FoodFormInput) {
    setFoods((prev) =>
      prev.map((f) => (f.id === id ? { ...f, ...input } : f)),
    );
    setEditingId(null);
    // eslint-disable-next-line no-console
    console.log('mock updateFood', { id, ...input });
  }

  function handleArchive(id: number) {
    setFoods((prev) =>
      prev.map((f) => (f.id === id ? { ...f, archived: !f.archived } : f)),
    );
    // eslint-disable-next-line no-console
    console.log('mock archiveFood', { id });
  }

  return (
    <div className="space-y-4">
      <div>
        {!adding ? (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="inline-flex h-11 items-center rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700"
          >
            <span className="mr-1" aria-hidden>+</span> Add food
          </button>
        ) : (
          <FoodForm
            submitLabel="Add to library"
            onSave={handleCreate}
            onCancel={() => setAdding(false)}
          />
        )}
      </div>

      {foods.length === 0 ? (
        <p className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-500 shadow-sm">
          No foods yet — add your first one above.
        </p>
      ) : (
        <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white shadow-sm">
          {foods.map((f) =>
            editingId === f.id ? (
              <li key={f.id} className="p-3">
                <FoodForm
                  initial={f}
                  submitLabel="Save changes"
                  onSave={(input) => handleUpdate(f.id, input)}
                  onCancel={() => setEditingId(null)}
                />
              </li>
            ) : (
              <li
                key={f.id}
                className="flex items-center gap-3 px-3 py-3 sm:px-4"
              >
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-baseline gap-x-2 truncate">
                    <span className="text-sm font-semibold text-slate-900">
                      {f.name}
                    </span>
                    {f.brand ? (
                      <span className="text-xs text-slate-500">
                        · {f.brand}
                      </span>
                    ) : null}
                    {f.archived ? (
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                        archived
                      </span>
                    ) : null}
                  </p>
                  <p className="truncate text-xs text-slate-500">
                    {f.servingLabel} · {f.caloriesPerServing} kcal
                    {f.proteinG !== null ? ` · ${f.proteinG} g protein` : ''}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <button
                    type="button"
                    onClick={() => setEditingId(f.id)}
                    className="inline-flex h-9 items-center rounded-md border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 transition hover:bg-slate-100"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => handleArchive(f.id)}
                    className="inline-flex h-9 items-center rounded-md border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 transition hover:bg-slate-100"
                  >
                    {f.archived ? 'Unarchive' : 'Archive'}
                  </button>
                </div>
              </li>
            ),
          )}
        </ul>
      )}
    </div>
  );
}
