import 'server-only';
import type { Row } from '@libsql/client';
import { getDb } from '@/lib/db';
import type {
  DayCalorieTotal,
  Entry,
  Food,
  MealItem,
  MealItemWithFood,
  Profile,
  UserName,
} from '@/lib/types';

// Wave 2 Agent B: real Turso-backed read queries.

// ---------- Row -> object mappers ----------

function toNumOrNull(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'bigint') return Number(v);
  if (typeof v === 'number') return v;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}

function toIntOrNull(v: unknown): number | null {
  const n = toNumOrNull(v);
  return n === null ? null : Math.trunc(n);
}

function toStringOrNull(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  return String(v);
}

function rowToProfile(r: Row): Profile {
  const sex = r.sex === null || r.sex === undefined ? null : String(r.sex);
  return {
    id: Number(r.id),
    name: String(r.name) as UserName,
    displayName: String(r.display_name),
    heightIn: toNumOrNull(r.height_in),
    age: toIntOrNull(r.age),
    sex: sex === 'm' || sex === 'f' ? sex : null,
    startWeightLb: toNumOrNull(r.start_weight_lb),
    startDate: toStringOrNull(r.start_date),
    targetWeightMinLb: toNumOrNull(r.target_weight_min_lb),
    targetWeightMaxLb: toNumOrNull(r.target_weight_max_lb),
    dailyCalorieTarget: toIntOrNull(r.daily_calorie_target),
    dailyStepTarget: toIntOrNull(r.daily_step_target),
  };
}

function rowToEntry(r: Row): Entry {
  return {
    userId: Number(r.user_id),
    date: String(r.date),
    weightLb: toNumOrNull(r.weight_lb),
    steps: toIntOrNull(r.steps),
    notes: toStringOrNull(r.notes),
  };
}

function rowToFood(r: Row): Food {
  return {
    id: Number(r.id),
    name: String(r.name),
    brand: toStringOrNull(r.brand),
    servingLabel: String(r.serving_label),
    caloriesPerServing: Number(r.calories_per_serving),
    proteinG: toNumOrNull(r.protein_g),
    carbsG: toNumOrNull(r.carbs_g),
    fatG: toNumOrNull(r.fat_g),
    archived: Number(r.archived) !== 0,
    createdBy: r.created_by === null || r.created_by === undefined
      ? null
      : Number(r.created_by),
    createdAt: String(r.created_at),
  };
}

function rowToFoodAliased(r: Row, prefix: string): Food {
  return {
    id: Number(r[`${prefix}id`]),
    name: String(r[`${prefix}name`]),
    brand: toStringOrNull(r[`${prefix}brand`]),
    servingLabel: String(r[`${prefix}serving_label`]),
    caloriesPerServing: Number(r[`${prefix}calories_per_serving`]),
    proteinG: toNumOrNull(r[`${prefix}protein_g`]),
    carbsG: toNumOrNull(r[`${prefix}carbs_g`]),
    fatG: toNumOrNull(r[`${prefix}fat_g`]),
    archived: Number(r[`${prefix}archived`]) !== 0,
    createdBy:
      r[`${prefix}created_by`] === null ||
      r[`${prefix}created_by`] === undefined
        ? null
        : Number(r[`${prefix}created_by`]),
    createdAt: String(r[`${prefix}created_at`]),
  };
}

function rowToMealItem(r: Row): MealItem {
  return {
    id: Number(r.id),
    userId: Number(r.user_id),
    date: String(r.date),
    foodId: Number(r.food_id),
    servings: Number(r.servings),
    createdAt: String(r.created_at),
  };
}

function rowToMealItemWithFood(r: Row): MealItemWithFood {
  // meal_items columns are aliased mi_*, foods columns are f_*.
  return {
    id: Number(r.mi_id),
    userId: Number(r.mi_user_id),
    date: String(r.mi_date),
    foodId: Number(r.mi_food_id),
    servings: Number(r.mi_servings),
    createdAt: String(r.mi_created_at),
    food: rowToFoodAliased(r, 'f_'),
  };
}

const MEAL_JOIN_COLUMNS = `
  meal_items.id            AS mi_id,
  meal_items.user_id       AS mi_user_id,
  meal_items.date          AS mi_date,
  meal_items.food_id       AS mi_food_id,
  meal_items.servings      AS mi_servings,
  meal_items.created_at    AS mi_created_at,
  foods.id                 AS f_id,
  foods.name               AS f_name,
  foods.brand              AS f_brand,
  foods.serving_label      AS f_serving_label,
  foods.calories_per_serving AS f_calories_per_serving,
  foods.protein_g          AS f_protein_g,
  foods.carbs_g            AS f_carbs_g,
  foods.fat_g              AS f_fat_g,
  foods.archived           AS f_archived,
  foods.created_by         AS f_created_by,
  foods.created_at         AS f_created_at
`;

// ---------- Public queries ----------

export async function getProfile(name: UserName): Promise<Profile> {
  const db = getDb();
  const result = await db.execute({
    sql: `SELECT id, name, display_name, height_in, age, sex,
                 start_weight_lb, start_date,
                 target_weight_min_lb, target_weight_max_lb,
                 daily_calorie_target, daily_step_target
            FROM users WHERE name = ? LIMIT 1`,
    args: [name],
  });
  const row = result.rows[0];
  if (!row) {
    throw new Error(
      `Profile for user '${name}' not found. Run \`pnpm migrate\` to seed users.`,
    );
  }
  return rowToProfile(row);
}

export async function getEntries(
  userId: number,
  fromDate?: string,
): Promise<Entry[]> {
  const db = getDb();
  if (fromDate) {
    const result = await db.execute({
      sql: `SELECT user_id, date, weight_lb, steps, notes
              FROM entries
             WHERE user_id = ? AND date >= ?
             ORDER BY date ASC`,
      args: [userId, fromDate],
    });
    return result.rows.map(rowToEntry);
  }
  const result = await db.execute({
    sql: `SELECT user_id, date, weight_lb, steps, notes
            FROM entries
           WHERE user_id = ?
           ORDER BY date ASC`,
    args: [userId],
  });
  return result.rows.map(rowToEntry);
}

export async function getMealsForDate(
  userId: number,
  date: string,
): Promise<MealItemWithFood[]> {
  const db = getDb();
  const result = await db.execute({
    sql: `SELECT ${MEAL_JOIN_COLUMNS}
            FROM meal_items
            JOIN foods ON foods.id = meal_items.food_id
           WHERE meal_items.user_id = ? AND meal_items.date = ?
           ORDER BY meal_items.created_at ASC, meal_items.id ASC`,
    args: [userId, date],
  });
  return result.rows.map(rowToMealItemWithFood);
}

export async function listFoods(opts?: {
  search?: string;
  includeArchived?: boolean;
}): Promise<Food[]> {
  const db = getDb();
  const search = opts?.search?.trim() ?? '';
  const includeArchived = opts?.includeArchived ?? false;

  const where: string[] = [];
  const args: (string | number)[] = [];
  if (!includeArchived) {
    where.push('archived = 0');
  }
  if (search.length > 0) {
    // Case-insensitive name LIKE %search%. SQLite LIKE is case-insensitive
    // for ASCII by default; force LOWER on both sides for safety.
    where.push('LOWER(name) LIKE ?');
    args.push(`%${search.toLowerCase()}%`);
  }
  const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';

  const result = await db.execute({
    sql: `SELECT id, name, brand, serving_label, calories_per_serving,
                 protein_g, carbs_g, fat_g, archived, created_by, created_at
            FROM foods
            ${whereSql}
           ORDER BY name COLLATE NOCASE ASC, id ASC`,
    args,
  });
  return result.rows.map(rowToFood);
}

export async function getRecentlyUsedFoods(
  userId: number,
  limit: number,
): Promise<Food[]> {
  const db = getDb();
  // Foods this user has logged in meal_items in the last 30 days,
  // ranked by usage count (desc), then most-recent log date (desc).
  // Excludes archived foods.
  const result = await db.execute({
    sql: `SELECT foods.id, foods.name, foods.brand, foods.serving_label,
                 foods.calories_per_serving, foods.protein_g, foods.carbs_g,
                 foods.fat_g, foods.archived, foods.created_by, foods.created_at,
                 COUNT(meal_items.id) AS usage_count,
                 MAX(meal_items.date) AS last_date
            FROM meal_items
            JOIN foods ON foods.id = meal_items.food_id
           WHERE meal_items.user_id = ?
             AND meal_items.date >= date('now', '-30 days')
             AND foods.archived = 0
           GROUP BY foods.id
           ORDER BY usage_count DESC, last_date DESC, foods.name COLLATE NOCASE ASC
           LIMIT ?`,
    args: [userId, limit],
  });
  return result.rows.map(rowToFood);
}

export async function getDayCalorieTotals(
  userId: number,
  fromDate?: string,
): Promise<DayCalorieTotal[]> {
  const db = getDb();
  // Note: we include archived foods here — archiving only hides from the
  // picker; calories already eaten still count.
  const args: (string | number)[] = [userId];
  let dateFilter = '';
  if (fromDate) {
    dateFilter = ' AND meal_items.date >= ?';
    args.push(fromDate);
  }
  const result = await db.execute({
    sql: `SELECT meal_items.date AS date,
                 SUM(foods.calories_per_serving * meal_items.servings) AS calories
            FROM meal_items
            JOIN foods ON foods.id = meal_items.food_id
           WHERE meal_items.user_id = ?${dateFilter}
           GROUP BY meal_items.date
           ORDER BY meal_items.date ASC`,
    args,
  });
  return result.rows.map((r) => ({
    date: String(r.date),
    calories: Number(r.calories ?? 0),
  }));
}

// Internal helper: fetch a single MealItemWithFood by id (used by actions).
export async function getMealItemWithFoodById(
  id: number,
): Promise<MealItemWithFood> {
  const db = getDb();
  const result = await db.execute({
    sql: `SELECT ${MEAL_JOIN_COLUMNS}
            FROM meal_items
            JOIN foods ON foods.id = meal_items.food_id
           WHERE meal_items.id = ?
           LIMIT 1`,
    args: [id],
  });
  const row = result.rows[0];
  if (!row) throw new Error(`MealItem id=${id} not found`);
  return rowToMealItemWithFood(row);
}

// Internal helper used elsewhere if needed.
export { rowToMealItem };
