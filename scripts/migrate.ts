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

  console.log('[migrate] seeding users (INSERT OR IGNORE)');
  await client.execute({
    sql: `INSERT OR IGNORE INTO users (name, display_name) VALUES (?, ?)`,
    args: ['adam', 'Adam'],
  });
  await client.execute({
    sql: `INSERT OR IGNORE INTO users (name, display_name) VALUES (?, ?)`,
    args: ['anna', 'Anna'],
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
