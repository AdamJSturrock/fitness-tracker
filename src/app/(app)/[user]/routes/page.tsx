import { notFound } from 'next/navigation';
import type { UserName } from '@/lib/types';
import { VALID_USERS } from '@/lib/types';
import { getLatestWeightLb, getProfile, listWalkingRoutes } from '@/server/queries';
import RoutesClient from './routes-client';

export default async function RoutesPage({
  params,
}: {
  params: Promise<{ user: string }>;
}) {
  const { user } = await params;
  if (!VALID_USERS.includes(user as UserName)) notFound();
  const name = user as UserName;

  const profile = await getProfile(name);
  const [routes, latestWeightLb] = await Promise.all([
    listWalkingRoutes(profile.id, { includeArchived: false }),
    getLatestWeightLb(profile.id),
  ]);

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-bold text-slate-900">
          {profile.displayName}&rsquo;s walking routes
        </h1>
        <p className="text-sm text-slate-500">
          Draw your regular dog walks once. Tap one on{' '}
          <span className="font-semibold">Today</span> to log a walk.
        </p>
      </header>

      <RoutesClient
        userId={profile.id}
        userSegment={name}
        routes={routes}
        latestWeightLb={latestWeightLb}
      />
    </div>
  );
}
