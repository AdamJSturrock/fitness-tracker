import { notFound } from 'next/navigation';
import type { Entry, UserName } from '@/lib/types';
import {
  getEntries,
  getMealsForDate,
  getProfile,
} from '@/server/queries';
import {
  healthyLossLine,
  movingAverage,
  projectWeight,
  type DatedWeight,
} from '@/lib/stats';
import StatsPanel from '@/components/StatsPanel';
import WeightChart from '@/components/WeightChart';
import { todayIso } from '@/lib/dateUtils';

const VALID_USERS: readonly UserName[] = ['adam', 'anna'];

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
  const [entries, meals] = await Promise.all([
    getEntries(profile.id),
    getMealsForDate(profile.id, today),
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
      />

      <WeightChart
        rawWeights={filtered}
        movingAvg={ma}
        healthyLoss={healthy}
        projection={projectionResult?.projection ?? null}
        targetMinLb={profile.targetWeightMinLb}
        targetMaxLb={profile.targetWeightMaxLb}
        heightIn={profile.heightIn}
        todayIso={today}
      />
    </div>
  );
}
