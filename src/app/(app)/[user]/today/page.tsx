import { notFound } from 'next/navigation';
import type { UserName } from '@/lib/types';
import {
  getEntries,
  getFavoriteFoods,
  getLatestWeightLb,
  getMealsForDate,
  getProfile,
  getRecentlyUsedFoods,
  getStreak,
  getTodayRoutineRows,
  getWalkLogsForDate,
  listFoods,
  listRoutines,
  listWalkingRoutes,
} from '@/server/queries';
import { todayIso } from '@/lib/dateUtils';
import DateSwitcher from '@/components/DateSwitcher';
import TodayClient from './today-client';

const VALID_USERS: readonly UserName[] = ['adam', 'anna', 'demo'];

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export default async function TodayPage({
  params,
  searchParams,
}: {
  params: Promise<{ user: string }>;
  searchParams: Promise<{ date?: string | string[] }>;
}) {
  const { user } = await params;
  if (!VALID_USERS.includes(user as UserName)) notFound();
  const name = user as UserName;

  const profile = await getProfile(name);
  const today = todayIso();
  const sp = await searchParams;
  const requested = Array.isArray(sp.date) ? sp.date[0] : sp.date;
  // Accept any past or current YYYY-MM-DD; future dates and garbage fall back to today.
  const date =
    requested && ISO_DATE.test(requested) && requested <= today
      ? requested
      : today;
  const isToday = date === today;

  const [
    meals,
    foods,
    recentFoods,
    favorites,
    entries,
    todayRoutine,
    streak,
    allRoutines,
    walkingRoutes,
    walkLogs,
    latestWeightLb,
  ] = await Promise.all([
    getMealsForDate(profile.id, date),
    listFoods({ includeArchived: false }),
    getRecentlyUsedFoods(profile.id, 8),
    getFavoriteFoods(profile.id),
    getEntries(profile.id, date),
    getTodayRoutineRows(profile.id, date),
    getStreak(profile.id, date),
    listRoutines(profile.id),
    listWalkingRoutes(profile.id, { includeArchived: false }),
    getWalkLogsForDate(profile.id, date),
    getLatestWeightLb(profile.id),
  ]);

  const todaysEntry = entries.find((e) => e.date === date) ?? null;

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-bold text-slate-900">{formatHeading(date)}</h1>
        <p className="text-sm text-slate-500">
          {profile.displayName}&rsquo;s {isToday ? 'daily check-in' : 'log entry'}
        </p>
      </header>

      <DateSwitcher userSegment={name} date={date} todayIso={today} />

      <TodayClient
        userId={profile.id}
        userSegment={name}
        date={date}
        meals={meals}
        foods={foods}
        recentFoods={recentFoods}
        favorites={favorites}
        dailyCalorieTarget={profile.dailyCalorieTarget}
        initialWeightLb={todaysEntry?.weightLb ?? null}
        initialSteps={todaysEntry?.steps ?? null}
        routine={todayRoutine.routine}
        routineRows={todayRoutine.rows}
        streak={streak}
        hasAnyRoutine={allRoutines.length > 0}
        walkingRoutes={walkingRoutes}
        walkLogs={walkLogs}
        latestWeightLb={latestWeightLb}
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
