'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { GoalMode, Profile } from '@/lib/types';
import {
  ACTIVITY_LEVELS,
  type ActivityLevel,
  bmi,
  bmiCategory,
  bmrMifflinStJeor,
  calorieTargetForGoal,
  formatHeight,
  healthyWeightRangeLb,
  parseHeight,
  tdee,
} from '@/lib/units';
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
  targetDate: string;
  dailyCalorieTarget: string;
  dailyStepTarget: string;
  proteinTargetG: string;
  mode: GoalMode;
  activityLevel: ActivityLevel;
  /** Signed change rate, lb/week. Positive in loss mode (e.g. 1 = lose 1 lb/wk),
   *  negative in build mode (e.g. -0.5 = gain ½ lb/wk). 0 = maintain. */
  goalLossLbPerWeek: string;
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
    targetDate: p.targetDate ?? '',
    dailyCalorieTarget: fmtNum(p.dailyCalorieTarget),
    dailyStepTarget: fmtNum(p.dailyStepTarget),
    proteinTargetG: fmtNum(p.proteinTargetG),
    mode: p.mode,
    activityLevel: 'light',
    goalLossLbPerWeek: p.mode === 'build' ? '-0.5' : '1',
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
  const suggested = healthyWeightRangeLb(heightIn);

  // Calorie target suggestion (Mifflin-St Jeor BMR × activity − goal deficit)
  const ageNum = (() => {
    const n = Number(form.age);
    return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
  })();
  const bmrVal = bmrMifflinStJeor({
    weightLb: liveWeight,
    heightIn,
    age: ageNum,
    sex: profile.sex,
  });
  const tdeeVal = tdee(bmrVal, form.activityLevel);
  const goalChange = (() => {
    const n = Number(form.goalLossLbPerWeek);
    return Number.isFinite(n) ? n : 0;
  })();
  const suggestedKcal = calorieTargetForGoal(tdeeVal, goalChange);
  // Default protein suggestion: ~0.8 g per lb bodyweight in build mode,
  // ~0.7 g/lb in loss mode. Drops to nothing when we don't have a weight yet.
  const proteinSuggestionG =
    liveWeight != null && liveWeight > 0
      ? Math.round(liveWeight * (form.mode === 'build' ? 0.8 : 0.7))
      : null;

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((s) => ({ ...s, [key]: value }));
  }

  function applySuggestedTargets() {
    if (!suggested) return;
    setForm((s) => ({
      ...s,
      targetWeightMinLb: String(Math.round(suggested.minLb)),
      targetWeightMaxLb: String(Math.round(suggested.maxLb)),
    }));
  }

  function applySuggestedKcal() {
    if (suggestedKcal == null) return;
    setForm((s) => ({ ...s, dailyCalorieTarget: String(suggestedKcal) }));
  }

  function applySuggestedProtein() {
    if (proteinSuggestionG == null) return;
    setForm((s) => ({ ...s, proteinTargetG: String(proteinSuggestionG) }));
  }

  function setMode(next: GoalMode) {
    setForm((s) => ({
      ...s,
      mode: next,
      // Reset the per-week selector to a sensible default for the mode so the
      // calorie suggestion below stays believable across mode flips.
      goalLossLbPerWeek: next === 'build' ? '-0.5' : '1',
    }));
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
        targetDate: form.targetDate.trim() === '' ? null : form.targetDate.trim(),
        dailyCalorieTarget: intOrNull(form.dailyCalorieTarget),
        dailyStepTarget: intOrNull(form.dailyStepTarget),
        mode: form.mode,
        proteinTargetG: intOrNull(form.proteinTargetG),
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

      <fieldset className="rounded-lg border border-slate-200 bg-slate-50 p-3">
        <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Goal mode
        </legend>
        <div className="grid grid-cols-2 gap-2">
          <ModeOption
            checked={form.mode === 'loss'}
            onChange={() => setMode('loss')}
            label="Lose weight"
            help="Eat below TDEE; aim for the upper bound of your target band."
          />
          <ModeOption
            checked={form.mode === 'build'}
            onChange={() => setMode('build')}
            label="Build muscle"
            help="Eat above TDEE; lean gain rate ≤ ½ lb/week to minimise fat."
          />
        </div>
      </fieldset>

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
        <Field label="Target date (when to hit it)">
          <input
            type="date"
            value={form.targetDate}
            onChange={(e) => update('targetDate', e.target.value)}
            className={inputCls}
          />
          <p className="mt-1 text-xs text-slate-500">
            Optional. If set, the dashboard shows the calorie pace required to
            hit your target by this date.
          </p>
        </Field>
        <div className="sm:col-span-2">
          {suggested ? (
            <div className="flex flex-wrap items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
              <span>
                Suggested for {formatHeight(heightIn)}:{' '}
                <span className="font-semibold">
                  {Math.round(suggested.minLb)}–{Math.round(suggested.maxLb)} lb
                </span>{' '}
                <span className="text-emerald-700">(BMI 18.5–25)</span>
              </span>
              <button
                type="button"
                onClick={applySuggestedTargets}
                className="ml-auto inline-flex h-7 items-center rounded-md border border-emerald-600 bg-white px-2.5 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-100"
              >
                Use these
              </button>
            </div>
          ) : (
            <p className="text-xs text-slate-500">
              Enter a height above to see a suggested healthy-BMI target range.
            </p>
          )}
        </div>
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
        <Field label="Daily protein target (g)">
          <input
            type="text"
            inputMode="numeric"
            value={form.proteinTargetG}
            onChange={(e) =>
              update('proteinTargetG', e.target.value.replace(/[^0-9]/g, ''))
            }
            className={inputCls}
          />
          <div className="mt-1 flex items-center justify-between gap-2 text-xs text-slate-500">
            <span>
              {proteinSuggestionG != null
                ? `Suggested ≈ ${proteinSuggestionG} g (${form.mode === 'build' ? '0.8' : '0.7'} g/lb)`
                : 'Suggested rate: 0.7 g/lb (loss) · 0.8 g/lb (build).'}
            </span>
            {proteinSuggestionG != null ? (
              <button
                type="button"
                onClick={applySuggestedProtein}
                className="inline-flex h-7 items-center rounded-md border border-slate-300 bg-white px-2 text-[11px] font-semibold text-slate-700 hover:bg-slate-100"
              >
                Use {proteinSuggestionG}g
              </button>
            ) : null}
          </div>
        </Field>

        <div className="sm:col-span-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800">
            Suggested calorie target
          </p>
          <p className="mt-1 text-xs text-emerald-900">
            Mifflin-St Jeor BMR × activity − goal deficit. Updates as your
            weight changes.
          </p>
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <label className="block">
              <span className="block text-[11px] font-semibold uppercase tracking-wide text-emerald-800">
                Activity level
              </span>
              <select
                value={form.activityLevel}
                onChange={(e) =>
                  update('activityLevel', e.target.value as ActivityLevel)
                }
                className="mt-1 block h-10 w-full rounded-md border border-emerald-300 bg-white px-2 text-sm text-slate-900"
              >
                {(
                  Object.entries(ACTIVITY_LEVELS) as [
                    ActivityLevel,
                    (typeof ACTIVITY_LEVELS)[ActivityLevel],
                  ][]
                ).map(([key, val]) => (
                  <option key={key} value={key}>
                    {val.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="block text-[11px] font-semibold uppercase tracking-wide text-emerald-800">
                {form.mode === 'build' ? 'Gain rate' : 'Goal'}
              </span>
              <select
                value={form.goalLossLbPerWeek}
                onChange={(e) => update('goalLossLbPerWeek', e.target.value)}
                className="mt-1 block h-10 w-full rounded-md border border-emerald-300 bg-white px-2 text-sm text-slate-900"
              >
                {form.mode === 'build' ? (
                  <>
                    <option value="-0.25">Gain ¼ lb / week (lean)</option>
                    <option value="-0.5">Gain ½ lb / week</option>
                    <option value="-1">Gain 1 lb / week (aggressive)</option>
                  </>
                ) : (
                  <>
                    <option value="0">Maintain weight</option>
                    <option value="0.5">Lose ½ lb / week</option>
                    <option value="1">Lose 1 lb / week</option>
                    <option value="1.5">Lose 1½ lb / week</option>
                    <option value="2">Lose 2 lb / week (aggressive)</option>
                  </>
                )}
              </select>
            </label>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            {suggestedKcal != null ? (
              <span className="text-sm text-emerald-900">
                Suggested:{' '}
                <span className="font-bold">{suggestedKcal} kcal/day</span>
                {tdeeVal != null ? (
                  <span className="ml-2 text-xs text-emerald-700">
                    (BMR ≈ {Math.round(bmrVal ?? 0)}, TDEE ≈{' '}
                    {Math.round(tdeeVal)})
                  </span>
                ) : null}
              </span>
            ) : (
              <span className="text-xs text-emerald-700">
                Fill in height, age and start weight above to compute.
              </span>
            )}
            <button
              type="button"
              onClick={applySuggestedKcal}
              disabled={suggestedKcal == null}
              className="ml-auto inline-flex h-7 items-center rounded-md border border-emerald-600 bg-white px-2.5 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
            >
              Use this
            </button>
          </div>
        </div>
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

function ModeOption({
  checked,
  onChange,
  label,
  help,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
  help: string;
}) {
  return (
    <label
      className={
        'flex cursor-pointer flex-col gap-1 rounded-lg border p-3 transition ' +
        (checked
          ? 'border-emerald-500 bg-white shadow-sm ring-2 ring-emerald-200'
          : 'border-slate-200 bg-white hover:border-slate-300')
      }
    >
      <span className="flex items-center gap-2">
        <input
          type="radio"
          name="goal-mode"
          checked={checked}
          onChange={onChange}
          className="h-4 w-4 accent-emerald-600"
        />
        <span className="text-sm font-semibold text-slate-900">{label}</span>
      </span>
      <span className="pl-6 text-xs text-slate-500">{help}</span>
    </label>
  );
}
