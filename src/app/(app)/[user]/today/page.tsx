import { notFound } from 'next/navigation';
import type { UserName } from '@/lib/types';
import {
  getEntries,
  getMealsForDate,
  getProfile,
  getRecentlyUsedFoods,
  getStreak,
  getTodayRoutineRows,
  listFoods,
  listRoutines,
} from '@/server/queries';
import { todayIso } from '@/lib/dateUtils';
import TodayClient from './today-client';

const VALID_USERS: readonly UserName[] = ['adam', 'anna', 'demo'];

export default async function TodayPage({
  params,
}: {
  params: Promise<{ user: string }>;
}) {
  const { user } = await params;
  if (!VALID_USERS.includes(user as UserName)) notFound();
  const name = user as UserName;

  const profile = await getProfile(name);
  const date = todayIso();

  const [meals, foods, recentFoods, entries, todayRoutine, streak, allRoutines] =
    await Promise.all([
      getMealsForDate(profile.id, date),
      listFoods({ includeArchived: false }),
      getRecentlyUsedFoods(profile.id, 8),
      getEntries(profile.id, date),
      getTodayRoutineRows(profile.id, date),
      getStreak(profile.id, date),
      listRoutines(profile.id),
    ]);

  const todaysEntry = entries.find((e) => e.date === date) ?? null;

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-bold text-slate-900">{formatHeading(date)}</h1>
        <p className="text-sm text-slate-500">
          {profile.displayName}&rsquo;s daily check-in
        </p>
      </header>

      <TodayClient
        userId={profile.id}
        userSegment={name}
        date={date}
        meals={meals}
        foods={foods}
        recentFoods={recentFoods}
        dailyCalorieTarget={profile.dailyCalorieTarget}
        initialWeightLb={todaysEntry?.weightLb ?? null}
        initialSteps={todaysEntry?.steps ?? null}
        routine={todayRoutine.routine}
        routineRows={todayRoutine.rows}
        streak={streak}
        hasAnyRoutine={allRoutines.length > 0}
      />
    </div>
  );
}

function formatHeading(iso: string): string {
  // ISO YYYY-MM-DD → "Wed, 29 Apr 2026" using a UTC parse.
  const d = new Date(`${iso}T00:00:00Z`);
  const wd = d.toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' });
  const day = d.getUTCDate();
  const mo = d.toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' });
  const yr = d.getUTCFullYear();
  return `${wd}, ${day} ${mo} ${yr}`;
}
