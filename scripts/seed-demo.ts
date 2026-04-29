/**
 * Seed the 'demo' user with ~60 days of realistic data so the app can be
 * demoed without polluting Adam or Anna's real data.
 *
 * Idempotent: deletes everything owned by 'demo' first, then re-creates.
 * Uses a seeded RNG so every run produces the same numbers.
 *
 * Usage: pnpm seed:demo
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient } from '@libsql/client';

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
    if (!(key in process.env)) process.env[key] = value;
  }
}
loadDotenvLocal();

const HORIZON_DAYS = 60;

function makeRng(seed: number) {
  let s = seed >>> 0;
  return function next(): number {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

function isoDaysAgo(today: Date, ago: number): string {
  const d = new Date(today);
  d.setUTCDate(d.getUTCDate() - ago);
  return d.toISOString().slice(0, 10);
}

function isoWeekday(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  const day = new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1)).getUTCDay();
  return day === 0 ? 7 : day; // Mon=1..Sun=7
}

interface SeedFood {
  name: string;
  brand: string | null;
  serving_label: string;
  calories_per_serving: number;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  // Mealtime weight: how often this gets picked at 'b' breakfast / 'l' lunch / 'd' dinner / 's' snack
  slot: 'b' | 'l' | 'd' | 's';
}

const DEMO_FOODS: SeedFood[] = [
  { name: 'Oats (porridge)', brand: null, serving_label: '40g dry', calories_per_serving: 150, protein_g: 5, carbs_g: 27, fat_g: 3, slot: 'b' },
  { name: 'Banana', brand: null, serving_label: '1 medium', calories_per_serving: 105, protein_g: 1, carbs_g: 27, fat_g: 0, slot: 's' },
  { name: 'Greek yogurt', brand: 'Fage 0%', serving_label: '170g pot', calories_per_serving: 100, protein_g: 17, carbs_g: 6, fat_g: 0, slot: 'b' },
  { name: 'Eggs (scrambled)', brand: null, serving_label: '2 eggs', calories_per_serving: 155, protein_g: 13, carbs_g: 1, fat_g: 11, slot: 'b' },
  { name: 'Chicken breast', brand: null, serving_label: '150g cooked', calories_per_serving: 248, protein_g: 47, carbs_g: 0, fat_g: 5, slot: 'l' },
  { name: 'Brown rice', brand: null, serving_label: '180g cooked', calories_per_serving: 220, protein_g: 5, carbs_g: 46, fat_g: 2, slot: 'l' },
  { name: 'Mixed salad + olive oil', brand: null, serving_label: '1 bowl', calories_per_serving: 180, protein_g: 3, carbs_g: 8, fat_g: 15, slot: 'l' },
  { name: 'Salmon fillet', brand: null, serving_label: '140g cooked', calories_per_serving: 280, protein_g: 32, carbs_g: 0, fat_g: 16, slot: 'd' },
  { name: 'Sweet potato', brand: null, serving_label: '200g baked', calories_per_serving: 180, protein_g: 4, carbs_g: 41, fat_g: 0, slot: 'd' },
  { name: 'Steamed broccoli', brand: null, serving_label: '150g', calories_per_serving: 50, protein_g: 4, carbs_g: 10, fat_g: 0, slot: 'd' },
  { name: 'Apple', brand: null, serving_label: '1 medium', calories_per_serving: 95, protein_g: 0, carbs_g: 25, fat_g: 0, slot: 's' },
  { name: 'Almonds', brand: null, serving_label: '30g', calories_per_serving: 175, protein_g: 6, carbs_g: 6, fat_g: 15, slot: 's' },
  { name: 'Whey protein shake', brand: null, serving_label: '1 scoop + water', calories_per_serving: 130, protein_g: 25, carbs_g: 3, fat_g: 2, slot: 's' },
];

interface SeedExercise {
  name: string;
  category: 'strength' | 'bodyweight';
  target_sets: number;
  target_reps: number;
  target_weight_lb: number | null;
}

const DEMO_EXERCISES: SeedExercise[] = [
  { name: 'Bench press', category: 'strength', target_sets: 3, target_reps: 8, target_weight_lb: 155 },
  { name: 'Back squat', category: 'strength', target_sets: 3, target_reps: 8, target_weight_lb: 195 },
  { name: 'Deadlift', category: 'strength', target_sets: 3, target_reps: 5, target_weight_lb: 245 },
  { name: 'Pull-up', category: 'bodyweight', target_sets: 3, target_reps: 6, target_weight_lb: null },
  { name: 'Plank', category: 'bodyweight', target_sets: 3, target_reps: 1, target_weight_lb: null },
];

const ROUTINE_NAME = 'Demo full body';
const ROUTINE_SCHEDULE = [1, 3, 5, 7]; // Mon, Wed, Fri, Sun

async function main() {
  const url = process.env.TURSO_DATABASE_URL ?? 'file:./local.db';
  const authToken = process.env.TURSO_AUTH_TOKEN || undefined;
  console.log(`[seed:demo] connecting to ${url}`);
  const db = createClient({ url, authToken });

  // ---- 1. user row exists ---------------------------------------------------
  const userR = await db.execute({
    sql: `SELECT id FROM users WHERE name = 'demo' LIMIT 1`,
  });
  if (!userR.rows[0]) {
    throw new Error(
      `'demo' user not found — run \`pnpm migrate\` first to seed it.`,
    );
  }
  const userId = Number(userR.rows[0].id);

  // ---- 2. profile fields ----------------------------------------------------
  // Today is the seed anchor.
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const startDate = isoDaysAgo(today, HORIZON_DAYS - 1);
  const startWeightLb = 215;

  console.log('[seed:demo] writing demo profile');
  await db.execute({
    sql: `UPDATE users
            SET display_name = 'Demo',
                height_in = 70,
                age = 34,
                sex = 'm',
                start_weight_lb = ?,
                start_date = ?,
                target_weight_min_lb = 175,
                target_weight_max_lb = 185,
                daily_calorie_target = 2000,
                daily_step_target = 10000
          WHERE name = 'demo'`,
    args: [startWeightLb, startDate],
  });

  // ---- 3. blow away demo's existing data -----------------------------------
  console.log('[seed:demo] clearing existing demo data');
  await db.execute({
    sql: `DELETE FROM meal_items WHERE user_id = ?`,
    args: [userId],
  });
  await db.execute({
    sql: `DELETE FROM exercise_logs WHERE user_id = ?`,
    args: [userId],
  });
  await db.execute({
    sql: `DELETE FROM entries WHERE user_id = ?`,
    args: [userId],
  });
  // Cascade deletes routine_exercises via FK ON DELETE CASCADE.
  await db.execute({
    sql: `DELETE FROM routines WHERE user_id = ?`,
    args: [userId],
  });

  // ---- 4. ensure shared library has the demo foods + exercises -------------
  console.log('[seed:demo] ensuring foods + exercises in shared library');
  const foodIdByName = new Map<string, number>();
  for (const f of DEMO_FOODS) {
    const existing = await db.execute({
      sql: `SELECT id FROM foods WHERE name = ? AND serving_label = ? LIMIT 1`,
      args: [f.name, f.serving_label],
    });
    if (existing.rows[0]) {
      foodIdByName.set(f.name, Number(existing.rows[0].id));
      continue;
    }
    const ins = await db.execute({
      sql: `INSERT INTO foods
              (name, brand, serving_label, calories_per_serving,
               protein_g, carbs_g, fat_g, created_by)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            RETURNING id`,
      args: [
        f.name,
        f.brand,
        f.serving_label,
        f.calories_per_serving,
        f.protein_g,
        f.carbs_g,
        f.fat_g,
        userId,
      ],
    });
    foodIdByName.set(f.name, Number(ins.rows[0].id));
  }
  const exerciseIdByName = new Map<string, number>();
  for (const e of DEMO_EXERCISES) {
    const existing = await db.execute({
      sql: `SELECT id FROM exercises WHERE name = ? LIMIT 1`,
      args: [e.name],
    });
    if (existing.rows[0]) {
      exerciseIdByName.set(e.name, Number(existing.rows[0].id));
      continue;
    }
    const ins = await db.execute({
      sql: `INSERT INTO exercises (name, category) VALUES (?, ?) RETURNING id`,
      args: [e.name, e.category],
    });
    exerciseIdByName.set(e.name, Number(ins.rows[0].id));
  }

  // ---- 5. routine + routine_exercises --------------------------------------
  console.log('[seed:demo] creating routine');
  const rIns = await db.execute({
    sql: `INSERT INTO routines (user_id, name, schedule_days)
          VALUES (?, ?, ?) RETURNING id`,
    args: [userId, ROUTINE_NAME, ROUTINE_SCHEDULE.join(',')],
  });
  const routineId = Number(rIns.rows[0].id);
  const routineExerciseIds: { id: number; exId: number; ex: SeedExercise }[] = [];
  for (let i = 0; i < DEMO_EXERCISES.length; i++) {
    const e = DEMO_EXERCISES[i];
    const exId = exerciseIdByName.get(e.name)!;
    const reIns = await db.execute({
      sql: `INSERT INTO routine_exercises
              (routine_id, exercise_id, position,
               target_sets, target_reps, target_weight_lb)
            VALUES (?, ?, ?, ?, ?, ?)
            RETURNING id`,
      args: [
        routineId,
        exId,
        i + 1,
        e.target_sets,
        e.target_reps,
        e.target_weight_lb,
      ],
    });
    routineExerciseIds.push({
      id: Number(reIns.rows[0].id),
      exId,
      ex: e,
    });
  }

  // ---- 6. 60 days of entries (weight + steps) ------------------------------
  console.log(`[seed:demo] seeding ${HORIZON_DAYS} days of entries`);
  const rng = makeRng(0xdaa12345);
  // Linear weight trend startWeight → ~200, with daily noise.
  const endWeightLb = 200;
  for (let i = 0; i < HORIZON_DAYS; i++) {
    const date = isoDaysAgo(today, HORIZON_DAYS - 1 - i);
    const t = i / (HORIZON_DAYS - 1);
    const trend = startWeightLb + t * (endWeightLb - startWeightLb);
    const noise = (rng() - 0.5) * 1.4; // ±0.7 lb
    const weight = Math.round((trend + noise) * 10) / 10;
    const steps = 8000 + Math.round(rng() * 5000);
    await db.execute({
      sql: `INSERT INTO entries (user_id, date, weight_lb, steps)
            VALUES (?, ?, ?, ?)`,
      args: [userId, date, weight, steps],
    });
  }

  // ---- 7. 60 days of meals -------------------------------------------------
  console.log('[seed:demo] seeding meals');
  const breakfastFoods = DEMO_FOODS.filter((f) => f.slot === 'b');
  const lunchFoods = DEMO_FOODS.filter((f) => f.slot === 'l');
  const dinnerFoods = DEMO_FOODS.filter((f) => f.slot === 'd');
  const snackFoods = DEMO_FOODS.filter((f) => f.slot === 's');
  const mealRng = makeRng(0xb0b0caca);
  function pick<T>(arr: T[]): T {
    return arr[Math.floor(mealRng() * arr.length) % arr.length];
  }
  for (let i = 0; i < HORIZON_DAYS; i++) {
    const date = isoDaysAgo(today, HORIZON_DAYS - 1 - i);
    const items: SeedFood[] = [
      pick(breakfastFoods),
      pick(lunchFoods),
      pick(lunchFoods),
      pick(dinnerFoods),
      pick(dinnerFoods),
      pick(snackFoods),
    ];
    for (const f of items) {
      const foodId = foodIdByName.get(f.name)!;
      const servings = 1;
      await db.execute({
        sql: `INSERT INTO meal_items (user_id, date, food_id, servings)
              VALUES (?, ?, ?, ?)`,
        args: [userId, date, foodId, servings],
      });
    }
  }

  // ---- 8. exercise logs on each scheduled day ------------------------------
  console.log('[seed:demo] seeding exercise logs on routine days');
  const liftRng = makeRng(0xfeed1234);
  let liftDays = 0;
  for (let i = 0; i < HORIZON_DAYS; i++) {
    const date = isoDaysAgo(today, HORIZON_DAYS - 1 - i);
    const dow = isoWeekday(date);
    if (!ROUTINE_SCHEDULE.includes(dow)) continue;
    // Skip the most recent scheduled day occasionally so today/tomorrow
    // remain "to do" — small 10% miss rate so streak isn't perfect.
    if (i >= HORIZON_DAYS - 7 && liftRng() < 0.15) continue;
    liftDays++;
    for (const re of routineExerciseIds) {
      const tw =
        re.ex.target_weight_lb != null
          ? re.ex.target_weight_lb + Math.round((liftRng() - 0.4) * 10)
          : null;
      await db.execute({
        sql: `INSERT INTO exercise_logs
                (user_id, date, exercise_id, routine_id,
                 sets, reps, weight_lb)
              VALUES (?, ?, ?, ?, ?, ?, ?)`,
        args: [
          userId,
          date,
          re.exId,
          routineId,
          re.ex.target_sets,
          re.ex.target_reps,
          tw,
        ],
      });
    }
  }

  console.log(
    `[seed:demo] done. routine days logged: ${liftDays} (out of ~${Math.round(
      (HORIZON_DAYS * ROUTINE_SCHEDULE.length) / 7,
    )} scheduled).`,
  );
}

main().catch((err) => {
  console.error('[seed:demo] FAILED:', err);
  process.exit(1);
});
