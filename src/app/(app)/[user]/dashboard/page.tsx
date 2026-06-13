import { notFound } from 'next/navigation';
import type { Entry, UserName } from '@/lib/types';
import {
  getDayCalorieTotals,
  getEntries,
  getMealsForDate,
  getProfile,
  getRecentPrs,
} from '@/server/queries';
import {
  caloriePaceProjection,
  closestScenarioRate,
  currentSmoothedWeight,
  healthyTrendLine,
  movingAverage,
  paceScenarioProjection,
  projectWeight,
  requiredPace,
  scenarioRatesForMode,
  weeklyAverageLoss,
  type DatedWeight,
} from '@/lib/stats';
import StatsPanel from '@/components/StatsPanel';
import WeightChart from '@/components/WeightChart';
import PaceInsight from '@/components/PaceInsight';
import RecentPrs from '@/components/RecentPrs';
import { addDays, daysBetween, todayIso } from '@/lib/dateUtils';
import { ACTIVITY_LEVELS, bmrMifflinStJeor, tdee } from '@/lib/units';

const VALID_USERS: readonly UserName[] = ['adam', 'anna', 'demo'];

/**
 * Far edge of the projection window: run the chart out to the later of the end
 * of the current year and one year from the start date. This keeps the target
 * band and the what-if scenario lines visible across the whole horizon even
 * when a faster pace reaches the band much sooner.
 */
function projectionHorizonEnd(today: string, startDate: string | null): string {
  const year = Number(today.slice(0, 4));
  let end = `${year}-12-31`;
  if (startDate) {
    const oneYearFromStart = addDays(startDate, 365);
    if (oneYearFromStart > end) end = oneYearFromStart;
  }
  // Never project a horizon that's already behind us (e.g. logging on Dec 31).
  if (end <= today) end = addDays(today, 90);
  return end;
}

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
  const [entries, meals, dayCalorieTotals, recentPrs] = await Promise.all([
    getEntries(profile.id),
    getMealsForDate(profile.id, today),
    getDayCalorieTotals(profile.id),
    getRecentPrs(profile.id, 30, 5),
  ]);
  const mode = profile.mode;
  // The boundary the projection aims at: upper bound for loss, lower bound
  // (the floor you climb above) for build.
  const targetBoundaryLb =
    mode === 'build' ? profile.targetWeightMinLb : profile.targetWeightMaxLb;

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
      ? healthyTrendLine({
          startDate: profile.startDate,
          startWeightLb: profile.startWeightLb,
          throughDate: today,
          mode,
        })
      : [];

  const projectionResult =
    targetBoundaryLb != null && ma.length > 0
      ? projectWeight({
          maSeries: ma,
          today: ma[ma.length - 1].date,
          targetWeightMaxLb: targetBoundaryLb,
          mode,
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
    targetBoundaryLb != null &&
    anchorWeight != null &&
    tdeeVal != null &&
    dailyKcalAssumed != null
      ? caloriePaceProjection({
          anchorDate: today,
          anchorWeightLb: anchorWeight,
          tdeeKcal: tdeeVal,
          dailyKcal: dailyKcalAssumed,
          targetMaxLb: targetBoundaryLb,
          mode,
        })
      : null;
  void ACTIVITY_LEVELS; // ensures import is preserved if we later expose it

  // Required pace: inverse calc — given the user's target date, how much
  // do they need to eat / lose per week to make it.
  const requiredPaceResult =
    profile.targetDate != null &&
    targetBoundaryLb != null &&
    anchorWeight != null &&
    tdeeVal != null
      ? requiredPace({
          anchorDate: today,
          anchorWeightLb: anchorWeight,
          targetDate: profile.targetDate,
          targetMaxLb: targetBoundaryLb,
          tdeeKcal: tdeeVal,
          mode,
        })
      : null;
  // Build a 2-point "required" line for the chart from (today, current) to
  // (targetDate, targetBoundaryLb) — only when we have a sensible required pace.
  const requiredLine =
    requiredPaceResult &&
    requiredPaceResult.pace !== 'past' &&
    requiredPaceResult.pace !== 'already-there' &&
    profile.targetDate != null &&
    targetBoundaryLb != null &&
    anchorWeight != null
      ? [
          { date: today, weightLb: anchorWeight },
          { date: profile.targetDate, weightLb: targetBoundaryLb },
        ]
      : null;

  // --- What-if pace scenarios + realism check ----------------------------
  // Project constant-rate trajectories (1 / 1.5 / 2 lb/wk for loss) from the
  // current smoothed weight, and compare them to the user's actual recent
  // pace so we can say which one they're tracking — a more honest read on the
  // target than the target date alone.
  const horizonEndIso = projectionHorizonEnd(today, profile.startDate);
  const horizonDays = Math.max(7, daysBetween(today, horizonEndIso));

  // Pace over three windows (lb/wk toward the goal; positive = progress).
  // weeklyAverageLoss is loss-positive, so flip the sign in build mode.
  const towardGoal = (lossPositive: number) =>
    mode === 'build' ? -lossPositive : lossPositive;
  const pace2wk = ma.length >= 2 ? towardGoal(weeklyAverageLoss(ma, 2)) : null;
  const pace4wk = ma.length >= 2 ? towardGoal(weeklyAverageLoss(ma, 4)) : null;
  const lastMaDate = ma.length > 0 ? ma[ma.length - 1].date : null;
  const paceSinceStart =
    profile.startDate != null &&
    profile.startWeightLb != null &&
    anchorWeight != null &&
    lastMaDate != null &&
    daysBetween(profile.startDate, lastMaDate) > 0
      ? (towardGoal(profile.startWeightLb - anchorWeight) /
          daysBetween(profile.startDate, lastMaDate)) *
        7
      : null;

  const scenarioRates = scenarioRatesForMode(mode);
  const closestRate =
    pace4wk != null ? closestScenarioRate(pace4wk, scenarioRates) : null;

  const scenarioProjections =
    targetBoundaryLb != null && anchorWeight != null
      ? scenarioRates.map((rate) => ({
          rate,
          proj: paceScenarioProjection({
            anchorDate: today,
            anchorWeightLb: anchorWeight,
            lbPerWeek: rate,
            targetMaxLb: targetBoundaryLb,
            horizonDays,
            mode,
          }),
        }))
      : [];

  const chartScenarios = scenarioProjections
    .filter((s) => s.proj !== null)
    .map((s) => ({
      lbPerWeek: s.rate,
      points: s.proj!.projection,
      isClosest: s.rate === closestRate,
    }));

  const insightScenarios = scenarioProjections
    .filter((s) => s.proj !== null)
    .map((s) => ({
      lbPerWeek: s.rate,
      targetReached: s.proj!.targetReached,
    }));

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
        mode={mode}
      />

      <WeightChart
        rawWeights={filtered}
        movingAvg={ma}
        healthyLoss={healthy}
        projection={projectionResult?.projection ?? null}
        planProjection={planProjection?.projection ?? null}
        requiredLine={requiredLine}
        requiredPaceClass={requiredPaceResult?.pace ?? null}
        scenarios={chartScenarios.length > 0 ? chartScenarios : null}
        targetMinLb={profile.targetWeightMinLb}
        targetMaxLb={profile.targetWeightMaxLb}
        heightIn={profile.heightIn}
        todayIso={today}
        horizonEndIso={horizonEndIso}
        mode={mode}
      />

      {insightScenarios.length > 0 ? (
        <PaceInsight
          mode={mode}
          pace2wk={pace2wk}
          pace4wk={pace4wk}
          paceSinceStart={paceSinceStart}
          closestRate={closestRate}
          scenarios={insightScenarios}
          targetDate={profile.targetDate}
        />
      ) : null}

      {mode === 'build' ? (
        <RecentPrs prs={recentPrs} />
      ) : null}
    </div>
  );
}
