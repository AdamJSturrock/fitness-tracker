/**
 * Programmatic smoke test for the data layer (queries + actions).
 *
 * Runs against the configured DB (defaults to file:./local.db).
 * Asserts:
 *   - getProfile(adam) returns id=1 with the seeded profile fields.
 *   - upsertEntry creates and re-reads a future-dated entry.
 *   - addMealItem inserts a meal_item.
 *   - getDayCalorieTotals returns the expected sum after the insert.
 *   - removeMealItem brings the total back down.
 *
 * Cleans up after itself so re-runs are idempotent.
 *
 * Usage:
 *   pnpm tsx scripts/smoke.ts
 */

import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Module } from 'node:module';

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

// In a Next runtime, `server-only` is intercepted to prevent client imports of
// server modules; it has no real npm package. `next/cache.revalidatePath` is
// a no-op outside a Next request. Both throw if imported in a plain CLI, so
// we stub both before importing the actions / queries.
const emptyStubPath = resolve(process.cwd(), '.smoke-empty-stub.cjs');
writeFileSync(emptyStubPath, `module.exports = {};`);

const cacheStubPath = resolve(process.cwd(), '.smoke-next-cache-stub.cjs');
writeFileSync(
  cacheStubPath,
  `module.exports = { revalidatePath: () => {}, revalidateTag: () => {} };`,
);

interface ResolveCtx {
  _resolveFilename(req: string, parent: NodeJS.Module): string;
}
const M = Module as unknown as ResolveCtx;
const origResolve = M._resolveFilename;
M._resolveFilename = function (request: string, parent: NodeJS.Module): string {
  if (request === 'next/cache') return cacheStubPath;
  if (request === 'server-only' || request === 'client-only') {
    return emptyStubPath;
  }
  return origResolve.call(this, request, parent);
};

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) {
    console.error(`[smoke] FAIL: ${msg}`);
    process.exit(1);
  }
  console.log(`[smoke]  ok: ${msg}`);
}

function tomorrowIso(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

async function main() {
  const { getProfile, getDayCalorieTotals, getMealsForDate } = await import(
    '@/server/queries'
  );
  const { upsertEntry, addMealItem, removeMealItem, createFood, updateProfile } =
    await import('@/server/actions');
  const { getDb } = await import('@/lib/db');

  const date = tomorrowIso(); // not "today" so we don't disturb fixtures

  // --- 1. profile fetch + updateProfile roundtrip (independent of seed:fake) ---
  const adamBefore = await getProfile('adam');
  assert(adamBefore.id === 1, `getProfile('adam').id === 1 (got ${adamBefore.id})`);
  assert(adamBefore.name === 'adam', `getProfile('adam').name === 'adam'`);

  const adamUpdated = await updateProfile({
    name: 'adam',
    startWeightLb: 199.9,
  });
  assert(
    adamUpdated.startWeightLb === 199.9,
    `updateProfile sets startWeightLb (got ${adamUpdated.startWeightLb})`,
  );
  // Restore to whatever it was before so we don't leave smoke-test residue.
  await updateProfile({ name: 'adam', startWeightLb: adamBefore.startWeightLb });
  const adam = adamUpdated;

  // --- 2. upsertEntry ---
  const entry = await upsertEntry({
    userId: adam.id,
    date,
    weightLb: 195.5,
    steps: 10_500,
  });
  assert(entry.weightLb === 195.5, `upsertEntry weight roundtrips (195.5)`);
  assert(entry.steps === 10500, `upsertEntry steps roundtrips (10500)`);

  // --- 3. addMealItem ---
  // Use a small dedicated test food so the calorie math is deterministic.
  const db = getDb();
  let foodId: number;
  const existing = await db.execute({
    sql: `SELECT id FROM foods WHERE name = ? AND serving_label = ? LIMIT 1`,
    args: ['Smoke test food', '1 unit'],
  });
  if (existing.rows[0]) {
    foodId = Number(existing.rows[0].id);
  } else {
    const food = await createFood({
      name: 'Smoke test food',
      servingLabel: '1 unit',
      caloriesPerServing: 250,
    });
    foodId = food.id;
  }

  const meal = await addMealItem({
    userId: adam.id,
    date,
    foodId,
    servings: 2,
  });
  assert(
    meal.food.id === foodId && meal.servings === 2,
    `addMealItem returned the joined meal_item with food`,
  );

  // --- 4. getDayCalorieTotals ---
  const totals = await getDayCalorieTotals(adam.id, date);
  const dayTotal = totals.find((t) => t.date === date)?.calories ?? 0;
  assert(
    dayTotal === 500, // 250 kcal × 2 servings
    `getDayCalorieTotals(${date}) === 500 (got ${dayTotal})`,
  );

  // --- 5. removeMealItem brings total back down ---
  await removeMealItem(meal.id);
  const totalsAfter = await getDayCalorieTotals(adam.id, date);
  const dayTotalAfter = totalsAfter.find((t) => t.date === date)?.calories ?? 0;
  assert(
    dayTotalAfter === 0,
    `getDayCalorieTotals(${date}) === 0 after removal (got ${dayTotalAfter})`,
  );

  const mealsAfter = await getMealsForDate(adam.id, date);
  assert(
    mealsAfter.find((m) => m.id === meal.id) === undefined,
    `meal item is gone from getMealsForDate`,
  );

  // --- cleanup: remove the entry and the test food so re-runs stay clean
  // and we don't leave 'Smoke test food' in the user's library ---
  await db.execute({
    sql: `DELETE FROM entries WHERE user_id = ? AND date = ?`,
    args: [adam.id, date],
  });
  await db.execute({
    sql: `DELETE FROM foods WHERE id = ?`,
    args: [foodId],
  });

  console.log('[smoke] all checks passed.');
}

main().catch((err) => {
  console.error('[smoke] FAILED:', err);
  process.exit(1);
});
