/**
 * Idempotent fake-data seeder for local development and verification.
 *
 * Populates 30 days of weight entries (with realistic loss trend + small
 * daily noise) for both Adam and Anna, a small shared food library, and a
 * handful of meal_items per user per recent day.
 *
 * Usage:
 *   pnpm seed:fake          # uses TURSO_DATABASE_URL or falls back to file:./local.db
 *
 * Re-running the script is safe: the schema-level unique key on entries
 * makes them upsertable, foods are inserted only when missing (matched by
 * name + serving_label + brand), and meal_items for the seeded days are
 * cleared and re-inserted so totals stay deterministic.
 */

import { createClient, type Client } from '@libsql/client';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

function loadDotenvLocal() {
  const envPath = resolve(process.cwd(), '.env.local');
  if (!existsSync(envPath)) return;
  const raw = readFileSync(envPath, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

loadDotenvLocal();

// Deterministic PRNG so re-running gives identical output.
function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = t;
    r = Math.imul(r ^ (r >>> 15), r | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function todayIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addDays(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1));
  dt.setUTCDate(dt.getUTCDate() + days);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

interface FoodSeed {
  name: string;
  brand: string | null;
  serving_label: string;
  calories_per_serving: number;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
}

const FOODS: FoodSeed[] = [
  {
    name: 'Weetabix',
    brand: 'Weetabix',
    serving_label: '2 biscuits',
    calories_per_serving: 136,
    protein_g: 4.5,
    carbs_g: 27,
    fat_g: 1.0,
  },
  {
    name: 'Skimmed milk',
    brand: null,
    serving_label: '100 ml',
    calories_per_serving: 35,
    protein_g: 3.4,
    carbs_g: 5.0,
    fat_g: 0.1,
  },
  {
    name: 'Chicken breast',
    brand: null,
    serving_label: '100 g',
    calories_per_serving: 165,
    protein_g: 31,
    carbs_g: 0,
    fat_g: 3.6,
  },
  {
    name: 'Brown rice (cooked)',
    brand: null,
    serving_label: '100 g',
    calories_per_serving: 123,
    protein_g: 2.7,
    carbs_g: 26,
    fat_g: 0.9,
  },
  {
    name: 'Greek yogurt 0%',
    brand: 'Fage',
    serving_label: '170 g pot',
    calories_per_serving: 100,
    protein_g: 17,
    carbs_g: 6.0,
    fat_g: 0,
  },
  {
    name: 'Banana',
    brand: null,
    serving_label: '1 medium',
    calories_per_serving: 105,
    protein_g: 1.3,
    carbs_g: 27,
    fat_g: 0.3,
  },
  {
    name: 'Olive oil',
    brand: null,
    serving_label: '1 tbsp',
    calories_per_serving: 119,
    protein_g: 0,
    carbs_g: 0,
    fat_g: 13.5,
  },
  {
    name: 'Mixed salad',
    brand: null,
    serving_label: '1 bowl',
    calories_per_serving: 60,
    protein_g: 2,
    carbs_g: 8,
    fat_g: 1,
  },
];

interface UserSeed {
  name: 'adam' | 'anna';
  startWeight: number; // 30 days ago
  endWeight: number; // today
  noiseSeed: number;
}

const USERS: UserSeed[] = [
  { name: 'adam', startWeight: 200, endWeight: 192, noiseSeed: 0xa1a1a1a1 },
  { name: 'anna', startWeight: 160, endWeight: 156, noiseSeed: 0x5050505 },
];

const DAYS = 30;

async function ensureFood(client: Client, food: FoodSeed): Promise<number> {
  const existing = await client.execute({
    sql: `SELECT id FROM foods
           WHERE name = ? AND serving_label = ?
             AND ((brand IS NULL AND ? IS NULL) OR brand = ?)
           LIMIT 1`,
    args: [food.name, food.serving_label, food.brand, food.brand],
  });
  if (existing.rows[0]) return Number(existing.rows[0].id);

  const ins = await client.execute({
    sql: `INSERT INTO foods
            (name, brand, serving_label, calories_per_serving,
             protein_g, carbs_g, fat_g)
          VALUES (?, ?, ?, ?, ?, ?, ?)
          RETURNING id`,
    args: [
      food.name,
      food.brand,
      food.serving_label,
      food.calories_per_serving,
      food.protein_g,
      food.carbs_g,
      food.fat_g,
    ],
  });
  return Number(ins.rows[0]!.id);
}

async function userIdByName(
  client: Client,
  name: 'adam' | 'anna',
): Promise<number> {
  const r = await client.execute({
    sql: 'SELECT id FROM users WHERE name = ? LIMIT 1',
    args: [name],
  });
  if (!r.rows[0]) {
    throw new Error(`User '${name}' not found. Run \`pnpm migrate\` first.`);
  }
  return Number(r.rows[0].id);
}

async function ensureProfile(
  client: Client,
  user: UserSeed,
  startDate: string,
) {
  // Only fill in profile fields if they're still null (idempotent on re-run).
  await client.execute({
    sql: `UPDATE users SET
            height_in            = COALESCE(height_in, ?),
            age                  = COALESCE(age, ?),
            sex                  = COALESCE(sex, ?),
            start_weight_lb      = COALESCE(start_weight_lb, ?),
            start_date           = COALESCE(start_date, ?),
            target_weight_min_lb = COALESCE(target_weight_min_lb, ?),
            target_weight_max_lb = COALESCE(target_weight_max_lb, ?),
            daily_calorie_target = COALESCE(daily_calorie_target, ?),
            daily_step_target    = COALESCE(daily_step_target, ?)
          WHERE name = ?`,
    args:
      user.name === 'adam'
        ? [72, 38, 'm', user.startWeight, startDate, 175, 180, 2200, 9000, 'adam']
        : [66, 36, 'f', user.startWeight, startDate, 140, 150, 1700, 8000, 'anna'],
  });
}

async function seedWeightsAndMeals(
  client: Client,
  user: UserSeed,
  foodIds: number[],
) {
  const userId = await userIdByName(client, user.name);
  const today = todayIso();
  const startDate = addDays(today, -(DAYS - 1));

  await ensureProfile(client, user, startDate);

  const rng = mulberry32(user.noiseSeed);
  const slope = (user.endWeight - user.startWeight) / (DAYS - 1);

  // ----- weights -----
  for (let i = 0; i < DAYS; i++) {
    const date = addDays(startDate, i);
    const trend = user.startWeight + slope * i;
    const noise = (rng() - 0.5) * 0.8; // ±0.4 lb
    const weight = Number((trend + noise).toFixed(1));
    const steps = Math.round(6000 + rng() * 6000);

    await client.execute({
      sql: `INSERT INTO entries (user_id, date, weight_lb, steps)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(user_id, date) DO UPDATE SET
              weight_lb = excluded.weight_lb,
              steps     = excluded.steps`,
      args: [userId, date, weight, steps],
    });
  }

  // ----- meal items -----
  // Wipe seeded meal items for the seed window, then re-insert deterministically.
  await client.execute({
    sql: `DELETE FROM meal_items WHERE user_id = ? AND date >= ?`,
    args: [userId, startDate],
  });

  // Pick 2-4 foods per day with simple servings.
  for (let i = 0; i < DAYS; i++) {
    const date = addDays(startDate, i);
    const numItems = 2 + Math.floor(rng() * 3); // 2..4
    const used = new Set<number>();
    for (let n = 0; n < numItems; n++) {
      let foodId: number;
      do {
        foodId = foodIds[Math.floor(rng() * foodIds.length)];
      } while (used.has(foodId) && used.size < foodIds.length);
      used.add(foodId);
      const servings = Number((1 + Math.floor(rng() * 3)).toFixed(0));
      await client.execute({
        sql: `INSERT INTO meal_items (user_id, date, food_id, servings)
              VALUES (?, ?, ?, ?)`,
        args: [userId, date, foodId, servings],
      });
    }
  }
}

async function main() {
  const url = process.env.TURSO_DATABASE_URL ?? 'file:./local.db';
  const authToken = process.env.TURSO_AUTH_TOKEN || undefined;
  const client = createClient({ url, authToken });

  console.log(`[seed:fake] connecting to ${url}`);

  // 1. Foods
  const foodIds: number[] = [];
  for (const f of FOODS) {
    const id = await ensureFood(client, f);
    foodIds.push(id);
  }
  console.log(`[seed:fake] foods ready (${foodIds.length})`);

  // 2. Per-user weights, profiles, meal items
  for (const u of USERS) {
    await seedWeightsAndMeals(client, u, foodIds);
    console.log(`[seed:fake] seeded ${DAYS}d for ${u.name}`);
  }

  console.log('[seed:fake] done.');
}

main().catch((err) => {
  console.error('[seed:fake] FAILED:', err);
  process.exit(1);
});
