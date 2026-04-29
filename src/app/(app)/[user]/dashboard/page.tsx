import { notFound } from 'next/navigation';
import type { Entry, UserName } from '@/lib/types';
import {
  getDayCalorieTotals,
  getEntries,
  getMealsForDate,
  getProfile,
} from '@/server/queries';
import {
  caloriePaceProjection,
  currentSmoothedWeight,
  healthyLossLine,
  movingAverage,
  projectWeight,
  requiredPace,
  type DatedWeight,
} from '@/lib/stats';
import StatsPanel from '@/components/StatsPanel';
import WeightChart from '@/components/WeightChart';
import { todayIso } from '@/lib/dateUtils';
import { ACTIVITY_LEVELS, bmrMifflinStJeor, tdee } from '@/lib/units';

const VALID_USERS: readonly UserName[] = ['adam', 'anna', 'demo'];

export default async function DashboardPage({
  params,
}: {
  params: Promise<{ user: string }>;
}) {
  const { user } = await params;
  if (!VALID_USERS.includes(user as UserName)) notFound();
  const name = user as UserName;

  const profile = await getProfile(name);
  const today = todayIso();
  const [entries, meals, dayCalorieTotals] = await Promise.all([
    getEntries(profile.id),
    getMealsForDate(profile.id, today),
    getDayCalorieTotals(profile.id),
  ]);

  const todaysCalories = meals.reduce(
    (sum, m) => sum + Math.round(m.food.caloriesPerServing * m.servings),
    0,
  );
  const todaysEntry = entries.find((e) => e.date === today);
  const todaysSteps = todaysEntry?.steps ?? null;

  // Build chart series.
  const filtered: DatedWeight[] = entries
    .filter(
      (e: Entry): e is Entry & { weightLb: number } =>
        e.weightLb !== null && Number.isFinite(e.weightLb),
    )
    .map((e) => ({ date: e.date, weightLb: e.weightLb }));

  const ma = movingAverage(filtered);

  const healthy =
    profile.startDate && profile.startWeightLb != null
      ? healthyLossLine({
          startDate: profile.startDate,
          startWeightLb: profile.startWeightLb,
          throughDate: today,
        })
      : [];

  const projectionResult =
    profile.targetWeightMaxLb != null && ma.length > 0
      ? projectWeight({
          maSeries: ma,
          today: ma[ma.length - 1].date,
          targetWeightMaxLb: profile.targetWeightMaxLb,
        })
      : null;

  // Calorie-deficit projection: usable from day 1 once the user has set
  // height + age + start weight + a daily calorie target. Anchors at the
  // most recent smoothed weight (or start weight as fallback) and uses
  // either the user's actual recent intake (≥3 days of meal data) or
  // their stated daily target as the assumed kcal/day.
  const recentTotals = dayCalorieTotals.slice(-14);
  const avgRecentKcal =
    recentTotals.length >= 3
      ? recentTotals.reduce((s, d) => s + d.calories, 0) / recentTotals.length
      : null;
  const anchorWeight =
    currentSmoothedWeight(ma) ?? profile.startWeightLb ?? null;
  const bmrVal = bmrMifflinStJeor({
    weightLb: anchorWeight,
    heightIn: profile.heightIn,
    age: profile.age,
    sex: profile.sex,
  });
  // We don't store activity level yet — default to 'light' (1.375).
  const tdeeVal = tdee(bmrVal, 'light');
  const dailyKcalAssumed =
    avgRecentKcal ?? profile.dailyCalorieTarget ?? null;
  const planProjection =
    profile.targetWeightMaxLb != null &&
    anchorWeight != null &&
    tdeeVal != null &&
    dailyKcalAssumed != null
      ? caloriePaceProjection({
          anchorDate: today,
          anchorWeightLb: anchorWeight,
          tdeeKcal: tdeeVal,
          dailyKcal: dailyKcalAssumed,
          targetMaxLb: profile.targetWeightMaxLb,
        })
      : null;
  void ACTIVITY_LEVELS; // ensures import is preserved if we later expose it

  // Required pace: inverse calc — given the user's target date, how much
  // do they need to eat / lose per week to make it.
  const requiredPaceResult =
    profile.targetDate != null &&
    profile.targetWeightMaxLb != null &&
    anchorWeight != null &&
    tdeeVal != null
      ? requiredPace({
          anchorDate: today,
          anchorWeightLb: anchorWeight,
          targetDate: profile.targetDate,
          targetMaxLb: profile.targetWeightMaxLb,
          tdeeKcal: tdeeVal,
        })
      : null;
  // Build a 2-point "required" line for the chart from (today, current) to
  // (targetDate, targetMaxLb) — only when we have a sensible required pace.
  const requiredLine =
    requiredPaceResult &&
    requiredPaceResult.pace !== 'past' &&
    requiredPaceResult.pace !== 'already-there' &&
    profile.targetDate != null &&
    profile.targetWeightMaxLb != null &&
    anchorWeight != null
      ? [
          { date: today, weightLb: anchorWeight },
          { date: profile.targetDate, weightLb: profile.targetWeightMaxLb },
        ]
      : null;

  return (
    <div className="space-y-5">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">
            {profile.displayName}&rsquo;s dashboard
          </h1>
          <p className="text-sm text-slate-500">As of {today}</p>
        </div>
      </header>

      <StatsPanel
        profile={profile}
        entries={entries}
        todaysCalories={todaysCalories}
        todaysSteps={todaysSteps}
        todayIso={today}
        planProjection={planProjection}
        avgRecentKcal={avgRecentKcal}
        tdeeKcal={tdeeVal}
        requiredPace={requiredPaceResult}
      />

      <WeightChart
        rawWeights={filtered}
        movingAvg={ma}
        healthyLoss={healthy}
        projection={projectionResult?.projection ?? null}
        planProjection={planProjection?.projection ?? null}
        requiredLine={requiredLine}
        requiredPaceClass={requiredPaceResult?.pace ?? null}
        targetMinLb={profile.targetWeightMinLb}
        targetMaxLb={profile.targetWeightMaxLb}
        heightIn={profile.heightIn}
        todayIso={today}
      />
    </div>
  );
}
