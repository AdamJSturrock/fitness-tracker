import { notFound } from 'next/navigation';
import type { UserName } from '@/lib/types';
import { VALID_USERS } from '@/lib/types';
import { userIdByName } from '@/lib/db';
import { todayIso } from '@/lib/dateUtils';
import ScanClient from './scan-client';

export default async function ScanPage({
  params,
}: {
  params: Promise<{ user: string }>;
}) {
  const { user } = await params;
  if (!VALID_USERS.includes(user as UserName)) notFound();
  const name = user as UserName;
  const userId = await userIdByName(name);
  const date = todayIso();

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-bold text-slate-900">Scan a barcode</h1>
        <p className="text-sm text-slate-500">
          Aim at the EAN/UPC on the packaging. We&rsquo;ll prefill the food
          details for you to confirm.
        </p>
      </header>

      <ScanClient userSegment={name} userId={userId} date={date} />
    </div>
  );
}
