// Unit helpers — pure functions, no I/O.
// Heights are stored in inches, weights in pounds.

export type BmiCategory = 'underweight' | 'healthy' | 'overweight' | 'obese';

/**
 * Body Mass Index using the imperial formula.
 *   BMI = (weight_lb / height_in^2) * 703
 * Returns NaN for non-positive height.
 */
export function bmi(weightLb: number, heightIn: number): number {
  if (!Number.isFinite(weightLb) || !Number.isFinite(heightIn) || heightIn <= 0) {
    return NaN;
  }
  return (weightLb / (heightIn * heightIn)) * 703;
}

/** WHO/NHS standard BMI categories. */
export function bmiCategory(value: number): BmiCategory {
  if (!Number.isFinite(value)) return 'healthy';
  if (value < 18.5) return 'underweight';
  if (value < 25) return 'healthy';
  if (value < 30) return 'overweight';
  return 'obese';
}

/**
 * Inverse of bmi(): weight (lb) corresponding to a given BMI at a given
 * height (in). Returns NaN for invalid inputs.
 */
export function weightLbForBmi(bmiValue: number, heightIn: number): number {
  if (
    !Number.isFinite(bmiValue) ||
    !Number.isFinite(heightIn) ||
    heightIn <= 0
  ) {
    return NaN;
  }
  return (bmiValue * heightIn * heightIn) / 703;
}

/**
 * Healthy-BMI weight range (BMI 18.5–25) in lb for a given height.
 * Returns null if height is invalid.
 */
export function healthyWeightRangeLb(
  heightIn: number | null | undefined,
): { minLb: number; maxLb: number } | null {
  if (heightIn == null || !Number.isFinite(heightIn) || heightIn <= 0) {
    return null;
  }
  return {
    minLb: weightLbForBmi(18.5, heightIn),
    maxLb: weightLbForBmi(25, heightIn),
  };
}

/** "185.4 lb", or "—" for null/NaN. */
export function formatWeight(lb: number | null | undefined, digits = 1): string {
  if (lb == null || !Number.isFinite(lb)) return '—';
  return `${lb.toFixed(digits)} lb`;
}

/** 70 inches → `5'10"`, null → "—". */
export function formatHeight(inches: number | null | undefined): string {
  if (inches == null || !Number.isFinite(inches) || inches <= 0) return '—';
  const total = Math.round(inches);
  const feet = Math.floor(total / 12);
  const remainder = total - feet * 12;
  return `${feet}'${remainder}"`;
}

/**
 * Parse height inputs into inches.
 * Accepts: `5'10"`, `5'10`, `5 10`, `5-10`, `70`, `70in`, `70"`.
 * Returns null for anything else (including empty string).
 */
export function parseHeight(input: string): number | null {
  if (typeof input !== 'string') return null;
  const trimmed = input.trim();
  if (trimmed === '') return null;

  // Pure number — treat as inches (allow trailing in/").
  const inchesOnly = trimmed.match(/^(\d+(?:\.\d+)?)(?:\s*(?:in|"))?$/i);
  if (inchesOnly) {
    const n = Number(inchesOnly[1]);
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  // feet + inches: 5'10", 5'10, 5 10, 5-10, 5ft10in
  const feetInches = trimmed.match(
    /^(\d+(?:\.\d+)?)\s*(?:'|ft|\s|-)\s*(\d+(?:\.\d+)?)?\s*(?:"|in)?$/i,
  );
  if (feetInches) {
    const feet = Number(feetInches[1]);
    const inches = feetInches[2] ? Number(feetInches[2]) : 0;
    if (!Number.isFinite(feet) || !Number.isFinite(inches)) return null;
    if (feet <= 0 || inches < 0 || inches >= 12) return null;
    return feet * 12 + inches;
  }

  return null;
}
