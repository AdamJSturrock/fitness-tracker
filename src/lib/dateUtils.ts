// Tiny date helpers used by the dashboard + today pages. No tz drift:
// we always work in YYYY-MM-DD strings and keep arithmetic in UTC.

/** Today's local date as YYYY-MM-DD. */
export function todayIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const DAY_MS = 86_400_000;

function parseYmd(ymd: string): Date {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1));
}

function toYmd(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Add (possibly negative) days to a YYYY-MM-DD, returning YYYY-MM-DD. */
export function addDays(ymd: string, days: number): string {
  const d = parseYmd(ymd);
  d.setUTCDate(d.getUTCDate() + days);
  return toYmd(d);
}

/** Difference in days, b - a. */
export function daysBetween(a: string, b: string): number {
  return Math.round((parseYmd(b).getTime() - parseYmd(a).getTime()) / DAY_MS);
}

/** Format YYYY-MM-DD as "Apr 12" for chart axis ticks. */
export function formatShortDate(ymd: string): string {
  const d = parseYmd(ymd);
  const mo = d.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' });
  const day = d.getUTCDate();
  return `${mo} ${day}`;
}
