import { notFound } from 'next/navigation';
import type { UserName } from '@/lib/types';
import { getProfile, listFoods } from '@/server/queries';
import FoodsClient from './foods-client';

const VALID_USERS: readonly UserName[] = ['adam', 'anna'];

export default async function FoodsPage({
  params,
  searchParams,
}: {
  params: Promise<{ user: string }>;
  searchParams: Promise<{ archived?: string }>;
}) {
  const { user } = await params;
  if (!VALID_USERS.includes(user as UserName)) notFound();
  const name = user as UserName;

  const sp = await searchParams;
  const includeArchived = sp.archived === '1';

  const [profile, foods] = await Promise.all([
    getProfile(name),
    listFoods({ includeArchived }),
  ]);

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-bold text-slate-900">Food library</h1>
        <p className="text-sm text-slate-500">
          Shared between Adam &amp; Anna. Tidy up names, fix calorie counts,
          archive things you no longer buy.
        </p>
      </header>

      <FoodsClient
        foods={foods}
        userId={profile.id}
        showArchived={includeArchived}
      />
    </div>
  );
}
