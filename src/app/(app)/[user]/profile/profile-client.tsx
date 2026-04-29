'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { Profile } from '@/lib/types';
import { bmi, bmiCategory, formatHeight, parseHeight } from '@/lib/units';
import { updateProfile } from '@/server/actions';

export interface ProfileClientProps {
  profile: Profile;
  currentWeightLb: number | null;
}

interface FormState {
  heightInput: string;
  age: string;
  startWeightLb: string;
  startDate: string;
  targetWeightMinLb: string;
  targetWeightMaxLb: string;
  dailyCalorieTarget: string;
  dailyStepTarget: string;
}

function fmtNum(n: number | null): string {
  return n === null || !Number.isFinite(n) ? '' : String(n);
}

function initialState(p: Profile): FormState {
  return {
    heightInput: p.heightIn !== null ? formatHeight(p.heightIn) : '',
    age: fmtNum(p.age),
    startWeightLb: fmtNum(p.startWeightLb),
    startDate: p.startDate ?? '',
    targetWeightMinLb: fmtNum(p.targetWeightMinLb),
    targetWeightMaxLb: fmtNum(p.targetWeightMaxLb),
    dailyCalorieTarget: fmtNum(p.dailyCalorieTarget),
    dailyStepTarget: fmtNum(p.dailyStepTarget),
  };
}

export default function ProfileClient({
  profile,
  currentWeightLb,
}: ProfileClientProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [form, setForm] = useState<FormState>(initialState(profile));
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const heightIn = useMemo(
    () => parseHeight(form.heightInput),
    [form.heightInput],
  );

  const liveWeight =
    Number(form.startWeightLb) > 0 && currentWeightLb === null
      ? Number(form.startWeightLb)
      : currentWeightLb;
  const bmiVal =
    heightIn !== null && liveWeight !== null
      ? bmi(liveWeight, heightIn)
      : null;

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((s) => ({ ...s, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const parsedHeight = parseHeight(form.heightInput);
    if (form.heightInput.trim() !== '' && parsedHeight === null) {
      setError(
        'Height is unreadable. Try formats like 5\'10", 5 10, or 70.',
      );
      return;
    }

    const numOrNull = (s: string): number | null => {
      const t = s.trim();
      if (t === '') return null;
      const n = Number(t);
      return Number.isFinite(n) ? n : null;
    };
    const intOrNull = (s: string): number | null => {
      const n = numOrNull(s);
      return n === null ? null : Math.round(n);
    };

    const min = numOrNull(form.targetWeightMinLb);
    const max = numOrNull(form.targetWeightMaxLb);
    if (min !== null && max !== null && min > max) {
      setError('Minimum target weight must be ≤ maximum.');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name: profile.name,
        heightIn: parsedHeight,
        age: intOrNull(form.age),
        startWeightLb: numOrNull(form.startWeightLb),
        startDate: form.startDate.trim() === '' ? null : form.startDate.trim(),
        targetWeightMinLb: min,
        targetWeightMaxLb: max,
        dailyCalorieTarget: intOrNull(form.dailyCalorieTarget),
        dailyStepTarget: intOrNull(form.dailyStepTarget),
      };
      await updateProfile(payload);
      setSavedAt(Date.now());
      startTransition(() => {
        router.refresh();
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save profile.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
    >
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Display name
        </p>
        <p className="mt-1 text-base font-semibold text-slate-900">
          {profile.displayName}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Height">
          <input
            type="text"
            value={form.heightInput}
            onChange={(e) => update('heightInput', e.target.value)}
            placeholder={'e.g. 5\'10" or 70'}
            className={inputCls}
          />
          <p className="mt-1 text-xs text-slate-500">
            {heightIn !== null
              ? `${formatHeight(heightIn)} (${heightIn.toFixed(1)} in)`
              : 'Pure number = inches; or feet+inches.'}
          </p>
        </Field>
        <Field label="Age">
          <input
            type="text"
            inputMode="numeric"
            value={form.age}
            onChange={(e) => update('age', e.target.value.replace(/[^0-9]/g, ''))}
            className={inputCls}
          />
        </Field>
      </div>

      <div className="rounded-lg bg-slate-50 p-3 text-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Current BMI
        </p>
        <p className="mt-1 text-base text-slate-900">
          {bmiVal === null || !Number.isFinite(bmiVal) ? (
            <span className="text-slate-500">
              Set height &amp; log a weight to see BMI.
            </span>
          ) : (
            <>
              <span className="font-semibold">{bmiVal.toFixed(1)}</span>{' '}
              <span className="text-slate-500">({bmiCategory(bmiVal)})</span>
            </>
          )}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Start weight (lb)">
          <input
            type="text"
            inputMode="decimal"
            value={form.startWeightLb}
            onChange={(e) => update('startWeightLb', e.target.value)}
            className={inputCls}
          />
        </Field>
        <Field label="Start date">
          <input
            type="date"
            value={form.startDate}
            onChange={(e) => update('startDate', e.target.value)}
            className={inputCls}
          />
        </Field>
        <Field label="Target weight min (lb)">
          <input
            type="text"
            inputMode="decimal"
            value={form.targetWeightMinLb}
            onChange={(e) => update('targetWeightMinLb', e.target.value)}
            className={inputCls}
          />
        </Field>
        <Field label="Target weight max (lb)">
          <input
            type="text"
            inputMode="decimal"
            value={form.targetWeightMaxLb}
            onChange={(e) => update('targetWeightMaxLb', e.target.value)}
            className={inputCls}
          />
        </Field>
        <Field label="Daily calorie target">
          <input
            type="text"
            inputMode="numeric"
            value={form.dailyCalorieTarget}
            onChange={(e) =>
              update('dailyCalorieTarget', e.target.value.replace(/[^0-9]/g, ''))
            }
            className={inputCls}
          />
        </Field>
        <Field label="Daily step target">
          <input
            type="text"
            inputMode="numeric"
            value={form.dailyStepTarget}
            onChange={(e) =>
              update('dailyStepTarget', e.target.value.replace(/[^0-9]/g, ''))
            }
            className={inputCls}
          />
        </Field>
      </div>

      {error ? (
        <p className="text-sm font-medium text-rose-600">{error}</p>
      ) : null}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={saving}
          className="inline-flex h-11 items-center rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-60"
        >
          {saving ? 'Saving…' : 'Save profile'}
        </button>
        {savedAt !== null ? (
          <span className="text-xs font-medium text-emerald-600">
            Saved <span aria-hidden>✓</span>
          </span>
        ) : null}
      </div>
    </form>
  );
}

const inputCls =
  'mt-1 block h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-base text-slate-900 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200';

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-sm font-medium text-slate-700">{label}</span>
      {children}
    </label>
  );
}
