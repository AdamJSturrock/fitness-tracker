/**
 * Idempotent schema migration + seed for the fitness tracker.
 *
 * Usage:
 *   pnpm migrate           # uses TURSO_DATABASE_URL or falls back to file:./local.db
 *
 * Reads the same env vars as the app (TURSO_DATABASE_URL, TURSO_AUTH_TOKEN).
 */

import { config as loadEnv } from 'node:process';
import { createClient } from '@libsql/client';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

// Lightweight .env.local loader so `pnpm migrate` works without an extra dep.
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
void loadEnv; // keep the import resolved without using it

const STATEMENTS: string[] = [
  `CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    display_name TEXT NOT NULL,
    height_in REAL,
    age INTEGER,
    sex TEXT,
    start_weight_lb REAL,
    start_date TEXT,
    target_weight_min_lb REAL,
    target_weight_max_lb REAL,
    target_date TEXT,
    daily_calorie_target INTEGER,
    daily_step_target INTEGER
  )`,
  `CREATE TABLE IF NOT EXISTS entries (
    user_id INTEGER NOT NULL REFERENCES users(id),
    date TEXT NOT NULL,
    weight_lb REAL,
    steps INTEGER,
    notes TEXT,
    PRIMARY KEY (user_id, date)
  )`,
  `CREATE TABLE IF NOT EXISTS foods (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    brand TEXT,
    serving_label TEXT NOT NULL,
    calories_per_serving INTEGER NOT NULL,
    protein_g REAL,
    carbs_g REAL,
    fat_g REAL,
    archived INTEGER NOT NULL DEFAULT 0,
    created_by INTEGER REFERENCES users(id),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE INDEX IF NOT EXISTS foods_name_idx ON foods(name)`,
  `CREATE TABLE IF NOT EXISTS meal_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    date TEXT NOT NULL,
    food_id INTEGER NOT NULL REFERENCES foods(id),
    servings REAL NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE INDEX IF NOT EXISTS meal_items_user_date_idx ON meal_items(user_id, date)`,
  // ---- Phase 1: workouts ----
  `CREATE TABLE IF NOT EXISTS exercises (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    archived INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE INDEX IF NOT EXISTS exercises_name_idx ON exercises(name)`,
  `CREATE TABLE IF NOT EXISTS routines (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    name TEXT NOT NULL,
    schedule_days TEXT NOT NULL DEFAULT '',
    archived INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE INDEX IF NOT EXISTS routines_user_idx ON routines(user_id, archived)`,
  `CREATE TABLE IF NOT EXISTS routine_exercises (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    routine_id INTEGER NOT NULL REFERENCES routines(id) ON DELETE CASCADE,
    exercise_id INTEGER NOT NULL REFERENCES exercises(id),
    position INTEGER NOT NULL,
    target_sets INTEGER,
    target_reps INTEGER,
    target_weight_lb REAL,
    notes TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS routine_exercises_routine_idx ON routine_exercises(routine_id, position)`,
  `CREATE TABLE IF NOT EXISTS exercise_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    date TEXT NOT NULL,
    exercise_id INTEGER NOT NULL REFERENCES exercises(id),
    routine_id INTEGER REFERENCES routines(id),
    sets INTEGER,
    reps INTEGER,
    weight_lb REAL,
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE INDEX IF NOT EXISTS exercise_logs_user_date_idx ON exercise_logs(user_id, date)`,
  // ---- Phase 3: muscle-building mode (performance snapshots) ----
  // One row per (user, exercise, date) summarising that day's work for the
  // exercise. Recomputed whenever an exercise_log is written for the same
  // (user, exercise, date). Lets the UI show "last time: 3×8 @ 95 lb" and PR
  // history without re-querying exercise_logs from scratch each render.
  `CREATE TABLE IF NOT EXISTS performance_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    exercise_id INTEGER NOT NULL REFERENCES exercises(id),
    date TEXT NOT NULL,
    top_weight_lb REAL,
    top_reps INTEGER,
    total_volume_lb REAL,
    total_sets INTEGER,
    e1rm REAL,
    is_pr INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (user_id, exercise_id, date)
  )`,
  `CREATE INDEX IF NOT EXISTS performance_snapshots_user_ex_date_idx
     ON performance_snapshots(user_id, exercise_id, date)`,
  // ---- Phase 4: walking routes ----
  // Per-user library of named dog-walk routes. Distance and elevation are
  // computed once at save-time from the drawn polyline (haversine + Open-Meteo).
  // Daily logging references one of these routes via exercise_logs.walking_route_id.
  `CREATE TABLE IF NOT EXISTS walking_routes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    name TEXT NOT NULL,
    distance_mi REAL NOT NULL,
    elevation_gain_ft REAL,
    default_minutes INTEGER NOT NULL,
    geojson TEXT NOT NULL,
    archived INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE INDEX IF NOT EXISTS walking_routes_user_idx ON walking_routes(user_id, archived)`,
  // ---- Phase 5: food favorites ----
  // Explicit pinned favorites per user. Composite PK keeps it one-row-per-pair;
  // the index supports "most-recently-favorited first" listings.
  `CREATE TABLE IF NOT EXISTS food_favorites (
    user_id INTEGER NOT NULL REFERENCES users(id),
    food_id INTEGER NOT NULL REFERENCES foods(id),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (user_id, food_id)
  )`,
  `CREATE INDEX IF NOT EXISTS food_favorites_user_idx ON food_favorites(user_id, created_at DESC)`,
];

async function main() {
  const url = process.env.TURSO_DATABASE_URL ?? 'file:./local.db';
  const authToken = process.env.TURSO_AUTH_TOKEN || undefined;

  console.log(`[migrate] connecting to ${url}`);
  const client = createClient({ url, authToken });

  for (const sql of STATEMENTS) {
    const oneLine = sql.replace(/\s+/g, ' ').trim();
    console.log(`[migrate] exec: ${oneLine.slice(0, 80)}…`);
    await client.execute(sql);
  }

  // ---- Idempotent column additions for existing DBs ----
  // SQLite has no `ADD COLUMN IF NOT EXISTS`, so try and swallow
  // "duplicate column" errors.
  async function tryAddColumn(table: string, column: string, type: string) {
    try {
      console.log(`[migrate] try ALTER ${table} ADD COLUMN ${column} ${type}`);
      await client.execute(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/duplicate column|already exists/i.test(msg)) {
        // already there — fine
      } else {
        throw err;
      }
    }
  }
  await tryAddColumn('users', 'target_date', 'TEXT');
  // Phase 2: cardio support
  await tryAddColumn('exercises', 'kcal_correction_factor', 'REAL NOT NULL DEFAULT 1.0');
  await tryAddColumn('routine_exercises', 'target_duration_min', 'REAL');
  await tryAddColumn('routine_exercises', 'target_distance_mi', 'REAL');
  await tryAddColumn('exercise_logs', 'duration_min', 'REAL');
  await tryAddColumn('exercise_logs', 'distance_mi', 'REAL');
  await tryAddColumn('exercise_logs', 'kcal_machine', 'INTEGER');
  // Phase 3: muscle-building mode + protein target.
  await tryAddColumn('users', 'mode', "TEXT NOT NULL DEFAULT 'loss'");
  await tryAddColumn('users', 'protein_target_g', 'INTEGER');
  // Phase 4: walking routes — exercise_logs gains a route FK and a pace tag.
  await tryAddColumn('exercise_logs', 'walking_route_id', 'INTEGER REFERENCES walking_routes(id)');
  await tryAddColumn('exercise_logs', 'walk_pace', 'TEXT');
  // Phase 5: barcode scanner + richer nutrition data on foods.
  // All NULL-allowed so existing manually-entered foods keep working unchanged.
  // raw_nutrition_json stores the verbatim API response for later diet-quality
  // analysis (NOVA distribution, sat-fat exposure, etc.).
  await tryAddColumn('foods', 'barcode', 'TEXT');
  await tryAddColumn('foods', 'fiber_g', 'REAL');
  await tryAddColumn('foods', 'sugar_g', 'REAL');
  await tryAddColumn('foods', 'sat_fat_g', 'REAL');
  await tryAddColumn('foods', 'salt_g', 'REAL');
  await tryAddColumn('foods', 'nutriscore', 'TEXT');
  await tryAddColumn('foods', 'nova_group', 'INTEGER');
  await tryAddColumn('foods', 'is_vegan', 'INTEGER');
  await tryAddColumn('foods', 'is_vegetarian', 'INTEGER');
  await tryAddColumn('foods', 'image_url', 'TEXT');
  await tryAddColumn('foods', 'ingredients', 'TEXT');
  await tryAddColumn('foods', 'data_source', 'TEXT');
  await tryAddColumn('foods', 'raw_nutrition_json', 'TEXT');
  // Partial index — only barcoded foods are indexed, keeping the index small
  // while still giving O(log n) lookup for cache-hit checks on scan.
  await client.execute(
    `CREATE INDEX IF NOT EXISTS foods_barcode_idx ON foods(barcode) WHERE barcode IS NOT NULL`,
  );

  // Seed an Elliptical exercise with the 0.67 correction factor so it's
  // available in the shared library without anyone having to add it.
  console.log('[migrate] seeding shared cardio exercises');
  const ellipticalLookup = await client.execute({
    sql: `SELECT id FROM exercises WHERE name = 'Elliptical' LIMIT 1`,
  });
  if (!ellipticalLookup.rows[0]) {
    await client.execute({
      sql: `INSERT INTO exercises (name, category, kcal_correction_factor)
            VALUES (?, ?, ?)`,
      args: ['Elliptical', 'cardio', 0.67],
    });
  } else {
    // Ensure category + factor are right even if it pre-exists with defaults.
    await client.execute({
      sql: `UPDATE exercises
              SET category = 'cardio',
                  kcal_correction_factor = COALESCE(kcal_correction_factor, 0.67)
            WHERE id = ?`,
      args: [ellipticalLookup.rows[0].id],
    });
  }

  // Shared "Dog walk" exercise — kcal is derived from MET × kg × hours at
  // display time, so the correction factor is 1.0 and kcal_machine is unused.
  const dogWalkLookup = await client.execute({
    sql: `SELECT id FROM exercises WHERE name = 'Dog walk' LIMIT 1`,
  });
  if (!dogWalkLookup.rows[0]) {
    await client.execute({
      sql: `INSERT INTO exercises (name, category, kcal_correction_factor)
            VALUES (?, ?, ?)`,
      args: ['Dog walk', 'cardio', 1.0],
    });
  }

  console.log('[migrate] seeding users (INSERT OR IGNORE)');
  await client.execute({
    sql: `INSERT OR IGNORE INTO users (name, display_name, sex) VALUES (?, ?, ?)`,
    args: ['adam', 'Adam', 'm'],
  });
  await client.execute({
    sql: `INSERT OR IGNORE INTO users (name, display_name, sex) VALUES (?, ?, ?)`,
    args: ['anna', 'Anna', 'f'],
  });
  await client.execute({
    sql: `INSERT OR IGNORE INTO users (name, display_name, sex) VALUES (?, ?, ?)`,
    args: ['demo', 'Demo', 'm'],
  });
  // Backfill sex on rows seeded before we baked it into the seed. Idempotent
  // and only fills NULL, so a manual override on the row is preserved.
  await client.execute({
    sql: `UPDATE users SET sex = 'm' WHERE name = 'adam' AND sex IS NULL`,
  });
  await client.execute({
    sql: `UPDATE users SET sex = 'f' WHERE name = 'anna' AND sex IS NULL`,
  });

  const result = await client.execute(
    `SELECT id, name, display_name FROM users ORDER BY id`,
  );
  console.log('[migrate] users:');
  for (const row of result.rows) {
    console.log(
      `         id=${row.id} name=${row.name} display=${row.display_name}`,
    );
  }

  console.log('[migrate] done.');
}

main().catch((err) => {
  console.error('[migrate] FAILED:', err);
  process.exit(1);
});
