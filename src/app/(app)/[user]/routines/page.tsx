import { notFound } from 'next/navigation';
import type { UserName } from '@/lib/types';
import {
  getProfile,
  getRoutineWithExercises,
  listExercises,
  listRoutines,
} from '@/server/queries';
import RoutinesClient from './routines-client';

const VALID_USERS: readonly UserName[] = ['adam', 'anna'];

export default async function RoutinesPage({
  params,
}: {
  params: Promise<{ user: string }>;
}) {
  const { user } = await params;
  if (!VALID_USERS.includes(user as UserName)) notFound();
  const name = user as UserName;

  const profile = await getProfile(name);
  const [routines, exercises] = await Promise.all([
    listRoutines(profile.id, { includeArchived: false }),
    listExercises({ includeArchived: false }),
  ]);
  const routinesWithExercises = await Promise.all(
    routines.map((r) => getRoutineWithExercises(r.id)),
  );

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-bold text-slate-900">
          {profile.displayName}&rsquo;s routines
        </h1>
        <p className="text-sm text-slate-500">
          Build weekly workouts. The routine scheduled for the day shows up on{' '}
          <span className="font-semibold">Today</span>.
        </p>
      </header>

      <RoutinesClient
        userId={profile.id}
        userSegment={name}
        routines={routinesWithExercises}
        exercises={exercises}
      />
    </div>
  );
}
