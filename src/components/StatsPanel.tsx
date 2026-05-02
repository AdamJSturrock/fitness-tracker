import type { Entry, GoalMode, Profile } from '@/lib/types';
import {
  type CaloriePaceProjection,
  currentSmoothedWeight,
  movingAverage,
  projectWeight,
  type RequiredPace,
  totalChangeSinceStart,
  weeklyAverageLoss,
  type DatedWeight,
} from '@/lib/stats';
import { bmi, bmiCategory, formatWeight, weightLbForBmi } from '@/lib/units';

export interface StatsPanelProps {
  profile: Profile;
  entries: Entry[]; // ascending by date
  todaysCalories: number;
  todaysSteps: number | null;
  todayIso: string;
  /** Calorie-deficit projection from the dashboard (works from day 1). */
  planProjection: CaloriePaceProjection | null;
  /** Actual recent intake average (kcal/day) — null if < 3 days of data. */
  avgRecentKcal: number | null;
  /** TDEE used for the plan projection (kcal/day). */
  tdeeKcal: number | null;
  /** Required pace to hit the user's target_date — null if no targetDate set. */
  requiredPace: RequiredPace | null;
  mode: GoalMode;
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
  mode: GoalMode,
): Tone {
  if (target == null) return 'neutral';
  if (mode === 'build') {
    // Build mode: under-eating is the failure; sitting on target is good;
    // over-eating beyond +200 starts depositing as fat.
    if (todaysCalories < target - 150) return 'bad';
    if (todaysCalories > target + 250) return 'neutral';
    return 'good';
  }
  if (todaysCalories > target + 200) return 'bad';
  if (todaysCalories > target) return 'neutral';
  return 'good';
}

function anchorWeightForPlan(
  profile: Profile,
  ma: DatedWeight[],
): number | null {
  if (ma.length > 0) return ma[ma.length - 1].weightLb;
  return profile.startWeightLb;
}

export default function StatsPanel({
  profile,
  entries,
  todaysCalories,
  todaysSteps,
  planProjection,
  avgRecentKcal,
  tdeeKcal,
  requiredPace,
  mode,
}: StatsPanelProps) {
  const isBuild = mode === 'build';
  // The boundary the projection aims at: upper bound for loss, lower bound
  // (the floor you climb above) for build.
  const targetBoundaryLb = isBuild
    ? profile.targetWeightMinLb
    : profile.targetWeightMaxLb;
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

  // Projection: only when we have a target boundary + ≥7 distinct points.
  const projection =
    targetBoundaryLb != null && filtered.length > 0
      ? projectWeight({
          maSeries: ma,
          today:
            ma.length > 0 ? ma[ma.length - 1].date : entries[0]?.date ?? '',
          targetWeightMaxLb: targetBoundaryLb,
          mode,
        })
      : null;

  // Healthy-BMI projection: in loss mode we project down to BMI=25; in build
  // mode we project up to BMI=18.5 (the floor) so an underweight user climbing
  // out of underweight has the same "ETA to healthy" stat.
  const healthyBmiCutoffLb =
    profile.heightIn !== null
      ? weightLbForBmi(isBuild ? 18.5 : 25, profile.heightIn)
      : null;
  const bmiProjection =
    healthyBmiCutoffLb !== null && filtered.length > 0
      ? projectWeight({
          maSeries: ma,
          today:
            ma.length > 0 ? ma[ma.length - 1].date : entries[0]?.date ?? '',
          targetWeightMaxLb: healthyBmiCutoffLb,
          mode,
        })
      : null;

  const bmiVal =
    current !== null && profile.heightIn !== null
      ? bmi(current, profile.heightIn)
      : null;
  const alreadyHealthyBmi =
    current !== null &&
    healthyBmiCutoffLb !== null &&
    (isBuild ? current >= healthyBmiCutoffLb : current <= healthyBmiCutoffLb);

  const remaining = targetRemaining({
    current,
    targetMinLb: profile.targetWeightMinLb,
    targetMaxLb: profile.targetWeightMaxLb,
    mode,
  });

  return (
    <section
      aria-label="Stats"
      className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4"
    >
      <Card
        label="Target remaining"
        tone={
          remaining.kind === 'inside'
            ? 'good'
            : remaining.kind === 'range'
              ? 'primary'
              : 'neutral'
        }
      >
        {remaining.kind === 'range' ? (
          <>
            <Big
              value={
                remaining.minLb === remaining.maxLb
                  ? `${remaining.minLb.toFixed(1)} lb`
                  : `${remaining.minLb.toFixed(1)} – ${remaining.maxLb.toFixed(1)} lb`
              }
            />
            <Sub>
              {isBuild ? 'to gain into target band' : 'to lose into target band'}
            </Sub>
          </>
        ) : remaining.kind === 'inside' ? (
          <>
            <Big value="In target band ✓" />
            <Sub>
              {isBuild
                ? 'Above the floor — hold or build above'
                : 'You’re inside the target range'}
            </Sub>
          </>
        ) : remaining.kind === 'no-weight' ? (
          <>
            <Big value="—" />
            <Sub>Log a weight to see this</Sub>
          </>
        ) : (
          <>
            <Big value="—" />
            <Sub>Set a target weight on Profile</Sub>
          </>
        )}
      </Card>

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
            : isBuild
              ? change.lb < 0
                ? 'good' // gained weight (negative lb in loss-convention = gain)
                : change.lb > 0
                  ? 'bad'
                  : 'neutral'
              : change.lb > 0
                ? 'good'
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

      <Card label={isBuild ? 'Weekly avg gain' : 'Weekly avg loss'}>
        <Big
          value={
            wkly === 0 && ma.length < 2
              ? '—'
              : `${(isBuild ? -wkly : wkly).toFixed(2)} lb/wk`
          }
        />
        <Sub>Last 4 wks of MA</Sub>
      </Card>

      <Card label="Projected target" tone={planProjection ? 'primary' : 'neutral'}>
        <Big
          value={
            planProjection?.targetReached
              ? formatDateLong(planProjection.targetReached)
              : projection?.targetReached
                ? formatDateLong(projection.targetReached)
                : '—'
          }
        />
        <Sub>
          {planProjection
            ? `Plan · ${(isBuild ? planProjection.slopeLbPerWeek : -planProjection.slopeLbPerWeek).toFixed(2)} lb/wk` +
              (isBuild
                ? planProjection.dailyDeficitKcal < 0
                  ? ` · ${Math.round(-planProjection.dailyDeficitKcal)} kcal/day surplus`
                  : ' · no surplus'
                : planProjection.dailyDeficitKcal > 0
                  ? ` · ${Math.round(planProjection.dailyDeficitKcal)} kcal/day deficit`
                  : ' · no deficit')
            : targetBoundaryLb == null
              ? isBuild
                ? 'Set a target weight floor'
                : 'Set a target weight'
              : profile.heightIn == null ||
                  profile.age == null ||
                  (anchorWeightForPlan(profile, ma) == null)
                ? 'Set height, age & start weight'
                : profile.dailyCalorieTarget == null && avgRecentKcal == null
                  ? 'Set a calorie target or log meals'
                  : '—'}
        </Sub>
        <p className="mt-1 text-xs text-slate-500">
          {projection
            ? `Trend · ${projection.slopeLbPerWeek.toFixed(2)} lb/wk · r²=${projection.r2.toFixed(2)}`
            : 'Trend · need 7+ days of weight data'}
        </p>
        {tdeeKcal != null ? (
          <p className="mt-0.5 text-[11px] text-slate-400">
            TDEE ≈ {Math.round(tdeeKcal)} kcal · intake{' '}
            {avgRecentKcal != null
              ? `${Math.round(avgRecentKcal)} (avg)`
              : profile.dailyCalorieTarget != null
                ? `${profile.dailyCalorieTarget} (target)`
                : '—'}
          </p>
        ) : null}
        <p className="mt-1 text-xs text-slate-500">
          {alreadyHealthyBmi
            ? 'Healthy BMI · already there ✓'
            : bmiProjection?.targetReached
              ? `Healthy BMI · ${formatDateLong(bmiProjection.targetReached)}`
              : profile.heightIn === null
                ? 'Healthy BMI · set height'
                : 'Healthy BMI · <7d data'}
        </p>
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
        tone={caloriesTone(todaysCalories, profile.dailyCalorieTarget, mode)}
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

      {requiredPace ? (
        <Card
          label="To hit target date"
          tone={paceTone(requiredPace.pace)}
        >
          {requiredPace.pace === 'past' ? (
            <>
              <Big value="Date passed" />
              <Sub>Pick a future target date</Sub>
            </>
          ) : requiredPace.pace === 'already-there' ? (
            <>
              <Big value="Already there ✓" />
              <Sub>You&rsquo;re inside the target band</Sub>
            </>
          ) : (
            <>
              <Big value={`${Math.round(requiredPace.dailyIntakeKcal)} kcal/day`} />
              <Sub>
                {requiredPace.lbPerWeek.toFixed(2)} lb/wk{' '}
                {isBuild ? 'gain' : 'loss'} ·{' '}
                {Math.round(requiredPace.dailyDeficitKcal)} kcal{' '}
                {isBuild ? 'surplus' : 'deficit'}
              </Sub>
              <p className="mt-1 text-[11px] text-slate-500">
                {requiredPace.pace === 'easy'
                  ? 'Easy pace — comfortably sustainable.'
                  : requiredPace.pace === 'moderate'
                    ? 'Moderate pace — sustainable.'
                    : requiredPace.pace === 'aggressive'
                      ? isBuild
                        ? 'Aggressive — extra calories above ½ lb/wk tend to deposit as fat.'
                        : 'Aggressive — keep an eye on energy levels.'
                      : isBuild
                        ? 'Too aggressive — gaining over 1 lb/wk is mostly fat. Push the date out.'
                        : 'Too aggressive — over 2 lb/wk is not recommended. Push the date out.'}
              </p>
              <p className="mt-0.5 text-[11px] text-slate-400">
                {requiredPace.daysAvailable} day
                {requiredPace.daysAvailable === 1 ? '' : 's'} to go
              </p>
            </>
          )}
        </Card>
      ) : (
        <Card label="To hit target date" tone="neutral">
          <Big value="—" />
          <Sub>Set a target date on Profile</Sub>
        </Card>
      )}
    </section>
  );
}

function paceTone(pace: RequiredPace['pace']): Tone {
  switch (pace) {
    case 'easy':
    case 'moderate':
      return 'good';
    case 'aggressive':
      return 'neutral';
    case 'unsafe':
    case 'past':
      return 'bad';
    case 'already-there':
      return 'primary';
    default:
      return 'neutral';
  }
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

type Remaining =
  | { kind: 'no-target' }
  | { kind: 'no-weight' }
  | { kind: 'inside' }
  | { kind: 'range'; minLb: number; maxLb: number };

function targetRemaining({
  current,
  targetMinLb,
  targetMaxLb,
  mode,
}: {
  current: number | null;
  targetMinLb: number | null;
  targetMaxLb: number | null;
  mode: GoalMode;
}): Remaining {
  if (targetMinLb == null || targetMaxLb == null) return { kind: 'no-target' };
  if (current == null) return { kind: 'no-weight' };
  // Inside the band counts as "done" in either mode.
  if (current >= targetMinLb && current <= targetMaxLb) return { kind: 'inside' };
  if (mode === 'build') {
    // Below the floor → need to climb. Above the ceiling → already past target,
    // treat as done from this card's perspective.
    if (current >= targetMaxLb) return { kind: 'inside' };
    return {
      kind: 'range',
      minLb: targetMinLb - current,
      maxLb: targetMaxLb - current,
    };
  }
  // Loss mode: above the ceiling → still need to lose. Below the floor → done.
  if (current <= targetMinLb) return { kind: 'inside' };
  return {
    kind: 'range',
    minLb: current - targetMaxLb,
    maxLb: current - targetMinLb,
  };
}
