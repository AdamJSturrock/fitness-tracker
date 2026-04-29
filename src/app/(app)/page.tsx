import { redirect } from 'next/navigation';
import { getLastUser } from '@/lib/auth';

export default async function AppHomePage() {
  const user = await getLastUser();
  redirect(`/${user}/dashboard`);
}
