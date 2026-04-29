'use client';

import { useEffect, useRef, useState } from 'react';

export interface DailyFormInput {
  weightLb?: number | null;
  steps?: number | null;
}

export interface DailyFormProps {
  /** Current entry values (may be null if nothing logged yet today). */
  initialWeightLb: number | null;
  initialSteps: number | null;
  /**
   * Called on blur when a field changes. Only the changed field is sent.
   * Wave 3 will pass a real server action here.
   */
  onSave: (input: DailyFormInput) => Promise<void> | void;
}

/** Pretty-format a possibly-null number for an input value. */
function fmt(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '';
  return String(n);
}

export default function DailyForm({
  initialWeightLb,
  initialSteps,
  onSave,
}: DailyFormProps) {
  const [weight, setWeight] = useState<string>(fmt(initialWeightLb));
  const [steps, setSteps] = useState<string>(fmt(initialSteps));
  const [savedTick, setSavedTick] = useState(0);
  const [saving, setSaving] = useState<null | 'weight' | 'steps'>(null);

  // Re-sync if parent props change (e.g. user switch).
  const lastInit = useRef({ w: initialWeightLb, s: initialSteps });
  useEffect(() => {
    if (
      lastInit.current.w !== initialWeightLb ||
      lastInit.current.s !== initialSteps
    ) {
      setWeight(fmt(initialWeightLb));
      setSteps(fmt(initialSteps));
      lastInit.current = { w: initialWeightLb, s: initialSteps };
    }
  }, [initialWeightLb, initialSteps]);

  async function commit(field: 'weight' | 'steps') {
    if (field === 'weight') {
      const trimmed = weight.trim();
      const parsed = trimmed === '' ? null : Number(trimmed);
      if (parsed !== null && !Number.isFinite(parsed)) return;
      const initial = initialWeightLb;
      if (parsed === initial) return;
      setSaving('weight');
      try {
        await onSave({ weightLb: parsed });
        setSavedTick((t) => t + 1);
      } finally {
        setSaving(null);
      }
    } else {
      const trimmed = steps.trim();
      const parsed = trimmed === '' ? null : Number(trimmed);
      if (parsed !== null && (!Number.isFinite(parsed) || parsed < 0)) return;
      const intParsed = parsed === null ? null : Math.round(parsed);
      if (intParsed === initialSteps) return;
      setSaving('steps');
      try {
        await onSave({ steps: intParsed });
        setSavedTick((t) => t + 1);
      } finally {
        setSaving(null);
      }
    }
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <header className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Daily check-in
        </h2>
        <SavedIndicator tick={savedTick} pending={saving !== null} />
      </header>

      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="block text-sm font-medium text-slate-700">
            Weight
          </span>
          <div className="relative mt-1">
            <input
              type="text"
              inputMode="decimal"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              onBlur={() => commit('weight')}
              placeholder="—"
              className="block h-12 w-full rounded-lg border border-slate-300 bg-white px-3 pr-10 text-lg font-semibold text-slate-900 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200"
            />
            <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-slate-400">
              lb
            </span>
          </div>
        </label>

        <label className="block">
          <span className="block text-sm font-medium text-slate-700">
            Steps
          </span>
          <input
            type="text"
            inputMode="numeric"
            value={steps}
            onChange={(e) => setSteps(e.target.value.replace(/[^0-9]/g, ''))}
            onBlur={() => commit('steps')}
            placeholder="—"
            className="mt-1 block h-12 w-full rounded-lg border border-slate-300 bg-white px-3 text-lg font-semibold text-slate-900 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200"
          />
        </label>
      </div>
    </section>
  );
}

function SavedIndicator({ tick, pending }: { tick: number; pending: boolean }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (tick === 0) return;
    setVisible(true);
    const t = setTimeout(() => setVisible(false), 1500);
    return () => clearTimeout(t);
  }, [tick]);

  if (pending) {
    return <span className="text-xs text-slate-400">Saving…</span>;
  }
  return (
    <span
      aria-live="polite"
      className={
        'text-xs font-medium text-emerald-600 transition-opacity duration-500 ' +
        (visible ? 'opacity-100' : 'opacity-0')
      }
    >
      Saved <span aria-hidden>✓</span>
    </span>
  );
}
