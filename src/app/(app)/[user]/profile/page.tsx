import { notFound } from 'next/navigation';
import type { UserName } from '@/lib/types';
import { mockEntries, mockProfiles } from '@/lib/fixtures';
import ProfileClient from './profile-client';

const VALID_USERS: readonly UserName[] = ['adam', 'anna'];

export default async function ProfilePage({
  params,
}: {
  params: Promise<{ user: string }>;
}) {
  const { user } = await params;
  if (!VALID_USERS.includes(user as UserName)) notFound();
  const name = user as UserName;

  const profile = mockProfiles[name];

  // Most recent weighed entry (for live BMI under height/weight).
  const entries = mockEntries(name);
  const weighed = entries.filter((e) => e.weightLb !== null);
  const currentWeightLb =
    weighed.length > 0 ? weighed[weighed.length - 1].weightLb : null;

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-bold text-slate-900">Profile</h1>
        <p className="text-sm text-slate-500">
          Height, age, and your weight + calorie targets.
        </p>
      </header>

      <ProfileClient profile={profile} currentWeightLb={currentWeightLb} />
    </div>
  );
}
