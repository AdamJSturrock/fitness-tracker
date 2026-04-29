import { describe, expect, it } from 'vitest';
import {
  currentSmoothedWeight,
  daysToTarget,
  healthyLossLine,
  linearRegression,
  movingAverage,
  projectWeight,
  totalChangeSinceStart,
  weeklyAverageLoss,
  type DatedWeight,
} from './stats';

// --- helpers --------------------------------------------------------------

function addDays(ymd: string, days: number): string {
  const d = new Date(ymd + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Build a perfectly linear series: weight on day i = start + slope * i. */
function linearSeries(
  startDate: string,
  startWeight: number,
  slopePerDay: number,
  days: number,
): DatedWeight[] {
  const out: DatedWeight[] = [];
  for (let i = 0; i < days; i++) {
    out.push({
      date: addDays(startDate, i),
      weightLb: startWeight + slopePerDay * i,
    });
  }
  return out;
}

// --- movingAverage --------------------------------------------------------

describe('movingAverage', () => {
  it('returns same length and never NaN', () => {
    const series = linearSeries('2026-01-01', 200, -0.1, 21);
    const ma = movingAverage(series, 7);
    expect(ma).toHaveLength(21);
    for (const p of ma) {
      expect(Number.isFinite(p.weightLb)).toBe(true);
    }
  });

  it('first point equals itself; second is mean of 3', () => {
    const series: DatedWeight[] = [
      { date: '2026-01-01', weightLb: 200 },
      { date: '2026-01-02', weightLb: 199 },
      { date: '2026-01-03', weightLb: 198 },
      { date: '2026-01-04', weightLb: 197 },
      { date: '2026-01-05', weightLb: 196 },
    ];
    const ma = movingAverage(series, 5);
    expect(ma[0].weightLb).toBeCloseTo(200);
    // Second: window shrinks to 3 → mean(200, 199, 198) = 199
    expect(ma[1].weightLb).toBeCloseTo(199);
    // Center: full 5-window mean(200,199,198,197,196) = 198
    expect(ma[2].weightLb).toBeCloseTo(198);
  });

  it('on a perfectly linear series the centered MA equals the value itself for interior points', () => {
    const series = linearSeries('2026-01-01', 200, -1, 11);
    const ma = movingAverage(series, 7);
    // For i >= 3 and i <= 7 the full window applies; centered MA on a line == the value at i.
    for (let i = 3; i <= 7; i++) {
      expect(ma[i].weightLb).toBeCloseTo(series[i].weightLb);
    }
  });

  it('throws on even window', () => {
    expect(() => movingAverage([], 4)).toThrow();
  });

  it('handles empty input', () => {
    expect(movingAverage([], 7)).toEqual([]);
  });
});

// --- healthyLossLine ------------------------------------------------------

describe('healthyLossLine', () => {
  it('uses 1% of start weight per week, capped at 2 lb/wk', () => {
    // 250 lb → 1% = 2.5, capped to 2.0 lb/week.
    const line = healthyLossLine({
      startDate: '2026-01-05', // Monday
      startWeightLb: 250,
      throughDate: '2026-01-19', // 14 days later
    });
    expect(line[0]).toEqual({ date: '2026-01-05', weightLb: 250 });
    // Last point should be 250 - (2/7)*14 = 250 - 4 = 246
    const last = line[line.length - 1];
    expect(last.date).toBe('2026-01-19');
    expect(last.weightLb).toBeCloseTo(246, 6);
  });

  it('uses 1% when below cap', () => {
    // 150 lb → 1% = 1.5 lb/week.
    const line = healthyLossLine({
      startDate: '2026-01-05',
      startWeightLb: 150,
      throughDate: '2026-01-12',
    });
    const last = line[line.length - 1];
    expect(last.weightLb).toBeCloseTo(148.5, 6);
  });

  it('first point is exactly the anchor', () => {
    const line = healthyLossLine({
      startDate: '2026-02-15',
      startWeightLb: 180,
      throughDate: '2026-03-01',
    });
    expect(line[0]).toEqual({ date: '2026-02-15', weightLb: 180 });
  });

  it('handles throughDate equal to startDate', () => {
    const line = healthyLossLine({
      startDate: '2026-01-01',
      startWeightLb: 200,
      throughDate: '2026-01-01',
    });
    expect(line).toEqual([{ date: '2026-01-01', weightLb: 200 }]);
  });
});

// --- linearRegression -----------------------------------------------------

describe('linearRegression', () => {
  it('recovers a known slope on noiseless data', () => {
    const points = Array.from({ length: 10 }, (_, i) => ({ x: i, y: 5 + 2 * i }));
    const { slope, intercept, r2 } = linearRegression(points);
    expect(slope).toBeCloseTo(2);
    expect(intercept).toBeCloseTo(5);
    expect(r2).toBeCloseTo(1);
  });

  it('returns 0/0/0 for empty input', () => {
    expect(linearRegression([])).toEqual({ slope: 0, intercept: 0, r2: 0 });
  });

  it('returns intercept only for single point', () => {
    expect(linearRegression([{ x: 5, y: 7 }])).toEqual({
      slope: 0,
      intercept: 7,
      r2: 0,
    });
  });

  it('handles all-equal x values', () => {
    const r = linearRegression([
      { x: 3, y: 1 },
      { x: 3, y: 5 },
    ]);
    expect(r.slope).toBe(0);
    expect(r.intercept).toBeCloseTo(3);
    expect(r.r2).toBe(0);
  });
});

// --- projectWeight --------------------------------------------------------

describe('projectWeight', () => {
  it('returns null with insufficient data', () => {
    const ma = linearSeries('2026-04-15', 200, -0.2, 5); // only 5 points
    const result = projectWeight({
      maSeries: ma,
      today: '2026-04-19',
      targetWeightMaxLb: 180,
    });
    expect(result).toBeNull();
  });

  it('projects to target on a clean downward trend', () => {
    // 14 days, losing 0.2 lb/day = 1.4 lb/week.
    const ma = linearSeries('2026-04-16', 200, -0.2, 14);
    const today = ma[ma.length - 1].date;
    const result = projectWeight({
      maSeries: ma,
      today,
      targetWeightMaxLb: 195,
    });
    expect(result).not.toBeNull();
    expect(result!.slopeLbPerWeek).toBeCloseTo(-1.4, 5);
    expect(result!.r2).toBeCloseTo(1, 5);
    expect(result!.targetReached).not.toBeNull();
    // Currently at ~197.4 after 13 days of loss, slope -0.2 lb/day to hit 195
    // → ~12 days. Just check it's a valid future date.
    expect(result!.targetReached! >= today).toBe(true);
  });

  it('returns flat projection with null target when no loss', () => {
    const ma = linearSeries('2026-04-16', 200, 0.05, 14); // slowly gaining
    const today = ma[ma.length - 1].date;
    const result = projectWeight({
      maSeries: ma,
      today,
      targetWeightMaxLb: 180,
      horizonDays: 14,
    });
    expect(result).not.toBeNull();
    expect(result!.targetReached).toBeNull();
    expect(result!.slopeLbPerWeek).toBeGreaterThanOrEqual(0);
    expect(result!.projection.length).toBeGreaterThan(0);
  });
});

// --- daysToTarget ---------------------------------------------------------

describe('daysToTarget', () => {
  it('computes simple arithmetic', () => {
    // 200 - 0.5*days = 180  → days = 40
    expect(
      daysToTarget({
        currentMaWeightLb: 200,
        slopeLbPerDay: -0.5,
        targetWeightMaxLb: 180,
      }),
    ).toBe(40);
  });

  it('returns null when already below target', () => {
    expect(
      daysToTarget({
        currentMaWeightLb: 175,
        slopeLbPerDay: -0.5,
        targetWeightMaxLb: 180,
      }),
    ).toBeNull();
  });

  it('returns null when not losing', () => {
    expect(
      daysToTarget({
        currentMaWeightLb: 200,
        slopeLbPerDay: 0,
        targetWeightMaxLb: 180,
      }),
    ).toBeNull();
    expect(
      daysToTarget({
        currentMaWeightLb: 200,
        slopeLbPerDay: 0.1,
        targetWeightMaxLb: 180,
      }),
    ).toBeNull();
  });
});

// --- weeklyAverageLoss ----------------------------------------------------

describe('weeklyAverageLoss', () => {
  it('reports positive number when losing', () => {
    // 28 days, losing 0.25 lb/day → 1.75 lb/week.
    const ma = linearSeries('2026-04-01', 200, -0.25, 28);
    expect(weeklyAverageLoss(ma, 4)).toBeCloseTo(1.75, 5);
  });

  it('returns 0 for too-short series', () => {
    expect(weeklyAverageLoss([], 4)).toBe(0);
    expect(weeklyAverageLoss([{ date: '2026-01-01', weightLb: 200 }], 4)).toBe(0);
  });

  it('reports negative number when gaining', () => {
    const ma = linearSeries('2026-04-01', 200, 0.1, 28); // gaining
    expect(weeklyAverageLoss(ma, 4)).toBeCloseTo(-0.7, 5);
  });
});

// --- currentSmoothedWeight ------------------------------------------------

describe('currentSmoothedWeight', () => {
  it('returns last value', () => {
    const ma: DatedWeight[] = [
      { date: '2026-01-01', weightLb: 200 },
      { date: '2026-01-02', weightLb: 199 },
    ];
    expect(currentSmoothedWeight(ma)).toBe(199);
  });

  it('returns null for empty', () => {
    expect(currentSmoothedWeight([])).toBeNull();
  });
});

// --- totalChangeSinceStart ------------------------------------------------

describe('totalChangeSinceStart', () => {
  it('positive lb when lost', () => {
    const ma: DatedWeight[] = [
      { date: '2026-01-01', weightLb: 200 },
      { date: '2026-02-01', weightLb: 190 },
    ];
    const out = totalChangeSinceStart({ maSeries: ma, startWeightLb: 200 });
    expect(out.lb).toBeCloseTo(10);
    expect(out.percent).toBeCloseTo(5);
  });

  it('returns zero for empty series', () => {
    expect(totalChangeSinceStart({ maSeries: [], startWeightLb: 200 })).toEqual({
      lb: 0,
      percent: 0,
    });
  });

  it('returns zero for invalid start weight', () => {
    const ma: DatedWeight[] = [{ date: '2026-01-01', weightLb: 200 }];
    expect(totalChangeSinceStart({ maSeries: ma, startWeightLb: 0 })).toEqual({
      lb: 0,
      percent: 0,
    });
  });
});
