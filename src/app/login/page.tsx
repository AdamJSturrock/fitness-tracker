'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });

      if (res.ok) {
        router.replace('/');
        router.refresh();
        return;
      }

      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setError(data.error ?? 'Login failed.');
    } catch {
      setError('Network error. Try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-50 p-6 dark:bg-neutral-950">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm space-y-4 rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-900"
      >
        <div>
          <h1 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">
            Fitness Tracker
          </h1>
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
            Enter the shared password to continue.
          </p>
        </div>

        <label className="block">
          <span className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
            Password
          </span>
          <input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 block w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-base text-neutral-900 shadow-sm focus:border-neutral-500 focus:outline-none focus:ring-2 focus:ring-neutral-300 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100 dark:focus:border-neutral-400 dark:focus:ring-neutral-700"
          />
        </label>

        {error && (
          <p
            role="alert"
            className="text-sm text-red-600 dark:text-red-400"
          >
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="block w-full rounded-lg bg-neutral-900 px-3 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300"
        >
          {submitting ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </main>
  );
}
