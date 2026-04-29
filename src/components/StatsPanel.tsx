import type { Entry, Profile } from '@/lib/types';
import {
  currentSmoothedWeight,
  movingAverage,
  projectWeight,
  totalChangeSinceStart,
  weeklyAverageLoss,
  type DatedWeight,
} from '@/lib/stats';
import { bmi, bmiCategory, formatWeight } from '@/lib/units';

export interface StatsPanelProps {
  profile: Profile;
  entries: Entry[]; // ascending by date
  todaysCalories: number;
  todaysSteps: number | null;
  todayIso: string;
}

type Tone = 'neutral' | 'primary' | 'good' | 'bad';

function toneClass(tone: Tone): string {
  switch (tone) {
    case 'primary':
      return 'text-emerald-700';
    case 'good':
      return 'text-emerald-700';
    case 'bad':
      return 'text-rose-700';
    default:
      return 'text-slate-900';
  }
}

function formatDateLong(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1));
  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function caloriesTone(
  todaysCalories: number,
  target: number | null,
): Tone {
  if (target == null) return 'neutral';
  if (todaysCalories > target + 200) return 'bad';
  if (todaysCalories > target) return 'neutral';
  return 'good';
}

export default function StatsPanel({
  profile,
  entries,
  todaysCalories,
  todaysSteps,
}: StatsPanelProps) {
  // Build the smoothed series.
  const filtered: DatedWeight[] = entries
    .filter(
      (e): e is Entry & { weightLb: number } =>
        e.weightLb !== null && Number.isFinite(e.weightLb),
    )
    .map((e) => ({ date: e.date, weightLb: e.weightLb }));
  const ma = movingAverage(filtered);
  const current = currentSmoothedWeight(ma);
  const change =
    profile.startWeightLb != null
      ? totalChangeSinceStart({
          maSeries: ma,
          startWeightLb: profile.startWeightLb,
        })
      : null;
  const wkly = weeklyAverageLoss(ma);

  // Projection: only when we have a target max + ≥7 distinct points.
  const projection =
    profile.targetWeightMaxLb != null && filtered.length > 0
      ? projectWeight({
          maSeries: ma,
          today:
            ma.length > 0 ? ma[ma.length - 1].date : entries[0]?.date ?? '',
          targetWeightMaxLb: profile.targetWeightMaxLb,
        })
      : null;

  const bmiVal =
    current !== null && profile.heightIn !== null
      ? bmi(current, profile.heightIn)
      : null;

  return (
    <section
      aria-label="Stats"
      className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6"
    >
      <Card label="Current weight" tone="primary">
        <Big value={formatWeight(current)} />
        {profile.targetWeightMinLb != null && profile.targetWeightMaxLb != null ? (
          <Sub>
            Target {profile.targetWeightMinLb.toFixed(0)}–
            {profile.targetWeightMaxLb.toFixed(0)} lb
          </Sub>
        ) : (
          <Sub>—</Sub>
        )}
      </Card>

      <Card
        label="Δ since start"
        tone={
          change === null
            ? 'neutral'
            : change.lb > 0
              ? 'good' // lost weight (positive lb in stats convention)
              : change.lb < 0
                ? 'bad'
                : 'neutral'
        }
      >
        <Big
          value={
            change === null
              ? '—'
              : `${change.lb > 0 ? '−' : change.lb < 0 ? '+' : ''}${Math.abs(
                  change.lb,
                ).toFixed(1)} lb`
          }
        />
        <Sub>
          {change === null
            ? '—'
            : `${change.percent >= 0 ? '−' : '+'}${Math.abs(change.percent).toFixed(1)}% of start`}
        </Sub>
      </Card>

      <Card label="Weekly avg loss">
        <Big
          value={
            wkly === 0 && ma.length < 2
              ? '—'
              : `${wkly.toFixed(2)} lb/wk`
          }
        />
        <Sub>Last 4 wks of MA</Sub>
      </Card>

      <Card label="Projected target">
        <Big
          value={
            projection?.targetReached
              ? formatDateLong(projection.targetReached)
              : '—'
          }
        />
        <Sub>
          {projection
            ? `${projection.slopeLbPerWeek.toFixed(2)} lb/wk · r²=${projection.r2.toFixed(2)}`
            : '<7d of data'}
        </Sub>
      </Card>

      <Card label="BMI">
        <Big
          value={
            bmiVal === null || !Number.isFinite(bmiVal)
              ? '—'
              : bmiVal.toFixed(1)
          }
        />
        <Sub>
          {bmiVal === null || !Number.isFinite(bmiVal)
            ? 'Set height & weight'
            : bmiCategory(bmiVal)}
        </Sub>
      </Card>

      <Card
        label="Today's calories"
        tone={caloriesTone(todaysCalories, profile.dailyCalorieTarget)}
      >
        <Big
          value={
            profile.dailyCalorieTarget == null
              ? `${todaysCalories} kcal`
              : `${todaysCalories} / ${profile.dailyCalorieTarget}`
          }
        />
        <Sub>
          {todaysSteps !== null
            ? `Steps: ${todaysSteps.toLocaleString()}${
                profile.dailyStepTarget
                  ? ` / ${profile.dailyStepTarget.toLocaleString()}`
                  : ''
              }`
            : 'No steps logged'}
        </Sub>
      </Card>
    </section>
  );
}

function Card({
  label,
  tone = 'neutral',
  children,
}: {
  label: string;
  tone?: Tone;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <div className={'mt-1 ' + toneClass(tone)}>{children}</div>
    </div>
  );
}

function Big({ value }: { value: string }) {
  return <p className="text-base font-semibold tabular-nums">{value}</p>;
}

function Sub({ children }: { children: React.ReactNode }) {
  return <p className="mt-0.5 text-xs text-slate-500">{children}</p>;
}
