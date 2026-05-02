import type { PerformanceSnapshotWithExercise } from '@/lib/types';

function formatDateLong(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1)).toLocaleDateString(
    'en-GB',
    { day: 'numeric', month: 'short', timeZone: 'UTC' },
  );
}

export default function RecentPrs({
  prs,
}: {
  prs: PerformanceSnapshotWithExercise[];
}) {
  return (
    <section
      aria-label="Recent PRs"
      className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
    >
      <header className="mb-2 flex items-center justify-between">
        <h2 className="text-base font-semibold text-slate-900">
          <span aria-hidden>🏆</span> Recent PRs
        </h2>
        <span className="text-xs text-slate-500">Last 30 days</span>
      </header>
      {prs.length === 0 ? (
        <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
          No PRs yet — log a heavier set than last time and it&rsquo;ll show up
          here.
        </p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {prs.map((pr) => (
            <li
              key={pr.id}
              className="flex items-center justify-between gap-3 py-2 text-sm"
            >
              <div className="min-w-0">
                <p className="truncate font-semibold text-slate-900">
                  {pr.exercise.name}
                </p>
                <p className="text-xs text-slate-500">
                  {pr.topWeightLb != null && pr.topReps != null
                    ? `${pr.topWeightLb} lb × ${pr.topReps}`
                    : pr.topReps != null
                      ? `${pr.topReps} reps`
                      : '—'}
                  {pr.e1rm != null
                    ? ` · est. 1RM ${Math.round(pr.e1rm)} lb`
                    : ''}
                </p>
              </div>
              <span className="shrink-0 text-xs text-slate-500">
                {formatDateLong(pr.date)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
