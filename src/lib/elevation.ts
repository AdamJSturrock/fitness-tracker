/**
 * Open-Meteo Elevation API client. Free, no key, accepts up to 100 lat/lng
 * pairs per request. Used at route-save time only — daily logs don't re-fetch.
 *
 * Docs: https://open-meteo.com/en/docs/elevation-api
 */

const OPEN_METEO_ELEVATION_URL = 'https://api.open-meteo.com/v1/elevation';
const MAX_POINTS_PER_REQUEST = 100;

interface ElevationResponse {
  elevation?: number[];
}

/**
 * Fetch elevations (in metres) for an array of [lat, lng] points. Splits into
 * batches of 100 to respect the API limit. Returns null on any failure so the
 * caller can save the route without elevation rather than blocking the user.
 */
export async function fetchElevations(
  points: Array<[number, number]>,
): Promise<number[] | null> {
  if (points.length === 0) return [];
  const out: number[] = [];
  for (let i = 0; i < points.length; i += MAX_POINTS_PER_REQUEST) {
    const batch = points.slice(i, i + MAX_POINTS_PER_REQUEST);
    const lats = batch.map((p) => p[0]).join(',');
    const lngs = batch.map((p) => p[1]).join(',');
    const url = `${OPEN_METEO_ELEVATION_URL}?latitude=${lats}&longitude=${lngs}`;
    try {
      const res = await fetch(url, {
        headers: { accept: 'application/json' },
      });
      if (!res.ok) return null;
      const json = (await res.json()) as ElevationResponse;
      if (!Array.isArray(json.elevation)) return null;
      out.push(...json.elevation);
    } catch {
      return null;
    }
  }
  return out;
}
