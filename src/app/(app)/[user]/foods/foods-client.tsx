'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { Food } from '@/lib/types';
import FoodForm, { type FoodFormInput } from '@/components/FoodForm';
import { archiveFood, createFood, updateFood } from '@/server/actions';

export interface FoodsClientProps {
  foods: Food[];
  userId: number;
}

export default function FoodsClient({ foods, userId }: FoodsClientProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  function refresh() {
    startTransition(() => {
      router.refresh();
    });
  }

  async function handleCreate(input: FoodFormInput) {
    await createFood({ ...input, createdBy: userId });
    setAdding(false);
    refresh();
  }

  async function handleUpdate(id: number, input: FoodFormInput) {
    await updateFood({ id, ...input });
    setEditingId(null);
    refresh();
  }

  async function handleArchive(id: number) {
    await archiveFood(id);
    refresh();
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
                    disabled={f.archived}
                    className="inline-flex h-9 items-center rounded-md border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 transition hover:bg-slate-100 disabled:opacity-50"
                  >
                    Archive
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
