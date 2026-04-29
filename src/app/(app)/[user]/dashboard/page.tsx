import { notFound } from 'next/navigation';
import type { UserName } from '@/lib/types';
import {
  MOCK_TODAY,
  mockEntries,
  mockProfiles,
} from '@/lib/fixtures';
import { bmi, bmiCategory, formatWeight } from '@/lib/units';

const VALID_USERS: readonly UserName[] = ['adam', 'anna'];

export default async function DashboardPage({
  params,
}: {
  params: Promise<{ user: string }>;
}) {
  const { user } = await params;
  if (!VALID_USERS.includes(user as UserName)) notFound();
  const name = user as UserName;

  const profile = mockProfiles[name];
  const entries = mockEntries(name);

  // Derived stats — placeholders for Wave 3's StatsPanel.
  const weighed = entries.filter(
    (e): e is typeof e & { weightLb: number } =>
      e.weightLb !== null && Number.isFinite(e.weightLb),
  );
  const current = weighed.length > 0 ? weighed[weighed.length - 1].weightLb : null;
  const start = profile.startWeightLb;
  const delta = current !== null && start !== null ? current - start : null;

  // Quick weekly avg loss across last 4 weeks of weighed entries (rough).
  let weeklyAvgLoss: number | null = null;
  if (weighed.length >= 14) {
    const last = weighed[weighed.length - 1].weightLb;
    const fourWeeksAgoIdx = Math.max(0, weighed.length - 1 - 28);
    const reference = weighed[fourWeeksAgoIdx].weightLb;
    const days = Math.max(1, weighed.length - 1 - fourWeeksAgoIdx);
    weeklyAvgLoss = ((reference - last) / days) * 7;
  }

  const targetMid =
    profile.targetWeightMinLb != null && profile.targetWeightMaxLb != null
      ? (profile.targetWeightMinLb + profile.targetWeightMaxLb) / 2
      : null;
  const projection =
    current !== null && targetMid !== null && weeklyAvgLoss !== null && weeklyAvgLoss > 0
      ? Math.ceil(((current - targetMid) / weeklyAvgLoss) * 7)
      : null;

  const bmiVal =
    current !== null && profile.heightIn !== null
      ? bmi(current, profile.heightIn)
      : null;

  return (
    <div className="space-y-5">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">
            {profile.displayName}&rsquo;s dashboard
          </h1>
          <p className="text-sm text-slate-500">As of {MOCK_TODAY}</p>
        </div>
      </header>

      <section
        aria-label="Stats"
        className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5"
      >
        <StatBox
          label="Current weight"
          value={formatWeight(current)}
          tone="primary"
        />
        <StatBox
          label="Δ since start"
          value={
            delta === null
              ? '—'
              : `${delta > 0 ? '+' : ''}${delta.toFixed(1)} lb`
          }
          tone={
            delta === null
              ? 'neutral'
              : delta < 0
                ? 'good'
                : delta > 0
                  ? 'bad'
                  : 'neutral'
          }
        />
        <StatBox
          label="Weekly avg loss"
          value={
            weeklyAvgLoss === null
              ? '—'
              : `${weeklyAvgLoss.toFixed(2)} lb/wk`
          }
        />
        <StatBox
          label="Projected at target"
          value={projection === null ? '—' : `~${projection} days`}
        />
        <StatBox
          label="BMI"
          value={
            bmiVal === null || !Number.isFinite(bmiVal)
              ? '—'
              : `${bmiVal.toFixed(1)} (${bmiCategory(bmiVal)})`
          }
        />
      </section>

      <section
        aria-label="Weight chart"
        className="flex h-96 items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500"
      >
        <div>
          <p className="font-medium text-slate-600">
            Chart — Wave 3 fills this
          </p>
          <p className="mt-1 text-xs text-slate-400">
            Recharts composition with raw points, 7-day MA, healthy-loss line,
            target band, and projection.
          </p>
        </div>
      </section>
    </div>
  );
}

function StatBox({
  label,
  value,
  tone = 'neutral',
}: {
  label: string;
  value: string;
  tone?: 'neutral' | 'primary' | 'good' | 'bad';
}) {
  const valueColor =
    tone === 'primary'
      ? 'text-emerald-700'
      : tone === 'good'
        ? 'text-emerald-700'
        : tone === 'bad'
          ? 'text-rose-700'
          : 'text-slate-900';
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className={'mt-1 text-base font-semibold ' + valueColor}>{value}</p>
    </div>
  );
}
