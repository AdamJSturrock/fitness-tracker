/**
 * Light-weight Vitest test for the chart's data-shaping pipeline.
 *
 * We don't render the chart (no jsdom needed). Instead we feed a synthetic
 * 14-day weight series through the same helpers the dashboard uses —
 * `movingAverage`, `healthyLossLine`, `projectWeight` — and assert the
 * projection picks a plausible future date for the target.
 */

import { describe, it, expect } from 'vitest';
import {
  healthyLossLine,
  movingAverage,
  projectWeight,
  type DatedWeight,
} from '@/lib/stats';

const DAY_MS = 86_400_000;

function ymd(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function build14DayTrendingSeries(): {
  series: DatedWeight[];
  startDate: string;
  today: string;
  startWeightLb: number;
  targetMaxLb: number;
} {
  // 14 days ending at a fixed "today" so the test is deterministic.
  const today = '2026-04-29';
  const startDate = ymd(
    new Date(new Date('2026-04-29T00:00:00Z').getTime() - 13 * DAY_MS),
  );
  const startWeightLb = 200;
  // Lose ~0.5 lb/day; small ±0.3 noise so the smoothed line cleanly trends.
  const series: DatedWeight[] = [];
  for (let i = 0; i < 14; i++) {
    const date = ymd(
      new Date(new Date(startDate + 'T00:00:00Z').getTime() + i * DAY_MS),
    );
    const noise = ((i * 13) % 7) / 10 - 0.3; // deterministic small noise
    series.push({ date, weightLb: startWeightLb - 0.5 * i + noise });
  }
  return { series, startDate, today, startWeightLb, targetMaxLb: 180 };
}

describe('dashboard chart-data pipeline', () => {
  const { series, startDate, today, startWeightLb, targetMaxLb } =
    build14DayTrendingSeries();

  it('movingAverage preserves length and produces no NaN', () => {
    const ma = movingAverage(series);
    expect(ma).toHaveLength(series.length);
    for (const p of ma) {
      expect(Number.isFinite(p.weightLb)).toBe(true);
    }
    // Last MA value should be lower than first (we trended down).
    expect(ma[ma.length - 1].weightLb).toBeLessThan(ma[0].weightLb);
  });

  it('healthyLossLine starts at the anchor weight and trends down', () => {
    const line = healthyLossLine({
      startDate,
      startWeightLb,
      throughDate: today,
    });
    expect(line[0]).toEqual({ date: startDate, weightLb: startWeightLb });
    expect(line[line.length - 1].weightLb).toBeLessThanOrEqual(startWeightLb);
  });

  it('projectWeight returns a valid future targetReached date', () => {
    const ma = movingAverage(series);
    const result = projectWeight({
      maSeries: ma,
      today,
      targetWeightMaxLb: targetMaxLb,
    });

    // 14-day window with ≥7 points → projection must exist.
    expect(result).not.toBeNull();
    if (!result) throw new Error('unreachable');

    expect(result.targetReached).not.toBeNull();
    expect(typeof result.targetReached).toBe('string');
    expect(result.targetReached).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    // The projection must be a valid YYYY-MM-DD string strictly after `today`.
    const todayMs = new Date(today + 'T00:00:00Z').getTime();
    const reachedMs = new Date(result.targetReached + 'T00:00:00Z').getTime();
    expect(Number.isFinite(reachedMs)).toBe(true);
    expect(reachedMs).toBeGreaterThan(todayMs);

    // We were losing weight, so slope is negative.
    expect(result.slopeLbPerWeek).toBeLessThan(0);
    // Strong linear signal → r² should be high on this clean fixture.
    expect(result.r2).toBeGreaterThan(0.9);
  });
});
