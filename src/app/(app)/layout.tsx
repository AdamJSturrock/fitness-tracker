import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getSession } from '@/lib/auth';

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
    <div className="flex min-h-screen flex-col bg-neutral-50 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
      <header className="sticky top-0 z-10 border-b border-neutral-200 bg-white/90 backdrop-blur dark:border-neutral-800 dark:bg-neutral-900/90">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
          <Link
            href="/"
            className="text-base font-semibold tracking-tight"
          >
            Fitness Tracker
          </Link>

          {/* Wave 2 Agent U replaces this with <UserSwitcher />. */}
          <div
            data-placeholder="user-switcher"
            className="text-xs text-neutral-500 dark:text-neutral-400"
          >
            switcher TBD
          </div>

          <form action="/api/logout" method="post">
            <button
              type="submit"
              formMethod="post"
              className="rounded-md border border-neutral-300 bg-white px-2.5 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:bg-neutral-800"
            >
              Log out
            </button>
          </form>
        </div>

        {/* Wave 2 Agent U replaces this with <NavTabs />. */}
        <div
          data-placeholder="nav-tabs"
          className="mx-auto max-w-3xl px-4 pb-2 text-xs text-neutral-500 dark:text-neutral-400"
        >
          tabs TBD
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">
        {children}
      </main>
    </div>
  );
}
