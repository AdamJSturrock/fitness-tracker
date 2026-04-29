import { notFound } from 'next/navigation';
import type { UserName } from '@/lib/types';
import { getProfile } from '@/server/queries';

const VALID_USERS: readonly UserName[] = ['adam', 'anna', 'demo'];

export default async function UserLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ user: string }>;
}) {
  const { user } = await params;
  if (!VALID_USERS.includes(user as UserName)) notFound();

  // Fail fast (404) if the profile row is missing — typically means the
  // migration hasn't been run yet.
  try {
    await getProfile(user as UserName);
  } catch {
    notFound();
  }

  return <>{children}</>;
}
