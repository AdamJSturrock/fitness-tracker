'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';

export default function LogoutButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  async function handleLogout() {
    try {
      await fetch('/api/logout', { method: 'POST' });
    } catch {
      // Best-effort — fall through to navigate anyway.
    }
    startTransition(() => {
      router.refresh();
      router.push('/login');
    });
  }

  return (
    <button
      type="button"
      onClick={handleLogout}
      disabled={pending}
      className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-100 disabled:opacity-50"
    >
      {pending ? 'Logging out…' : 'Log out'}
    </button>
  );
}
