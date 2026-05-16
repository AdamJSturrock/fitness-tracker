import type { WalkPace } from './types';

/**
 * MET values for dog walking, drawn from the Compendium of Physical Activities.
 * "Walking the dog" is rated 3.0 — already lower than steady walking to reflect
 * stop-start, sniff breaks, neighbour chats. The three options here let users
 * nudge it for a particularly brisk or stoppy day without overthinking it.
 */
export const PACE_METS: Record<WalkPace, number> = {
  brisk: 3.5,
  normal: 3.0,
  stoppy: 2.3,
};

export const DEFAULT_PACE: WalkPace = 'normal';

export const PACE_LABELS: Record<WalkPace, string> = {
  brisk: 'Brisk',
  normal: 'Normal',
  stoppy: 'Lots of stops',
};

const LB_TO_KG = 0.45359237;

/**
 * kcal = MET × kg × hours. Returns 0 when weight is missing rather than throwing
 * so the UI can still show the walk row even before a weight is logged.
 */
export function kcalForWalk(input: {
  pace: WalkPace;
  minutes: number;
  weightLb: number | null;
}): number {
  if (!input.weightLb || input.minutes <= 0) return 0;
  const met = PACE_METS[input.pace];
  const kg = input.weightLb * LB_TO_KG;
  const hours = input.minutes / 60;
  return Math.round(met * kg * hours);
}

// ---- Route difficulty ----

export type RouteDifficulty = 'easy' | 'medium' | 'hard';

export const DIFFICULTY_LABELS: Record<RouteDifficulty, string> = {
  easy: 'Easy',
  medium: 'Medium',
  hard: 'Hard',
};

/** Tailwind chip classes for each bucket. */
export const DIFFICULTY_CHIP_CLASSES: Record<RouteDifficulty, string> = {
  easy: 'bg-emerald-100 text-emerald-700',
  medium: 'bg-amber-100 text-amber-700',
  hard: 'bg-rose-100 text-rose-700',
};

/**
 * Energy-miles shorthand: each 500 ft of climb counts as one extra mile of
 * effort. Used to bucket a saved route into easy / medium / hard for at-a-
 * glance comparison on the routes list and the Today screen.
 */
export function routeEnergyMiles(
  distanceMi: number,
  elevationGainFt: number | null,
): number {
  return distanceMi + (elevationGainFt ?? 0) / 500;
}

export function routeDifficulty(
  distanceMi: number,
  elevationGainFt: number | null,
): RouteDifficulty {
  const em = routeEnergyMiles(distanceMi, elevationGainFt);
  if (em < 2) return 'easy';
  if (em < 3) return 'medium';
  return 'hard';
}

// ---- Polyline maths ----

const EARTH_RADIUS_M = 6_371_000;
const MI_PER_M = 0.000621371;
const FT_PER_M = 3.28084;

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** Great-circle distance between two [lat, lng] pairs in metres. */
export function haversineMeters(
  a: [number, number],
  b: [number, number],
): number {
  const [lat1, lng1] = a;
  const [lat2, lng2] = b;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const h =
    sinDLat * sinDLat +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * sinDLng * sinDLng;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Total length of a [lat, lng] polyline in miles. */
export function polylineDistanceMiles(latlngs: Array<[number, number]>): number {
  if (latlngs.length < 2) return 0;
  let meters = 0;
  for (let i = 1; i < latlngs.length; i++) {
    meters += haversineMeters(latlngs[i - 1], latlngs[i]);
  }
  return meters * MI_PER_M;
}

/**
 * Densify a polyline by inserting points every `stepM` metres along each
 * segment. Used to give the elevation API a fair sample of the terrain rather
 * than just the corners. Returns [lat, lng] pairs.
 */
export function densifyPolyline(
  latlngs: Array<[number, number]>,
  stepM = 50,
): Array<[number, number]> {
  if (latlngs.length < 2) return [...latlngs];
  const out: Array<[number, number]> = [latlngs[0]];
  for (let i = 1; i < latlngs.length; i++) {
    const a = latlngs[i - 1];
    const b = latlngs[i];
    const segM = haversineMeters(a, b);
    const n = Math.max(1, Math.floor(segM / stepM));
    for (let k = 1; k <= n; k++) {
      const t = k / n;
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  }
  return out;
}

/**
 * Sum of positive elevation deltas along a sequence of metre elevations,
 * converted to feet. Conservative — small fluctuations from the elevation API
 * inflate the total, so we ignore deltas below `noiseM`.
 */
export function elevationGainFt(metreSamples: number[], noiseM = 1): number {
  if (metreSamples.length < 2) return 0;
  let gainM = 0;
  for (let i = 1; i < metreSamples.length; i++) {
    const d = metreSamples[i] - metreSamples[i - 1];
    if (d > noiseM) gainM += d;
  }
  return gainM * FT_PER_M;
}

// ---- GeoJSON helpers (LineString uses [lng, lat] order) ----

/** Build a GeoJSON LineString string from [lat, lng] pairs. */
export function latlngsToGeoJson(latlngs: Array<[number, number]>): string {
  return JSON.stringify({
    type: 'LineString',
    coordinates: latlngs.map(([lat, lng]) => [lng, lat]),
  });
}

/** Parse a stored GeoJSON LineString back into [lat, lng] pairs. */
export function geoJsonToLatlngs(geojson: string): Array<[number, number]> {
  try {
    const parsed = JSON.parse(geojson) as {
      type?: string;
      coordinates?: Array<[number, number]>;
    };
    if (parsed.type !== 'LineString' || !Array.isArray(parsed.coordinates)) {
      return [];
    }
    return parsed.coordinates.map(([lng, lat]) => [lat, lng]);
  } catch {
    return [];
  }
}
