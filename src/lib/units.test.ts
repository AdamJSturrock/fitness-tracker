import { describe, expect, it } from 'vitest';
import {
  bmi,
  bmiCategory,
  formatHeight,
  formatWeight,
  parseHeight,
} from './units';

describe('bmi', () => {
  it('matches the imperial formula', () => {
    // 185 lb at 70 in: (185 / 4900) * 703 ≈ 26.54
    expect(bmi(185, 70)).toBeCloseTo(26.5418, 3);
    // Sanity: a 100 lb / 50 in subject → (100/2500)*703 = 28.12
    expect(bmi(100, 50)).toBeCloseTo(28.12, 4);
  });

  it('returns NaN for non-positive height', () => {
    expect(bmi(150, 0)).toBeNaN();
    expect(bmi(150, -1)).toBeNaN();
  });
});

describe('bmiCategory', () => {
  it('classifies the standard cutoffs', () => {
    expect(bmiCategory(17)).toBe('underweight');
    expect(bmiCategory(18.5)).toBe('healthy');
    expect(bmiCategory(24.9)).toBe('healthy');
    expect(bmiCategory(25)).toBe('overweight');
    expect(bmiCategory(29.9)).toBe('overweight');
    expect(bmiCategory(30)).toBe('obese');
    expect(bmiCategory(45)).toBe('obese');
  });
});

describe('formatWeight', () => {
  it('formats with default 1 decimal', () => {
    expect(formatWeight(185.42)).toBe('185.4 lb');
  });

  it('respects digits parameter', () => {
    expect(formatWeight(185.42, 0)).toBe('185 lb');
    expect(formatWeight(185.42, 2)).toBe('185.42 lb');
  });

  it('returns em-dash for null/undefined', () => {
    expect(formatWeight(null)).toBe('—');
    expect(formatWeight(undefined)).toBe('—');
  });
});

describe('formatHeight', () => {
  it("formats inches as feet'inches\"", () => {
    expect(formatHeight(70)).toBe(`5'10"`);
    expect(formatHeight(72)).toBe(`6'0"`);
    expect(formatHeight(60)).toBe(`5'0"`);
  });

  it('returns em-dash for null/invalid', () => {
    expect(formatHeight(null)).toBe('—');
    expect(formatHeight(0)).toBe('—');
  });
});

describe('parseHeight', () => {
  it("parses 5'10\" forms", () => {
    expect(parseHeight(`5'10"`)).toBe(70);
    expect(parseHeight(`5'10`)).toBe(70);
    expect(parseHeight(`5 10`)).toBe(70);
    expect(parseHeight(`5-10`)).toBe(70);
    expect(parseHeight(`5ft10in`)).toBe(70);
  });

  it('parses raw inches', () => {
    expect(parseHeight('70')).toBe(70);
    expect(parseHeight('70in')).toBe(70);
    expect(parseHeight(`70"`)).toBe(70);
  });

  it('round-trips with formatHeight', () => {
    const inches = parseHeight(formatHeight(67));
    expect(inches).toBe(67);
  });

  it('rejects garbage', () => {
    expect(parseHeight('')).toBeNull();
    expect(parseHeight('tall')).toBeNull();
    expect(parseHeight('5 99')).toBeNull(); // inches >= 12
    expect(parseHeight('-5')).toBeNull();
  });
});
