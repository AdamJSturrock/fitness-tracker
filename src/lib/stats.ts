// Pure statistics helpers for the weight chart.
// No I/O, no React, no Date.now(). Tests live alongside in stats.test.ts.

export interface DatedWeight {
  date: string; // YYYY-MM-DD
  weightLb: number;
}

export interface RegressionResult {
  slope: number;
  intercept: number;
  r2: number;
}

export interface Projection {
  projection: DatedWeight[];
  targetReached: string | null; // YYYY-MM-DD or null
  slopeLbPerWeek: number;
  r2: number;
}

// ---------- date helpers (local, no tz drift) ----------

const DAY_MS = 86_400_000;

function parseYmd(ymd: string): Date {
  // Construct as UTC so arithmetic is timezone-free and consistent.
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1));
}

function toYmd(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addDays(ymd: string, days: number): string {
  const d = parseYmd(ymd);
  d.setUTCDate(d.getUTCDate() + days);
  return toYmd(d);
}

function daysBetween(a: string, b: string): number {
  return Math.round((parseYmd(b).getTime() - parseYmd(a).getTime()) / DAY_MS);
}

// ---------- 1. centered moving average ----------

/**
 * Centered moving average over a weight series sorted ascending by date.
 * Window MUST be odd. At the edges where the full window isn't available
 * we shrink the window symmetrically — first point is just itself,
 * second is the mean of the first 3, etc. Never returns NaN; never
 * changes the length of the series.
 *
 * Caller is responsible for filtering out null weights before calling.
 */
export function movingAverage(series: DatedWeight[], window = 7): DatedWeight[] {
  if (window % 2 === 0) {
    throw new Error(`movingAverage: window must be odd, got ${window}`);
  }
  if (series.length === 0) return [];

  const halfMax = (window - 1) / 2;
  const out: DatedWeight[] = new Array(series.length);

  for (let i = 0; i < series.length; i++) {
    // Symmetric shrink at both edges.
    const half = Math.min(halfMax, i, series.length - 1 - i);
    let sum = 0;
    let count = 0;
    for (let j = i - half; j <= i + half; j++) {
      sum += series[j].weightLb;
      count++;
    }
    out[i] = { date: series[i].date, weightLb: sum / count };
  }
  return out;
}

// ---------- 2. healthy trend reference line ----------

export type GoalMode = 'loss' | 'build';

/**
 * The "max healthy loss" reference line — anchored at start_date,
 * weekly resolution Mondays through throughDate, plus the actual end date
 * if it isn't already a Monday.
 *
 * Slope: -min(0.01 * startWeightLb, 2) lb per week (NHS guideline).
 * First point is exactly (startDate, startWeightLb).
 */
export function healthyLossLine(args: {
  startDate: string;
  startWeightLb: number;
  throughDate: string;
}): DatedWeight[] {
  return healthyTrendLine({ ...args, mode: 'loss' });
}

/**
 * Mode-aware healthy reference line.
 *
 * - mode='loss':  slope = -min(0.01 * startWeight, 2) lb/wk (NHS guideline).
 * - mode='build': slope = +min(0.005 * startWeight, 1) lb/wk. Half the loss
 *   rate is the standard "lean gain" guidance — gaining faster than ~1 lb/wk
 *   tips into mostly fat. First point is exactly (startDate, startWeightLb).
 */
export function healthyTrendLine(args: {
  startDate: string;
  startWeightLb: number;
  throughDate: string;
  mode: GoalMode;
}): DatedWeight[] {
  const { startDate, startWeightLb, throughDate, mode } = args;
  const totalDays = daysBetween(startDate, throughDate);
  if (totalDays < 0) return [{ date: startDate, weightLb: startWeightLb }];

  const ratePerWeek =
    mode === 'loss'
      ? -Math.min(0.01 * startWeightLb, 2)
      : Math.min(0.005 * startWeightLb, 1);
  const ratePerDay = ratePerWeek / 7;

  const points: DatedWeight[] = [];
  points.push({ date: startDate, weightLb: startWeightLb });

  const startDow = parseYmd(startDate).getUTCDay();
  const daysToNextMonday = ((1 - startDow + 7) % 7) || 7;
  let cursorDays = daysToNextMonday;

  while (cursorDays < totalDays) {
    const date = addDays(startDate, cursorDays);
    const weightLb = startWeightLb + ratePerDay * cursorDays;
    points.push({ date, weightLb });
    cursorDays += 7;
  }

  const last = points[points.length - 1];
  if (last.date !== throughDate) {
    points.push({
      date: throughDate,
      weightLb: startWeightLb + ratePerDay * totalDays,
    });
  }

  return points;
}

// ---------- 3. linear regression ----------

/**
 * Standard ordinary-least-squares fit. r² is the coefficient of determination.
 * Degenerate cases:
 *   - 0 points: { slope:0, intercept:0, r2:0 }
 *   - 1 point: { slope:0, intercept:y, r2:0 }
 *   - all-x identical: slope=0, intercept=mean(y), r2=0
 */
export function linearRegression(points: { x: number; y: number }[]): RegressionResult {
  if (points.length < 2) {
    return { slope: 0, intercept: points[0]?.y ?? 0, r2: 0 };
  }

  const n = points.length;
  let sumX = 0;
  let sumY = 0;
  for (const p of points) {
    sumX += p.x;
    sumY += p.y;
  }
  const meanX = sumX / n;
  const meanY = sumY / n;

  let ssxx = 0; // Σ(x - x̄)²
  let ssxy = 0; // Σ(x - x̄)(y - ȳ)
  let ssyy = 0; // Σ(y - ȳ)²
  for (const p of points) {
    const dx = p.x - meanX;
    const dy = p.y - meanY;
    ssxx += dx * dx;
    ssxy += dx * dy;
    ssyy += dy * dy;
  }

  if (ssxx === 0) {
    return { slope: 0, intercept: meanY, r2: 0 };
  }
  const slope = ssxy / ssxx;
  const intercept = meanY - slope * meanX;
  const r2 = ssyy === 0 ? 1 : (ssxy * ssxy) / (ssxx * ssyy);
  return { slope, intercept, r2 };
}

// ---------- 4. projection ----------

/**
 * Project forward from `today` using a regression over the last
 * `lookbackDays` of `maSeries`. Returns null if there isn't enough data
 * (fewer than 7 distinct points in the lookback window).
 *
 * `targetWeightMaxLb` is the boundary the user is heading toward — for
 * loss mode it's the upper bound of the target band; for build mode it's
 * the lower bound (the floor they want to climb above).
 *
 * If the trend isn't moving toward the target (no loss when mode='loss',
 * no gain when mode='build'), we still emit a flat-ish line for the full
 * horizon and report `targetReached: null`.
 */
export function projectWeight(args: {
  maSeries: DatedWeight[];
  today: string;
  targetWeightMaxLb: number;
  lookbackDays?: number;
  horizonDays?: number;
  mode?: GoalMode;
}): Projection | null {
  const {
    maSeries,
    today,
    targetWeightMaxLb,
    lookbackDays = 14,
    horizonDays = 365,
    mode = 'loss',
  } = args;

  if (maSeries.length === 0) return null;

  // Take points within `lookbackDays` of today, inclusive.
  const cutoff = addDays(today, -lookbackDays);
  const recent = maSeries.filter((p) => p.date >= cutoff && p.date <= today);
  if (recent.length < 7) return null;

  const firstDate = recent[0].date;
  const points = recent.map((p) => ({
    x: daysBetween(firstDate, p.date),
    y: p.weightLb,
  }));
  const { slope, intercept, r2 } = linearRegression(points);

  const slopeLbPerWeek = slope * 7;

  // Current modeled weight at "today" (in the regression frame).
  const todayX = daysBetween(firstDate, today);
  const startY = slope * todayX + intercept;

  const projection: DatedWeight[] = [];
  let targetReached: string | null = null;

  for (let week = 0; week * 7 <= horizonDays; week++) {
    const dayOffset = week * 7;
    const date = addDays(today, dayOffset);
    const weightLb = startY + slope * dayOffset;
    projection.push({ date, weightLb });

    const crossed =
      mode === 'loss'
        ? slope < 0 && weightLb <= targetWeightMaxLb
        : slope > 0 && weightLb >= targetWeightMaxLb;
    if (crossed) {
      const dayHit = (targetWeightMaxLb - startY) / slope;
      if (Number.isFinite(dayHit) && dayHit >= 0) {
        targetReached = addDays(today, Math.ceil(dayHit));
      } else {
        targetReached = date;
      }
      break;
    }
  }

  return {
    projection,
    targetReached,
    slopeLbPerWeek,
    r2,
  };
}

// ---------- 5. days to target ----------

/**
 * Pure arithmetic. Returns the number of days until the modeled weight
 * crosses the target boundary. For mode='loss' the target is the upper
 * bound (you must be above it and losing); for mode='build' the target
 * is the lower bound (you must be below it and gaining). Returns null
 * when the trend isn't heading toward the boundary or already crossed.
 */
export function daysToTarget(args: {
  currentMaWeightLb: number;
  slopeLbPerDay: number;
  targetWeightMaxLb: number;
  mode?: GoalMode;
}): number | null {
  const {
    currentMaWeightLb,
    slopeLbPerDay,
    targetWeightMaxLb,
    mode = 'loss',
  } = args;
  if (mode === 'loss') {
    if (currentMaWeightLb <= targetWeightMaxLb) return null;
    if (slopeLbPerDay >= 0) return null;
  } else {
    if (currentMaWeightLb >= targetWeightMaxLb) return null;
    if (slopeLbPerDay <= 0) return null;
  }
  const days = (targetWeightMaxLb - currentMaWeightLb) / slopeLbPerDay;
  return Math.max(0, Math.ceil(days));
}

// ---------- 6. weekly average loss ----------

/**
 * Average lb lost per week over the last `weeks` weeks of the moving-average series.
 * Positive number = losing weight. Returns 0 if not enough data.
 */
export function weeklyAverageLoss(maSeries: DatedWeight[], weeks = 4): number {
  if (maSeries.length < 2) return 0;
  const last = maSeries[maSeries.length - 1];
  const cutoff = addDays(last.date, -weeks * 7);
  const window = maSeries.filter((p) => p.date >= cutoff && p.date <= last.date);
  if (window.length < 2) return 0;
  const first = window[0];
  const days = daysBetween(first.date, last.date);
  if (days <= 0) return 0;
  const lbDelta = first.weightLb - last.weightLb; // positive = lost
  return (lbDelta / days) * 7;
}

// ---------- 7. current smoothed weight ----------

export function currentSmoothedWeight(maSeries: DatedWeight[]): number | null {
  if (maSeries.length === 0) return null;
  return maSeries[maSeries.length - 1].weightLb;
}

// ---------- 8. total change since start ----------

/**
 * Total change since the user's start weight, in lb and percent.
 * Positive numbers = lost. Returns 0/0 if maSeries is empty.
 */
export function totalChangeSinceStart(args: {
  maSeries: DatedWeight[];
  startWeightLb: number;
}): { lb: number; percent: number } {
  const { maSeries, startWeightLb } = args;
  if (maSeries.length === 0 || !Number.isFinite(startWeightLb) || startWeightLb <= 0) {
    return { lb: 0, percent: 0 };
  }
  const current = maSeries[maSeries.length - 1].weightLb;
  const lb = startWeightLb - current;
  const percent = (lb / startWeightLb) * 100;
  return { lb, percent };
}

// ---------- 9. calorie-pace projection (deficit → weeks to target) ----------

export interface CaloriePaceProjectionInput {
  /** YYYY-MM-DD anchor date (e.g. today, or last logged-weight date). */
  anchorDate: string;
  /** Weight at the anchor date (lb). */
  anchorWeightLb: number;
  /** Maintenance calories at the anchor weight (TDEE = BMR × activity). */
  tdeeKcal: number;
  /** What the user is averaging per day (kcal). Use the planned target if no
   *  real data is available yet. Below tdeeKcal in build mode → no gain;
   *  above tdeeKcal in loss mode → no loss. */
  dailyKcal: number;
  /**
   * Boundary the projection ends at — for loss mode the upper bound of the
   * target band, for build mode the lower bound (the floor you're climbing
   * toward).
   */
  targetMaxLb: number;
  horizonDays?: number;
  mode?: GoalMode;
}

export interface CaloriePaceProjection {
  projection: DatedWeight[];
  targetReached: string | null;
  /** Negative = losing, positive = gaining. */
  slopeLbPerWeek: number;
  /** tdee − dailyKcal. Positive = deficit (loss mode); negative = surplus (build mode). */
  dailyDeficitKcal: number;
}

/**
 * Project forward from anchor weight using a calorie-deficit model:
 *   slope_lb_per_week = (dailyKcal − tdeeKcal) × 7 / 3500
 * This is a flat slope (no compounding), which is good enough for the
 * UX — the goal is "give the user a believable target ETA from day 1".
 *
 * Returns null only for invalid inputs. If dailyKcal >= tdeeKcal we still
 * emit a flat horizon line and targetReached = null (the chart line shows
 * the user that, at current intake, they won't reach the band).
 */
export function caloriePaceProjection(
  args: CaloriePaceProjectionInput,
): CaloriePaceProjection | null {
  const {
    anchorDate,
    anchorWeightLb,
    tdeeKcal,
    dailyKcal,
    targetMaxLb,
    horizonDays = 365,
    mode = 'loss',
  } = args;
  if (
    !Number.isFinite(anchorWeightLb) ||
    !Number.isFinite(tdeeKcal) ||
    !Number.isFinite(dailyKcal) ||
    !Number.isFinite(targetMaxLb) ||
    anchorWeightLb <= 0 ||
    tdeeKcal <= 0 ||
    targetMaxLb <= 0
  ) {
    return null;
  }
  const dailyDeficit = tdeeKcal - dailyKcal; // +ve = losing
  const slopeLbPerDay = -dailyDeficit / 3500;
  const slopeLbPerWeek = slopeLbPerDay * 7;

  // Already on the target side of the boundary — emit a flat point.
  const alreadyThere =
    mode === 'loss'
      ? anchorWeightLb <= targetMaxLb
      : anchorWeightLb >= targetMaxLb;
  if (alreadyThere) {
    return {
      projection: [{ date: anchorDate, weightLb: anchorWeightLb }],
      targetReached: anchorDate,
      slopeLbPerWeek,
      dailyDeficitKcal: dailyDeficit,
    };
  }

  const points: DatedWeight[] = [
    { date: anchorDate, weightLb: anchorWeightLb },
  ];
  let targetReached: string | null = null;
  for (let d = 7; d <= horizonDays; d += 7) {
    const w = anchorWeightLb + slopeLbPerDay * d;
    const date = addDays(anchorDate, d);
    points.push({ date, weightLb: w });
    const crossed =
      mode === 'loss'
        ? slopeLbPerDay < 0 && w <= targetMaxLb
        : slopeLbPerDay > 0 && w >= targetMaxLb;
    if (crossed && targetReached === null) {
      const prev = points[points.length - 2];
      const segDays = d - daysBetween(anchorDate, prev.date);
      const dW = w - prev.weightLb;
      const t = (targetMaxLb - prev.weightLb) / dW;
      const crossingDays = daysBetween(anchorDate, prev.date) + t * segDays;
      targetReached = addDays(anchorDate, Math.ceil(crossingDays));
      points[points.length - 1] = { date: targetReached, weightLb: targetMaxLb };
      break;
    }
  }
  return {
    projection: points,
    targetReached,
    slopeLbPerWeek,
    dailyDeficitKcal: dailyDeficit,
  };
}

// ---------- 10. required pace (inverse: target by date → kcal/day needed) ----

export interface RequiredPaceInput {
  /** YYYY-MM-DD anchor date (today). */
  anchorDate: string;
  /** Weight at the anchor (lb). */
  anchorWeightLb: number;
  /** YYYY-MM-DD desired date to hit `targetMaxLb`. Must be > anchor. */
  targetDate: string;
  /**
   * Boundary to cross — upper bound for loss mode, lower bound (floor) for
   * build mode.
   */
  targetMaxLb: number;
  /** Maintenance calories at anchor (TDEE = BMR × activity multiplier). */
  tdeeKcal: number;
  mode?: GoalMode;
}

export interface RequiredPace {
  /** Required avg rate, lb/week. Positive — magnitude only; the direction is
   *  implied by mode. */
  lbPerWeek: number;
  /**
   * Required daily kcal delta vs TDEE. For loss mode this is a deficit
   * (positive = below TDEE); for build mode it's a surplus (positive =
   * above TDEE). Always non-negative.
   */
  dailyDeficitKcal: number;
  /** Required daily kcal intake (TDEE ± delta), floored at 0. */
  dailyIntakeKcal: number;
  /** Days until target date (anchor exclusive, target inclusive). */
  daysAvailable: number;
  /**
   * Pace bucket. Thresholds depend on mode:
   *   loss:  easy ≤0.5, moderate ≤1, aggressive ≤2, unsafe >2 (lb/wk)
   *   build: easy ≤0.25, moderate ≤0.5, aggressive ≤1, unsafe >1
   * Above the safe ceiling extra calories tend to deposit as fat rather
   * than lean mass.
   */
  pace: 'past' | 'already-there' | 'easy' | 'moderate' | 'aggressive' | 'unsafe';
}

/**
 * Inverse of caloriePaceProjection — given a desired target date, work out
 * how many lb/wk and kcal/day the user needs.
 * Returns null only for invalid inputs.
 */
export function requiredPace(args: RequiredPaceInput): RequiredPace | null {
  const {
    anchorDate,
    anchorWeightLb,
    targetDate,
    targetMaxLb,
    tdeeKcal,
    mode = 'loss',
  } = args;
  if (
    !Number.isFinite(anchorWeightLb) ||
    !Number.isFinite(targetMaxLb) ||
    !Number.isFinite(tdeeKcal) ||
    anchorWeightLb <= 0 ||
    targetMaxLb <= 0 ||
    tdeeKcal <= 0
  ) {
    return null;
  }
  const days = daysBetween(anchorDate, targetDate);
  const alreadyThere =
    mode === 'loss'
      ? anchorWeightLb <= targetMaxLb
      : anchorWeightLb >= targetMaxLb;
  if (alreadyThere) {
    return {
      lbPerWeek: 0,
      dailyDeficitKcal: 0,
      dailyIntakeKcal: tdeeKcal,
      daysAvailable: days,
      pace: 'already-there',
    };
  }
  if (days <= 0) {
    return {
      lbPerWeek: NaN,
      dailyDeficitKcal: NaN,
      dailyIntakeKcal: NaN,
      daysAvailable: days,
      pace: 'past',
    };
  }
  const lbDelta =
    mode === 'loss'
      ? anchorWeightLb - targetMaxLb
      : targetMaxLb - anchorWeightLb;
  const lbPerWeek = (lbDelta / days) * 7;
  const dailyDeficitKcal = (lbPerWeek * 3500) / 7;
  const dailyIntakeKcal =
    mode === 'loss'
      ? Math.max(0, tdeeKcal - dailyDeficitKcal)
      : tdeeKcal + dailyDeficitKcal;
  let pace: RequiredPace['pace'];
  if (mode === 'loss') {
    if (lbPerWeek <= 0.5) pace = 'easy';
    else if (lbPerWeek <= 1) pace = 'moderate';
    else if (lbPerWeek <= 2) pace = 'aggressive';
    else pace = 'unsafe';
  } else {
    if (lbPerWeek <= 0.25) pace = 'easy';
    else if (lbPerWeek <= 0.5) pace = 'moderate';
    else if (lbPerWeek <= 1) pace = 'aggressive';
    else pace = 'unsafe';
  }
  return {
    lbPerWeek,
    dailyDeficitKcal,
    dailyIntakeKcal,
    daysAvailable: days,
    pace,
  };
}

// ---------- 11. estimated 1-rep-max (Epley) -----------------------------

/**
 * Epley estimated 1-rep-max: weight × (1 + reps/30).
 * The standard reference for progressive-overload tracking — lets us compare
 * a heavy 5×5 against a higher-rep set on a single axis. Returns null if any
 * input is missing/invalid or non-positive.
 */
export function epleyOneRepMax(
  weightLb: number | null | undefined,
  reps: number | null | undefined,
): number | null {
  if (
    weightLb == null ||
    reps == null ||
    !Number.isFinite(weightLb) ||
    !Number.isFinite(reps) ||
    weightLb <= 0 ||
    reps <= 0
  ) {
    return null;
  }
  return weightLb * (1 + reps / 30);
}
