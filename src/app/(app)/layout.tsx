import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getSession } from '@/lib/auth';
import NavTabs from '@/components/NavTabs';
import LogoutButton from '@/components/LogoutButton';

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Defensive auth check (middleware also enforces this).
  const session = await getSession();
  if (!session.authed) {
    redirect('/login');
  }

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 text-slate-900">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
          <Link
            href="/"
            className="text-base font-semibold tracking-tight text-slate-900"
          >
            Fitness Tracker
          </Link>
          <LogoutButton />
        </div>
        <NavTabs />
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-5">
        {children}
      </main>
    </div>
  );
}
