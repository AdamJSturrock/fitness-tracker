import 'server-only';
import type { FoodDataSource, NovaGroup, NutriScore } from './types';

/**
 * Barcode → nutrition lookup. Tries Open Food Facts first (free, no auth,
 * strong UK supermarket coverage), then FatSecret as a fallback when OFF
 * returns nothing. Mirrors the silent-fail-returns-null pattern from
 * `src/lib/elevation.ts` — any network error, non-2xx response, or parse
 * failure becomes `null` so the caller can degrade gracefully.
 */

export interface NutritionLookupResult {
  name: string;
  brand?: string;
  servingLabel: string;
  caloriesPerServing: number;
  proteinG?: number;
  carbsG?: number;
  fatG?: number;
  fiberG?: number;
  sugarG?: number;
  satFatG?: number;
  /** Salt in grams per serving. If only sodium was given, this is sodium × 2.5. */
  saltG?: number;
  nutriscore?: NutriScore;
  novaGroup?: NovaGroup;
  isVegan?: boolean;
  isVegetarian?: boolean;
  imageUrl?: string;
  ingredients?: string;
  barcode: string;
  source: Exclude<FoodDataSource, 'manual'>;
  /** Verbatim API response, stringified. Stored on the foods row for later analysis. */
  rawJson: string;
}

const OFF_USER_AGENT = 'fitness-tracker/0.1 (adam.sturrock@30m.com)';

/**
 * Main entry: try OFF, then FatSecret. Returns the first hit or null.
 */
export async function lookupBarcode(
  barcode: string,
): Promise<NutritionLookupResult | null> {
  const off = await lookupOpenFoodFacts(barcode);
  if (off) return off;
  const fs = await lookupFatSecret(barcode);
  if (fs) return fs;
  return null;
}

// ---------- Open Food Facts ----------

interface OFFNutriments {
  'energy-kcal_serving'?: number;
  'energy-kcal_100g'?: number;
  proteins_serving?: number;
  proteins_100g?: number;
  carbohydrates_serving?: number;
  carbohydrates_100g?: number;
  fat_serving?: number;
  fat_100g?: number;
  fiber_serving?: number;
  fiber_100g?: number;
  sugars_serving?: number;
  sugars_100g?: number;
  'saturated-fat_serving'?: number;
  'saturated-fat_100g'?: number;
  salt_serving?: number;
  salt_100g?: number;
  sodium_serving?: number;
  sodium_100g?: number;
}

interface OFFProduct {
  product_name?: string;
  brands?: string;
  nutriments?: OFFNutriments;
  serving_size?: string;
  quantity?: string;
  nutriscore_grade?: string;
  nova_group?: number;
  ingredients_analysis_tags?: string[];
  ingredients_text?: string;
  image_front_url?: string;
}

interface OFFResponse {
  status?: 0 | 1;
  product?: OFFProduct;
}

/**
 * Parse a free-form serving size like "30 g", "250 ml", "1 bottle (330 ml)"
 * and return the grams component if present. Used to scale _100g values when
 * _serving fields are missing.
 */
function parseServingGrams(servingSize: string | undefined): number | null {
  if (!servingSize) return null;
  // Look for a number followed by "g" (case-insensitive), as a standalone unit.
  // Matches "30 g", "30g", "30.5 g", but skips "300 mg" via the lookahead.
  const match = servingSize.match(/(\d+(?:[.,]\d+)?)\s*g(?![a-z])/i);
  if (!match) return null;
  const n = Number.parseFloat(match[1].replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function pickVeganTag(
  tags: string[] | undefined,
  keyword: 'vegan' | 'vegetarian',
): boolean | undefined {
  if (!tags) return undefined;
  if (tags.includes(`en:${keyword}`)) return true;
  if (tags.includes(`en:non-${keyword}`)) return false;
  // 'en:vegan-status-unknown' / 'en:vegetarian-status-unknown' → undefined
  return undefined;
}

function pickNutriscore(raw: string | undefined): NutriScore | undefined {
  if (!raw) return undefined;
  const g = raw.toLowerCase();
  return g === 'a' || g === 'b' || g === 'c' || g === 'd' || g === 'e'
    ? g
    : undefined;
}

function pickNovaGroup(raw: number | undefined): NovaGroup | undefined {
  if (raw === 1 || raw === 2 || raw === 3 || raw === 4) return raw;
  return undefined;
}

/**
 * For each nutrient: prefer the _serving value if OFF supplied it. Otherwise
 * scale _100g by (servingGrams / 100). Otherwise return undefined.
 */
function pickPerServing(
  perServing: number | undefined,
  per100g: number | undefined,
  servingGrams: number | null,
): number | undefined {
  if (typeof perServing === 'number' && Number.isFinite(perServing)) {
    return perServing;
  }
  if (
    typeof per100g === 'number' &&
    Number.isFinite(per100g) &&
    servingGrams !== null
  ) {
    return per100g * (servingGrams / 100);
  }
  return undefined;
}

export async function lookupOpenFoodFacts(
  barcode: string,
): Promise<NutritionLookupResult | null> {
  const fields = [
    'product_name',
    'brands',
    'nutriments',
    'serving_size',
    'quantity',
    'nutriscore_grade',
    'nova_group',
    'ingredients_analysis_tags',
    'ingredients_text',
    'image_front_url',
  ].join(',');
  const url = `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(
    barcode,
  )}.json?fields=${fields}`;

  try {
    const res = await fetch(url, {
      headers: {
        accept: 'application/json',
        'user-agent': OFF_USER_AGENT,
      },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as OFFResponse;
    if (json.status !== 1 || !json.product) return null;

    const p = json.product;
    const n = p.nutriments ?? {};
    const servingGrams = parseServingGrams(p.serving_size);

    // kcal: try _serving, then scale _100g, then fall back to raw _100g with
    // a '100 g' label if neither serving info is available.
    let caloriesPerServing = pickPerServing(
      n['energy-kcal_serving'],
      n['energy-kcal_100g'],
      servingGrams,
    );
    let servingLabel = p.serving_size?.trim() || '';
    if (caloriesPerServing === undefined) {
      // No _serving and no parseable serving_size — fall back to _100g.
      if (typeof n['energy-kcal_100g'] === 'number') {
        caloriesPerServing = n['energy-kcal_100g'];
        servingLabel = '100 g';
      } else {
        // No kcal info at all — can't use this hit, signal no match.
        return null;
      }
    }
    if (!servingLabel) servingLabel = '100 g';

    // For each macro we need to use the same fallback rule as kcal: if the
    // servingLabel ended up being '100 g' (because serving info was missing),
    // we want the raw _100g numbers, not the scaled ones.
    const macroPick = (
      perServing: number | undefined,
      per100g: number | undefined,
    ): number | undefined => {
      if (servingLabel === '100 g') {
        return typeof per100g === 'number' && Number.isFinite(per100g)
          ? per100g
          : undefined;
      }
      return pickPerServing(perServing, per100g, servingGrams);
    };

    const proteinG = macroPick(n.proteins_serving, n.proteins_100g);
    const carbsG = macroPick(n.carbohydrates_serving, n.carbohydrates_100g);
    const fatG = macroPick(n.fat_serving, n.fat_100g);
    const fiberG = macroPick(n.fiber_serving, n.fiber_100g);
    const sugarG = macroPick(n.sugars_serving, n.sugars_100g);
    const satFatG = macroPick(
      n['saturated-fat_serving'],
      n['saturated-fat_100g'],
    );
    let saltG = macroPick(n.salt_serving, n.salt_100g);
    if (saltG === undefined) {
      // OFF: salt = sodium × 2.5 when only sodium is reported.
      const sodiumG = macroPick(n.sodium_serving, n.sodium_100g);
      if (sodiumG !== undefined) saltG = sodiumG * 2.5;
    }

    const result: NutritionLookupResult = {
      name: (p.product_name ?? '').trim() || `Barcode ${barcode}`,
      servingLabel,
      caloriesPerServing: Math.round(caloriesPerServing),
      barcode,
      source: 'openfoodfacts',
      rawJson: JSON.stringify(json),
    };
    const brand = (p.brands ?? '').split(',')[0]?.trim();
    if (brand) result.brand = brand;
    if (proteinG !== undefined) result.proteinG = proteinG;
    if (carbsG !== undefined) result.carbsG = carbsG;
    if (fatG !== undefined) result.fatG = fatG;
    if (fiberG !== undefined) result.fiberG = fiberG;
    if (sugarG !== undefined) result.sugarG = sugarG;
    if (satFatG !== undefined) result.satFatG = satFatG;
    if (saltG !== undefined) result.saltG = saltG;

    const ns = pickNutriscore(p.nutriscore_grade);
    if (ns) result.nutriscore = ns;
    const nv = pickNovaGroup(p.nova_group);
    if (nv) result.novaGroup = nv;

    const isVegan = pickVeganTag(p.ingredients_analysis_tags, 'vegan');
    if (isVegan !== undefined) result.isVegan = isVegan;
    const isVeg = pickVeganTag(p.ingredients_analysis_tags, 'vegetarian');
    if (isVeg !== undefined) result.isVegetarian = isVeg;

    if (p.image_front_url) result.imageUrl = p.image_front_url;
    if (p.ingredients_text) result.ingredients = p.ingredients_text;

    return result;
  } catch {
    return null;
  }
}

// ---------- FatSecret ----------

interface FatSecretToken {
  access_token: string;
  /** Absolute epoch millis when the token expires. */
  expiresAtMs: number;
}

let cachedFatSecretToken: FatSecretToken | null = null;

async function getFatSecretToken(
  forceRefresh = false,
): Promise<string | null> {
  const id = process.env.FATSECRET_CLIENT_ID;
  const secret = process.env.FATSECRET_CLIENT_SECRET;
  if (!id || !secret) return null;

  const now = Date.now();
  if (
    !forceRefresh &&
    cachedFatSecretToken &&
    cachedFatSecretToken.expiresAtMs - 60_000 > now
  ) {
    return cachedFatSecretToken.access_token;
  }

  try {
    const basic = Buffer.from(`${id}:${secret}`).toString('base64');
    const res = await fetch('https://oauth.fatsecret.com/connect/token', {
      method: 'POST',
      headers: {
        authorization: `Basic ${basic}`,
        'content-type': 'application/x-www-form-urlencoded',
        accept: 'application/json',
      },
      body: 'grant_type=client_credentials&scope=basic',
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      access_token?: string;
      expires_in?: number;
    };
    if (!json.access_token) return null;
    const ttlSec =
      typeof json.expires_in === 'number' && json.expires_in > 0
        ? json.expires_in
        : 60 * 60 * 24;
    cachedFatSecretToken = {
      access_token: json.access_token,
      expiresAtMs: now + ttlSec * 1000,
    };
    return cachedFatSecretToken.access_token;
  } catch {
    return null;
  }
}

interface FatSecretBarcodeLookupResponse {
  food_id?: { value?: string };
}

interface FatSecretServing {
  serving_id?: string;
  measurement_description?: string;
  metric_serving_amount?: string | number;
  metric_serving_unit?: string;
  calories?: string | number;
  protein?: string | number;
  carbohydrate?: string | number;
  fat?: string | number;
  fiber?: string | number;
  sugar?: string | number;
  saturated_fat?: string | number;
  sodium?: string | number;
  salt?: string | number;
}

interface FatSecretFood {
  food_name?: string;
  brand_name?: string;
  servings?: {
    serving?: FatSecretServing | FatSecretServing[];
  };
}

interface FatSecretFoodGetResponse {
  food?: FatSecretFood;
}

function toFiniteNumber(v: unknown): number | undefined {
  if (v === undefined || v === null) return undefined;
  const n = typeof v === 'number' ? v : Number.parseFloat(String(v));
  return Number.isFinite(n) ? n : undefined;
}

async function fatSecretFetch<T>(
  url: string,
  token: string,
): Promise<{ json: T; status: number } | null> {
  try {
    const res = await fetch(url, {
      headers: {
        authorization: `Bearer ${token}`,
        accept: 'application/json',
      },
    });
    if (res.status === 401) return { json: null as unknown as T, status: 401 };
    if (!res.ok) return null;
    const json = (await res.json()) as T;
    return { json, status: res.status };
  } catch {
    return null;
  }
}

export async function lookupFatSecret(
  barcode: string,
): Promise<NutritionLookupResult | null> {
  let token = await getFatSecretToken();
  if (!token) return null;

  const findUrl = `https://platform.fatsecret.com/rest/server.api?method=food.find_id_for_barcode&barcode=${encodeURIComponent(
    barcode,
  )}&format=json`;

  let findResp = await fatSecretFetch<FatSecretBarcodeLookupResponse>(
    findUrl,
    token,
  );
  if (findResp && findResp.status === 401) {
    token = await getFatSecretToken(true);
    if (!token) return null;
    findResp = await fatSecretFetch<FatSecretBarcodeLookupResponse>(
      findUrl,
      token,
    );
  }
  if (!findResp) return null;
  const foodId = findResp.json?.food_id?.value;
  if (!foodId || foodId === '0') return null;

  const getUrl = `https://platform.fatsecret.com/rest/server.api?method=food.get.v2&food_id=${encodeURIComponent(
    foodId,
  )}&format=json`;

  let getResp = await fatSecretFetch<FatSecretFoodGetResponse>(getUrl, token);
  if (getResp && getResp.status === 401) {
    token = await getFatSecretToken(true);
    if (!token) return null;
    getResp = await fatSecretFetch<FatSecretFoodGetResponse>(getUrl, token);
  }
  if (!getResp || !getResp.json?.food) return null;

  const food = getResp.json.food;
  const rawServings = food.servings?.serving;
  if (!rawServings) return null;
  const servings = Array.isArray(rawServings) ? rawServings : [rawServings];
  const serving = servings[0];
  if (!serving) return null;

  const calories = toFiniteNumber(serving.calories);
  if (calories === undefined) return null;

  // Build serving label: prefer metric (e.g. "30 g"), else measurement_description.
  let servingLabel = '';
  const amount = toFiniteNumber(serving.metric_serving_amount);
  const unit = serving.metric_serving_unit?.trim();
  if (amount !== undefined && unit) {
    // Trim trailing zeros — "30 g" not "30.000 g".
    const amountStr = Number.isInteger(amount)
      ? String(amount)
      : String(Number(amount.toFixed(2)));
    servingLabel = `${amountStr} ${unit}`;
  } else if (serving.measurement_description) {
    servingLabel = serving.measurement_description.trim();
  }
  if (!servingLabel) servingLabel = '1 serving';

  const result: NutritionLookupResult = {
    name: (food.food_name ?? '').trim() || `Barcode ${barcode}`,
    servingLabel,
    caloriesPerServing: Math.round(calories),
    barcode,
    source: 'fatsecret',
    rawJson: JSON.stringify(getResp.json),
  };
  const brand = food.brand_name?.trim();
  if (brand) result.brand = brand;

  const protein = toFiniteNumber(serving.protein);
  if (protein !== undefined) result.proteinG = protein;
  const carbs = toFiniteNumber(serving.carbohydrate);
  if (carbs !== undefined) result.carbsG = carbs;
  const fat = toFiniteNumber(serving.fat);
  if (fat !== undefined) result.fatG = fat;
  const fiber = toFiniteNumber(serving.fiber);
  if (fiber !== undefined) result.fiberG = fiber;
  const sugar = toFiniteNumber(serving.sugar);
  if (sugar !== undefined) result.sugarG = sugar;
  const satFat = toFiniteNumber(serving.saturated_fat);
  if (satFat !== undefined) result.satFatG = satFat;

  // Salt: prefer salt if FatSecret happens to return it, else convert sodium
  // (FatSecret reports sodium in mg per serving).
  const saltDirect = toFiniteNumber(serving.salt);
  if (saltDirect !== undefined) {
    result.saltG = saltDirect;
  } else {
    const sodiumMg = toFiniteNumber(serving.sodium);
    if (sodiumMg !== undefined) result.saltG = (sodiumMg / 1000) * 2.5;
  }

  return result;
}
