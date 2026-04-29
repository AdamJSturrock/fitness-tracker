import { notFound } from 'next/navigation';
import type { UserName } from '@/lib/types';
import {
  MOCK_TODAY,
  mockFoods,
  mockMealsForToday,
  mockProfiles,
  mockRecentlyUsedFoods,
} from '@/lib/fixtures';
import TodayClient from './today-client';

const VALID_USERS: readonly UserName[] = ['adam', 'anna'];

export default async function TodayPage({
  params,
}: {
  params: Promise<{ user: string }>;
}) {
  const { user } = await params;
  if (!VALID_USERS.includes(user as UserName)) notFound();
  const name = user as UserName;

  const profile = mockProfiles[name];
  const date = MOCK_TODAY;
  const meals = mockMealsForToday(name, date);
  const foods = mockFoods;
  const recentFoods = mockRecentlyUsedFoods(name, 8);

  // Today's entry — Wave 2 fixtures don't store one explicitly. Pull the
  // last entry from mockEntries(name) for the same date if it exists.
  // For now, assume nothing logged yet today and pre-fill with null.
  const todaysWeight: number | null = null;
  const todaysSteps: number | null = null;

  // Pretty date heading.
  const heading = formatHeading(date);

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-bold text-slate-900">{heading}</h1>
        <p className="text-sm text-slate-500">
          {profile.displayName}&rsquo;s daily check-in
        </p>
      </header>

      <TodayClient
        meals={meals}
        foods={foods}
        recentFoods={recentFoods}
        dailyCalorieTarget={profile.dailyCalorieTarget}
        initialWeightLb={todaysWeight}
        initialSteps={todaysSteps}
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
