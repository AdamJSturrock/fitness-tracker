import { notFound } from 'next/navigation';
import type { UserName } from '@/lib/types';

const VALID_USERS: readonly UserName[] = ['adam', 'anna'];

export default async function UserLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ user: string }>;
}) {
  const { user } = await params;
  if (!VALID_USERS.includes(user as UserName)) notFound();

  // Each page re-fetches its own profile from fixtures (Wave 3 swaps to
  // `getProfile`). Server components are cheap; no context needed.
  return <>{children}</>;
}
