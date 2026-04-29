'use client';

import { useState } from 'react';
import type { Food } from '@/lib/types';

export interface FoodFormInput {
  name: string;
  brand: string | null;
  servingLabel: string;
  caloriesPerServing: number;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
}

export interface FoodFormProps {
  /** Existing food to edit. Omit for create. */
  initial?: Partial<Food>;
  submitLabel?: string;
  onSave: (input: FoodFormInput) => Promise<void> | void;
  onCancel?: () => void;
}

function numFromInput(s: string): number | null {
  const trimmed = s.trim();
  if (trimmed === '') return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

export default function FoodForm({
  initial,
  submitLabel = 'Save',
  onSave,
  onCancel,
}: FoodFormProps) {
  const [name, setName] = useState(initial?.name ?? '');
  const [brand, setBrand] = useState(initial?.brand ?? '');
  const [servingLabel, setServingLabel] = useState(initial?.servingLabel ?? '');
  const [calories, setCalories] = useState<string>(
    initial?.caloriesPerServing != null ? String(initial.caloriesPerServing) : '',
  );
  const [proteinG, setProteinG] = useState<string>(
    initial?.proteinG != null ? String(initial.proteinG) : '',
  );
  const [carbsG, setCarbsG] = useState<string>(
    initial?.carbsG != null ? String(initial.carbsG) : '',
  );
  const [fatG, setFatG] = useState<string>(
    initial?.fatG != null ? String(initial.fatG) : '',
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const trimmedName = name.trim();
    const trimmedServing = servingLabel.trim();
    const cals = numFromInput(calories);
    if (trimmedName === '') {
      setError('Name is required.');
      return;
    }
    if (trimmedServing === '') {
      setError('Serving label is required (e.g. "100 g", "1 slice").');
      return;
    }
    if (cals === null || !Number.isInteger(cals) || cals <= 0) {
      setError('Calories per serving must be a positive whole number.');
      return;
    }
    setSubmitting(true);
    try {
      await onSave({
        name: trimmedName,
        brand: brand.trim() === '' ? null : brand.trim(),
        servingLabel: trimmedServing,
        caloriesPerServing: cals,
        proteinG: numFromInput(proteinG),
        carbsG: numFromInput(carbsG),
        fatG: numFromInput(fatG),
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Name" required>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputCls}
            placeholder="Weetabix"
          />
        </Field>
        <Field label="Brand">
          <input
            type="text"
            value={brand}
            onChange={(e) => setBrand(e.target.value)}
            className={inputCls}
            placeholder="Optional"
          />
        </Field>
        <Field label="Serving label" required>
          <input
            type="text"
            value={servingLabel}
            onChange={(e) => setServingLabel(e.target.value)}
            className={inputCls}
            placeholder="2 biscuits"
          />
        </Field>
        <Field label="Calories / serving" required>
          <input
            type="text"
            inputMode="numeric"
            value={calories}
            onChange={(e) => setCalories(e.target.value.replace(/[^0-9]/g, ''))}
            className={inputCls}
            placeholder="136"
          />
        </Field>
        <Field label="Protein (g)">
          <input
            type="text"
            inputMode="decimal"
            value={proteinG}
            onChange={(e) => setProteinG(e.target.value)}
            className={inputCls}
            placeholder="Optional"
          />
        </Field>
        <Field label="Carbs (g)">
          <input
            type="text"
            inputMode="decimal"
            value={carbsG}
            onChange={(e) => setCarbsG(e.target.value)}
            className={inputCls}
            placeholder="Optional"
          />
        </Field>
        <Field label="Fat (g)">
          <input
            type="text"
            inputMode="decimal"
            value={fatG}
            onChange={(e) => setFatG(e.target.value)}
            className={inputCls}
            placeholder="Optional"
          />
        </Field>
      </div>

      {error ? (
        <p className="mt-3 text-sm font-medium text-rose-600">{error}</p>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={submitting}
          className="inline-flex h-11 items-center rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-60"
        >
          {submitting ? 'Saving…' : submitLabel}
        </button>
        {onCancel ? (
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex h-11 items-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
          >
            Cancel
          </button>
        ) : null}
      </div>
    </form>
  );
}

const inputCls =
  'mt-1 block h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-base text-slate-900 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200';

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-sm font-medium text-slate-700">
        {label}
        {required ? <span className="ml-0.5 text-rose-500">*</span> : null}
      </span>
      {children}
    </label>
  );
}
