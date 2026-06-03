'use client';

import { useCallback, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import type { Food, UserName } from '@/lib/types';
import FoodForm, { type FoodFormInput } from '@/components/FoodForm';
import type { NutritionLookupResult } from '@/lib/nutrition';
import {
  addMealItem,
  createFoodAndAddMealItem,
  lookupBarcodeAction,
  type BarcodeLookupResult,
} from '@/server/actions';

/**
 * BarcodeScanner touches `navigator.mediaDevices` and (optionally) zxing — both
 * are browser-only. Defer its module to client-only loading.
 */
const BarcodeScanner = dynamic(() => import('@/components/BarcodeScanner'), {
  ssr: false,
  loading: () => (
    <div className="aspect-[4/3] w-full animate-pulse rounded-xl bg-slate-200" />
  ),
});

type Stage =
  | { kind: 'scanning' }
  | { kind: 'looking_up'; barcode: string }
  | { kind: 'db_hit'; food: Food }
  | { kind: 'api_hit'; prefill: NutritionLookupResult }
  | { kind: 'not_found'; barcode: string }
  | { kind: 'submitting' }
  | { kind: 'done' }
  | { kind: 'error'; message: string };

export interface ScanClientProps {
  userSegment: UserName;
  userId: number;
  date: string;
}

export default function ScanClient({
  userSegment,
  userId,
  date,
}: ScanClientProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [stage, setStage] = useState<Stage>({ kind: 'scanning' });
  const [servings, setServings] = useState<string>('1');

  const cancelHref = `/${userSegment}/today`;

  const goBackToToday = useCallback(() => {
    startTransition(() => {
      router.push(cancelHref);
      router.refresh();
    });
  }, [cancelHref, router]);

  const handleScan = useCallback(
    async (barcode: string) => {
      setStage({ kind: 'looking_up', barcode });
      let result: BarcodeLookupResult;
      try {
        result = await lookupBarcodeAction(barcode, userId);
      } catch (err) {
        setStage({
          kind: 'error',
          message:
            err instanceof Error
              ? err.message
              : 'Lookup failed. Try again or enter manually.',
        });
        return;
      }
      if (result.status === 'db_hit') {
        setStage({ kind: 'db_hit', food: result.food });
      } else if (result.status === 'api_hit') {
        setStage({ kind: 'api_hit', prefill: result.prefill });
      } else {
        setStage({ kind: 'not_found', barcode });
      }
    },
    [userId],
  );

  function parseServings(): number {
    const trimmed = servings.trim();
    if (trimmed === '') return 1;
    const n = Number(trimmed);
    return Number.isFinite(n) && n > 0 ? n : 1;
  }

  async function handleAddExisting(food: Food) {
    setStage({ kind: 'submitting' });
    try {
      await addMealItem({
        userId,
        date,
        foodId: food.id,
        servings: parseServings(),
      });
      goBackToToday();
    } catch (err) {
      setStage({
        kind: 'error',
        message:
          err instanceof Error
            ? err.message
            : 'Failed to add to today. Try again.',
      });
    }
  }

  async function handleSaveAndAdd(
    input: FoodFormInput,
    prefill: NutritionLookupResult | null,
    barcode: string,
  ) {
    setStage({ kind: 'submitting' });
    try {
      await createFoodAndAddMealItem({
        userId,
        date,
        servings: parseServings(),
        createdBy: userId,
        // Manual form fields
        name: input.name,
        brand: input.brand,
        servingLabel: input.servingLabel,
        caloriesPerServing: input.caloriesPerServing,
        proteinG: input.proteinG,
        carbsG: input.carbsG,
        fatG: input.fatG,
        // Barcode + rich nutrition from the API (when we had one)
        barcode,
        fiberG: prefill?.fiberG ?? null,
        sugarG: prefill?.sugarG ?? null,
        satFatG: prefill?.satFatG ?? null,
        saltG: prefill?.saltG ?? null,
        nutriscore: prefill?.nutriscore ?? null,
        novaGroup: prefill?.novaGroup ?? null,
        isVegan: prefill?.isVegan ?? null,
        isVegetarian: prefill?.isVegetarian ?? null,
        imageUrl: prefill?.imageUrl ?? null,
        ingredients: prefill?.ingredients ?? null,
        dataSource: prefill?.source ?? 'manual',
        rawNutritionJson: prefill?.rawJson ?? null,
      });
      goBackToToday();
    } catch (err) {
      setStage({
        kind: 'error',
        message:
          err instanceof Error ? err.message : 'Failed to save food. Try again.',
      });
    }
  }

  function handleRescan() {
    setServings('1');
    setStage({ kind: 'scanning' });
  }

  // ---- render ----

  if (stage.kind === 'scanning') {
    return (
      <BarcodeScanner onScan={handleScan} onCancel={goBackToToday} />
    );
  }

  if (stage.kind === 'looking_up') {
    return (
      <StatusCard
        title="Looking up barcode…"
        body={`Checking your library and Open Food Facts for ${stage.barcode}.`}
        onCancel={goBackToToday}
      />
    );
  }

  if (stage.kind === 'submitting') {
    return (
      <StatusCard
        title="Saving…"
        body="Adding to today's meals."
        onCancel={goBackToToday}
      />
    );
  }

  if (stage.kind === 'done') {
    return (
      <StatusCard
        title="Done"
        body="Returning to Today."
        onCancel={goBackToToday}
      />
    );
  }

  if (stage.kind === 'error') {
    return (
      <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 shadow-sm">
        <p className="text-sm font-semibold text-rose-800">Something went wrong</p>
        <p className="mt-1 text-sm text-rose-700">{stage.message}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleRescan}
            className="inline-flex h-11 items-center rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700"
          >
            Scan again
          </button>
          <button
            type="button"
            onClick={goBackToToday}
            className="inline-flex h-11 items-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  if (stage.kind === 'db_hit') {
    const f = stage.food;
    return (
      <section className="rounded-xl border border-emerald-200 bg-white p-4 shadow-sm">
        <p className="text-xs font-medium uppercase tracking-wide text-emerald-700">
          Already in your library
        </p>
        <h2 className="mt-1 text-lg font-bold text-slate-900">{f.name}</h2>
        {f.brand ? (
          <p className="text-sm text-slate-500">{f.brand}</p>
        ) : null}
        <p className="mt-2 text-sm text-slate-700">
          {f.servingLabel} · {f.caloriesPerServing} kcal
          {f.proteinG != null ? ` · ${f.proteinG}g protein` : ''}
        </p>
        <ServingsInput value={servings} onChange={setServings} />
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => handleAddExisting(f)}
            className="inline-flex h-11 items-center rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700"
          >
            Add to today
          </button>
          <button
            type="button"
            onClick={handleRescan}
            className="inline-flex h-11 items-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
          >
            Scan again
          </button>
          <button
            type="button"
            onClick={goBackToToday}
            className="inline-flex h-11 items-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
          >
            Cancel
          </button>
        </div>
      </section>
    );
  }

  if (stage.kind === 'api_hit') {
    const p = stage.prefill;
    return (
      <section className="rounded-xl border border-emerald-200 bg-white p-4 shadow-sm">
        <p className="text-xs font-medium uppercase tracking-wide text-emerald-700">
          Found on {p.source === 'openfoodfacts' ? 'Open Food Facts' : 'FatSecret'}
        </p>
        <p className="mt-1 text-xs text-slate-500">
          Barcode {p.barcode}. Tweak anything, then save.
        </p>
        <div className="mt-3 space-y-3">
          <ServingsInput value={servings} onChange={setServings} />
          <FoodForm
            initial={{
              name: p.name,
              brand: p.brand ?? null,
              servingLabel: p.servingLabel,
              caloriesPerServing: p.caloriesPerServing,
              proteinG: p.proteinG ?? null,
              carbsG: p.carbsG ?? null,
              fatG: p.fatG ?? null,
            }}
            submitLabel="Save & add to today"
            onSave={(input) => handleSaveAndAdd(input, p, p.barcode)}
            onCancel={goBackToToday}
          />
        </div>
      </section>
    );
  }

  // not_found
  const barcode = stage.barcode;
  return (
    <section className="rounded-xl border border-amber-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-amber-700">
        No match found
      </p>
      <p className="mt-1 text-xs text-slate-500">
        Barcode <span className="font-mono">{barcode}</span> — enter the details
        manually. We&rsquo;ll save the barcode so the next scan is instant.
      </p>
      <div className="mt-3 space-y-3">
        <ServingsInput value={servings} onChange={setServings} />
        <FoodForm
          submitLabel="Save & add to today"
          onSave={(input) => handleSaveAndAdd(input, null, barcode)}
          onCancel={goBackToToday}
        />
      </div>
    </section>
  );
}

function ServingsInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  return (
    <label className="block">
      <span className="block text-sm font-medium text-slate-700">Servings</span>
      <input
        type="text"
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 block h-11 w-32 rounded-lg border border-slate-300 bg-white px-3 text-base text-slate-900 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200"
      />
    </label>
  );
}

function StatusCard({
  title,
  body,
  onCancel,
}: {
  title: string;
  body: string;
  onCancel: () => void;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-sm font-semibold text-slate-900">{title}</p>
      <p className="mt-1 text-sm text-slate-600">{body}</p>
      <button
        type="button"
        onClick={onCancel}
        className="mt-3 inline-flex h-10 items-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
      >
        Cancel
      </button>
    </div>
  );
}
