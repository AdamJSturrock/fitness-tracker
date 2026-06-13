import type { GoalMode } from '@/lib/types';
import { daysBetween } from '@/lib/dateUtils';

export interface PaceScenarioEta {
  lbPerWeek: number;
  /** Projected date the target boundary is reached, or null if not within horizon. */
  targetReached: string | null;
}

export interface PaceInsightProps {
  mode: GoalMode;
  /** Recent pace toward the goal, lb/wk (positive = progress). null = not enough data. */
  pace2wk: number | null;
  pace4wk: number | null;
  paceSinceStart: number | null;
  /** The scenario rate closest to the 4-week pace, or null if not progressing. */
  closestRate: number | null;
  /** One entry per plotted scenario (e.g. 1 / 1.5 / 2 lb/wk), ascending by rate. */
  scenarios: PaceScenarioEta[];
  /** User's goal date for being inside the band, if set. */
  targetDate: string | null;
}

function formatDateLong(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1));
  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function paceLabel(v: number | null): string {
  if (v === null) return '—';
  // Negative = moving the wrong way for the goal.
  return `${v >= 0 ? '' : '+'}${Math.abs(v).toFixed(2)} lb/wk`;
}

/**
 * Pace-realism panel. Shows the recent pace over three windows (so a slowdown
 * is obvious), which what-if rate the 4-week pace tracks closest to, the
 * projected target date for each rate, and a verdict against the user's goal
 * date. Pure presentation — all numbers are computed on the server.
 */
export default function PaceInsight({
  mode,
  pace2wk,
  pace4wk,
  paceSinceStart,
  closestRate,
  scenarios,
  targetDate,
}: PaceInsightProps) {
  const isBuild = mode === 'build';
  const verb = isBuild ? 'gain' : 'loss';

  // Is the recent pace decelerating? (2-wk slower than 4-wk slower than start.)
  const slowing =
    pace2wk !== null &&
    pace4wk !== null &&
    pace2wk < pace4wk - 0.05 &&
    (paceSinceStart === null || pace4wk <= paceSinceStart + 0.05);

  const closest =
    closestRate !== null
      ? scenarios.find((s) => s.lbPerWeek === closestRate) ?? null
      : null;

  // Which is the slowest rate that still reaches the band on/before the goal
  // date? That's the pace the user would need to hold to make their target.
  const neededForGoal =
    targetDate !== null
      ? scenarios.find(
          (s) => s.targetReached !== null && s.targetReached <= targetDate,
        ) ?? null
      : null;

  let verdict: { text: string; tone: 'good' | 'warn' | 'bad' };
  if (closestRate === null || closest === null) {
    verdict = {
      text: `No clear ${verb} over the last 4 weeks, so none of these paces fit yet. Worth revisiting intake before reading too much into the target date.`,
      tone: 'bad',
    };
  } else if (closest.targetReached === null) {
    verdict = {
      text: `At your recent ${verb} pace (~${closestRate.toFixed(
        1,
      )} lb/wk) you don't reach the target band within the year shown.`,
      tone: 'bad',
    };
  } else if (targetDate === null) {
    verdict = {
      text: `At your recent ${verb} pace (~${closestRate.toFixed(
        1,
      )} lb/wk) you'd reach the target band around ${formatDateLong(
        closest.targetReached,
      )}. Set a target date on Profile to see whether that's on track.`,
      tone: 'good',
    };
  } else {
    const slackDays = daysBetween(targetDate, closest.targetReached); // +ve = late
    if (slackDays <= 0) {
      verdict = {
        text: `On track — your recent ${verb} pace (~${closestRate.toFixed(
          1,
        )} lb/wk) reaches the band around ${formatDateLong(
          closest.targetReached,
        )}, on or ahead of your ${formatDateLong(targetDate)} goal.`,
        tone: 'good',
      };
    } else {
      const weeksLate = Math.round(slackDays / 7);
      const needLine = neededForGoal
        ? `Holding ~${neededForGoal.lbPerWeek.toFixed(
            1,
          )} lb/wk would get you there in time.`
        : `Even the fastest pace shown doesn't hit it in time — the goal date may be unrealistic.`;
      verdict = {
        text: `At your recent ${verb} pace (~${closestRate.toFixed(
          1,
        )} lb/wk) you'd reach the band around ${formatDateLong(
          closest.targetReached,
        )} — about ${weeksLate} week${
          weeksLate === 1 ? '' : 's'
        } after your ${formatDateLong(
          targetDate,
        )} goal. ${needLine}`,
        tone: weeksLate > 8 ? 'bad' : 'warn',
      };
    }
  }

  const toneClass =
    verdict.tone === 'good'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
      : verdict.tone === 'warn'
        ? 'border-amber-200 bg-amber-50 text-amber-800'
        : 'border-rose-200 bg-rose-50 text-rose-800';

  return (
    <section
      aria-label="Pace check"
      className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4"
    >
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-semibold text-slate-900">
          Pace check{isBuild ? '' : ' — is the target realistic?'}
        </h2>
        {slowing ? (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800">
            Slowing down
          </span>
        ) : null}
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <PaceCell label={`Last 2 wks`} value={paceLabel(pace2wk)} />
        <PaceCell
          label="Last 4 wks"
          value={paceLabel(pace4wk)}
          emphasize
        />
        <PaceCell label="Since start" value={paceLabel(paceSinceStart)} />
      </div>

      <div className="mt-3 rounded-lg border border-slate-100 bg-slate-50 p-2.5">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          Projected target date by {verb} pace
        </p>
        <ul className="mt-1.5 space-y-1">
          {scenarios.map((s) => (
            <li
              key={s.lbPerWeek}
              className={
                'flex items-center justify-between text-sm ' +
                (s.lbPerWeek === closestRate
                  ? 'font-semibold text-fuchsia-700'
                  : 'text-slate-600')
              }
            >
              <span className="flex items-center gap-1.5">
                <span
                  aria-hidden
                  className="inline-block h-2 w-2 rounded-full"
                  style={{
                    background:
                      s.lbPerWeek === closestRate ? '#c026d3' : '#e879f9',
                    opacity: s.lbPerWeek === closestRate ? 1 : 0.5,
                  }}
                />
                {s.lbPerWeek.toFixed(1)} lb/wk
                {s.lbPerWeek === closestRate ? ' · closest to you' : ''}
              </span>
              <span className="tabular-nums">
                {s.targetReached
                  ? formatDateLong(s.targetReached)
                  : 'beyond a year'}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <p
        className={
          'mt-3 rounded-lg border px-3 py-2 text-xs leading-relaxed ' +
          toneClass
        }
      >
        {verdict.text}
      </p>
    </section>
  );
}

function PaceCell({
  label,
  value,
  emphasize = false,
}: {
  label: string;
  value: string;
  emphasize?: boolean;
}) {
  return (
    <div
      className={
        'rounded-lg border p-2 ' +
        (emphasize
          ? 'border-fuchsia-200 bg-fuchsia-50'
          : 'border-slate-200 bg-white')
      }
    >
      <p className="text-[11px] font-medium text-slate-500">{label}</p>
      <p className="mt-0.5 text-sm font-semibold tabular-nums text-slate-900">
        {value}
      </p>
    </div>
  );
}
