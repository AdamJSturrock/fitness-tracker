import { notFound } from 'next/navigation';
import type { UserName } from '@/lib/types';

const VALID_USERS: readonly UserName[] = ['adam', 'anna'];

export default async function TodayPage({
  params,
}: {
  params: Promise<{ user: string }>;
}) {
  const { user } = await params;
  if (!VALID_USERS.includes(user as UserName)) notFound();

  return <main>{user} today — coming soon</main>;
}
